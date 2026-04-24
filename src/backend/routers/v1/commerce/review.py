"""``/v1/commerce/*`` review routes.

Owner: Iapetus (W2 NP P4 S1).

Endpoints
---------
- ``POST  /v1/commerce/listings/{listing_id}/reviews``
- ``GET   /v1/commerce/listings/{listing_id}/reviews``
- ``PATCH /v1/commerce/reviews/{review_id}``
- ``DELETE /v1/commerce/reviews/{review_id}``
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Path, Query, Request, Response, status
from pydantic import Field

from src.backend.commerce.review import (
    create_review,
    delete_review,
    list_reviews_for_listing,
    update_review,
)
from src.backend.errors import NotFoundProblem, UnauthorizedProblem
from src.backend.middleware.auth import AuthPrincipal
from src.backend.models.base import NeriumModel
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

review_router = APIRouter(
    prefix="/commerce",
    tags=["commerce", "review"],
)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class ReviewCreateRequest(NeriumModel):
    """POST body for create."""

    rating: int = Field(..., ge=1, le=5, description="Rating 1..5.")
    title: Optional[str] = Field(
        default=None, max_length=200, description="Optional short headline."
    )
    body: Optional[str] = Field(
        default=None,
        max_length=5000,
        description="Optional markdown review body.",
    )


class ReviewUpdateRequest(NeriumModel):
    """PATCH body. At least one field required."""

    rating: Optional[int] = Field(
        default=None,
        ge=1,
        le=5,
        description="Rating 1..5. Omit to keep existing value.",
    )
    title: Optional[str] = Field(
        default=None, max_length=200, description="Set null to clear."
    )
    body: Optional[str] = Field(
        default=None, max_length=5000, description="Set null to clear."
    )


class ReviewResponse(NeriumModel):
    """GET + POST + PATCH response item."""

    id: UUID
    listing_id: UUID
    reviewer_user_id: UUID
    rating: int
    title: Optional[str] = None
    body: Optional[str] = None
    helpful_count: int
    flag_count: int
    status: str
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_auth(request: Request) -> AuthPrincipal:
    auth = getattr(request.state, "auth", None)
    if not isinstance(auth, AuthPrincipal):
        raise UnauthorizedProblem(detail="no authenticated principal")
    return auth


def _review_to_response(review) -> ReviewResponse:
    return ReviewResponse(
        id=review.id,
        listing_id=review.listing_id,
        reviewer_user_id=review.reviewer_user_id,
        rating=review.rating,
        title=review.title,
        body=review.body,
        helpful_count=review.helpful_count,
        flag_count=review.flag_count,
        status=review.status,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@review_router.post(
    "/listings/{listing_id}/reviews",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_review_endpoint(
    body: ReviewCreateRequest,
    request: Request,
    listing_id: UUID = Path(..., description="UUID v7 of the listing."),
) -> ReviewResponse:
    """Create a review. Requires a completed purchase."""

    principal = _require_auth(request)
    try:
        user_uuid = UUID(principal.user_id)
        tenant_uuid = UUID(principal.tenant_id)
    except (TypeError, ValueError) as exc:
        raise UnauthorizedProblem(
            detail="JWT sub/tenant_id claim is not a valid UUID.",
        ) from exc

    review = await create_review(
        tenant_id=tenant_uuid,
        reviewer_user_id=user_uuid,
        listing_id=listing_id,
        rating=body.rating,
        title=body.title,
        body=body.body,
    )
    return _review_to_response(review)


@review_router.get(
    "/listings/{listing_id}/reviews",
    response_model=CursorPage[ReviewResponse],
    status_code=status.HTTP_200_OK,
)
async def list_reviews_endpoint(
    request: Request,
    listing_id: UUID = Path(..., description="UUID v7 of the listing."),
    sort: str = Query(
        "recent",
        description="Sort order: 'recent' (created_at DESC) or 'helpful'.",
    ),
    cursor: Optional[str] = Query(
        None, description="Opaque cursor from a prior page."
    ),
    limit: int = Query(
        DEFAULT_LIMIT,
        ge=MIN_LIMIT,
        le=MAX_LIMIT,
        description="Page size 1..100.",
    ),
) -> CursorPage[ReviewResponse]:
    """Paginated public review feed for a listing."""

    principal = _require_auth(request)
    try:
        tenant_uuid = UUID(principal.tenant_id)
    except (TypeError, ValueError) as exc:
        raise UnauthorizedProblem(
            detail="JWT tenant_id claim is not a valid UUID.",
        ) from exc

    cursor_ts: Optional[datetime] = None
    cursor_id: Optional[UUID] = None
    if cursor:
        payload = decode_cursor(cursor)
        cursor_ts = payload.ts
        cursor_id = payload.id

    reviews, has_more = await list_reviews_for_listing(
        tenant_id=tenant_uuid,
        listing_id=listing_id,
        sort=sort,
        limit=limit,
        cursor_ts=cursor_ts,
        cursor_id=cursor_id,
    )

    next_cursor: Optional[str] = None
    if has_more and reviews:
        last = reviews[-1]
        next_cursor = encode_cursor(
            CursorPayload(
                ts=last.created_at,
                id=last.id,
                dir=CursorDirection.NEXT,
            )
        )

    return CursorPage[ReviewResponse](
        items=[_review_to_response(r) for r in reviews],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@review_router.patch(
    "/reviews/{review_id}",
    response_model=ReviewResponse,
    status_code=status.HTTP_200_OK,
)
async def patch_review_endpoint(
    body: ReviewUpdateRequest,
    request: Request,
    review_id: UUID = Path(..., description="UUID v7 of the review."),
) -> ReviewResponse:
    """Owner-only PATCH."""

    principal = _require_auth(request)
    try:
        user_uuid = UUID(principal.user_id)
        tenant_uuid = UUID(principal.tenant_id)
    except (TypeError, ValueError) as exc:
        raise UnauthorizedProblem(
            detail="JWT sub/tenant_id claim is not a valid UUID.",
        ) from exc

    review = await update_review(
        tenant_id=tenant_uuid,
        review_id=review_id,
        actor_user_id=user_uuid,
        rating=body.rating,
        title=body.title,
        body=body.body,
    )
    return _review_to_response(review)


@review_router.delete(
    "/reviews/{review_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_review_endpoint(
    request: Request,
    review_id: UUID = Path(..., description="UUID v7 of the review."),
) -> Response:
    """Owner-only soft-delete."""

    principal = _require_auth(request)
    try:
        user_uuid = UUID(principal.user_id)
        tenant_uuid = UUID(principal.tenant_id)
    except (TypeError, ValueError) as exc:
        raise UnauthorizedProblem(
            detail="JWT sub/tenant_id claim is not a valid UUID.",
        ) from exc

    await delete_review(
        tenant_id=tenant_uuid,
        review_id=review_id,
        actor_user_id=user_uuid,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = [
    "ReviewCreateRequest",
    "ReviewResponse",
    "ReviewUpdateRequest",
    "review_router",
]
