"""HTTP routes for ``/v1/marketplace/listings``.

Owner: Phanes (W2 NP P1 Session 1).

Endpoints
---------
- ``GET  /v1/marketplace/listings``                 cursor-paginated list.
- ``GET  /v1/marketplace/listings/{listing_id}``    detail view.
- ``POST /v1/marketplace/listings``                 create draft.
- ``PATCH /v1/marketplace/listings/{listing_id}``   partial update (owner-only).
- ``POST /v1/marketplace/listings/{listing_id}/publish`` draft to public.
- ``DELETE /v1/marketplace/listings/{listing_id}``  soft delete (archive).

Gate order on write endpoints
-----------------------------
1. Auth via Aether AuthMiddleware (populates ``request.state.auth``).
2. Hemera ``marketplace.live`` via
   :func:`src.backend.marketplace.listing_service.enforce_marketplace_live`.
3. Category-specific Premium re-gate for category=premium.
4. Category-metadata + pricing-details validators.
5. Insert / update / archive.

Tenant isolation
----------------
Every DB access runs inside
``src.backend.db.tenant.tenant_scoped(pool, tenant_id)`` so the
canonical RLS policy filters rows the caller cannot see. Cross-tenant
reads return 404 (hide existence) not 403.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Path, Query, Request, Response, status

from src.backend.errors import NotFoundProblem, UnauthorizedProblem
from src.backend.marketplace import listing_service
from src.backend.middleware.auth import AuthPrincipal
from src.backend.models.marketplace_listing import (
    Category,
    ListingCreate,
    ListingDetail,
    ListingPublic,
    ListingUpdate,
    Subtype,
)
from src.backend.pagination.cursor import (
    CursorDirection,
    CursorPage,
    CursorPayload,
    DEFAULT_LIMIT,
    MAX_LIMIT,
    MIN_LIMIT,
    decode_cursor,
    encode_cursor,
)

logger = logging.getLogger(__name__)

listing_router = APIRouter(
    prefix="/marketplace/listings",
    tags=["marketplace"],
)


def _require_auth(request: Request) -> AuthPrincipal:
    """Return the authenticated principal or raise 401.

    Mirrors :func:`src.backend.routers.v1.ma.sessions._require_auth`;
    the middleware normally catches a missing token upstream, this
    branch exists for defensive reasons (tests that bypass the stack).
    """

    auth = getattr(request.state, "auth", None)
    if auth is None:
        raise UnauthorizedProblem(detail="no authenticated principal")
    return auth


@listing_router.get(
    "",
    response_model=CursorPage[ListingPublic],
    status_code=status.HTTP_200_OK,
)
async def list_listings_endpoint(
    request: Request,
    category: Optional[Category] = Query(
        None, description="Filter by top-level category."
    ),
    subtype: Optional[Subtype] = Query(
        None, description="Filter by subtype. Must be consistent with category."
    ),
    status_filter: Optional[str] = Query(
        "published",
        alias="status",
        description=(
            "Filter by status. Defaults to 'published'. Pass 'draft' to see "
            "your own drafts (still tenant-scoped)."
        ),
    ),
    sort: str = Query(
        "recent",
        description="Sort order: 'recent' (created_at DESC) or 'rating'.",
    ),
    mine: bool = Query(
        False,
        description="When true, restrict to listings owned by the caller.",
    ),
    cursor: Optional[str] = Query(None, description="Opaque cursor from a prior page."),
    limit: int = Query(
        DEFAULT_LIMIT,
        ge=MIN_LIMIT,
        le=MAX_LIMIT,
        description="Page size 1..100.",
    ),
) -> CursorPage[ListingPublic]:
    """Cursor-paginated list of listings scoped to the caller's tenant."""

    auth = _require_auth(request)
    tenant_id = UUID(auth.tenant_id)
    user_id = UUID(auth.user_id)

    cursor_ts: Optional[datetime] = None
    cursor_id: Optional[UUID] = None
    if cursor:
        payload = decode_cursor(cursor)
        cursor_ts = payload.ts
        cursor_id = payload.id

    items, has_more, last_row = await listing_service.list_listings(
        tenant_id=tenant_id,
        category=category,
        subtype=subtype,
        status=status_filter,
        creator_user_id=user_id if mine else None,
        sort=sort,
        cursor_ts=cursor_ts,
        cursor_id=cursor_id,
        limit=limit,
    )

    next_cursor: Optional[str] = None
    if has_more and last_row is not None:
        next_cursor = encode_cursor(
            CursorPayload(
                ts=last_row["created_at"],
                id=last_row["id"],
                dir=CursorDirection.NEXT,
            )
        )

    return CursorPage[ListingPublic](
        items=items,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@listing_router.get(
    "/{listing_id}",
    response_model=ListingDetail,
    status_code=status.HTTP_200_OK,
)
async def get_listing_endpoint(
    request: Request,
    listing_id: UUID = Path(..., description="UUID v7 of the listing."),
) -> ListingDetail:
    """Fetch a single listing. Cross-tenant rows surface as 404."""

    auth = _require_auth(request)
    tenant_id = UUID(auth.tenant_id)
    return await listing_service.get_listing(
        listing_id=listing_id, tenant_id=tenant_id
    )


@listing_router.post(
    "",
    response_model=ListingDetail,
    status_code=status.HTTP_201_CREATED,
)
async def create_listing_endpoint(
    body: ListingCreate,
    request: Request,
) -> ListingDetail:
    """Create a draft listing. Hemera ``marketplace.live`` required."""

    auth = _require_auth(request)
    tenant_id = UUID(auth.tenant_id)
    user_id = UUID(auth.user_id)
    return await listing_service.create_listing(
        body=body, tenant_id=tenant_id, user_id=user_id
    )


@listing_router.patch(
    "/{listing_id}",
    response_model=ListingDetail,
    status_code=status.HTTP_200_OK,
)
async def update_listing_endpoint(
    body: ListingUpdate,
    request: Request,
    listing_id: UUID = Path(..., description="UUID v7 of the listing."),
) -> ListingDetail:
    """Partial update. Owner-only; non-owner attempts surface 403."""

    auth = _require_auth(request)
    tenant_id = UUID(auth.tenant_id)
    user_id = UUID(auth.user_id)
    return await listing_service.update_listing(
        listing_id=listing_id,
        body=body,
        tenant_id=tenant_id,
        user_id=user_id,
    )


@listing_router.post(
    "/{listing_id}/publish",
    response_model=ListingDetail,
    status_code=status.HTTP_200_OK,
)
async def publish_listing_endpoint(
    request: Request,
    listing_id: UUID = Path(..., description="UUID v7 of the listing."),
) -> ListingDetail:
    """Flip a draft to published after running the validation pipeline."""

    auth = _require_auth(request)
    tenant_id = UUID(auth.tenant_id)
    user_id = UUID(auth.user_id)
    return await listing_service.publish_listing(
        listing_id=listing_id, tenant_id=tenant_id, user_id=user_id
    )


@listing_router.delete(
    "/{listing_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_listing_endpoint(
    request: Request,
    listing_id: UUID = Path(..., description="UUID v7 of the listing."),
) -> Response:
    """Soft-delete (archive) a listing. Owner-only."""

    auth = _require_auth(request)
    tenant_id = UUID(auth.tenant_id)
    user_id = UUID(auth.user_id)
    await listing_service.delete_listing(
        listing_id=listing_id, tenant_id=tenant_id, user_id=user_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["listing_router"]
