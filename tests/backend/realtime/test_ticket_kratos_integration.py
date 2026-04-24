"""Integration tests for the Nike <-> Kratos ticket seam.

These tests verify the round trip the S2 spawn directive mandates:

1. Nike mints a ticket via :func:`mint_ticket_for_caller`.
2. The Kratos SSE verifier (installed by
   :func:`src.backend.realtime.lifespan.install_realtime`) accepts the
   ticket through :func:`verify_ticket_async` returning an
   :class:`AuthPrincipal`.
3. Revoked tickets surface as ``TicketRevokedError`` -> 401.
4. Expired tickets surface as ``TicketExpiredError`` -> 401.
5. Missing verifier installation returns ``ServiceUnavailableProblem``
   with the exact detail Kratos S2 shipped. Acts as the regression
   guard for the "browser SSE path now 200" pledge: before this
   session the verifier was absent; the assertion below shows it is
   present AFTER Nike's install hook runs.

Kratos' full SSE handler is not driven end-to-end here because that
requires asyncpg + Redis Pub/Sub live fixtures. The seam-level
verifier exchange is the exact line that used to return 503, so
asserting it returns an ``AuthPrincipal`` (or the structured error)
covers the 503 -> 200 flip for the happy path.
"""

from __future__ import annotations

import time
from types import SimpleNamespace

import pytest
import pytest_asyncio
from fakeredis import aioredis as fake_aioredis

from src.backend.config import Settings
from src.backend.errors import ServiceUnavailableProblem
from src.backend.ma.sse_stream import resolve_sse_principal
from src.backend.ma.ticket_verifier import (
    get_ticket_verifier,
    set_ticket_verifier,
    verify_ticket_async,
)
from src.backend.middleware.auth import AuthPrincipal
from src.backend.realtime.jwt_tokens import (
    TicketExpiredError,
    TicketRevokedError,
    mint_ticket_jwt,
)
from src.backend.realtime.ticket_service import (
    build_kratos_verifier,
    mint_ticket_for_caller,
    revoke_ticket_by_jti,
)


USER_ID = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa"
TENANT_ID = "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb"


@pytest.fixture(autouse=True)
def _reset_ticket_verifier():
    set_ticket_verifier(None)
    yield
    set_ticket_verifier(None)


@pytest_asyncio.fixture
async def redis():
    client = fake_aioredis.FakeRedis(decode_responses=True)
    await client.flushall()
    try:
        yield client
    finally:
        await client.aclose()


def _settings() -> Settings:
    return Settings(env="development")


def _principal() -> AuthPrincipal:
    return AuthPrincipal(user_id=USER_ID, tenant_id=TENANT_ID)


def _install_nike_verifier(redis_handle) -> None:
    """Install the Kratos verifier the way ``install_realtime`` does."""

    set_ticket_verifier(
        build_kratos_verifier(
            redis_resolver=lambda: redis_handle,
            settings_resolver=_settings,
        )
    )


async def _ok_check(*_args, **_kwargs) -> bool:
    return True


# ---------------------------------------------------------------------------
# 503 baseline (pre-install)
# ---------------------------------------------------------------------------


def test_precondition_kratos_seam_returns_503_when_no_verifier_installed() -> None:
    """Guard: baseline behaviour before Nike installs its verifier."""

    from src.backend.ma.ticket_verifier import verify_ticket

    assert get_ticket_verifier() is None
    with pytest.raises(ServiceUnavailableProblem) as excinfo:
        verify_ticket("does-not-matter")
    assert "not configured" in excinfo.value.detail


# ---------------------------------------------------------------------------
# Happy path: mint -> exchange -> AuthPrincipal
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ticket_mint_then_kratos_exchange_returns_principal(redis) -> None:
    _install_nike_verifier(redis)
    minted = await mint_ticket_for_caller(
        redis=redis,
        principal=_principal(),
        resource=f"user:{USER_ID}",
        ttl_s=120,
        settings=_settings(),
        session_check=_ok_check,
    )

    principal = await verify_ticket_async(minted.ticket)
    assert isinstance(principal, AuthPrincipal)
    assert principal.user_id == USER_ID
    assert principal.tenant_id == TENANT_ID
    assert principal.token_type == "realtime_ticket"


