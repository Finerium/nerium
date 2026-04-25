"""EdDSA short-lived bearer token for Tethys agent identity.

Owner: Tethys (W2 NP P5 Session 1).

Issues + verifies JWTs signed with Ed25519 (``alg: EdDSA``). Used for
short-lived agent bearer tokens (WebSocket tickets, MCP tool call
attestation, marketplace purchase action). The TTL is hard-capped at
300 seconds per the prompt's strategic decision lock; callers that
need longer-lived authentication MUST use raw signed artifacts per
``docs/contracts/agent_identity.contract.md`` Section 4 instead.

Library choice
--------------
``python-jose`` does not implement EdDSA. We add :pypi:`pyjwt` for the
EdDSA path; it routes through the already-pinned ``cryptography``
backend for the actual sign + verify primitives, so no additional
crypto wheel ships. The ``pyjwt[crypto]`` extra is declared in the
project ``pyproject.toml`` under the core dependency block.

Error surface
-------------
``issue_jwt`` raises :class:`ValueError` on TTL > 300s. ``verify_jwt``
raises :class:`UnauthorizedProblem` (HTTP 401 problem+json) on every
failure mode (signature, expiry, malformed token, missing claim).
That keeps the FastAPI dependency in :mod:`middleware` a single try
block.
"""

from __future__ import annotations

import time
from typing import Any

import jwt
from jwt.exceptions import (
    DecodeError,
    ExpiredSignatureError,
    InvalidSignatureError,
    InvalidTokenError,
)

from src.backend.errors import UnauthorizedProblem

__all__ = [
    "JWT_TTL_MAX_SEC",
    "issue_jwt",
    "verify_jwt",
]


JWT_TTL_MAX_SEC: int = 300
"""Hard cap on JWT TTL (seconds). Locked by the agent identity contract.

Increasing this requires a V4 ferry per the Tethys prompt's strategic
decision hard-stops. Primary identity verification path is raw signed
artifacts; bearer tokens stay short-lived to bound replay-attack
exposure on stolen tokens.
"""

_ALGORITHM = "EdDSA"
"""Ed25519 JWS algorithm name per RFC 8037."""


def issue_jwt(
    agent_id: str,
    claims: dict[str, Any],
    ttl_sec: int,
    private_pem: str,
) -> str:
    """Sign a JWT with the agent identity's Ed25519 private PEM.

    Parameters
    ----------
    agent_id
        UUID string for the identity. Stored as the ``sub`` claim so the
        verifier can resolve back to the public PEM in the database.
    claims
        Caller-supplied additional claims (scope, target resource, etc.).
        Reserved keys (``sub``, ``iat``, ``exp``) are overwritten by this
        function; the caller's values for those keys are dropped silently
        because the function cannot honour them without breaking the
        contract.
    ttl_sec
        Token lifetime in seconds. Must be ``>= 1`` and ``<= 300`` or the
        function raises :class:`ValueError` with a stable message that
        the FastAPI router translates into a 422 problem+json.
    private_pem
        PKCS8 PEM string from :func:`generate_ed25519_keypair`.

    Returns
    -------
    str
        Encoded JWT compact string (``header.payload.signature``).

    Raises
    ------
    ValueError
        If ``ttl_sec`` is outside ``[1, 300]``.
    """

    if not isinstance(ttl_sec, int) or ttl_sec < 1:
        raise ValueError("ttl_sec must be a positive integer")
    if ttl_sec > JWT_TTL_MAX_SEC:
        raise ValueError(
            f"ttl_sec={ttl_sec} exceeds JWT_TTL_MAX_SEC={JWT_TTL_MAX_SEC}"
        )

    now = int(time.time())
    payload: dict[str, Any] = dict(claims)
    payload["sub"] = str(agent_id)
    payload["iat"] = now
    payload["exp"] = now + ttl_sec

    return jwt.encode(payload, private_pem, algorithm=_ALGORITHM)


def verify_jwt(token: str, public_pem: str) -> dict[str, Any]:
    """Verify a JWT against the agent's public PEM and return the claims.

    Parameters
    ----------
    token
        Compact JWT string previously issued by :func:`issue_jwt`.
    public_pem
        SubjectPublicKeyInfo PEM string. Resolved from the
        ``agent_identity.public_key_pem`` row matching the JWT ``sub``
        claim by the FastAPI dependency layer.

    Returns
    -------
    dict[str, Any]
        Decoded claims dict including ``sub``, ``iat``, ``exp`` plus any
        custom claims passed at issue time.

    Raises
    ------
    UnauthorizedProblem
        On any verification failure: signature mismatch, expiry,
        malformed token, missing ``sub``. The 401 envelope's ``detail``
        field surfaces the underlying jwt-library reason without
        leaking sensitive token bytes.
    """

    try:
        claims: dict[str, Any] = jwt.decode(
            token,
            public_pem,
            algorithms=[_ALGORITHM],
            options={"require": ["sub", "iat", "exp"]},
        )
    except ExpiredSignatureError as exc:
        raise UnauthorizedProblem(
            detail="Agent JWT expired.",
        ) from exc
    except (InvalidSignatureError, DecodeError) as exc:
        raise UnauthorizedProblem(
            detail="Agent JWT signature failed verification.",
        ) from exc
    except InvalidTokenError as exc:
        raise UnauthorizedProblem(
            detail=f"Agent JWT rejected: {exc}",
        ) from exc

    if "sub" not in claims:
        raise UnauthorizedProblem(detail="Agent JWT missing 'sub' claim.")

    return claims
