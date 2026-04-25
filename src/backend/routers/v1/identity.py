"""HTTP routes for ``/v1/identity/agents`` agent identity CRUD.

Owner: Tethys (W2 NP P5 Session 1 + T4 Session 2 deferred).

Endpoints
---------
- ``POST   /v1/identity/agents``                  register a new agent identity
- ``GET    /v1/identity/agents``                  list every identity owned by
                                                   the authenticated user
- ``GET    /v1/identity/agents/{agent_id}``       fetch a single identity
- ``DELETE /v1/identity/agents/{agent_id}``       revoke (soft-delete via status)
- ``POST   /v1/identity/agents/{agent_id}/rotate`` admin-only rotate single
                                                   agent's Ed25519 key

Auth
----
Every endpoint requires an authenticated human ``AuthPrincipal`` (via
the existing Aether ``AuthMiddleware`` bearer JWT). RLS already filters
to the principal's tenant; the router additionally filters by
``owner_user_id`` so a user inside the same tenant cannot read or
mutate another user's agents. Cross-user access returns 404 (not 403)
to avoid leaking existence.

The ``/rotate`` endpoint additionally requires the ``admin`` (or the
narrower ``admin:identity``) scope via :func:`require_admin_scope`.
This matches the spawn directive's "admin role required" wording
because key rotation crosses owner boundaries (admins rotate on
behalf of compromised user agents).

One-time private PEM
--------------------
The POST handler returns ``private_pem`` exactly once. The server NEVER
persists the private key. Subsequent reads via GET strip ``private_pem``
entirely. The rotate endpoint generates a server-side keypair too but
intentionally does NOT surface ``private_pem`` because the rotation is
admin-initiated and the new private key would otherwise leak to an
operator who is not the agent's owner; instead, the response carries
the ``new_agent_id`` so the owner can re-register with a fresh keypair
they generate themselves.

Contract refs
-------------
- ``docs/contracts/agent_identity.contract.md`` Sections 4.1, 4.2, 4.5, 4.6.
- ``docs/contracts/rest_api_base.contract.md`` Section 3.1 /v1 prefix.
- T4 spawn directive Section "Scope item 2" (admin rotate endpoint).
"""

from __future__ import annotations

import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Request, Response, status
from pydantic import Field

from src.backend.errors import (
    ConflictProblem,
    NotFoundProblem,
    UnauthorizedProblem,
)
from src.backend.middleware.auth import AuthPrincipal
from src.backend.models.base import NeriumModel
from src.backend.registry.identity.cron.key_rotation import (
    RotationTargetMissingError,
    RotationTooRecentError,
    rotate_single_agent,
)
from src.backend.registry.identity.crypto import generate_ed25519_keypair
from src.backend.registry.identity.service import (
    AgentIdentityRow,
    create_identity,
    delete_identity,
    get_identity_by_id,
    list_identities_for_owner,
)
from src.backend.routers.v1.admin.deps import require_admin_scope

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