@pytest.mark.asyncio
async def test_resolve_sse_principal_accepts_ticket(redis) -> None:
    """Direct exercise of the Kratos SSE resolver with our ticket."""

    _install_nike_verifier(redis)
    minted = await mint_ticket_for_caller(
        redis=redis,
        principal=_principal(),
        resource=f"user:{USER_ID}",
        ttl_s=120,
        settings=_settings(),
        session_check=_ok_check,
    )

    request = SimpleNamespace(state=SimpleNamespace(), headers={})
    principal = await resolve_sse_principal(request, ticket=minted.ticket)
    assert principal.user_id == USER_ID
    assert principal.tenant_id == TENANT_ID


# ---------------------------------------------------------------------------
# Revoked -> 401 token_revoked
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_revoked_ticket_is_rejected_by_kratos(redis) -> None:
    _install_nike_verifier(redis)
    minted = await mint_ticket_for_caller(
        redis=redis,
        principal=_principal(),
        resource=f"user:{USER_ID}",
        ttl_s=120,
        settings=_settings(),
        session_check=_ok_check,
    )
    await revoke_ticket_by_jti(
        redis=redis, jti=minted.jti, principal=_principal()
    )

    with pytest.raises(TicketRevokedError) as excinfo:
        await verify_ticket_async(minted.ticket)
    assert excinfo.value.detail == "token_revoked"


# ---------------------------------------------------------------------------
# Expired -> 401 token_expired
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_expired_ticket_is_rejected_by_kratos(redis) -> None:
    _install_nike_verifier(redis)
    settings = _settings()
    secret = settings.effective_realtime_ticket_secret()
    # Hand-craft a past-exp token (mint_ticket_jwt clamps positive TTLs).
    from jose import jwt as _jwt

    past = int(time.time()) - 10
    payload = {
        "iss": "nerium.realtime",
        "aud": "nerium.realtime",
        "sub": USER_ID,
        "tid": TENANT_ID,
        "tenant_id": TENANT_ID,
        "res": f"user:{USER_ID}",
        "jti": "jti-expired-integration",
        "iat": past - 120,
        "exp": past,
        "scope": "realtime:ticket",
    }
    token = _jwt.encode(payload, secret, algorithm="HS256")

    with pytest.raises(TicketExpiredError) as excinfo:
        await verify_ticket_async(token)
    assert excinfo.value.detail == "token_expired"


# ---------------------------------------------------------------------------
# Bad signature -> 401 token_invalid
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bad_signature_is_rejected_by_kratos(redis) -> None:
    _install_nike_verifier(redis)
    # Sign with a different secret so signature verification fails.
    token, _claims = mint_ticket_jwt(
        secret="not-the-real-secret",
        sub=USER_ID,
        tid=TENANT_ID,
        res=f"user:{USER_ID}",
        jti="jti-bad-sig",
        ttl_s=60,
    )
    from src.backend.realtime.jwt_tokens import TicketInvalidError

    with pytest.raises(TicketInvalidError):
        await verify_ticket_async(token)


# ---------------------------------------------------------------------------
# Lifespan install -> uninstall cycle preserves seam state
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_install_realtime_installs_verifier(redis, monkeypatch) -> None:
    """Covers the explicit ``install_realtime`` path that Aether drives."""

    from src.backend.realtime import lifespan as realtime_lifespan

    monkeypatch.setattr(
        realtime_lifespan, "get_redis_client", lambda: redis
    )

    manager = await realtime_lifespan.install_realtime()
    try:
        assert get_ticket_verifier() is not None

        # Mint a ticket + verify through the Kratos seam to prove the
        # lifespan-installed verifier actually works.
        minted = await mint_ticket_for_caller(
            redis=redis,
            principal=_principal(),
            resource=f"user:{USER_ID}",
            ttl_s=60,
            settings=_settings(),
            session_check=_ok_check,
        )
        principal = await verify_ticket_async(minted.ticket)
        assert principal.user_id == USER_ID
    finally:
        await realtime_lifespan.shutdown_realtime()
        assert get_ticket_verifier() is None
