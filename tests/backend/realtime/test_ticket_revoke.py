"""Unit tests for the ticket revocation pipeline.

Covers:

- :func:`revoke_jti` TTL alignment + idempotency.
- :func:`revoke_ticket_by_jti` owner-only enforcement + 404 on missing.
- :func:`revoke_tickets_for_user` sweep over the per-user sorted set.
- Tombstone expiry aligns with original ticket exp.
"""

from __future__ import annotations

import asyncio
import time

import pytest
import pytest_asyncio
from fakeredis import aioredis as fake_aioredis

from src.backend.config import Settings
from src.backend.errors import ForbiddenProblem, NotFoundProblem
from src.backend.middleware.auth import AuthPrincipal
from src.backend.realtime.ticket_service import (
    mint_ticket_for_caller,
    revoke_ticket_by_jti,
    revoke_tickets_for_user,
    validate_ticket,
)
from src.backend.realtime.jwt_tokens import TicketRevokedError
from src.backend.realtime.ticket_store import (
    REVOKED_KEY_FMT,
    is_revoked,
    revoke_jti,
)


USER_ID = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa"
TENANT_ID = "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb"
SESSION_ID = "cccccccc-cccc-7ccc-8ccc-cccccccccccc"


def _principal(user_id: str = USER_ID) -> AuthPrincipal:
    return AuthPrincipal(user_id=user_id, tenant_id=TENANT_ID)


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


async def _ok_check(*_args, **_kwargs) -> bool:
    return True


# ---------------------------------------------------------------------------
# Low-level store
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_revoke_jti_creates_tombstone(redis) -> None:
    future_exp = int(time.time()) + 120
    assert await revoke_jti(redis, jti="jti-x", exp_unix=future_exp)
    assert await is_revoked(redis, "jti-x")


@pytest.mark.asyncio
async def test_revoke_jti_idempotent(redis) -> None:
    future_exp = int(time.time()) + 120
    assert await revoke_jti(redis, jti="jti-dup", exp_unix=future_exp)
    assert not await revoke_jti(redis, jti="jti-dup", exp_unix=future_exp)


@pytest.mark.asyncio
async def test_revoke_jti_noop_when_already_expired(redis) -> None:
    past_exp = int(time.time()) - 1
    assert not await revoke_jti(redis, jti="jti-past", exp_unix=past_exp)
    assert not await is_revoked(redis, "jti-past")


@pytest.mark.asyncio
async def test_revoke_jti_ttl_matches_remaining_exp(redis) -> None:
    future_exp = int(time.time()) + 90
    await revoke_jti(redis, jti="jti-ttl", exp_unix=future_exp)
    ttl = await redis.ttl(REVOKED_KEY_FMT.format(jti="jti-ttl"))
    # fakeredis returns the remaining TTL in seconds.
    assert 0 < ttl <= 90


# ---------------------------------------------------------------------------
# High-level revoke_ticket_by_jti
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_revoke_ticket_by_jti_owner_success(redis) -> None:
    minted = await mint_ticket_for_caller(
        redis=redis,
        principal=_principal(),
        resource=f"user:{USER_ID}",
        ttl_s=120,
        settings=_settings(),
        session_check=_ok_check,
    )
    revoked = await revoke_ticket_by_jti(
        redis=redis, jti=minted.jti, principal=_principal()
    )
    assert revoked is True
    assert await is_revoked(redis, minted.jti)


@pytest.mark.asyncio
async def test_revoke_ticket_by_jti_404_on_missing(redis) -> None:
    with pytest.raises(NotFoundProblem):
        await revoke_ticket_by_jti(
            redis=redis, jti="does-not-exist", principal=_principal()
        )


@pytest.mark.asyncio
async def test_revoke_ticket_by_jti_forbidden_for_non_owner(redis) -> None:
    minted = await mint_ticket_for_caller(
        redis=redis,
        principal=_principal(),
        resource=f"user:{USER_ID}",
        ttl_s=120,
        settings=_settings(),
        session_check=_ok_check,
    )
    other_user = "dddddddd-dddd-7ddd-8ddd-dddddddddddd"
    with pytest.raises(ForbiddenProblem):
        await revoke_ticket_by_jti(
            redis=redis,
            jti=minted.jti,
            principal=_principal(user_id=other_user),
        )


@pytest.mark.asyncio
async def test_revoke_ticket_blocks_future_validate(redis) -> None:
    settings = _settings()
    minted = await mint_ticket_for_caller(
        redis=redis,
        principal=_principal(),
        resource=f"user:{USER_ID}",
        ttl_s=180,
        settings=settings,
        session_check=_ok_check,
    )
    # Still valid pre-revoke.
    claims = await validate_ticket(
        redis=redis, ticket=minted.ticket, settings=settings
    )
    assert claims.jti == minted.jti

    await revoke_ticket_by_jti(
        redis=redis, jti=minted.jti, principal=_principal()
    )
    with pytest.raises(TicketRevokedError):
        await validate_ticket(
            redis=redis, ticket=minted.ticket, settings=settings
        )


# ---------------------------------------------------------------------------
# User-wide sweep
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_revoke_all_for_user_sweeps_index(redis) -> None:
    settings = _settings()
    minted_a = await mint_ticket_for_caller(
        redis=redis,
        principal=_principal(),
        resource=f"user:{USER_ID}",
        ttl_s=120,
        settings=settings,
        session_check=_ok_check,
    )
    minted_b = await mint_ticket_for_caller(
        redis=redis,
        principal=_principal(),
        resource=f"user:{USER_ID}",
        ttl_s=120,
        settings=settings,
        session_check=_ok_check,
    )

    count = await revoke_tickets_for_user(redis=redis, user_id=USER_ID)
    assert count == 2

    for minted in (minted_a, minted_b):
        with pytest.raises(TicketRevokedError):
            await validate_ticket(
                redis=redis, ticket=minted.ticket, settings=settings
            )


@pytest.mark.asyncio
async def test_revoke_all_for_user_skips_foreign_users(redis) -> None:
    settings = _settings()
    minted = await mint_ticket_for_caller(
        redis=redis,
        principal=_principal(),
        resource=f"user:{USER_ID}",
        ttl_s=120,
        settings=settings,
        session_check=_ok_check,
    )
    other_user = "dddddddd-dddd-7ddd-8ddd-dddddddddddd"
    count = await revoke_tickets_for_user(redis=redis, user_id=other_user)
    assert count == 0
    # Original ticket still passes validation.
    claims = await validate_ticket(
        redis=redis, ticket=minted.ticket, settings=settings
    )
    assert claims.jti == minted.jti
