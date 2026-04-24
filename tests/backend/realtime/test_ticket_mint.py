"""Unit tests for the Nike S2 ticket mint flow.

Exercises :func:`mint_ticket_for_caller` + the underlying JWT +
resource-normalise primitives in isolation (no FastAPI, no asyncpg).
"""

from __future__ import annotations

import time
from typing import Awaitable, Callable
from uuid import UUID

import pytest
import pytest_asyncio
from fakeredis import aioredis as fake_aioredis

from src.backend.config import Settings
from src.backend.errors import ForbiddenProblem, NotFoundProblem
from src.backend.middleware.auth import AuthPrincipal
from src.backend.realtime.jwt_tokens import (
    DEFAULT_TICKET_TTL_S,
    MAX_TICKET_TTL_S,
    decode_ticket_jwt,
    mint_ticket_jwt,
)
from src.backend.realtime.ticket_service import (
    MintedTicket,
    check_resource_ownership,
    mint_ticket_for_caller,
    split_resource,
)
from src.backend.realtime.ticket_store import (
    ACTIVE_KEY_FMT,
    USER_INDEX_KEY_FMT,
    load_active,
)


USER_ID = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa"
TENANT_ID = "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb"
SESSION_ID = "cccccccc-cccc-7ccc-8ccc-cccccccccccc"


def _principal() -> AuthPrincipal:
    return AuthPrincipal(
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        scopes=frozenset({"builder:write"}),
    )


def _settings() -> Settings:
    return Settings(env="development")


@pytest_asyncio.fixture
async def redis():
    client = fake_aioredis.FakeRedis(decode_responses=True)
    await client.flushall()
    try:
        yield client
    finally:
        await client.aclose()


# ---------------------------------------------------------------------------
# Raw JWT primitive
# ---------------------------------------------------------------------------


def test_mint_ticket_jwt_produces_roundtrippable_token() -> None:
    secret = "dev-secret"
    token, claims = mint_ticket_jwt(
        secret=secret,
        sub=USER_ID,
        tid=TENANT_ID,
        res=f"ma:session:{SESSION_ID}",
        jti="jti-abc",
        ttl_s=120,
    )
    decoded = decode_ticket_jwt(token, secret=secret)
    assert decoded.sub == USER_ID
    assert decoded.tid == TENANT_ID
    assert decoded.res == f"ma:session:{SESSION_ID}"
    assert decoded.jti == "jti-abc"
    assert decoded.exp - decoded.iat == 120
    assert claims.exp == decoded.exp


def test_mint_ticket_jwt_clamps_ttl_above_max() -> None:
    secret = "dev-secret"
    _token, claims = mint_ticket_jwt(
        secret=secret,
        sub=USER_ID,
        tid=TENANT_ID,
        res=f"ma:session:{SESSION_ID}",
        jti="jti-clamp",
        ttl_s=MAX_TICKET_TTL_S * 10,
    )
    assert claims.exp - claims.iat == MAX_TICKET_TTL_S


def test_mint_ticket_jwt_defaults_ttl_when_none() -> None:
    _token, claims = mint_ticket_jwt(
        secret="k",
        sub=USER_ID,
        tid=TENANT_ID,
        res=f"ma:session:{SESSION_ID}",
        jti="jti-default",
        ttl_s=None,
    )
    assert claims.exp - claims.iat == DEFAULT_TICKET_TTL_S


def test_mint_ticket_jwt_rejects_empty_secret() -> None:
    with pytest.raises(RuntimeError):
        mint_ticket_jwt(
            secret="",
            sub=USER_ID,
            tid=TENANT_ID,
            res=f"ma:session:{SESSION_ID}",
            jti="x",
        )


def test_mint_ticket_jwt_rejects_missing_fields() -> None:
    with pytest.raises(ValueError):
        mint_ticket_jwt(
            secret="k",
            sub="",
            tid=TENANT_ID,
            res=f"ma:session:{SESSION_ID}",
            jti="x",
        )


# ---------------------------------------------------------------------------
# Resource normalisation
# ---------------------------------------------------------------------------


def test_split_resource_accepts_ma_session_alias() -> None:
    scope, ident = split_resource(f"builder:session:{SESSION_ID}")
    assert scope == "ma:session"
    assert ident == SESSION_ID


def test_split_resource_accepts_canonical_prefix() -> None:
    scope, ident = split_resource(f"ma:session:{SESSION_ID}")
    assert scope == "ma:session"
    assert ident == SESSION_ID


def test_split_resource_rejects_bad_uuid() -> None:
    with pytest.raises(ValueError):
        split_resource("ma:session:not-a-uuid")


def test_split_resource_rejects_unknown_scope() -> None:
    with pytest.raises(ValueError):
        split_resource(f"unknown:scope:{SESSION_ID}")


def test_split_resource_user_scope() -> None:
    scope, ident = split_resource(f"user:{USER_ID}")
    assert scope == "user"
    assert ident == USER_ID


# ---------------------------------------------------------------------------
# Ownership checks
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_check_resource_ownership_user_scope_match() -> None:
    await check_resource_ownership(_principal(), f"user:{USER_ID}")


@pytest.mark.asyncio
async def test_check_resource_ownership_user_scope_mismatch_403() -> None:
    with pytest.raises(ForbiddenProblem):
        await check_resource_ownership(
            _principal(),
            f"user:{'d' * 8}-dddd-7ddd-8ddd-{'d' * 12}",
        )


