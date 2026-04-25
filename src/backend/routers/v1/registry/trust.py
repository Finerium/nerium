"""HTTP routes for ``/v1/registry/trust`` + ``/v1/admin/trust``.

Owner: Astraea (W2 Registry trust, NP P1 S1).

Endpoints
---------
- ``GET  /v1/registry/trust/listings/{listing_id}``
    Return cached + auto-refreshed trust score for a marketplace listing.
- ``GET  /v1/registry/trust/creators/{user_id}``
    Return cached + auto-refreshed creator-level aggregate.
- ``POST /v1/admin/trust/listings/{listing_id}/refresh``
    Admin-only: force immediate recompute + audit entry.
- ``POST /v1/admin/trust/creators/{user_id}/refresh``
    Admin-only: same for creators.

Gates
-----
- GET routes require an authenticated principal + tenant binding
  (handled by middleware). Cross-tenant reads return 404 so existence
  is not leaked.
- POST routes require the broad ``admin`` scope OR the pillar
  ``admin:trust`` scope via :func:`require_admin_scope`.

Contract refs
-------------
- ``docs/contracts/trust_score.contract.md`` Section 4.3 endpoint list.
- ``docs/contracts/rest_api_base.contract.md`` Section 3.1 /v1 prefix.
"""

from __future__ import annotations

import logging
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Request, status
from pydantic import BaseModel, Field

