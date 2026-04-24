"""Unit tests for ticket validation.

Exercises :func:`validate_ticket` covering happy path + every error
path (expired, revoked, bad signature, tampered payload, resource
mismatch).
"""

from __future__ import annotations

import time

import pytest
import pytest_asyncio
from fakeredis import aioredis as fake_aioredis
from jose import jwt

from src.backend.config import Settings
from src.backend.realtime.jwt_tokens import (
    DEFAULT_AUDIENCE,
    DEFAULT_ISSUER,
    JWT_ALGORITHM,
    TICKET_SCOPE,
    TicketExpiredError,
    TicketInvalidError,
    TicketResourceMismatchError,
    TicketRevokedError,
    mint_ticket_jwt,
)
from src.backend.realtime.ticket_service import (
    principal_from_claims,
    validate_ticket,
)
from src.backend.realtime.ticket_store import revoke_jti


USER_ID = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa"
TENANT_ID = "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb"
SESSION_ID = "cccccccc-cccc-7ccc-8ccc-cccccccccccc"


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


def _mint(
    *,
    secret: str,
    exp_offset: int = 180,
    jti: str = "jti-valid",
    res: str | None = None,
    audience: str = DEFAULT_AUDIENCE,
    issuer: str = DEFAULT_ISSUER,
) -> str:
    token, _claims = mint_ticket_jwt(
        secret=secret,
        sub=USER_ID,
        tid=TENANT_ID,
        res=res or f"ma:session:{SESSION_ID}",
        jti=jti,
        ttl_s=exp_offset,
        issuer=issuer,
        audience=audience,
    )
    return token


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_validate_happy_path(redis) -> None:
    settings = _settings()
    token = _mint(secret=settings.effective_realtime_ticket_secret())
    claims = await validate_ticket(
        redis=redis, ticket=token, settings=settings
    )
    assert claims.sub == USER_ID
    assert claims.tid == TENANT_ID
    assert claims.res == f"ma:session:{SESSION_ID}"
    assert claims.scope == TICKET_SCOPE


@pytest.mark.asyncio
async def test_principal_from_claims_maps_fields(redis) -> None:
    settings = _settings()
    token = _mint(secret=settings.effective_realtime_ticket_secret())
    claims = await validate_ticket(
        redis=redis, ticket=token, settings=settings
    )
    principal = principal_from_claims(claims)
    assert principal.user_id == USER_ID
    assert principal.tenant_id == TENANT_ID
    assert principal.token_type == "realtime_ticket"
    assert TICKET_SCOPE in principal.scopes


# ---------------------------------------------------------------------------
# Expired / bad signature / tampered / missing
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_validate_expired_token(redis) -> None:
    settings = _settings()
    secret = settings.effective_realtime_ticket_secret()
    # Bypass the clamp-to-positive check by building claims manually
    # with an exp in the past.
    past = int(time.time()) - 30
    payload = {
        "iss": DEFAULT_ISSUER,
        "aud": DEFAULT_AUDIENCE,
        "sub": USER_ID,
        "tid": TENANT_ID,
        "tenant_id": TENANT_ID,
        "res": f"ma:session:{SESSION_ID}",
        "jti": "jti-expired",
        "iat": past - 120,
        "exp": past,
        "scope": TICKET_SCOPE,
    }
    token = jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)

    with pytest.raises(TicketExpiredError):
        await validate_ticket(redis=redis, ticket=token, settings=settings)


@pytest.mark.asyncio
async def test_validate_bad_signature(redis) -> None:
    settings = _settings()
    token = _mint(secret="wrong-secret")
    with pytest.raises(TicketInvalidError):
        await validate_ticket(redis=redis, ticket=token, settings=settings)