class RotateResponse(NeriumModel):
    """202 Accepted response for the admin rotate endpoint.

    Surfaces a fingerprint preview rather than the full new public PEM
    so an operator clicking "Rotate" in an admin panel sees a stable
    short identifier without needing the full PEM round-trip. The
    ``new_agent_id`` lets the owner discover their freshly inserted
    active row.
    """

    job_id: str = Field(
        ...,
        description="Stable identifier for the rotation. Returned for "
        "audit trail correlation; admins quote this when troubleshooting "
        "a rotation report. Identical to ``new_agent_id`` since the "
        "rotation runs synchronously in-process.",
    )
    rotated_agent_id: UUID = Field(
        ...,
        description="UUID of the agent that was rotated. Matches the "
        "path parameter; included so async-Promise UI handlers can "
        "correlate the response without re-reading the URL.",
    )
    new_agent_id: UUID = Field(
        ...,
        description="UUID of the freshly inserted ``status='active'`` "
        "row. Owner can re-register a fresh keypair via "
        "``POST /v1/identity/agents`` if they need the private PEM.",
    )
    new_public_key_fingerprint: str = Field(
        ...,
        description="Short fingerprint of the new key in the format "
        "``sha256:<base64url 16 bytes>`` (per agent_identity contract "
        "Section 7). Use as a preview in admin UI without exposing "
        "the full PEM.",
    )
    old_public_key_fingerprint: str = Field(
        ...,
        description="Fingerprint of the now-retiring key. External "
        "verifiers pinning the old fingerprint should swap before "
        "``retires_at``.",
    )
    retires_at: datetime = Field(
        ...,
        description="UTC instant the retiring key flips to ``revoked``. "
        "Computed as ``now() + 7 days`` per the spawn directive's "
        "grace window.",
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


@identity_router.post(
    "/{agent_id}/rotate",
    response_model=RotateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[
        Depends(require_admin_scope(pillar_scope="admin:identity")),
    ],
)
async def rotate_identity(
    request: Request,
    agent_id: UUID = Path(..., description="UUID of the identity to rotate."),
) -> RotateResponse:
    """Admin: rotate one agent's Ed25519 keypair immediately.

    Triggers the same rotation primitive used by the weekly cron sweep
    (``tethys.key_rotation_sweep`` running Sundays at 03:00 UTC). The
    old key flips to ``status='retiring'`` with ``retires_at = now() +
    7 days`` so existing signed artifacts and JWTs keep verifying
    through the grace window. The new active row inherits the same
    ``owner_user_id`` + ``tenant_id`` + ``display_name``.

    Idempotency
    -----------
    Repeated calls within 7 days return HTTP 409 ``rotation_too_recent``
    so an operator double-clicking the button does not stack duplicate
    keypairs into the audit trail. The guard runs server-side via
    :func:`rotate_single_agent` with ``enforce_recent_guard=True``.

    Notification
    ------------
    Pheme sends ``key_rotation_alert`` to the agent owner with the
    old + new fingerprints + ``retires_at`` so external verifiers can
    re-pin within the grace window. Email failures do NOT roll back
    the rotation; the security-critical key swap is the primary effect.
    """

    # ``require_admin_scope`` already raised 403 when the principal
    # lacks the admin scope. We still need an authenticated principal
    # for audit attribution; pull it from request.state for logging.
    principal = getattr(request.state, "auth", None)
    if not isinstance(principal, AuthPrincipal):
        raise UnauthorizedProblem(
            detail="Admin rotate requires an authenticated principal.",
        )

    try:
        result = await rotate_single_agent(
            None,
            agent_id,
            enforce_recent_guard=True,
        )
    except RotationTooRecentError as exc:
        raise ConflictProblem(
            detail=(
                "rotation_too_recent: the active key is "
                f"{exc.age_days:.2f} days old; rotation is guarded "
                "for 7 days to prevent accidental double-rotation."
            ),
        ) from exc
    except RotationTargetMissingError as exc:
        raise NotFoundProblem(
            detail=(
                "Agent identity not found or already revoked; only "
                "active identities can be rotated."
            ),
        ) from exc

    logger.info(
        "identity.rotate.completed agent_id=%s admin_user_id=%s "
        "new_agent_id=%s new_fingerprint=%s",
        agent_id,
        principal.user_id,
        result["new_agent_id"],
        result["new_public_key_fingerprint"],
    )

    return RotateResponse(
        job_id=str(result["new_agent_id"]),
        rotated_agent_id=agent_id,
        new_agent_id=UUID(result["new_agent_id"]),
        new_public_key_fingerprint=result["new_public_key_fingerprint"],
        old_public_key_fingerprint=result["old_public_key_fingerprint"],
        retires_at=datetime.fromisoformat(result["retires_at"]),
    )


__all__ = ["identity_router"]