from src.backend.errors import (
    NotFoundProblem,
    ServiceUnavailableProblem,
    UnauthorizedProblem,
)
from src.backend.middleware.auth import AuthPrincipal
from src.backend.routers.v1.admin.deps import require_admin_scope
from src.backend.trust import service as trust_service
from src.backend.trust.cron.refresh_scores import (
    DEFAULT_FRESHNESS_WINDOW_HOURS,
    MAX_LISTINGS_PER_RUN,
    enqueue_refresh_batch,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Response model (mirrors contract Section 3.4 TrustScoreResponse)
# ---------------------------------------------------------------------------


class TrustScoreResponse(BaseModel):
    """Wire envelope for every trust endpoint.

    ``inputs_summary`` + ``boost_components`` + ``components`` together
    form the audit bag the UI can render as a "why this score?"
    expander. ``cached`` flags whether this response was served from
    the denormalised columns (``true``) or newly computed (``false``).
    """

    subject_kind: Literal["listing", "user", "identity"]
    subject_id: str
    score: float = Field(..., ge=0.0, le=1.0)
    band: Literal["unverified", "emerging", "established", "trusted", "elite"]
    stability: Literal["provisional", "stable"]
    category: str | None = None
    formula_version: str
    inputs_summary: dict[str, Any] = Field(default_factory=dict)
    boost_components: dict[str, float] = Field(default_factory=dict)
    components: dict[str, float] = Field(default_factory=dict)
    cached: bool
    computed_at: str | None = None
    verified_badge: bool = False


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------


# Public-ish route: authenticated user in a tenant can read any listing
# trust in their tenant. RLS does the tenant filter. No admin gate.
trust_router = APIRouter(
    prefix="/registry/trust",
    tags=["registry", "trust"],
)

# Separate admin router for the force-refresh endpoints. Mounted under
# the /v1/admin/* namespace so existing admin scope gates apply.
admin_trust_router = APIRouter(
    prefix="/admin/trust",
    tags=["admin-trust"],
    dependencies=[Depends(require_admin_scope(pillar_scope="admin:trust"))],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_principal(request: Request) -> AuthPrincipal:
    """Return the authenticated principal or raise 401."""

    auth = getattr(request.state, "auth", None)
    if not isinstance(auth, AuthPrincipal):
        raise UnauthorizedProblem(detail="no authenticated principal")
    return auth


def _tenant_uuid(principal: AuthPrincipal) -> UUID:
    return UUID(principal.tenant_id)


def _actor_uuid(principal: AuthPrincipal) -> UUID:
    return UUID(principal.user_id)


# ---------------------------------------------------------------------------
# GET handlers
# ---------------------------------------------------------------------------


@trust_router.get(
    "/listings/{listing_id}",
    response_model=TrustScoreResponse,
    status_code=status.HTTP_200_OK,
)
async def get_listing_trust(
    request: Request,
    listing_id: UUID = Path(..., description="Marketplace listing UUID."),
) -> TrustScoreResponse:
    """Return the trust score + breakdown for a listing.

    Refreshes the cache if the last compute is older than 24 hours
    (or if the listing has never been scored).
    """

    principal = _require_principal(request)
    payload = await trust_service.read_cached_listing_trust(
        listing_id=listing_id,
        tenant_id=_tenant_uuid(principal),
        actor_user_id=_actor_uuid(principal),
    )
    if payload is None:
        raise NotFoundProblem(detail="marketplace listing not found")
    return TrustScoreResponse(**payload)


@trust_router.get(
    "/creators/{user_id}",
    response_model=TrustScoreResponse,
    status_code=status.HTTP_200_OK,
)
async def get_creator_trust(
    request: Request,
    user_id: UUID = Path(..., description="Creator user UUID."),
) -> TrustScoreResponse:
    """Return the aggregate creator trust score."""

    principal = _require_principal(request)
    payload = await trust_service.read_cached_creator_trust(
        user_id=user_id,
        tenant_id=_tenant_uuid(principal),
        actor_user_id=_actor_uuid(principal),
    )
    if payload is None:
        raise NotFoundProblem(detail="user not found")
    return TrustScoreResponse(**payload)


# ---------------------------------------------------------------------------
# POST handlers (admin only)
# ---------------------------------------------------------------------------


@admin_trust_router.post(
    "/listings/{listing_id}/refresh",
    response_model=TrustScoreResponse,
    status_code=status.HTTP_200_OK,
)
async def refresh_listing_trust(
    request: Request,
    listing_id: UUID = Path(..., description="Marketplace listing UUID."),
) -> TrustScoreResponse:
    """Force an immediate listing trust recompute + audit row."""

    principal = _require_principal(request)
    breakdown = await trust_service.persist_listing_trust(
        listing_id=listing_id,
        tenant_id=_tenant_uuid(principal),
        actor_user_id=_actor_uuid(principal),
        event_type="admin_adjustment",
    )
    if breakdown is None:
        raise NotFoundProblem(detail="marketplace listing not found")

    from datetime import datetime, timezone  # local to avoid top-level noise

    payload = {
        "subject_kind": "listing",
        "subject_id": str(listing_id),
        "score": breakdown.score,
        "band": breakdown.band,
        "stability": breakdown.stability,
        "category": breakdown.category,
        "formula_version": breakdown.formula_version,
        "inputs_summary": dict(breakdown.inputs_summary),
        "boost_components": dict(breakdown.boost_components),
        "components": dict(breakdown.components),
        "cached": False,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
    return TrustScoreResponse(**payload)


@admin_trust_router.post(
    "/creators/{user_id}/refresh",
    response_model=TrustScoreResponse,
    status_code=status.HTTP_200_OK,
)
async def refresh_creator_trust(
    request: Request,
    user_id: UUID = Path(..., description="Creator user UUID."),
) -> TrustScoreResponse:
    """Force an immediate creator aggregate recompute."""

    principal = _require_principal(request)
    breakdown = await trust_service.persist_creator_trust(
        user_id=user_id,
        tenant_id=_tenant_uuid(principal),
        actor_user_id=_actor_uuid(principal),
        event_type="admin_adjustment",
    )
    if breakdown is None:
        raise NotFoundProblem(detail="user not found")

    from datetime import datetime, timezone

    payload = {
        "subject_kind": "user",
        "subject_id": str(user_id),
        "score": breakdown.score,
        "band": breakdown.band,
        "stability": breakdown.stability,
        "category": breakdown.category,
        "formula_version": breakdown.formula_version,
        "inputs_summary": dict(breakdown.inputs_summary),
        "boost_components": dict(breakdown.boost_components),
        "components": dict(breakdown.components),
        "cached": False,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
    return TrustScoreResponse(**payload)


class RefreshBatchRequest(BaseModel):
    """Optional knobs for ``POST /v1/admin/trust/refresh-batch``.

    Both fields are clamped server-side: a freshness window of zero or
    a per-tenant cap above ``MAX_LISTINGS_PER_RUN`` would let an admin
    trigger an unbounded sweep, so we clip aggressive overrides into
    the contract Section 8 envelope.
    """

    freshness_window_hours: int | None = Field(
        default=None,
        ge=1,
        le=24 * 30,
        description=(
            "How many hours of staleness qualifies a listing for refresh. "
            f"Default {DEFAULT_FRESHNESS_WINDOW_HOURS} when omitted."
        ),
    )
    max_listings_per_tenant: int | None = Field(
        default=None,
        ge=1,
        le=MAX_LISTINGS_PER_RUN,
        description=(
            f"Per-tenant cap. Capped at {MAX_LISTINGS_PER_RUN} per "
            "contract Section 8."
        ),
    )


class RefreshBatchResponse(BaseModel):
    """Acknowledgement that the batch refresh was enqueued via Arq."""

    enqueued: bool
    job_name: str
    freshness_window_hours: int
    max_listings_per_tenant: int


@admin_trust_router.post(
    "/refresh-batch",
    response_model=RefreshBatchResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_batch_refresh(
    request: Request,
    body: RefreshBatchRequest | None = None,
) -> RefreshBatchResponse:
    """Manually enqueue the nightly trust score refresh sweep.

    This endpoint does NOT block until the sweep finishes (a per-tenant
    cap of 1000 listings can take a while); it returns 202 once the
    Arq job has been enqueued. Operators triage by reading
    ``trust.refresh.batch_completed`` in the worker log.

    Behaviour
    ---------
    - ``freshness_window_hours`` defaults to 24 (matches on-demand
      cache TTL).
    - ``max_listings_per_tenant`` defaults to 1000 (contract Section
      8 cap).
    - Returns ``enqueued=False`` with HTTP 503 when the Arq Redis
      handle is not yet installed (e.g. a degraded boot) so the admin
      can distinguish "queued" from "queue down".
    """

    _require_principal(request)  # raises 401 if no principal
    knobs = body or RefreshBatchRequest()
    success = await enqueue_refresh_batch(
        freshness_window_hours=knobs.freshness_window_hours,
        max_listings_per_tenant=knobs.max_listings_per_tenant,
    )
    if not success:
        # Surface as a 503 so the operator knows the queue is unavailable.
        raise ServiceUnavailableProblem(
            detail=(
                "Trust refresh queue is currently unavailable. Inspect the "
                "API logs for lifespan.arq.unavailable and confirm Redis "
                "connectivity before retrying."
            )
        )
    return RefreshBatchResponse(
        enqueued=True,
        job_name="trust_refresh_batch",
        freshness_window_hours=(
            knobs.freshness_window_hours or DEFAULT_FRESHNESS_WINDOW_HOURS
        ),
        max_listings_per_tenant=(
            knobs.max_listings_per_tenant or MAX_LISTINGS_PER_RUN
        ),
    )


__all__ = [
    "RefreshBatchRequest",
    "RefreshBatchResponse",
    "TrustScoreResponse",
    "admin_trust_router",
    "trust_router",
]
