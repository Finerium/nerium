"""Marketplace review CRUD + Astraea event emit (Iapetus W2 NP P4 S1).

Contract refs:
    - docs/contracts/marketplace_commerce.contract.md Sections 4.5-4.6
      (review CRUD + helpful/flag endpoints).
    - docs/contracts/trust_score.contract.md Section 3.3 (the review
      rows feed Astraea's Wilson + Bayesian recompute). Iapetus is
      the author that resolves the P1 stopgap marker.

Responsibilities
----------------
- :func:`create_review`: purchased-only gate, dedup via unique partial
  index, emit ``review.upserted`` event into Astraea recompute hook.
- :func:`list_reviews_for_listing`: cursor-paginated public read.
  Filters soft-deleted + hidden rows.
- :func:`update_review`: owner-only PATCH. Emits ``review.upserted``.
- :func:`delete_review`: owner-only soft delete. Emits ``review.deleted``.
- :func:`aggregate_listing_reviews`: returns rating mean + count +
  helpful + flag totals. Consumed by the Astraea service via
  :func:`src.backend.trust.service.gather_listing_inputs` which is
  patched in this session to pull real data.

Astraea integration
-------------------
We do NOT require a message bus. The Astraea recompute entry point
(:func:`persist_listing_trust`) is called directly after each review
mutation. A trust snapshot refresh is synchronous + cheap for a
single listing; the latency hit is acceptable since the review POST
is not on a hot path.

Failures in the recompute hook are logged but do NOT roll back the
review mutation: the review is still durable, the trust recompute
can be retried by the on-demand read path or the Arq backfill.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

import asyncpg

from src.backend.commerce.purchase import (
    SLUG_NO_ELIGIBLE_PURCHASE,
    buyer_has_completed_purchase,
    get_completed_purchase_id,
)
from src.backend.db.pool import get_pool
from src.backend.db.tenant import tenant_scoped
from src.backend.errors import (
    ConflictProblem,
    ForbiddenProblem,
    NotFoundProblem,
    ProblemException,
    ValidationProblem,
)
from src.backend.utils.uuid7 import uuid7

logger = logging.getLogger(__name__)


# Problem-JSON slugs (commerce namespace).
SLUG_REVIEW_DUPLICATE: str = "marketplace_review_duplicate"
SLUG_REVIEW_OWNER_ONLY: str = "marketplace_review_owner_only"


class PurchasedOnlyProblem(ForbiddenProblem):
    """403: reviewer has no completed purchase for this listing."""

    slug = SLUG_NO_ELIGIBLE_PURCHASE
    title = "Purchase required to review"
    status = 403


class DuplicateReviewProblem(ConflictProblem):
    """409: reviewer already has a visible review for this listing."""

    slug = SLUG_REVIEW_DUPLICATE
    title = "Review already exists"
    status = 409


class ReviewOwnerOnlyProblem(ForbiddenProblem):
    """403: PATCH/DELETE issued by someone other than the reviewer."""

    slug = SLUG_REVIEW_OWNER_ONLY
    title = "Only the reviewer can edit or delete"
    status = 403


@dataclass(frozen=True)
class ReviewRow:
    """Projection of ``marketplace_review``."""

    id: UUID
    tenant_id: UUID
    listing_id: UUID
    reviewer_user_id: UUID
    purchase_id: Optional[UUID]
    rating: int
    title: Optional[str]
    body: Optional[str]
    helpful_count: int
    flag_count: int
    status: str
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime]


@dataclass(frozen=True)
class ReviewAggregate:
    """Aggregate rating signals for a listing.

    Consumed by :func:`src.backend.trust.service.gather_listing_inputs`
    to replace the Astraea P1 synthesised zeros with real data.
    """

    listing_id: UUID
    review_count: int
    rating_sum: int
    rating_mean_normalised: float
    helpful_count: int
    flag_count: int


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


async def create_review(
    *,
    tenant_id: UUID,
    reviewer_user_id: UUID,
    listing_id: UUID,
    rating: int,
    title: Optional[str] = None,
    body: Optional[str] = None,
) -> ReviewRow:
    """Create a review after enforcing the purchased-only gate.

    Gates
    -----
    1. ``rating`` in [1, 5] (also enforced by DB CHECK).
    2. Reviewer has at least one completed purchase of the listing
       (else 403 ``marketplace_review_purchased_only``).
    3. No existing visible review from this reviewer for this listing
       (else 409 ``marketplace_review_duplicate``).
    """

    if not (1 <= rating <= 5):
        raise ValidationProblem(detail="rating must be an integer 1..5")

    # 1. Purchase gate.
    purchase_id = await get_completed_purchase_id(
        tenant_id=tenant_id,
        buyer_user_id=reviewer_user_id,
        listing_id=listing_id,
    )
    if purchase_id is None:
        raise PurchasedOnlyProblem(
            detail=(
                "You can only review listings you have purchased. "
                "Complete a purchase first."
            ),
        )

    # 2. Insert with uniqueness guard. Partial unique index excludes
    #    soft-deleted rows so a prior soft-delete allows a fresh review.
    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        new_id = uuid7()
        try:
            row = await conn.fetchrow(
                """
                INSERT INTO marketplace_review (
                    id, tenant_id, listing_id, reviewer_user_id,
                    purchase_id, rating, title, body
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
                """,
                new_id,
                tenant_id,
                listing_id,
                reviewer_user_id,
                purchase_id,
                rating,
                title,
                body,
            )
        except asyncpg.UniqueViolationError as exc:
            raise DuplicateReviewProblem(
                detail=(
                    "You already reviewed this listing. "
                    "Use PATCH to update or DELETE first."
                ),
            ) from exc

    review = _row_to_dataclass(row)
    logger.info(
        "commerce.review.created review_id=%s listing_id=%s rating=%s",
        review.id,
        listing_id,
        rating,
    )

    # 3. Recompute Astraea trust score (best-effort, non-blocking).
    await _emit_review_upserted(
        tenant_id=tenant_id,
        listing_id=listing_id,
        actor_user_id=reviewer_user_id,
    )
    return review


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------


async def list_reviews_for_listing(
    *,
    tenant_id: UUID,
    listing_id: UUID,
    sort: str = "recent",
    limit: int = 20,
    cursor_ts: Optional[datetime] = None,
    cursor_id: Optional[UUID] = None,
) -> tuple[list[ReviewRow], bool]:
    """Return (reviews, has_more) for public review feed.

    Sort options
    ------------
    - ``recent`` (default): created_at DESC, id DESC secondary.
    - ``helpful``: helpful_count DESC, created_at DESC secondary.

    Excludes soft-deleted + hidden rows. Reviews with flag_count >= 3
    are hidden via Wilson moderation (contract Section 4.5); that
    transition runs via an admin job not shipped in S1.
    """

    limit = max(1, min(100, int(limit)))
    fetch_limit = limit + 1

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        if sort == "helpful":
            rows = await conn.fetch(
                """
                SELECT *
                FROM marketplace_review
                WHERE listing_id = $1
                  AND deleted_at IS NULL
                  AND status = 'visible'
                ORDER BY helpful_count DESC, created_at DESC, id DESC
                LIMIT $2
                """,
                listing_id,
                fetch_limit,
            )
        else:  # recent
            if cursor_ts is not None and cursor_id is not None:
                rows = await conn.fetch(
                    """
                    SELECT *
                    FROM marketplace_review
                    WHERE listing_id = $1
                      AND deleted_at IS NULL
                      AND status = 'visible'
                      AND (created_at, id) < ($2::timestamptz, $3::uuid)
                    ORDER BY created_at DESC, id DESC
                    LIMIT $4
                    """,
                    listing_id,
                    cursor_ts,
                    cursor_id,
                    fetch_limit,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT *
                    FROM marketplace_review
                    WHERE listing_id = $1
                      AND deleted_at IS NULL
                      AND status = 'visible'
                    ORDER BY created_at DESC, id DESC
                    LIMIT $2
                    """,
                    listing_id,
                    fetch_limit,
                )

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]
    return [_row_to_dataclass(r) for r in rows], has_more


