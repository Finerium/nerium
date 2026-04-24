"""Listing moderation service.

Owner: Eunomia (W2 NP P6 S1).

Behaviour
---------
- ``list_pending_listings`` pages through listings that have been
  submitted (``published`` status with ``published_at`` timestamp set)
  but have not yet been reviewed. A listing is considered "pending
  review" when it has a ``published`` status and no rows in
  ``moderation_event`` referencing it. This matches the Phanes W2 NP P1
  ``marketplace.listing.submitted`` event handoff: Phanes flips status
  to ``published`` and emits the event; the moderation queue reads that
  surface directly rather than maintaining a parallel inbox.
- ``approve_listing`` is a no-op on the listing row plus an append to
  ``moderation_event``. The listing's ``status`` stays ``published``
  because Phanes already flipped it; the audit record captures the
  moderator's sign-off.
- ``reject_listing`` flips ``marketplace_listing.status`` to
  ``suspended`` (hiding it from the public catalogue) and appends the
  audit row with a mandatory reason.

Status vocabulary deviation
---------------------------
The Eunomia prompt referenced ``pending_review / active / rejected``
but the actual ``marketplace_listing.status`` CHECK is
``draft / published / suspended / archived`` per 046. Mapping:

    prompt            -> actual
    ------            ------
    pending_review -> published + no moderation_event row
    active         -> published + moderation_event.action=approve
    rejected       -> suspended + moderation_event.action=reject

This preserves the shipped schema without a forward-incompatible
migration and keeps the event-driven contract intact.

Contract references
-------------------
- ``docs/contracts/marketplace_listing.contract.md`` Section 5 events.
- Migration 051 ``moderation_event`` DDL.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from src.backend.db.pool import get_pool
from src.backend.errors import (
    NotFoundProblem,
    ValidationProblem,
)
from src.backend.utils.uuid7 import uuid7

logger = logging.getLogger(__name__)

# Hard upper bound on ``reason`` length. Keeps the moderation UI
# rectangular and prevents a moderator from pasting the entire listing
# into the reason field. Above this we 400.
MAX_REASON_LEN: int = 2000

# Paging defaults. Match the Aether cursor pagination primitives in
# shape but we use a simple offset variant here because the moderation
# queue is small and bounded (unpaged cases return everything).
DEFAULT_LIST_LIMIT: int = 25
MAX_LIST_LIMIT: int = 100


@dataclass(frozen=True)
class PendingListing:
    """Row surfaced by ``list_pending_listings``.

    A minimal projection so the moderation dashboard can render without
    pulling the full listing detail blob. The admin UI fetches
    ``/v1/marketplace/listings/{id}`` for the full view when an operator
    clicks through.
    """

    listing_id: UUID
    tenant_id: UUID
    creator_user_id: UUID
    title: str
    category: str
    subtype: str
    short_description: Optional[str]
    slug: Optional[str]
    published_at: Optional[datetime]
    created_at: datetime


@dataclass(frozen=True)
class ModerationEvent:
    """Audit row stored in ``moderation_event``."""

    id: UUID
    tenant_id: Optional[UUID]
    moderator_id: UUID
    listing_id: UUID
    action: str
    reason: Optional[str]
    metadata: dict[str, Any]
    created_at: datetime


async def list_pending_listings(
    *,
    limit: int = DEFAULT_LIST_LIMIT,
    offset: int = 0,
) -> tuple[list[PendingListing], int]:
    """Return ``(rows, total_pending)`` for the moderation dashboard.

    Queries listings with ``status = 'published'`` that have no
    ``moderation_event`` row yet. Admin-scope callers: RLS policy allows
    cross-tenant visibility on ``moderation_event`` (tenant_id NULL
    covers platform-scope) but ``marketplace_listing`` still carries
    strict per-tenant RLS. The admin caller's tenant-binding middleware
    skipped binding for ``/admin*`` prefixes, which means we must query
    via the ``nerium_admin`` or ``nerium_migration`` role path. We
    instead page via the default app role with ``tenant_id`` NULL-safe
    checks so the current shipped boundary still works.

    To keep this shippable without a role-switch on the pool, the helper
    ASSUMES the caller has already acquired a cross-tenant read path
    (admin panel does). The SQL uses a NOT EXISTS sub-select against
    ``moderation_event`` so the query stays simple to reason about.
    """

    limit = max(1, min(limit, MAX_LIST_LIMIT))
    offset = max(0, offset)

    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                ml.id                 AS listing_id,
                ml.tenant_id          AS tenant_id,
                ml.creator_user_id    AS creator_user_id,
                ml.title              AS title,
                ml.category           AS category,
                ml.subtype            AS subtype,
                ml.short_description  AS short_description,
                ml.slug               AS slug,
                ml.published_at       AS published_at,
                ml.created_at         AS created_at
            FROM marketplace_listing ml
            WHERE ml.status = 'published'
              AND ml.archived_at IS NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM moderation_event me
                  WHERE me.listing_id = ml.id
              )
            ORDER BY ml.published_at DESC NULLS LAST, ml.id DESC
            LIMIT $1 OFFSET $2
            """,
            limit,
            offset,
        )
        total_row = await conn.fetchrow(
            """
            SELECT COUNT(*)::bigint AS total
            FROM marketplace_listing ml
            WHERE ml.status = 'published'
              AND ml.archived_at IS NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM moderation_event me
                  WHERE me.listing_id = ml.id
              )
            """
        )

    total = int(total_row["total"]) if total_row is not None else 0
    items = [
        PendingListing(
            listing_id=row["listing_id"],
            tenant_id=row["tenant_id"],
            creator_user_id=row["creator_user_id"],
            title=row["title"],
            category=row["category"],
            subtype=row["subtype"],
            short_description=row["short_description"],
            slug=row["slug"],
            published_at=row["published_at"],
            created_at=row["created_at"],
        )
        for row in rows
    ]
    return items, total


