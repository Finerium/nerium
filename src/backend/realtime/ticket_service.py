"""Realtime ticket business logic.

Owner: Nike (W2 NP P3 S2).

This module composes the JWT primitive (:mod:`jwt_tokens`) with the
Redis active + revocation stores (:mod:`ticket_store`) and the
resource-authorization database queries. It is the single entry point
for:

1. :func:`mint_ticket_for_caller` - used by the HTTP endpoint
   ``POST /v1/realtime/ticket``.
2. :func:`validate_ticket_for_kratos` - installed as the
   :mod:`src.backend.ma.ticket_verifier` callback during lifespan so
   Kratos' SSE path returns an :class:`AuthPrincipal` instead of 503.
3. :func:`revoke_ticket_by_jti` / :func:`revoke_tickets_for_user` -
   used by the HTTP revoke endpoint and the Aether logout hook.

Resource semantics
------------------
The ticket ``res`` claim carries one of the patterns below. The mint
endpoint runs the mapped ownership check BEFORE signing; validation
optionally re-runs a cheap pattern match if the caller passes an
``expected_resource`` argument (it does not re-query Postgres to keep
the hot path cheap).

- ``ma:session:<uuid>`` / ``builder:session:<uuid>``: caller must own
  the ``ma_session`` row (row.user_id = caller.user_id AND
  row.tenant_id = caller.tenant_id). Both prefixes are aliases; the
  Builder UI surface uses ``builder:session:*`` per the S2 spawn
  directive while Kratos' SSE URL uses the ``ma:session:*`` shape
  inside the bus contract. We normalise to ``ma:session:<uuid>``
  internally so both paths share one active-set row.
- ``user:<uuid>``: caller must be that user (sub claim equals the
  target). Primarily for presence / notifications streams.
- ``tenant:<uuid>``: reserved for admin panels; caller must carry the
  ``realtime:tenant`` scope AND belong to that tenant. Declared here so
  Eunomia can slot into the seam without a contract amendment.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional
from uuid import UUID, uuid4

from src.backend.config import Settings, get_settings
from src.backend.errors import ForbiddenProblem, NotFoundProblem
from src.backend.middleware.auth import AuthPrincipal
from src.backend.realtime.jwt_tokens import (
    DEFAULT_AUDIENCE,
    DEFAULT_ISSUER,
    DEFAULT_TICKET_TTL_S,
    MAX_TICKET_TTL_S,
    TICKET_SCOPE,
    TicketClaims,
    TicketInvalidError,
    TicketResourceMismatchError,
    TicketRevokedError,
    clamp_ttl,
    decode_ticket_jwt,
    mint_ticket_jwt,
)
from src.backend.realtime.ticket_store import (
    is_revoked,
    load_active,
    record_active,
    revoke_all_for_user,
    revoke_jti,
)
from src.backend.utils.uuid7 import uuid7

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Resource parsing + ownership checks
# ---------------------------------------------------------------------------


# Recognised resource scopes. Keys are the canonical prefix used in the
# ``res`` claim. Values are tuples of (aliases accepted at mint time,
# needs_uuid suffix).
_RESOURCE_PREFIXES: dict[str, tuple[tuple[str, ...], bool]] = {
    "ma:session": (("ma:session", "builder:session"), True),
    "user": (("user",), True),
    "tenant": (("tenant",), True),
}


def _normalise_resource(resource: str) -> str:
    """Return the canonical ``<scope>:<id>`` resource string.

    Raises :class:`ValueError` on syntactic problems. The mint endpoint
    converts those into a 422 ValidationProblem.
    """

    if not resource:
        raise ValueError("resource must be non-empty")
    trimmed = resource.strip()
    if " " in trimmed or "\n" in trimmed or "\t" in trimmed:
        raise ValueError("resource must not contain whitespace")
    parts = trimmed.split(":")
    if len(parts) < 2:
        raise ValueError(
            "resource must be '<scope>:<id>' or '<scope>:<subscope>:<id>'"
        )

    # Two shapes: ``<scope>:<id>`` or ``<scope>:<subscope>:<id>``.
    if len(parts) == 2:
        scope = parts[0]
        ident = parts[1]
    else:
        scope = f"{parts[0]}:{parts[1]}"
        ident = ":".join(parts[2:])

    canonical: Optional[str] = None
    requires_uuid = False
    for canon, (aliases, needs_uuid) in _RESOURCE_PREFIXES.items():
        if scope in aliases:
            canonical = canon
            requires_uuid = needs_uuid
            break

    if canonical is None:
        raise ValueError(f"resource scope {scope!r} is not recognised")

    if requires_uuid:
        try:
            UUID(ident)
        except ValueError as exc:
            raise ValueError(
                f"resource id {ident!r} is not a valid UUID"
            ) from exc

    return f"{canonical}:{ident}"


def split_resource(resource: str) -> tuple[str, str]:
    """Return ``(scope, identifier)`` for a canonical resource string."""

    canonical = _normalise_resource(resource)
    scope, _, ident = canonical.rpartition(":")
    return scope, ident


# Optional Postgres ownership check callable. Injected by the HTTP
# endpoint with the shape ``fn(user_id, tenant_id, session_id) -> bool``.
# Kept as an injection point so unit tests can mock the DB without
# spinning asyncpg; the endpoint wires the real implementation below.
SessionOwnershipCheck = Callable[[UUID, UUID, UUID], Awaitable[bool]]


async def _default_session_ownership_check(
    user_id: UUID,
    tenant_id: UUID,
    session_id: UUID,
) -> bool:
    """Return True when the ``ma_session`` row belongs to the caller.

    Uses the same tenant-scoped connection pattern Kratos uses so RLS
    silently filters cross-tenant rows. Missing row -> False.
    """

    from src.backend.db.pool import get_pool
    from src.backend.db.tenant import tenant_scoped
    from src.backend.ma.queries import select_session_by_id

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        row = await select_session_by_id(conn, session_id=session_id)
    if row is None:
        return False
    row_user = str(row["user_id"]) if row.get("user_id") is not None else ""
    return row_user == str(user_id)


async def check_resource_ownership(
    principal: AuthPrincipal,
    resource: str,
    *,
    session_check: Optional[SessionOwnershipCheck] = None,
) -> None:
    """Raise 403/404 when ``principal`` may not mint a ticket for ``resource``.

    Called by the mint endpoint after auth but before signing.
    """

    canonical = _normalise_resource(resource)
    scope, ident = canonical.rpartition(":")[0], canonical.rpartition(":")[2]

    if scope == "ma:session":
        try:
            user_id = UUID(principal.user_id)
            tenant_id = UUID(principal.tenant_id)
            session_id = UUID(ident)
        except ValueError as exc:
            raise NotFoundProblem(detail="session not found") from exc
        check = session_check or _default_session_ownership_check
        if not await check(user_id, tenant_id, session_id):
            # Do not leak existence. 404 matches the Kratos routes.
            raise NotFoundProblem(detail="session not found")
        return

    if scope == "user":
        if ident != str(principal.user_id):
            raise ForbiddenProblem(
                detail="cannot mint ticket for another user"
            )
        return

    if scope == "tenant":
        if ident != str(principal.tenant_id):
            raise ForbiddenProblem(
                detail="cannot mint ticket for another tenant"
            )
        # Reserved for admin surfaces; require the explicit scope so a
        # regular user session cannot escalate by naming its tenant.
        if "realtime:tenant" not in principal.scopes:
            raise ForbiddenProblem(
                detail="tenant-scope realtime ticket requires realtime:tenant scope"
            )
        return

    # Defensive: _normalise_resource rejected unknown scopes, so this
    # branch is only hit if the prefix map and ownership map drift.
    raise ForbiddenProblem(detail="unsupported resource scope")


# ---------------------------------------------------------------------------
# Mint + validate + revoke
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class MintedTicket:
    """Result of a successful :func:`mint_ticket_for_caller` call."""

    ticket: str
    jti: str
    resource: str
    issued_at: int
    expires_at: int


async def mint_ticket_for_caller(
    *,
    redis: Any,
    principal: AuthPrincipal,
    resource: str,
    ttl_s: Optional[int] = None,
    settings: Optional[Settings] = None,
    session_check: Optional[SessionOwnershipCheck] = None,
    now_unix: Optional[int] = None,
) -> MintedTicket:
    """Mint a realtime ticket after the caller passes the ownership gate.

    Steps
    -----
    1. Normalise + validate the resource pattern.
    2. Run the ownership check (DB hit for session scope, claim match
       for user / tenant scope).
    3. Allocate a uuid7-based jti so the ordering aligns with the
       per-user sorted-set index used at logout time.
    4. Sign the JWT.
    5. Persist the active record in Redis.

    Returns the wire payload the HTTP endpoint surfaces back to the
    caller.
    """

    cfg = settings or get_settings()
    secret = cfg.effective_realtime_ticket_secret()
    if not secret:
        # Defensive: production validate_production_secrets catches
        # this at lifespan, but tests that skip the lifespan hit this
        # path with a clear RuntimeError.
        raise RuntimeError(
            "Realtime ticket secret is unset. See "
            "NERIUM_REALTIME_TICKET_SECRET."
        )

    normalised = _normalise_resource(resource)
    await check_resource_ownership(
        principal, normalised, session_check=session_check
    )

    jti = uuid7().hex
    now = int(now_unix if now_unix is not None else time.time())
    ttl = clamp_ttl(ttl_s)
    token, claims = mint_ticket_jwt(
        secret=secret,
        sub=str(principal.user_id),
        tid=str(principal.tenant_id),
        res=normalised,
        jti=jti,
        ttl_s=ttl,
        issuer=DEFAULT_ISSUER,
        audience=DEFAULT_AUDIENCE,
        now_unix=now,
    )

    try:
        await record_active(
            redis,
            jti=jti,
            sub=claims.sub,
            tid=claims.tid,
            res=claims.res,
            exp_unix=claims.exp,
            now_unix=now,
        )
    except Exception:
        # Active record write failure is logged but not fatal: the
        # ticket itself is cryptographically valid for ttl seconds.
        # Downstream revocation would miss it, which is the tradeoff
        # we accept given the short TTL.
        logger.warning(
            "realtime.ticket.active_store_failed jti=%s", jti, exc_info=True
        )

    return MintedTicket(
        ticket=token,
        jti=jti,
        resource=normalised,
        issued_at=claims.iat,
        expires_at=claims.exp,
    )


async def validate_ticket(
    *,
    redis: Any,
    ticket: str,
    expected_resource: Optional[str] = None,
    settings: Optional[Settings] = None,
) -> TicketClaims:
    """Validate a realtime ticket end-to-end.

    - Signature + expiry: :func:`decode_ticket_jwt`.
    - Revocation: :func:`is_revoked`.
    - Optional resource pattern check.

    Returns the :class:`TicketClaims` container so the caller can
    surface ``sub``, ``tid``, ``res`` without re-decoding.
    """

    cfg = settings or get_settings()
    secret = cfg.effective_realtime_ticket_secret()
    if not secret:
        raise TicketInvalidError(detail="ticket_secret_unset")

    claims = decode_ticket_jwt(ticket, secret=secret)

    if await is_revoked(redis, claims.jti):
        raise TicketRevokedError()

    if expected_resource is not None:
        try:
            expected_canonical = _normalise_resource(expected_resource)
        except ValueError as exc:
            raise TicketResourceMismatchError(
                detail="resource_invalid"
            ) from exc
        if claims.res != expected_canonical:
            raise TicketResourceMismatchError()

    return claims


def principal_from_claims(claims: TicketClaims) -> AuthPrincipal:
    """Build an :class:`AuthPrincipal` from decoded ticket claims.

    Scopes collapse to the ticket scope literal (``realtime:ticket``)
    so downstream authorisation code can distinguish a ticket-minted
    principal from a bearer-minted one.
    """

    return AuthPrincipal(
        user_id=claims.sub,
        tenant_id=claims.tid,
        scopes=frozenset({claims.scope or TICKET_SCOPE}),
        issuer=claims.iss or DEFAULT_ISSUER,
        token_type="realtime_ticket",
        raw_claims=dict(claims.raw),
    )


async def revoke_ticket_by_jti(
    *,
    redis: Any,
    jti: str,
    principal: AuthPrincipal,
) -> bool:
    """Revoke a ticket the caller owns.

    Ownership model
    ---------------
    Revocation is restricted to the original mint caller: the sub
    claim on the active record must match ``principal.user_id``.
    Admin overrides land in a later Eunomia surface.

    Returns ``True`` if the revocation was freshly installed,
    ``False`` for a no-op (already revoked or expired).
    """

    if not jti:
        raise NotFoundProblem(detail="ticket not found")
    active = await load_active(redis, jti)
    if active is None:
        raise NotFoundProblem(detail="ticket not found")
    if active.sub != str(principal.user_id):
        raise ForbiddenProblem(detail="ticket does not belong to caller")
    return await revoke_jti(redis, jti=jti, exp_unix=active.exp)


async def revoke_tickets_for_user(
    *,
    redis: Any,
    user_id: str,
) -> int:
    """Revoke every live ticket for ``user_id``.

    Shortcut exposed so Aether's logout path can sweep tickets the
    session minted without opening a dependency on ticket_store.
    """

    return await revoke_all_for_user(redis, user_id=user_id)


# ---------------------------------------------------------------------------
# Kratos verifier adapter
# ---------------------------------------------------------------------------


def build_kratos_verifier(
    *,
    redis_resolver: Callable[[], Any],
    settings_resolver: Callable[[], Settings] = get_settings,
) -> Callable[[str], Awaitable[AuthPrincipal]]:
    """Return the async verifier callable installed at lifespan startup.

    The Kratos seam (:mod:`src.backend.ma.ticket_verifier`) accepts
    either sync or async callables via the :data:`AsyncTicketVerifier`
    variant added alongside Nike S2. Returning the async shape avoids
    the "sync-from-async" thread bridge and lets us await Redis
    revocation lookups directly on the FastAPI event loop.

    ``redis_resolver`` + ``settings_resolver`` are injected so the
    closure does not capture a Redis client that was bound to the
    test event loop at lifespan time; every invocation resolves a
    fresh handle via the installed pool accessor.
    """

    async def _async_verifier(ticket: str) -> AuthPrincipal:
        redis = redis_resolver()
        cfg = settings_resolver()
        claims = await validate_ticket(
            redis=redis,
            ticket=ticket,
            expected_resource=None,
            settings=cfg,
        )
        return principal_from_claims(claims)

    return _async_verifier


__all__ = [
    "DEFAULT_TICKET_TTL_S",
    "MAX_TICKET_TTL_S",
    "MintedTicket",
    "SessionOwnershipCheck",
    "build_kratos_verifier",
    "check_resource_ownership",
    "mint_ticket_for_caller",
    "principal_from_claims",
    "revoke_ticket_by_jti",
    "revoke_tickets_for_user",
    "split_resource",
    "validate_ticket",
]