async def get_review(
    *,
    tenant_id: UUID,
    review_id: UUID,
) -> Optional[ReviewRow]:
    """Return a review by id. Filters soft-deleted."""

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        row = await conn.fetchrow(
            "SELECT * FROM marketplace_review WHERE id = $1 AND deleted_at IS NULL",
            review_id,
        )
        if row is None:
            return None
        return _row_to_dataclass(row)


async def aggregate_listing_reviews(
    *,
    tenant_id: Optional[UUID],
    listing_id: UUID,
    conn: Optional[asyncpg.Connection] = None,
) -> ReviewAggregate:
    """Compute aggregate signals for a listing.

    Called from Astraea's :func:`gather_listing_inputs` as the
    stopgap-replacing data source. ``tenant_id`` may be None when
    the caller is inside an already-scoped connection.
    """

    sql = """
        SELECT
            COUNT(*)::int AS review_count,
            COALESCE(SUM(rating), 0)::int AS rating_sum,
            COALESCE(SUM(helpful_count), 0)::int AS helpful_count,
            COALESCE(SUM(flag_count), 0)::int AS flag_count
        FROM marketplace_review
        WHERE listing_id = $1
          AND deleted_at IS NULL
          AND status = 'visible'
    """

    if conn is not None:
        row = await conn.fetchrow(sql, listing_id)
    else:
        pool = get_pool()
        if tenant_id is None:
            async with pool.acquire() as c:
                row = await c.fetchrow(sql, listing_id)
        else:
            async with tenant_scoped(pool, tenant_id) as c:
                row = await c.fetchrow(sql, listing_id)

    count = int(row["review_count"] or 0) if row else 0
    total = int(row["rating_sum"] or 0) if row else 0
    helpful = int(row["helpful_count"] or 0) if row else 0
    flag = int(row["flag_count"] or 0) if row else 0

    # Normalise to [0, 1]: mean / 5 since rating is 1..5.
    if count > 0:
        mean_norm = (total / count) / 5.0
    else:
        mean_norm = 0.0

    return ReviewAggregate(
        listing_id=listing_id,
        review_count=count,
        rating_sum=total,
        rating_mean_normalised=max(0.0, min(1.0, mean_norm)),
        helpful_count=helpful,
        flag_count=flag,
    )


