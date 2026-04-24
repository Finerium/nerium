"""Low-level JWT primitives for the realtime ticket service.

Owner: Nike (W2 NP P3 S2).

This module wraps :mod:`jose.jwt` in a narrow API the rest of the Nike
stack consumes, so the signature algorithm (HS256 in S2, EdDSA in a
later iteration) is toggled from a single call site. The module is
deliberately free of Redis + FastAPI imports so unit tests can drive
signing + verification without standing up the app.

Claim shape
-----------
The realtime ticket carries the following claims, keyed to the
``docs/contracts/realtime_bus.contract.md`` Section 4.5 ticket shape and
the Nike S2 spawn directive:

- ``iss``: ``nerium.realtime`` issuer tag.
- ``aud``: audience identifier (default ``nerium.realtime``). Kept narrow
  so a ticket minted for one audience can't be replayed against another.
- ``sub``: owning user id (UUID v7 string).
- ``tid``: tenant id (UUID v7 string). Separate from ``tenant_id`` used
  by Aether's bearer verifier so the two schemes never collide; the
  verifier accepts either name for defensive forward compatibility.
- ``res``: resource string the ticket authorises (e.g.
  ``ma:session:<uuid>`` or ``builder:session:<uuid>``).
- ``jti``: unique nonce (UUID v7 hex, 32 chars) used by the revocation
  store.
- ``iat``: issued-at unix seconds.
- ``exp``: expiry unix seconds. TTL <= :data:`MAX_TICKET_TTL_S`.
- ``scope``: fixed ``realtime:ticket`` so audit logs can spot realtime
  tickets vs other HS256 tokens minted elsewhere in the stack.

Policy constants
----------------
- :data:`DEFAULT_TICKET_TTL_S` = 180 s (3 min). Spawn directive cap:
  TTL <= 300 s.
- :data:`MAX_TICKET_TTL_S` = 300 s. Enforced on mint; any caller
  requesting more is clamped.
- :data:`DEFAULT_AUDIENCE` = ``nerium.realtime``.
- :data:`DEFAULT_ISSUER` = ``nerium.realtime``.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Literal, Mapping

from jose import jwt
from jose.exceptions import ExpiredSignatureError, JWTClaimsError, JWTError

from src.backend.errors import UnauthorizedProblem

logger = logging.getLogger(__name__)


JWT_ALGORITHM: Literal["HS256"] = "HS256"
"""HS256 signing per S2 spawn directive. EdDSA upgrade tracked in the
realtime_bus contract Section 11 (post-hackathon)."""

DEFAULT_TICKET_TTL_S: int = 180
"""Default ticket TTL in seconds. Spawn directive: 180 s default."""

MAX_TICKET_TTL_S: int = 300
"""Hard ceiling on ticket TTL. Spawn directive hard-stop bound; callers
requesting more are clamped at mint time."""

DEFAULT_ISSUER: str = "nerium.realtime"
"""Issuer tag written into the ``iss`` claim."""

DEFAULT_AUDIENCE: str = "nerium.realtime"
"""Audience tag written into the ``aud`` claim. Kept simple for S2 so
the contract-specified ``wss://nerium.com/ws/realtime`` audience can
move in without a wire break (the verifier accepts a configurable set)."""

TICKET_SCOPE: str = "realtime:ticket"
"""Fixed scope claim so downstream audit filters can grep realtime
tickets apart from Aether bearer tokens."""


# ---------------------------------------------------------------------------
# Structured error slugs
# ---------------------------------------------------------------------------


class TicketError(UnauthorizedProblem):
    """Base 401 raised by ticket validation failures.

    Kept as a dedicated subclass so the Kratos SSE seam and the
    WebSocket server can dispatch on the type when they want
    finer-grained reason codes without string-matching ``detail``.
    """

    slug = "unauthorized"
    title = "Authentication required"
    status = 401


class TicketMissingError(TicketError):
    """Raised when the caller presented no ticket at all."""

    def __init__(self, detail: str = "ticket_missing") -> None:
        super().__init__(detail=detail)


class TicketInvalidError(TicketError):
    """Raised on signature, claim, or format failures."""

    def __init__(self, detail: str = "token_invalid") -> None:
        super().__init__(detail=detail)


class TicketExpiredError(TicketError):
    """Raised when the ticket's ``exp`` claim is in the past."""

    def __init__(self, detail: str = "token_expired") -> None:
        super().__init__(detail=detail)