@pytest.mark.asyncio
async def test_validate_tampered_payload(redis) -> None:
    settings = _settings()
    token = _mint(secret=settings.effective_realtime_ticket_secret())
    # Flip one character in the payload segment so signature check
    # fails.
    head, payload, sig = token.split(".")
    tampered = ".".join([head, payload[:-1] + ("A" if payload[-1] != "A" else "B"), sig])
    with pytest.raises(TicketInvalidError):
        await validate_ticket(redis=redis, ticket=tampered, settings=settings)


@pytest.mark.asyncio
async def test_validate_missing_token(redis) -> None:
    from src.backend.realtime.jwt_tokens import TicketMissingError

    with pytest.raises(TicketMissingError):
        await validate_ticket(redis=redis, ticket="", settings=_settings())


@pytest.mark.asyncio
async def test_validate_wrong_audience(redis) -> None:
    settings = _settings()
    token = _mint(
        secret=settings.effective_realtime_ticket_secret(),
        audience="other-audience",
    )
    with pytest.raises(TicketInvalidError):
        await validate_ticket(redis=redis, ticket=token, settings=settings)


@pytest.mark.asyncio
async def test_validate_wrong_issuer(redis) -> None:
    settings = _settings()
    token = _mint(
        secret=settings.effective_realtime_ticket_secret(),
        issuer="other.issuer",
    )
    with pytest.raises(TicketInvalidError):
        await validate_ticket(redis=redis, ticket=token, settings=settings)


# ---------------------------------------------------------------------------
# Revoked
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_validate_revoked_token_raises(redis) -> None:
    settings = _settings()
    secret = settings.effective_realtime_ticket_secret()
    token = _mint(secret=secret, jti="jti-revoked-1")
    # Install a revocation tombstone for the same jti.
    future_exp = int(time.time()) + 180
    assert await revoke_jti(redis, jti="jti-revoked-1", exp_unix=future_exp)

    with pytest.raises(TicketRevokedError):
        await validate_ticket(redis=redis, ticket=token, settings=settings)


@pytest.mark.asyncio
async def test_validate_revocation_is_double_safe(redis) -> None:
    """Revoking twice is idempotent + second call returns False."""

    future_exp = int(time.time()) + 180
    first = await revoke_jti(redis, jti="jti-dup", exp_unix=future_exp)
    second = await revoke_jti(redis, jti="jti-dup", exp_unix=future_exp)
    assert first is True
    assert second is False


# ---------------------------------------------------------------------------
# Resource mismatch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_validate_resource_mismatch(redis) -> None:
    settings = _settings()
    secret = settings.effective_realtime_ticket_secret()
    token = _mint(
        secret=secret,
        res=f"ma:session:{SESSION_ID}",
    )
    # Expected resource points at a DIFFERENT uuid.
    other_session = "11112222-3333-7444-8555-666677778888"
    with pytest.raises(TicketResourceMismatchError):
        await validate_ticket(
            redis=redis,
            ticket=token,
            expected_resource=f"ma:session:{other_session}",
            settings=settings,
        )


@pytest.mark.asyncio
async def test_validate_resource_alias_accepted(redis) -> None:
    """``builder:session:<uuid>`` passed as expected_resource matches a
    ticket whose canonical res is ``ma:session:<uuid>``."""

    settings = _settings()
    secret = settings.effective_realtime_ticket_secret()
    token = _mint(secret=secret, res=f"ma:session:{SESSION_ID}")
    claims = await validate_ticket(
        redis=redis,
        ticket=token,
        expected_resource=f"builder:session:{SESSION_ID}",
        settings=settings,
    )
    assert claims.res == f"ma:session:{SESSION_ID}"


@pytest.mark.asyncio
async def test_validate_invalid_expected_resource_raises(redis) -> None:
    settings = _settings()
    secret = settings.effective_realtime_ticket_secret()
    token = _mint(secret=secret)
    with pytest.raises(TicketResourceMismatchError):
        await validate_ticket(
            redis=redis,
            ticket=token,
            expected_resource="not-a-valid-resource",
            settings=settings,
        )