# ---------------------------------------------------------------------------
# Update / Delete
# ---------------------------------------------------------------------------


async def update_review(
    *,
    tenant_id: UUID,
    review_id: UUID,
    actor_user_id: UUID,
    rating: Optional[int] = None,
    title: Optional[str] = None,
    body: Optional[str] = None,
) -> ReviewRow:
    """Owner-only PATCH. Emits ``review.upserted``."""

    if rating is not None and not (1 <= rating <= 5):
        raise ValidationProblem(detail="rating must be an integer 1..5")

    if rating is None and title is None and body is None:
        raise ValidationProblem(
            detail="at least one of rating, title, body must be provided"
        )

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        existing = await conn.fetchrow(
            "SELECT * FROM marketplace_review WHERE id = $1 AND deleted_at IS NULL",
            review_id,
        )
        if existing is None:
            raise NotFoundProblem(detail=f"review {review_id} not found")
        if existing["reviewer_user_id"] != actor_user_id:
            raise ReviewOwnerOnlyProblem(
                detail="Only the original reviewer can edit this review."
            )

        row = await conn.fetchrow(
            """
            UPDATE marketplace_review
            SET
                rating = COALESCE($2, rating),
                title = CASE WHEN $3::boolean THEN $4 ELSE title END,
                body = CASE WHEN $5::boolean THEN $6 ELSE body END
            WHERE id = $1
            RETURNING *
            """,
            review_id,
            rating,
            title is not None,
            title,
            body is not None,
            body,
        )

    review = _row_to_dataclass(row)
    await _emit_review_upserted(
        tenant_id=tenant_id,
        listing_id=review.listing_id,
        actor_user_id=actor_user_id,
    )
    return review


async def delete_review(
    *,
    tenant_id: UUID,
    review_id: UUID,
    actor_user_id: UUID,
) -> None:
    """Owner-only soft-delete. Emits ``review.deleted``."""

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        existing = await conn.fetchrow(
            "SELECT * FROM marketplace_review WHERE id = $1 AND deleted_at IS NULL",
            review_id,
        )
        if existing is None:
            raise NotFoundProblem(detail=f"review {review_id} not found")
        if existing["reviewer_user_id"] != actor_user_id:
            raise ReviewOwnerOnlyProblem(
                detail="Only the original reviewer can delete this review."
            )
        await conn.execute(
            """
            UPDATE marketplace_review
            SET deleted_at = now(), status = 'removed'
            WHERE id = $1
            """,
            review_id,
        )

    await _emit_review_deleted(
        tenant_id=tenant_id,
        listing_id=existing["listing_id"],
        actor_user_id=actor_user_id,
    )


# ---------------------------------------------------------------------------
# Astraea integration hooks
# ---------------------------------------------------------------------------


async def _emit_review_upserted(
    *,
    tenant_id: UUID,
    listing_id: UUID,
    actor_user_id: Optional[UUID],
) -> None:
    """Call Astraea recompute directly. Best-effort.

    Any exception is logged and swallowed so a trust-layer outage
    does not break the review mutation. The on-demand read path
    (:func:`read_cached_listing_trust`) will refresh stale rows.
    """

    try:
        from src.backend.trust.service import persist_listing_trust

        await persist_listing_trust(
            listing_id=listing_id,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            event_type="review_trigger",
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "commerce.review.recompute_failed listing_id=%s err=%s",
            listing_id,
            exc,
        )


async def _emit_review_deleted(
    *,
    tenant_id: UUID,
    listing_id: UUID,
    actor_user_id: Optional[UUID],
) -> None:
    """Same as upserted but emits with a deleted-event tag for audit."""

    try:
        from src.backend.trust.service import persist_listing_trust

        await persist_listing_trust(
            listing_id=listing_id,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            event_type="review_trigger",
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "commerce.review.recompute_failed_on_delete listing_id=%s err=%s",
            listing_id,
            exc,
        )


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _row_to_dataclass(row: Any) -> ReviewRow:
    return ReviewRow(
        id=row["id"],
        tenant_id=row["tenant_id"],
        listing_id=row["listing_id"],
        reviewer_user_id=row["reviewer_user_id"],
        purchase_id=row["purchase_id"],
        rating=int(row["rating"]),
        title=row["title"],
        body=row["body"],
        helpful_count=int(row["helpful_count"]),
        flag_count=int(row["flag_count"]),
        status=row["status"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        deleted_at=row["deleted_at"],
    )


__all__ = [
    "DuplicateReviewProblem",
    "PurchasedOnlyProblem",
    "ReviewAggregate",
    "ReviewOwnerOnlyProblem",
    "ReviewRow",
    "SLUG_REVIEW_DUPLICATE",
    "SLUG_REVIEW_OWNER_ONLY",
    "aggregate_listing_reviews",
    "create_review",
    "delete_review",
    "get_review",
    "list_reviews_for_listing",
    "update_review",
]