class TicketRevokedError(TicketError):
    """Raised when the ticket's ``jti`` is present in the revocation set."""

    def __init__(self, detail: str = "token_revoked") -> None:
        super().__init__(detail=detail)


class TicketResourceMismatchError(TicketError):
    """Raised when the ticket ``res`` claim does not match the expected
    resource pattern passed by the caller at validate time."""

    def __init__(self, detail: str = "resource_mismatch") -> None:
        super().__init__(detail=detail)


# ---------------------------------------------------------------------------
# Claim container
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TicketClaims:
    """Decoded + type-narrowed ticket claims.

    Only fields the app code reads are surfaced; the raw claim dict is
    kept on :attr:`raw` for advanced consumers (audit, admin diagnostics).
    """

    jti: str
    sub: str
    tid: str
    res: str
    iat: int
    exp: int
    iss: str
    aud: str
    scope: str
    raw: Mapping[str, Any]

    @property
    def expires_at_unix(self) -> int:
        return int(self.exp)

    @property
    def ttl_remaining_s(self) -> int:
        remaining = int(self.exp) - int(time.time())
        return max(0, remaining)


# ---------------------------------------------------------------------------
# Sign / verify
# ---------------------------------------------------------------------------


def clamp_ttl(ttl_s: int | None) -> int:
    """Return a TTL honouring the spawn-directive ceiling.

    ``None`` or non-positive values fall back to the default TTL.
    Values above :data:`MAX_TICKET_TTL_S` are clamped down with a log
    so mis-specified callers fail-safe rather than fail-closed.
    """

    if ttl_s is None or ttl_s <= 0:
        return DEFAULT_TICKET_TTL_S
    if ttl_s > MAX_TICKET_TTL_S:
        logger.info(
            "realtime.ticket.ttl_clamped requested=%d max=%d",
            ttl_s,
            MAX_TICKET_TTL_S,
        )
        return MAX_TICKET_TTL_S
    return int(ttl_s)


def mint_ticket_jwt(
    *,
    secret: str,
    sub: str,
    tid: str,
    res: str,
    jti: str,
    ttl_s: int | None = None,
    issuer: str = DEFAULT_ISSUER,
    audience: str = DEFAULT_AUDIENCE,
    now_unix: int | None = None,
) -> tuple[str, TicketClaims]:
    """Sign an HS256 realtime ticket.

    Parameters
    ----------
    secret
        Raw HS256 signing key. Caller is responsible for fail-closed
        behaviour when this is empty in production.
    sub, tid, res, jti
        Ticket claim material. ``jti`` MUST be unique per mint so the
        active-set / revocation-set keys in Redis remain disjoint.
    ttl_s
        Desired TTL seconds. ``None`` uses the default; values above
        :data:`MAX_TICKET_TTL_S` are clamped.
    issuer, audience
        Claim values for ``iss`` and ``aud`` respectively.
    now_unix
        Test hook: override ``time.time()`` for deterministic iat/exp.

    Returns
    -------
    tuple[str, TicketClaims]
        The signed JWT and the claims container the caller can persist
        into the Redis active set without re-decoding.
    """

    if not secret:
        raise RuntimeError(
            "Refusing to mint realtime ticket: signing secret is empty. "
            "Set NERIUM_REALTIME_TICKET_SECRET or (in development) the "
            "NERIUM_SECRET_KEY fallback."
        )
    if not sub or not tid or not res or not jti:
        raise ValueError(
            "mint_ticket_jwt requires non-empty sub, tid, res, jti."
        )

    ttl = clamp_ttl(ttl_s)
    iat = int(now_unix if now_unix is not None else time.time())
    exp = iat + ttl

    claims: dict[str, Any] = {
        "iss": issuer,
        "aud": audience,
        "sub": sub,
        "tid": tid,
        # Mirror tenant_id under both names so the Aether AuthPrincipal
        # builder (which prefers "tenant_id") can reuse the same claim
        # dict without a translation step.
        "tenant_id": tid,
        "res": res,
        "jti": jti,
        "iat": iat,
        "exp": exp,
        "scope": TICKET_SCOPE,
    }

    token = jwt.encode(claims, secret, algorithm=JWT_ALGORITHM)
    return token, TicketClaims(
        jti=jti,
        sub=sub,
        tid=tid,
        res=res,
        iat=iat,
        exp=exp,
        iss=issuer,
        aud=audience,
        scope=TICKET_SCOPE,
        raw=claims,
    )


