"""Tests for Tethys Ed25519 key rotation cron + admin endpoint.

Owner: Tethys (W2 NP P5 Session 2 deferred, T4).

Coverage matrix
---------------
- :func:`rotate_single_agent` flips the old row to ``status='retiring'``
  with ``retires_at = now + 7d`` (UTC, tz-aware).
- :func:`rotate_single_agent` inserts a new row with
  ``status='active'`` for the same ``owner_user_id``.
- Idempotent guard: an active key younger than 7 days raises
  :class:`RotationTooRecentError`.
- Pheme ``key_rotation_alert`` is dispatched once per rotation with
  ``old_fingerprint`` + ``new_fingerprint`` + ``rotate_at`` in props.
- Admin endpoint returns HTTP 401 when no auth header is present.
- Admin endpoint returns HTTP 403 when auth lacks the admin scope.
- Admin endpoint returns HTTP 202 with a populated
  :class:`RotateResponse` when admin scope is present + key is old
  enough.
- Admin endpoint returns HTTP 409 with ``rotation_too_recent`` when
  the active key is younger than 7 days.
- :data:`KEY_ROTATION_CRON` is registered with the Sunday 03:00 UTC
  schedule + appears exactly once in
  :data:`REGISTERED_CRONS`.

The fake pool from ``conftest.fake_identity_pool`` already patches
``src.backend.db.pool.get_pool`` so the cron + admin path see the
same in-memory connection. We add per-test ``side_effect`` callables
on ``conn.fetchrow`` / ``conn.fetch`` / ``conn.execute`` to drive
each scenario without a live Postgres.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt as jose_jwt

from src.backend.config import Settings
from src.backend.errors import register_problem_handlers
from src.backend.middleware.auth import install_auth
from src.backend.registry.identity.cron.key_rotation import (
    CRON_SCHEDULE_NAME,
    GRACE_WINDOW_DAYS,
    KEY_ROTATION_CRON,
    PHEME_TEMPLATE_NAME,
    ROTATION_RECENT_GUARD_DAYS,
    RotationTargetMissingError,
    RotationTooRecentError,
    rotate_single_agent,
)
from src.backend.registry.identity.crypto import generate_ed25519_keypair
from src.backend.routers.v1.identity import identity_router
from src.backend.utils.uuid7 import uuid7
from src.backend.workers.arq_worker import REGISTERED_CRONS

_ADMIN_USER_ID = "11111111-1111-7111-8111-111111111111"
_ADMIN_TENANT_ID = "22222222-2222-7222-8222-222222222222"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


# Generate a single real Ed25519 PEM at module import so every stub
# row carries a fingerprint-able public key without paying the keygen
# cost in every test body.
_STUB_PUBLIC_PEM, _ = generate_ed25519_keypair()


def _stub_active_row(
    *,
    agent_id: UUID,
    owner_user_id: UUID | None = None,
    tenant_id: UUID | None = None,
    public_pem: str | None = None,
    created_at: datetime | None = None,
    display_name: str = "Rotation Target Agent",
) -> dict[str, Any]:
    """Return an asyncpg-style row dict for an active identity.

    Defaults the ``created_at`` to 100 days ago so the rotation
    candidate query (90d threshold) + the admin endpoint guard
    (7d threshold) both consider the row eligible. Defaults the
    public PEM to a real Ed25519 key generated at module import so
    fingerprinting succeeds.
    """

    return {
        "id": agent_id,
        "tenant_id": tenant_id or uuid4(),
        "owner_user_id": owner_user_id or uuid4(),
        "agent_slug": f"agent_{agent_id.hex[:12]}",
        "display_name": display_name,
        "public_key_pem": public_pem or _STUB_PUBLIC_PEM,
        "created_at": created_at or (datetime.now(UTC) - timedelta(days=100)),
        "status": "active",
    }


def _capture_executes() -> tuple[AsyncMock, list[tuple[str, tuple[Any, ...]]]]:
    """Return an :class:`AsyncMock` for ``conn.execute`` + a captured log.

    Each call appends ``(sql, args)`` to the log so tests can assert
    on the SQL fragments + parameter values issued by the rotation
    transaction.
    """

    log: list[tuple[str, tuple[Any, ...]]] = []

    async def _exec(sql: str, *args: Any) -> str:
        log.append((sql, args))
        return "UPDATE 1"

    return AsyncMock(side_effect=_exec), log


def _patch_cron_pool(
    monkeypatch: pytest.MonkeyPatch,
    fake_pool: Any,
) -> None:
    """Patch the ``get_pool`` symbol imported into the cron module.

    The conftest fixture already patches the canonical ``get_pool``
    plus the service module's local copy, but the cron module imports
    its own local reference at module scope so it needs an explicit
    patch site of its own.
    """

    monkeypatch.setattr(
        "src.backend.registry.identity.cron.key_rotation.get_pool",
        lambda: fake_pool,
    )


def _patch_pheme_send(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Replace ``pheme_send`` with a recorder + return the call list.

    Each invocation appends a dict carrying the template name, recipient,
    props payload, and tenant/user attribution. Tests assert against
    this list to confirm exactly one send per rotation.
    """

    calls: list[dict[str, Any]] = []

    async def _recorder(
        template_name: str,
        to_email: str,
        props: dict[str, Any],
        **kwargs: Any,
    ) -> UUID:
        calls.append(
            {
                "template_name": template_name,
                "to_email": to_email,
                "props": dict(props),
                "kwargs": dict(kwargs),
            }
        )
        return uuid7()

    monkeypatch.setattr(
        "src.backend.registry.identity.cron.key_rotation.pheme_send",
        _recorder,
    )
    return calls