@pytest.mark.asyncio
async def test_check_resource_ownership_tenant_requires_scope() -> None:
    principal = AuthPrincipal(
        user_id=USER_ID, tenant_id=TENANT_ID, scopes=frozenset()
    )
    with pytest.raises(ForbiddenProblem):
        await check_resource_ownership(principal, f"tenant:{TENANT_ID}")


@pytest.mark.asyncio
async def test_check_resource_ownership_tenant_with_scope() -> None:
    principal = AuthPrincipal(
        user_id=USER_ID,
        tenant_id=TENANT_ID,
        scopes=frozenset({"realtime:tenant"}),
    )
    await check_resource_ownership(principal, f"tenant:{TENANT_ID}")


@pytest.mark.asyncio
async def test_check_resource_ownership_session_404_on_missing() -> None:
    async def _check(
        _user_id: UUID, _tenant_id: UUID, _session_id: UUID
    ) -> bool:
        return False

    with pytest.raises(NotFoundProblem):
        await check_resource_ownership(
            _principal(),
            f"ma:session:{SESSION_ID}",
            session_check=_check,
        )


@pytest.mark.asyncio
async def test_check_resource_ownership_session_ok() -> None:
    captured: dict[str, tuple[UUID, UUID, UUID]] = {}

    async def _check(
        user_id: UUID, tenant_id: UUID, session_id: UUID
    ) -> bool:
        captured["args"] = (user_id, tenant_id, session_id)
        return True

    await check_resource_ownership(
        _principal(),
        f"builder:session:{SESSION_ID}",
        session_check=_check,
    )
    args = captured["args"]
    assert args[0] == UUID(USER_ID)
    assert args[1] == UUID(TENANT_ID)
    assert args[2] == UUID(SESSION_ID)


# ---------------------------------------------------------------------------
# mint_ticket_for_caller end-to-end (Redis + JWT + active record)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mint_persists_active_record_and_user_index(redis) -> None:
    async def _ok_check(*_args, **_kwargs) -> bool:
        return True

    minted: MintedTicket = await mint_ticket_for_caller(
        redis=redis,
        principal=_principal(),
        resource=f"builder:session:{SESSION_ID}",
        ttl_s=120,
        settings=_settings(),
        session_check=_ok_check,
    )
    assert minted.resource == f"ma:session:{SESSION_ID}"
    assert minted.expires_at - minted.issued_at == 120

    active = await load_active(redis, minted.jti)
    assert active is not None
    assert active.sub == USER_ID
    assert active.tid == TENANT_ID
    assert active.res == f"ma:session:{SESSION_ID}"
    assert active.exp == minted.expires_at

    # User index contains the jti with exp as score.
    index_raw = await redis.zrange(
        USER_INDEX_KEY_FMT.format(user_id=USER_ID), 0, -1, withscores=True
    )
    assert len(index_raw) == 1
    member, score = index_raw[0]
    assert member == minted.jti
    assert int(score) == minted.expires_at


@pytest.mark.asyncio
async def test_mint_ticket_default_ttl_applied(redis) -> None:
    async def _ok_check(*_args, **_kwargs) -> bool:
        return True

    minted = await mint_ticket_for_caller(
        redis=redis,
        principal=_principal(),
        resource=f"ma:session:{SESSION_ID}",
        ttl_s=None,
        settings=_settings(),
        session_check=_ok_check,
    )
    assert minted.expires_at - minted.issued_at == DEFAULT_TICKET_TTL_S


@pytest.mark.asyncio
async def test_mint_ticket_rejects_invalid_resource(redis) -> None:
    with pytest.raises(ValueError):
        await mint_ticket_for_caller(
            redis=redis,
            principal=_principal(),
            resource="not-a-valid-resource",
            settings=_settings(),
            session_check=None,
        )


@pytest.mark.asyncio
async def test_mint_ticket_secret_fallback_to_secret_key(redis) -> None:
    """``realtime_ticket_secret`` empty falls back to ``secret_key`` in dev."""

    settings = Settings(env="development")  # realtime_ticket_secret = ""
    assert settings.realtime_ticket_secret.get_secret_value() == ""
    assert settings.effective_realtime_ticket_secret() == (
        settings.secret_key.get_secret_value()
    )

    async def _ok_check(*_args, **_kwargs) -> bool:
        return True

    minted = await mint_ticket_for_caller(
        redis=redis,
        principal=_principal(),
        resource=f"user:{USER_ID}",
        settings=settings,
        session_check=_ok_check,
    )
    decoded = decode_ticket_jwt(
        minted.ticket, secret=settings.effective_realtime_ticket_secret()
    )
    assert decoded.sub == USER_ID


@pytest.mark.asyncio
async def test_mint_ticket_fails_when_secret_is_empty(redis) -> None:
    """Secret-missing failure surfaces as RuntimeError.

    We build a Settings subclass that returns empty from the effective
    secret accessor rather than monkeypatching the frozen model.
    """

    class _NoSecretSettings(Settings):
        def effective_realtime_ticket_secret(self) -> str:  # type: ignore[override]
            return ""

    settings = _NoSecretSettings(env="development")
    with pytest.raises(RuntimeError):
        await mint_ticket_for_caller(
            redis=redis,
            principal=_principal(),
            resource=f"user:{USER_ID}",
            settings=settings,
            session_check=None,
        )


@pytest.mark.asyncio
async def test_mint_ticket_refuses_cross_user_resource(redis) -> None:
    other_user = "dddddddd-dddd-7ddd-8ddd-dddddddddddd"
    with pytest.raises(ForbiddenProblem):
        await mint_ticket_for_caller(
            redis=redis,
            principal=_principal(),
            resource=f"user:{other_user}",
            settings=_settings(),
            session_check=None,
        )