def decode_ticket_jwt(
    token: str,
    *,
    secret: str,
    audience: str | tuple[str, ...] = DEFAULT_AUDIENCE,
    issuer: str | None = DEFAULT_ISSUER,
    verify_exp: bool = True,
) -> TicketClaims:
    """Verify an HS256 realtime ticket and return its claims.

    Error mapping
    -------------
    - Expired -> :class:`TicketExpiredError`.
    - Bad signature / malformed / wrong audience / missing claim ->
      :class:`TicketInvalidError`.

    The caller is responsible for the revocation + resource checks
    which require Redis / runtime context not available here.
    """

    if not token:
        raise TicketMissingError()
    if not secret:
        raise TicketInvalidError(detail="ticket_secret_unset")

    audiences = (audience,) if isinstance(audience, str) else tuple(audience)

    last_err: Exception | None = None
    decoded: dict[str, Any] | None = None
    for aud in audiences:
        try:
            decoded = jwt.decode(
                token,
                secret,
                algorithms=[JWT_ALGORITHM],
                audience=aud,
                issuer=issuer,
                options={
                    "require_sub": True,
                    "require_exp": True,
                    "verify_exp": verify_exp,
                    "verify_aud": True,
                    "verify_iss": issuer is not None,
                },
            )
            break
        except ExpiredSignatureError as exc:
            raise TicketExpiredError() from exc
        except JWTClaimsError as exc:
            last_err = exc
            continue
        except JWTError as exc:
            last_err = exc
            continue

    if decoded is None:
        # Defensive: ensure callers see a consistent 401 + avoid leaking
        # JWT internals through the exception message.
        logger.info(
            "realtime.ticket.decode_failed err=%s",
            type(last_err).__name__ if last_err else "unknown",
        )
        raise TicketInvalidError()

    jti = decoded.get("jti")
    sub = decoded.get("sub")
    tid = decoded.get("tid") or decoded.get("tenant_id")
    res = decoded.get("res")
    iat = decoded.get("iat")
    exp = decoded.get("exp")
    iss = decoded.get("iss", "")
    aud = decoded.get("aud", "")
    scope = decoded.get("scope", "")

    if not jti or not sub or not tid or not res or iat is None or exp is None:
        raise TicketInvalidError(detail="ticket_missing_claims")

    return TicketClaims(
        jti=str(jti),
        sub=str(sub),
        tid=str(tid),
        res=str(res),
        iat=int(iat),
        exp=int(exp),
        iss=str(iss),
        aud=str(aud) if isinstance(aud, str) else "",
        scope=str(scope),
        raw=decoded,
    )


__all__ = [
    "DEFAULT_AUDIENCE",
    "DEFAULT_ISSUER",
    "DEFAULT_TICKET_TTL_S",
    "JWT_ALGORITHM",
    "MAX_TICKET_TTL_S",
    "TICKET_SCOPE",
    "TicketClaims",
    "TicketError",
    "TicketExpiredError",
    "TicketInvalidError",
    "TicketMissingError",
    "TicketResourceMismatchError",
    "TicketRevokedError",
    "clamp_ttl",
    "decode_ticket_jwt",
    "mint_ticket_jwt",
]
