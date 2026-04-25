"""CRUD route tests for ``/v1/protocol/keys``.

Covers:
- Auth required (401 without principal).
- POST seals a secret + returns metadata (last_4 echo, no plaintext).
- GET lists own tenant rows.
- DELETE removes the row idempotently (404 on missing).
- POST with unknown vendor_slug surfaces 422 validation problem.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.backend.errors import register_problem_handlers
from src.backend.middleware.auth import AuthPrincipal
from src.backend.protocol.registry import (
    AdapterRegistry,
    reset_registry_for_tests,
)
from src.backend.protocol.adapters.stub_adapter import StubAdapter
from src.backend.routers.v1.protocol_keys import protocol_keys_router
from src.backend.utils.uuid7 import uuid7


_TEST_USER_ID = "11111111-1111-7111-8111-111111111111"
_TEST_TENANT_ID = "22222222-2222-7222-8222-222222222222"


class _FakeAcquireCtx:
    def __init__(self, conn: MagicMock) -> None:
        self._conn = conn

    async def __aenter__(self) -> MagicMock:
        return self._conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


@pytest.fixture
def keys_pool(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Install a fake asyncpg pool patched at every consumer site."""

    conn = MagicMock()
    conn.fetchrow = AsyncMock(return_value=None)
    conn.fetch = AsyncMock(return_value=[])
    conn.fetchval = AsyncMock(return_value=None)
    conn.execute = AsyncMock(return_value="OK")

    pool = MagicMock()
    pool.acquire = MagicMock(return_value=_FakeAcquireCtx(conn))
    pool.close = AsyncMock(return_value=None)

    monkeypatch.setattr("src.backend.db.pool.get_pool", lambda: pool)
    monkeypatch.setattr(
        "src.backend.routers.v1.protocol_keys.get_pool", lambda: pool
    )

    class _FakeTenantScopedCtx:
        async def __aenter__(self_inner) -> MagicMock:
            return conn

        async def __aexit__(self_inner, exc_type, exc, tb) -> None:
            return None

    def _patched_tenant_scoped(_pool, _tenant_id):
        return _FakeTenantScopedCtx()

    monkeypatch.setattr(
        "src.backend.routers.v1.protocol_keys.tenant_scoped",
        _patched_tenant_scoped,
    )

    pool._test_conn = conn
    return pool


def _row(*, vendor_slug: str = "stub", last_4: str = "abcd") -> dict[str, Any]:
    now = datetime.now(UTC)
    return {
        "id": uuid7(),
        "vendor_slug": vendor_slug,
        "last_4": last_4,
        "created_at": now,
        "updated_at": now,
    }


def _build_app(*, with_auth: bool = True) -> FastAPI:
    """Lightweight app: problem handlers + protocol_keys router.

    When ``with_auth`` is True a tiny middleware injects an
    :class:`AuthPrincipal` on ``request.state.auth`` so the router's
    ``_require_auth`` resolves cleanly. When False the principal is
    absent and the router raises 401.
    """

    app = FastAPI()
    register_problem_handlers(app)

    if with_auth:

        @app.middleware("http")
        async def _bind_auth(request, call_next):
            request.state.auth = AuthPrincipal(
                user_id=_TEST_USER_ID,
                tenant_id=_TEST_TENANT_ID,
                scopes=frozenset({"user"}),
                issuer="test",
                token_type="bearer",
                raw_claims={},
            )
            return await call_next(request)

    app.include_router(protocol_keys_router, prefix="/v1")
    return app


def _install_stub_only_registry(monkeypatch: pytest.MonkeyPatch) -> None:
    """Replace the registry singleton so vendor_slug='stub' is the only valid slug."""

    reset_registry_for_tests()
    registry = AdapterRegistry(adapters=[StubAdapter()])
    monkeypatch.setattr(
        "src.backend.routers.v1.protocol_keys.get_registry",
        lambda: registry,
    )


