"""Admin moderation queue router.

Mount point: ``/v1/admin/moderation/*`` (prefix applied by
``mount_v1_routers``).

Endpoints
---------
- ``GET /v1/admin/moderation/listings``: list published listings with
  no prior moderation decision. ``status`` query param reserved for
  future filter expansion (``pending`` default; ``all`` reserved).
- ``POST /v1/admin/moderation/listings/{listing_id}/approve``: record
  approval. Idempotent.
- ``POST /v1/admin/moderation/listings/{listing_id}/reject``: record
  rejection + flip listing status to ``suspended``. ``reason`` required.

Auth
----
Every route is gated by :func:`require_admin_scope` with the pillar
scope ``admin:moderation``. The broad ``admin`` scope is accepted too
so a superuser JWT bypasses the narrow check.

Contract refs
-------------
- Migration 051 ``moderation_event`` DDL.
- docs/contracts/marketplace_listing.contract.md Section 5 event signatures.
- Eunomia prompt P6 S1 Section C moderation queue.
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Path, Query, Request, status
from pydantic import ConfigDict, Field

from src.backend.admin import moderation as moderation_service
from src.backend.models.base import NeriumModel
from src.backend.routers.v1.admin.deps import get_actor_id, require_admin_scope

logger = logging.getLogger(__name__)


class PendingListingOut(NeriumModel):
    """Wire projection of a pending moderation queue entry."""

    model_config = ConfigDict(extra="forbid")

    listing_id: UUID
    tenant_id: UUID
    creator_user_id: UUID
    title: str
    category: str
    subtype: str
    short_description: Optional[str] = None
    slug: Optional[str] = None
    published_at: Optional[str] = None
    created_at: str


class PendingListingsResponse(NeriumModel):
    """Paginated envelope for the pending listings feed."""

    items: list[PendingListingOut]
    total: int
    limit: int
    offset: int


class ModerationEventOut(NeriumModel):
    """Response body for approve / reject routes."""

    model_config = ConfigDict(extra="forbid")

    id: UUID
    tenant_id: Optional[UUID] = None
    moderator_id: UUID
    listing_id: UUID
    action: str
    reason: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str


class RejectPayload(NeriumModel):
    """Body for the reject route."""

    model_config = ConfigDict(extra="forbid")

    reason: str = Field(
        ...,
        min_length=1,
        max_length=moderation_service.MAX_REASON_LEN,
        description="Human-readable explanation surfaced to the creator.",
    )
    metadata: dict[str, Any] = Field(default_factory=dict)


class ApprovePayload(NeriumModel):
    """Body for the approve route. All fields optional."""

    model_config = ConfigDict(extra="forbid")

    metadata: dict[str, Any] = Field(default_factory=dict)


router = APIRouter(
    # Resolves to ``/v1/admin/moderation/*`` once mounted under ``/v1``.
    prefix="/admin/moderation",
    tags=["admin-moderation"],
    dependencies=[
        Depends(require_admin_scope(pillar_scope="admin:moderation")),
    ],
)


@router.get("/listings", response_model=PendingListingsResponse)
async def list_pending_listings(
    limit: int = Query(
        default=moderation_service.DEFAULT_LIST_LIMIT,
        ge=1,
        le=moderation_service.MAX_LIST_LIMIT,
    ),
    offset: int = Query(default=0, ge=0),
) -> PendingListingsResponse:
    """Return listings awaiting a moderation decision.

    "Pending" is derived: a listing is pending when its
    ``marketplace_listing.status`` is ``published`` and no row in
    ``moderation_event`` references it yet. Phanes's publish flow emits
    ``marketplace.listing.submitted`` on that exact state transition, so
    this query is the event consumer by construction.
    """

    items, total = await moderation_service.list_pending_listings(
        limit=limit, offset=offset
    )
    return PendingListingsResponse(
        items=[_item_to_wire(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/listings/{listing_id}/approve",
    response_model=ModerationEventOut,
    status_code=status.HTTP_201_CREATED,
)
async def approve_listing(
    request: Request,
    listing_id: UUID = Path(...),
    payload: ApprovePayload = Body(default_factory=ApprovePayload),
) -> ModerationEventOut:
    """Approve a pending listing. Idempotent: repeated clicks reuse the
    first approval record rather than stacking duplicates."""

    moderator_id = get_actor_id(request)
    event = await moderation_service.approve_listing(
        listing_id=listing_id,
        moderator_id=moderator_id,
        metadata=payload.metadata or None,
    )
    return _event_to_wire(event)


@router.post(
    "/listings/{listing_id}/reject",
    response_model=ModerationEventOut,
    status_code=status.HTTP_201_CREATED,
)
async def reject_listing(
    request: Request,
    listing_id: UUID = Path(...),
    payload: RejectPayload = Body(...),
) -> ModerationEventOut:
    """Reject a pending listing + flip status to ``suspended``.

    ``reason`` is mandatory. The listing's creator will see the reason
    via a future Pheme transactional email template (Session 2 CUT); for
    Session 1 the reason only lives in the audit table.
    """

    moderator_id = get_actor_id(request)
    event = await moderation_service.reject_listing(
        listing_id=listing_id,
        moderator_id=moderator_id,
        reason=payload.reason,
        metadata=payload.metadata or None,
    )
    return _event_to_wire(event)


def _item_to_wire(item: moderation_service.PendingListing) -> PendingListingOut:
    return PendingListingOut(
        listing_id=item.listing_id,
        tenant_id=item.tenant_id,
        creator_user_id=item.creator_user_id,
        title=item.title,
        category=item.category,
        subtype=item.subtype,
        short_description=item.short_description,
        slug=item.slug,
        published_at=item.published_at.isoformat() if item.published_at else None,
        created_at=item.created_at.isoformat(),
    )


def _event_to_wire(event: moderation_service.ModerationEvent) -> ModerationEventOut:
    return ModerationEventOut(
        id=event.id,
        tenant_id=event.tenant_id,
        moderator_id=event.moderator_id,
        listing_id=event.listing_id,
        action=event.action,
        reason=event.reason,
        metadata=event.metadata or {},
        created_at=event.created_at.isoformat(),
    )


__all__ = ["router"]
