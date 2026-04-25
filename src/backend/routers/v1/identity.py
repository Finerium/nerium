"""HTTP routes for ``/v1/identity/agents`` agent identity CRUD.

Owner: Tethys (W2 NP P5 Session 1).

Endpoints
---------
- ``POST   /v1/identity/agents``           register a new agent identity
- ``GET    /v1/identity/agents``           list every identity owned by
                                            the authenticated user
- ``GET    /v1/identity/agents/{agent_id}`` fetch a single identity
- ``DELETE /v1/identity/agents/{agent_id}`` revoke (soft-delete via status)

Auth
----
Every endpoint requires an authenticated human ``AuthPrincipal`` (via
the existing Aether ``AuthMiddleware`` bearer JWT). RLS already filters
to the principal's tenant; the router additionally filters by
``owner_user_id`` so a user inside the same tenant cannot read or
mutate another user's agents. Cross-user access returns 404 (not 403)
to avoid leaking existence.

One-time private PEM
--------------------
The POST handler returns ``private_pem`` exactly once. The server NEVER
persists the private key. Subsequent reads via GET strip ``private_pem``
entirely. Rotating the key (S2 ferry-deferred) will require a fresh
keypair generation + continuity signature dance per the agent_identity
contract Section 4.2.

Contract refs
-------------
- ``docs/contracts/agent_identity.contract.md`` Sections 4.1, 4.5, 4.6.
- ``docs/contracts/rest_api_base.contract.md`` Section 3.1 /v1 prefix.
"""

from __future__ import annotations

import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Path, Request, Response, status
from pydantic import Field

from src.backend.errors import NotFoundProblem, UnauthorizedProblem
from src.backend.middleware.auth import AuthPrincipal
from src.backend.models.base import NeriumModel
from src.backend.registry.identity.crypto import generate_ed25519_keypair
from src.backend.registry.identity.service import (
    AgentIdentityRow,
    create_identity,
    delete_identity,
    get_identity_by_id,
    list_identities_for_owner,
)

logger = logging.getLogger(__name__)

identity_router = APIRouter(
    prefix="/identity/agents",
    tags=["identity"],
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class IdentityCreateRequest(NeriumModel):
    """POST body. Server generates the keypair; client only names it."""

    display_name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Human-readable agent name shown on the IdentityCard UI.",
    )


class IdentitySummary(NeriumModel):
    """Read response (no private PEM ever)."""

    agent_id: UUID = Field(..., description="UUID v7 primary key.")
    display_name: str
    public_pem: str = Field(
        ...,
        description="Ed25519 SubjectPublicKeyInfo PEM. Used to verify "
        "JWTs + raw artifact signatures issued by this agent.",
    )
    status: str = Field(
        ...,
        description="active | retiring | revoked. Only active + retiring "
        "are accepted by the verify hook.",
    )
    created_at: datetime
    retires_at: datetime | None = None
    revoked_at: datetime | None = None


class IdentityCreateResponse(IdentitySummary):
    """POST response. Surfaces ``private_pem`` exactly once.

    The server never persists ``private_pem``. The client MUST capture
    it from this response and store it securely. There is no recovery
    path: lost private key means re-registering with a new agent.
    """

    private_pem: str = Field(
        ...,
        description="Ed25519 PKCS8 PEM. Returned ONCE; never stored "
        "server-side. The owner is responsible for capture + safekeeping.",
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_auth(request: Request) -> AuthPrincipal:
    """Resolve the authenticated principal or raise 401."""

    auth = getattr(request.state, "auth", None)
    if not isinstance(auth, AuthPrincipal):
        raise UnauthorizedProblem(detail="No authenticated principal.")
    return auth


def _principal_uuids(principal: AuthPrincipal) -> tuple[UUID, UUID]:
    """Return ``(tenant_id, user_id)`` validated as UUIDs."""

    try:
        return UUID(principal.tenant_id), UUID(principal.user_id)
    except (TypeError, ValueError) as exc:
        raise UnauthorizedProblem(
            detail="JWT sub/tenant_id claim is not a valid UUID.",
        ) from exc


def _to_summary(row: AgentIdentityRow) -> IdentitySummary:
    return IdentitySummary(
        agent_id=row.id,
        display_name=row.display_name,
        public_pem=row.public_key_pem,
        status=row.status,
        created_at=row.created_at,
        retires_at=row.retires_at,
        revoked_at=row.revoked_at,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@identity_router.post(
    "",
    response_model=IdentityCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_identity(
    body: IdentityCreateRequest,
    request: Request,
) -> IdentityCreateResponse:
    """Generate a fresh Ed25519 keypair + persist the public PEM.

    The private PEM is returned to the caller exactly once and is
    never written to the database, the access log, or telemetry.
    """

    principal = _require_auth(request)
    tenant_id, user_id = _principal_uuids(principal)

    public_pem, private_pem = generate_ed25519_keypair()
    row = await create_identity(
        tenant_id=tenant_id,
        owner_user_id=user_id,
        display_name=body.display_name,
        public_pem=public_pem,
    )

    return IdentityCreateResponse(
        agent_id=row.id,
        display_name=row.display_name,
        public_pem=row.public_key_pem,
        private_pem=private_pem,
        status=row.status,
        created_at=row.created_at,
        retires_at=row.retires_at,
        revoked_at=row.revoked_at,
    )


@identity_router.get(
    "",
    response_model=list[IdentitySummary],
)
async def list_my_identities(request: Request) -> list[IdentitySummary]:
    """Return every identity owned by the authenticated user."""

    principal = _require_auth(request)
    tenant_id, user_id = _principal_uuids(principal)
    rows = await list_identities_for_owner(
        tenant_id=tenant_id,
        owner_user_id=user_id,
    )
    return [_to_summary(row) for row in rows]


@identity_router.get(
    "/{agent_id}",
    response_model=IdentitySummary,
)
async def get_identity(
    request: Request,
    agent_id: UUID = Path(..., description="UUID of the agent identity."),
) -> IdentitySummary:
    """Return a single identity owned by the authenticated user.

    Cross-user (same tenant, different owner) and cross-tenant reads
    return 404 so existence is not leaked.
    """

    principal = _require_auth(request)
    tenant_id, user_id = _principal_uuids(principal)
    row = await get_identity_by_id(
        tenant_id=tenant_id,
        agent_id=agent_id,
        owner_user_id=user_id,
    )
    if row is None:
        raise NotFoundProblem(detail="Agent identity not found.")
    return _to_summary(row)


@identity_router.delete(
    "/{agent_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def revoke_identity(
    request: Request,
    agent_id: UUID = Path(..., description="UUID of the agent identity."),
) -> Response:
    """Revoke the identity (status -> ``revoked``, ``revoked_at`` -> now()).

    Subsequent JWT verifications via :func:`require_agent_jwt` reject
    every request bearing this identity. Returns 204 on success and
    404 when the identity is missing or already revoked.
    """

    principal = _require_auth(request)
    tenant_id, user_id = _principal_uuids(principal)
    revoked = await delete_identity(
        tenant_id=tenant_id,
        owner_user_id=user_id,
        agent_id=agent_id,
    )
    if not revoked:
        raise NotFoundProblem(detail="Agent identity not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["identity_router"]
