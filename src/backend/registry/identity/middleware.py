"""``require_agent_jwt`` FastAPI dependency for Tethys agent identity.

Owner: Tethys (W2 NP P5 Session 1).

Verifies an incoming ``Authorization: Bearer <jwt>`` header against
the ``agent_identity`` row matching the JWT ``sub`` claim. Returns an
:class:`AgentPrincipal` carrying the resolved ``agent_id``,
``owner_user_id``, and decoded claims. Crius (W2 NP P5 Session 2,
vendor identity) imports this directly to authenticate vendor agents
on its own routes.

Behaviour
---------
- 401 ``UnauthorizedProblem`` on a missing or malformed bearer header.
- 401 ``UnauthorizedProblem`` on JWT verification failure (handled
  inside :func:`verify_jwt`).
- 401 ``UnauthorizedProblem`` on identity not found (RLS-invisible,
  hard-deleted, or wrong tenant).
- 401 ``UnauthorizedProblem`` when ``agent_identity.status = 'revoked'``.
  Both ``active`` and ``retiring`` are accepted so the 14-day grace
  window from the contract is honoured at this layer.

Tenant resolution
-----------------
The dependency reads the tenant from the existing
``request.state.tenant_id`` populated by :class:`TenantBindingMiddleware`
in the request stack. If the tenant binding is missing (a route mounted
outside the binding middleware) the dependency raises 401 rather than
falling back to a default tenant, so RLS isolation cannot be bypassed
silently.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from fastapi import Request

from src.backend.errors import UnauthorizedProblem
from src.backend.registry.identity.jwt_edd import verify_jwt
from src.backend.registry.identity.service import load_public_pem_for_verify

__all__ = ["AgentPrincipal", "require_agent_jwt"]


@dataclass(frozen=True)
class AgentPrincipal:
    """Resolved agent identity for a request.

    Crius (vendor identity) consumes this dataclass directly. New
    fields land additively without breaking the import surface.
    """

    agent_id: UUID
    owner_user_id: UUID | None
    tenant_id: UUID
    status: str
    claims: dict[str, Any] = field(default_factory=dict)


_BEARER_PREFIX = "Bearer "


async def require_agent_jwt(request: Request) -> AgentPrincipal:
    """FastAPI dependency: require + verify an agent EdDSA JWT.

    Wired as ``Depends(require_agent_jwt)`` on any route that should
    only be reached by an authenticated agent. Used by Crius (vendor
    identity surfaces), Kratos (tool_use signatures), and downstream
    consumers per ``docs/contracts/agent_identity.contract.md``
    Section 4.

    Returns
    -------
    AgentPrincipal
        Frozen dataclass with the agent's UUID, owning user UUID,
        tenant UUID, key status, and the raw decoded claims dict.
    """

    token = _extract_bearer(request)

    # Tenant binding must already be on the request state. The Aether
    # middleware stack guarantees this for every authenticated route;
    # when absent we refuse rather than guess a default.
    tenant_raw = getattr(request.state, "tenant_id", None)
    if tenant_raw is None:
        raise UnauthorizedProblem(detail="No tenant binding on request.")
    try:
        tenant_id = UUID(str(tenant_raw))
    except (TypeError, ValueError) as exc:
        raise UnauthorizedProblem(
            detail="Tenant binding is not a valid UUID.",
        ) from exc

    # Decode without verifying first so we can discover the agent_id
    # carried by the ``sub`` claim and resolve its public PEM. The
    # actual signature verification runs against the resolved PEM
    # immediately afterwards, so an attacker swapping the ``sub`` to
    # a different agent's UUID still has to forge a signature with
    # that agent's private key.
    agent_id = _peek_sub(token)
    pem_status = await load_public_pem_for_verify(
        tenant_id=tenant_id,
        agent_id=agent_id,
    )
    if pem_status is None:
        raise UnauthorizedProblem(detail="Unknown agent identity.")
    public_pem, status, owner_user_id = pem_status

    if status == "revoked":
        raise UnauthorizedProblem(detail="Agent identity is revoked.")

    claims = verify_jwt(token, public_pem)

    return AgentPrincipal(
        agent_id=agent_id,
        owner_user_id=owner_user_id,
        tenant_id=tenant_id,
        status=status,
        claims=claims,
    )


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _extract_bearer(request: Request) -> str:
    """Pull the JWT compact string out of the ``Authorization`` header."""

    header = request.headers.get("Authorization") or request.headers.get(
        "authorization"
    )
    if not header or not header.startswith(_BEARER_PREFIX):
        raise UnauthorizedProblem(detail="Missing bearer token.")
    token = header[len(_BEARER_PREFIX) :].strip()
    if not token:
        raise UnauthorizedProblem(detail="Empty bearer token.")
    return token


def _peek_sub(token: str) -> UUID:
    """Return the ``sub`` claim without verifying signature.

    Used to look up the public PEM that will then verify the same
    token. We cannot verify before the lookup because the verifier
    needs the key bound to the ``sub`` claim. The subsequent
    :func:`verify_jwt` call still runs the full signature check, so
    this peek does not weaken the security model.
    """

    import jwt as _jwt
    from jwt.exceptions import DecodeError, InvalidTokenError

    try:
        unverified = _jwt.decode(
            token,
            options={"verify_signature": False, "verify_exp": False},
            algorithms=["EdDSA"],
        )
    except (DecodeError, InvalidTokenError) as exc:
        raise UnauthorizedProblem(detail="Malformed agent JWT.") from exc

    sub = unverified.get("sub")
    if not sub:
        raise UnauthorizedProblem(detail="Agent JWT missing 'sub' claim.")
    try:
        return UUID(str(sub))
    except (TypeError, ValueError) as exc:
        raise UnauthorizedProblem(
            detail="Agent JWT 'sub' is not a valid UUID.",
        ) from exc