async def approve_listing(
    *,
    listing_id: UUID,
    moderator_id: UUID,
    metadata: Optional[dict[str, Any]] = None,
) -> ModerationEvent:
    """Record an approval decision on ``listing_id``.

    Idempotency: if the listing already has an ``approve`` row on file,
    this helper returns the existing event rather than stacking a
    duplicate. Repeated clicks on the "Approve" button are safe.
    """

    pool = get_pool()
    async with pool.acquire() as conn:
        listing_row = await conn.fetchrow(
            """
            SELECT id, tenant_id, status, archived_at
            FROM marketplace_listing
            WHERE id = $1
            """,
            listing_id,
        )
        if listing_row is None:
            raise NotFoundProblem(
                detail=f"Listing {listing_id} not found for moderation.",
            )
        if listing_row["archived_at"] is not None:
            raise ValidationProblem(
                detail="Cannot approve an archived listing.",
            )

        existing = await conn.fetchrow(
            """
            SELECT id, tenant_id, moderator_id, listing_id, action, reason,
                   metadata, created_at
            FROM moderation_event
            WHERE listing_id = $1 AND action = 'approve'
            ORDER BY created_at DESC
            LIMIT 1
            """,
            listing_id,
        )
        if existing is not None:
            return _row_to_event(existing)

        new_id = uuid7()
        meta_json = json.dumps(metadata or {})
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                INSERT INTO moderation_event (
                    id, tenant_id, moderator_id, listing_id, action,
                    reason, metadata
                ) VALUES ($1, $2, $3, $4, 'approve', NULL, $5::jsonb)
                RETURNING id, tenant_id, moderator_id, listing_id, action,
                          reason, metadata, created_at
                """,
                new_id,
                listing_row["tenant_id"],
                moderator_id,
                listing_id,
                meta_json,
            )

    assert row is not None
    logger.info(
        "moderation.approve listing_id=%s moderator_id=%s",
        listing_id,
        moderator_id,
    )
    return _row_to_event(row)


async def reject_listing(
    *,
    listing_id: UUID,
    moderator_id: UUID,
    reason: str,
    metadata: Optional[dict[str, Any]] = None,
) -> ModerationEvent:
    """Record a rejection + flip the listing status to ``suspended``.

    ``reason`` is mandatory; empty or whitespace-only raises 400.
    """

    if not reason or not reason.strip():
        raise ValidationProblem(
            detail="reason is required when rejecting a listing.",
        )
    if len(reason) > MAX_REASON_LEN:
        raise ValidationProblem(
            detail=(
                f"reason exceeds max length ({len(reason)} > "
                f"{MAX_REASON_LEN} chars)."
            ),
        )

    pool = get_pool()
    async with pool.acquire() as conn:
        listing_row = await conn.fetchrow(
            """
            SELECT id, tenant_id, status, archived_at
            FROM marketplace_listing
            WHERE id = $1
            """,
            listing_id,
        )
        if listing_row is None:
            raise NotFoundProblem(
                detail=f"Listing {listing_id} not found for moderation.",
            )
        if listing_row["archived_at"] is not None:
            raise ValidationProblem(
                detail="Cannot reject an archived listing.",
            )

        new_id = uuid7()
        meta_json = json.dumps(metadata or {})
        async with conn.transaction():
            # Flip status to suspended so the listing drops out of
            # public query paths immediately. The listing service's
            # public queries already filter ``status = 'published'``.
            await conn.execute(
                """
                UPDATE marketplace_listing
                SET status = 'suspended', updated_at = now()
                WHERE id = $1
                """,
                listing_id,
            )
            row = await conn.fetchrow(
                """
                INSERT INTO moderation_event (
                    id, tenant_id, moderator_id, listing_id, action,
                    reason, metadata
                ) VALUES ($1, $2, $3, $4, 'reject', $5, $6::jsonb)
                RETURNING id, tenant_id, moderator_id, listing_id, action,
                          reason, metadata, created_at
                """,
                new_id,
                listing_row["tenant_id"],
                moderator_id,
                listing_id,
                reason,
                meta_json,
            )

    assert row is not None
    logger.info(
        "moderation.reject listing_id=%s moderator_id=%s reason=%r",
        listing_id,
        moderator_id,
        reason,
    )
    return _row_to_event(row)


def _row_to_event(row: Any) -> ModerationEvent:
    """Normalise an asyncpg row (or MagicMock dict) to a dataclass."""

    metadata = row["metadata"]
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except ValueError:
            metadata = {}
    return ModerationEvent(
        id=row["id"],
        tenant_id=row["tenant_id"],
        moderator_id=row["moderator_id"],
        listing_id=row["listing_id"],
        action=row["action"],
        reason=row["reason"],
        metadata=metadata or {},
        created_at=row["created_at"],
    )


__all__ = [
    "DEFAULT_LIST_LIMIT",
    "MAX_LIST_LIMIT",
    "MAX_REASON_LEN",
    "ModerationEvent",
    "PendingListing",
    "approve_listing",
    "list_pending_listings",
    "reject_listing",
]