# ---------------------------------------------------------------------------
# rotate_single_agent: rotation logic
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rotate_marks_old_retiring_and_inserts_new_active(
    fake_identity_pool: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Old row gets ``status='retiring'`` + 7-day ``retires_at``; new
    row inserted as ``status='active'`` with same owner."""

    target_id = uuid7()
    owner_id = uuid7()
    tenant_id = uuid7()
    old_row = _stub_active_row(
        agent_id=target_id,
        owner_user_id=owner_id,
        tenant_id=tenant_id,
    )

    fake_identity_pool._test_conn.fetchrow = AsyncMock(
        side_effect=[
            old_row,  # _load_active_row
            {"email": "owner@example.com"},  # _resolve_owner_email
        ]
    )
    exec_mock, exec_log = _capture_executes()
    fake_identity_pool._test_conn.execute = exec_mock
    _patch_cron_pool(monkeypatch, fake_identity_pool)
    _patch_pheme_send(monkeypatch)

    before = datetime.now(UTC)
    result = await rotate_single_agent(None, target_id)
    after = datetime.now(UTC)

    assert result["status"] == "rotated"
    assert result["agent_id"] == str(target_id)
    assert UUID(result["new_agent_id"]) != target_id
    assert result["new_public_key_fingerprint"].startswith("sha256:")
    assert result["old_public_key_fingerprint"].startswith("sha256:")
    assert result["new_public_key_fingerprint"] != result["old_public_key_fingerprint"]

    # Two SQL writes: UPDATE old to retiring, INSERT new active.
    assert len(exec_log) == 2

    update_sql, update_args = exec_log[0]
    assert "UPDATE agent_identity" in update_sql
    assert "status = 'retiring'" in update_sql
    assert "retires_at" in update_sql
    assert update_args[0] == target_id  # WHERE id = $1

    # retires_at second positional ($2) must equal now + 7 days exactly,
    # tolerated within the test's wall-clock window.
    retires_at = update_args[1]
    assert isinstance(retires_at, datetime)
    assert retires_at.tzinfo is not None, "retires_at must be tz-aware UTC"
    expected_low = before + timedelta(days=GRACE_WINDOW_DAYS) - timedelta(seconds=2)
    expected_high = after + timedelta(days=GRACE_WINDOW_DAYS) + timedelta(seconds=2)
    assert expected_low <= retires_at <= expected_high

    insert_sql, insert_args = exec_log[1]
    assert "INSERT INTO agent_identity" in insert_sql
    assert "'active'" in insert_sql
    # owner_user_id (positional $3) preserved
    assert insert_args[2] == owner_id
    # tenant_id (positional $2) preserved
    assert insert_args[1] == tenant_id


@pytest.mark.asyncio
async def test_rotate_uses_seven_day_grace_window_in_utc(
    fake_identity_pool: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The grace window is exactly 7 days, computed in UTC."""

    assert GRACE_WINDOW_DAYS == 7

    target_id = uuid7()
    old_row = _stub_active_row(agent_id=target_id)

    fake_identity_pool._test_conn.fetchrow = AsyncMock(
        side_effect=[old_row, {"email": "owner@example.com"}]
    )
    exec_mock, exec_log = _capture_executes()
    fake_identity_pool._test_conn.execute = exec_mock
    _patch_cron_pool(monkeypatch, fake_identity_pool)
    _patch_pheme_send(monkeypatch)

    await rotate_single_agent(None, target_id)

    # The first execute call is the UPDATE; second positional arg is retires_at.
    _, update_args = exec_log[0]
    retires_at = update_args[1]
    now_utc = datetime.now(UTC)
    delta = retires_at - now_utc
    # Allow a small wall-clock slop window for test execution overhead.
    assert (
        timedelta(days=GRACE_WINDOW_DAYS) - timedelta(seconds=5)
        <= delta
        <= timedelta(days=GRACE_WINDOW_DAYS) + timedelta(seconds=5)
    )


# ---------------------------------------------------------------------------
# Idempotent guard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rotate_rejects_recent_key_with_too_recent_error(
    fake_identity_pool: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Active key younger than 7d raises :class:`RotationTooRecentError`."""

    target_id = uuid7()
    fresh_row = _stub_active_row(
        agent_id=target_id,
        # Three days old: well inside the 7d guard window.
        created_at=datetime.now(UTC) - timedelta(days=3),
    )

    fake_identity_pool._test_conn.fetchrow = AsyncMock(return_value=fresh_row)
    exec_mock, exec_log = _capture_executes()
    fake_identity_pool._test_conn.execute = exec_mock
    _patch_cron_pool(monkeypatch, fake_identity_pool)
    pheme_calls = _patch_pheme_send(monkeypatch)

    with pytest.raises(RotationTooRecentError) as exc_info:
        await rotate_single_agent(None, target_id)

    # No DB writes + no email when the guard rejects.
    assert exec_log == []
    assert pheme_calls == []
    # The error carries the agent_id + age_days for downstream error rendering.
    assert exc_info.value.agent_id == target_id
    assert 0 < exc_info.value.age_days < ROTATION_RECENT_GUARD_DAYS


@pytest.mark.asyncio
async def test_rotate_missing_target_raises_lookup_error(
    fake_identity_pool: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Unknown / already-revoked target raises
    :class:`RotationTargetMissingError`."""

    target_id = uuid7()
    fake_identity_pool._test_conn.fetchrow = AsyncMock(return_value=None)
    exec_mock, exec_log = _capture_executes()
    fake_identity_pool._test_conn.execute = exec_mock
    _patch_cron_pool(monkeypatch, fake_identity_pool)
    _patch_pheme_send(monkeypatch)

    with pytest.raises(RotationTargetMissingError):
        await rotate_single_agent(None, target_id)

    assert exec_log == []


# ---------------------------------------------------------------------------
# Pheme notification surface
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rotate_dispatches_pheme_key_rotation_alert(
    fake_identity_pool: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A successful rotation calls ``pheme_send`` exactly once with
    the expected template + props payload."""

    target_id = uuid7()
    owner_id = uuid7()
    tenant_id = uuid7()
    old_row = _stub_active_row(
        agent_id=target_id,
        owner_user_id=owner_id,
        tenant_id=tenant_id,
        display_name="Rotation Demo Agent",
    )

    fake_identity_pool._test_conn.fetchrow = AsyncMock(
        side_effect=[old_row, {"email": "owner+demo@example.com"}]
    )
    exec_mock, _ = _capture_executes()
    fake_identity_pool._test_conn.execute = exec_mock
    _patch_cron_pool(monkeypatch, fake_identity_pool)
    pheme_calls = _patch_pheme_send(monkeypatch)

    result = await rotate_single_agent(None, target_id)

    assert len(pheme_calls) == 1, "exactly one Pheme send per rotation"
    call = pheme_calls[0]
    assert call["template_name"] == PHEME_TEMPLATE_NAME == "key_rotation_alert"
    assert call["to_email"] == "owner+demo@example.com"

    props = call["props"]
    assert props["recipient_name"] == "Rotation Demo Agent"
    assert props["old_fingerprint"] == result["old_public_key_fingerprint"]
    assert props["new_fingerprint"] == result["new_public_key_fingerprint"]
    assert props["rotate_at"] == result["retires_at"]

    # Tenant + user ids flow into the kwargs surface so Selene can
    # attribute the email row to the right tenant.
    assert call["kwargs"]["tenant_id"] == tenant_id
    assert call["kwargs"]["user_id"] == owner_id


@pytest.mark.asyncio
async def test_rotate_proceeds_when_owner_email_missing(
    fake_identity_pool: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Missing owner email does NOT roll back the rotation."""

    target_id = uuid7()
    old_row = _stub_active_row(agent_id=target_id)

    fake_identity_pool._test_conn.fetchrow = AsyncMock(
        side_effect=[
            old_row,  # _load_active_row
            None,  # _resolve_owner_email -> no row
        ]
    )
    exec_mock, exec_log = _capture_executes()
    fake_identity_pool._test_conn.execute = exec_mock
    _patch_cron_pool(monkeypatch, fake_identity_pool)
    pheme_calls = _patch_pheme_send(monkeypatch)

    result = await rotate_single_agent(None, target_id)

    # Rotation still applied (UPDATE + INSERT both fire).
    assert len(exec_log) == 2
    # No Pheme send because there's no email address.
    assert pheme_calls == []
    # The notified_email field is None, signalling the gap to dashboards.
    assert result["notified_email"] is None
    assert result["status"] == "rotated"


# ---------------------------------------------------------------------------
# Cron registration
# ---------------------------------------------------------------------------


def test_cron_registered_with_sunday_three_am_utc_schedule() -> None:
    """KEY_ROTATION_CRON is registered with weekday=sun + hour=3 + minute=0."""

    assert KEY_ROTATION_CRON in REGISTERED_CRONS
    # Idempotency: importing the module twice must not register a duplicate.
    matching = [c for c in REGISTERED_CRONS if c is KEY_ROTATION_CRON]
    assert len(matching) == 1, (
        "KEY_ROTATION_CRON registered more than once "
        f"({len(matching)}); cron registry must stay deduplicated."
    )

    # Arq stores the schedule on the CronJob instance via its dataclass
    # fields (``weekday``, ``hour``, ``minute``).
    assert KEY_ROTATION_CRON.weekday == "sun"
    assert KEY_ROTATION_CRON.hour == {3}
    assert KEY_ROTATION_CRON.minute == {0}
    # Stable name for Selene + ops dashboards.
    assert KEY_ROTATION_CRON.name == CRON_SCHEDULE_NAME == "tethys.key_rotation_sweep"


# ---------------------------------------------------------------------------
# Admin endpoint
# ---------------------------------------------------------------------------


@pytest.fixture
def rotate_settings() -> Settings:
    return Settings(
        env="development",
        version="0.1.0-test",
        trusted_hosts=["testserver", "localhost"],
        cors_origins=["http://testserver"],
    )


@pytest.fixture
def rotate_app(rotate_settings: Settings) -> FastAPI:
    """Lightweight FastAPI app exposing only the identity router.

    Mirrors the ``identity_app`` fixture in test_identity_crud.py so
    auth wiring + tenant binding behave the same way for the new
    ``/rotate`` endpoint.
    """

    app = FastAPI()
    register_problem_handlers(app)
    install_auth(app, settings=rotate_settings)

    @app.middleware("http")
    async def _bind_tenant(request, call_next):
        auth = getattr(request.state, "auth", None)
        if auth is not None:
            request.state.tenant_id = auth.tenant_id
        return await call_next(request)

    app.include_router(identity_router, prefix="/v1")
    return app


def _bearer_with_scopes(
    settings: Settings,
    *,
    scopes: str,
    user_id: str = _ADMIN_USER_ID,
    tenant_id: str = _ADMIN_TENANT_ID,
) -> dict[str, str]:
    """Return an HS256 bearer header with the given scope string."""

    now = int(time.time())
    token = jose_jwt.encode(
        {
            "sub": user_id,
            "tenant_id": tenant_id,
            "iss": "nerium-test",
            "iat": now,
            "exp": now + 600,
            "scope": scopes,
        },
        settings.secret_key.get_secret_value(),
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def test_admin_rotate_returns_401_without_auth(
    rotate_app: FastAPI,
    fake_identity_pool: Any,
) -> None:
    """No bearer token: 401 from the auth middleware before the
    admin scope check runs."""

    target_id = uuid7()
    with TestClient(rotate_app) as client:
        resp = client.post(f"/v1/identity/agents/{target_id}/rotate")
    assert resp.status_code == 401


def test_admin_rotate_returns_403_without_admin_scope(
    rotate_app: FastAPI,
    rotate_settings: Settings,
    fake_identity_pool: Any,
) -> None:
    """Authenticated principal without the admin scope: 403."""

    headers = _bearer_with_scopes(rotate_settings, scopes="")
    target_id = uuid7()
    with TestClient(rotate_app) as client:
        resp = client.post(
            f"/v1/identity/agents/{target_id}/rotate",
            headers=headers,
        )
    assert resp.status_code == 403


def test_admin_rotate_returns_202_with_admin_scope(
    rotate_app: FastAPI,
    rotate_settings: Settings,
    fake_identity_pool: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Admin scope + old key: 202 with populated :class:`RotateResponse`."""

    target_id = uuid7()
    old_row = _stub_active_row(agent_id=target_id)

    fake_identity_pool._test_conn.fetchrow = AsyncMock(
        side_effect=[old_row, {"email": "admin@example.com"}]
    )
    exec_mock, exec_log = _capture_executes()
    fake_identity_pool._test_conn.execute = exec_mock
    _patch_cron_pool(monkeypatch, fake_identity_pool)
    _patch_pheme_send(monkeypatch)

    headers = _bearer_with_scopes(rotate_settings, scopes="admin")
    with TestClient(rotate_app) as client:
        resp = client.post(
            f"/v1/identity/agents/{target_id}/rotate",
            headers=headers,
        )

    assert resp.status_code == 202
    body = resp.json()
    assert body["rotated_agent_id"] == str(target_id)
    assert UUID(body["new_agent_id"]) != target_id
    assert body["new_public_key_fingerprint"].startswith("sha256:")
    assert body["old_public_key_fingerprint"].startswith("sha256:")
    assert body["job_id"] == body["new_agent_id"]
    # Two writes: UPDATE old to retiring + INSERT new active.
    assert len(exec_log) == 2


def test_admin_rotate_returns_409_on_too_recent_key(
    rotate_app: FastAPI,
    rotate_settings: Settings,
    fake_identity_pool: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Recent key + admin scope: 409 ``rotation_too_recent``."""

    target_id = uuid7()
    fresh_row = _stub_active_row(
        agent_id=target_id,
        # 1 day old: well within the 7d guard window.
        created_at=datetime.now(UTC) - timedelta(days=1),
    )

    fake_identity_pool._test_conn.fetchrow = AsyncMock(return_value=fresh_row)
    exec_mock, exec_log = _capture_executes()
    fake_identity_pool._test_conn.execute = exec_mock
    _patch_cron_pool(monkeypatch, fake_identity_pool)
    pheme_calls = _patch_pheme_send(monkeypatch)

    headers = _bearer_with_scopes(rotate_settings, scopes="admin")
    with TestClient(rotate_app) as client:
        resp = client.post(
            f"/v1/identity/agents/{target_id}/rotate",
            headers=headers,
        )

    assert resp.status_code == 409
    body = resp.json()
    assert "rotation_too_recent" in body["detail"]
    # Guard rejected before any write or notification.
    assert exec_log == []
    assert pheme_calls == []


def test_admin_rotate_returns_404_when_target_missing(
    rotate_app: FastAPI,
    rotate_settings: Settings,
    fake_identity_pool: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Unknown / revoked target + admin scope: 404."""

    target_id = uuid7()
    fake_identity_pool._test_conn.fetchrow = AsyncMock(return_value=None)
    exec_mock, _ = _capture_executes()
    fake_identity_pool._test_conn.execute = exec_mock
    _patch_cron_pool(monkeypatch, fake_identity_pool)
    _patch_pheme_send(monkeypatch)

    headers = _bearer_with_scopes(rotate_settings, scopes="admin")
    with TestClient(rotate_app) as client:
        resp = client.post(
            f"/v1/identity/agents/{target_id}/rotate",
            headers=headers,
        )

    assert resp.status_code == 404