def test_create_key_seals_and_returns_metadata(
    keys_pool: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """POST seals plaintext, persists ciphertext, echoes last_4."""

    _install_stub_only_registry(monkeypatch)
    keys_pool._test_conn.fetchrow = AsyncMock(
        return_value=_row(vendor_slug="stub", last_4="WXYZ"),
    )

    plaintext = "sk-test-1234abcdWXYZ"
    with TestClient(_build_app()) as client:
        resp = client.post(
            "/v1/protocol/keys",
            json={"vendor_slug": "stub", "secret": plaintext},
        )

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["vendor_slug"] == "stub"
    assert body["last_4"] == "WXYZ"
    # Plaintext NEVER round-trips back.
    assert "secret" not in body
    assert plaintext not in resp.text

    # The INSERT call carried sealed bytes (3 distinct bytea blobs).
    # asyncpg ``fetchrow(query, *args)`` so positional[0] is the SQL
    # string, positional[1..] are the bound params: id, tenant, slug,
    # ciphertext, nonce, wrapped_dek, last_4.
    insert_call = keys_pool._test_conn.fetchrow.await_args
    args = insert_call.args
    assert isinstance(args[4], (bytes, bytearray))  # ciphertext
    assert isinstance(args[5], (bytes, bytearray))  # nonce
    assert isinstance(args[6], (bytes, bytearray))  # wrapped_dek
    # Plaintext MUST NOT round-trip into the persisted ciphertext.
    assert plaintext.encode("utf-8") not in bytes(args[4])


def test_create_key_unknown_vendor_returns_422(
    keys_pool: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A vendor_slug not in the registry surfaces 422 ValidationProblem."""

    _install_stub_only_registry(monkeypatch)
    with TestClient(_build_app()) as client:
        resp = client.post(
            "/v1/protocol/keys",
            json={"vendor_slug": "no_such_vendor", "secret": "0123456789"},
        )
    assert resp.status_code == 422
    assert "no_such_vendor" in resp.text


def test_create_requires_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    """Missing auth principal yields 401."""

    _install_stub_only_registry(monkeypatch)
    with TestClient(_build_app(with_auth=False)) as client:
        resp = client.post(
            "/v1/protocol/keys",
            json={"vendor_slug": "stub", "secret": "12345678"},
        )
    assert resp.status_code == 401


def test_list_keys_returns_metadata(
    keys_pool: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GET returns metadata only, no ciphertext or plaintext."""

    _install_stub_only_registry(monkeypatch)
    rows = [
        _row(vendor_slug="stub", last_4="abcd"),
        _row(vendor_slug="anthropic", last_4="WXYZ"),
    ]
    keys_pool._test_conn.fetch = AsyncMock(return_value=rows)

    with TestClient(_build_app()) as client:
        resp = client.get("/v1/protocol/keys")

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert len(payload) == 2
    slugs = {row["vendor_slug"] for row in payload}
    assert slugs == {"stub", "anthropic"}
    for row in payload:
        # Metadata-only contract.
        assert set(row.keys()) == {
            "id",
            "vendor_slug",
            "last_4",
            "created_at",
            "updated_at",
        }


def test_delete_key_404_when_missing(
    keys_pool: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """DELETE on a slug with no row returns 404."""

    _install_stub_only_registry(monkeypatch)
    keys_pool._test_conn.execute = AsyncMock(return_value="DELETE 0")
    with TestClient(_build_app()) as client:
        resp = client.delete("/v1/protocol/keys/anthropic")
    assert resp.status_code == 404


def test_delete_key_204_on_success(
    keys_pool: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """DELETE with a matching row returns 204 + no body."""

    _install_stub_only_registry(monkeypatch)
    keys_pool._test_conn.execute = AsyncMock(return_value="DELETE 1")
    with TestClient(_build_app()) as client:
        resp = client.delete("/v1/protocol/keys/stub")
    assert resp.status_code == 204
    assert resp.content == b""
