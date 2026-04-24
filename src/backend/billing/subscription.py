"""Subscription row CRUD + webhook state sync helpers.

Owner: Plutus (W2 NP P4 S1).

The ``subscription`` table is the single source of truth for "what tier
is this user on right now" so the UI (Marshall P6 pricing landing, any
feature-flag gate) does not have to hit Stripe on every request.

Every mutation runs inside a ``tenant_scoped`` transaction so RLS
enforces the tenant boundary at Postgres-level even if the app layer
mis-routes a call.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from src.backend.billing.plans import Tier
from src.backend.db.pool import get_pool
from src.backend.db.tenant import tenant_scoped
from src.backend.models.base import NeriumModel
from src.backend.utils.uuid7 import uuid7

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Wire shapes
# ---------------------------------------------------------------------------


class SubscriptionSnapshot(NeriumModel):
    """Read-only projection surfaced by ``GET /v1/billing/subscription/me``.

    Mirrors the narrow set of fields the UI needs to render a "current
    plan" badge. Omits the jsonb metadata bag (admin-only) and the
    stripe_* ids (internal).
    """

    tier: Tier
    status: str
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool = False


class SubscriptionMeResponse(NeriumModel):
    """Top-level wire shape for ``/v1/billing/subscription/me``.

    ``subscription`` is ``None`` when the user has no row (default free
    tier; no Stripe Customer created yet). The UI treats null as "on
    Free" and renders the upgrade CTA.
    """

    subscription: Optional[SubscriptionSnapshot] = None


@dataclass(frozen=True)
class SubscriptionRow:
    """Internal projection returned by query helpers."""

    id: UUID
    tenant_id: UUID
    user_id: UUID
    stripe_customer_id: str
    stripe_subscription_id: str | None
    tier: Tier
    status: str
    current_period_start: datetime | None
    current_period_end: datetime | None
    cancel_at_period_end: bool
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


_SELECT_COLUMNS = """
id, tenant_id, user_id,
stripe_customer_id, stripe_subscription_id,
tier, status,
current_period_start, current_period_end, cancel_at_period_end,
created_at, updated_at, deleted_at
"""


def _row_to_snapshot(row: dict[str, Any] | None) -> SubscriptionSnapshot | None:
    """Convert a fetched row (or None) to a public snapshot (or None)."""

    if row is None:
        return None
    return SubscriptionSnapshot(
        tier=row["tier"],
        status=row["status"],
        current_period_start=row["current_period_start"],
        current_period_end=row["current_period_end"],
        cancel_at_period_end=bool(row["cancel_at_period_end"]),
    )


def _row_to_internal(row: dict[str, Any] | None) -> SubscriptionRow | None:
    if row is None:
        return None
    return SubscriptionRow(
        id=row["id"],
        tenant_id=row["tenant_id"],
        user_id=row["user_id"],
        stripe_customer_id=row["stripe_customer_id"],
        stripe_subscription_id=row["stripe_subscription_id"],
        tier=row["tier"],
        status=row["status"],
        current_period_start=row["current_period_start"],
        current_period_end=row["current_period_end"],
        cancel_at_period_end=bool(row["cancel_at_period_end"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        deleted_at=row["deleted_at"],
    )


async def get_active_subscription_for_user(
    *,
    user_id: UUID,
    tenant_id: UUID,
) -> SubscriptionRow | None:
    """Return the user's single active subscription row, or ``None``.

    "Active" here means any non-soft-deleted row; the caller filters
    further on ``status`` if they want a narrower slice (e.g. exclude
    canceled). We limit to 1 row because the webhook upsert path
    enforces at most one subscription per user via business logic (a
    tier upgrade cancels the old Stripe subscription before creating
    the new one).
    """

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        row = await conn.fetchrow(
            f"""
            SELECT {_SELECT_COLUMNS}
            FROM subscription
            WHERE user_id = $1
              AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT 1
            """,
            user_id,
        )
    return _row_to_internal(dict(row) if row else None)


async def get_subscription_snapshot(
    *,
    user_id: UUID,
    tenant_id: UUID,
) -> SubscriptionSnapshot | None:
    """Fetch + project the ``/v1/billing/subscription/me`` response."""

    internal = await get_active_subscription_for_user(
        user_id=user_id, tenant_id=tenant_id
    )
    if internal is None:
        return None
    return SubscriptionSnapshot(
        tier=internal.tier,
        status=internal.status,
        current_period_start=internal.current_period_start,
        current_period_end=internal.current_period_end,
        cancel_at_period_end=internal.cancel_at_period_end,
    )


async def get_subscription_by_stripe_id(
    *,
    stripe_subscription_id: str,
    conn: Any | None = None,
) -> SubscriptionRow | None:
    """Lookup by Stripe subscription id (webhook path).

    Accepts an optional existing connection so the webhook handler can
    run the upsert + ledger post inside a single transaction. When
    ``conn`` is None we acquire our own (non-tenant-scoped since the
    webhook path has no tenant context yet; the policy tolerates
    ``tenant_id IS NULL`` reads).
    """

    sql = f"""
        SELECT {_SELECT_COLUMNS}
        FROM subscription
        WHERE stripe_subscription_id = $1
        LIMIT 1
    """
    if conn is not None:
        row = await conn.fetchrow(sql, stripe_subscription_id)
    else:
        pool = get_pool()
        async with pool.acquire() as acquired:
            row = await acquired.fetchrow(sql, stripe_subscription_id)
    return _row_to_internal(dict(row) if row else None)


# ---------------------------------------------------------------------------
# Webhook-path upsert + sync
# ---------------------------------------------------------------------------


async def upsert_from_stripe_subscription(
    *,
    stripe_subscription: dict[str, Any],
    user_id: UUID,
    tenant_id: UUID,
    tier: Tier,
    conn: Any | None = None,
) -> SubscriptionRow:
    """Insert or update a ``subscription`` row from a Stripe payload.

    Called by the webhook handler on
    ``customer.subscription.created|updated`` so the local mirror
    tracks Stripe state. Uses ``stripe_subscription_id`` as the
    dedup key (the column is UNIQUE in the schema).

    ``stripe_subscription`` is the JSON dict from the event's
    ``data.object``. We extract the narrow set of fields the
    ``subscription`` table stores; the full blob is available in the
    ``subscription_event.payload`` row if future analytics want more.
    """

    sub_id = stripe_subscription["id"]
    customer_id = stripe_subscription["customer"]
    status_text = stripe_subscription["status"]
    period_start = _from_unix(stripe_subscription.get("current_period_start"))
    period_end = _from_unix(stripe_subscription.get("current_period_end"))
    cancel_at_period_end = bool(stripe_subscription.get("cancel_at_period_end"))

    new_id = uuid7()
    insert_sql = f"""
        INSERT INTO subscription (
            id, tenant_id, user_id,
            stripe_customer_id, stripe_subscription_id,
            tier, status,
            current_period_start, current_period_end, cancel_at_period_end,
            metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
        ON CONFLICT (stripe_subscription_id) DO UPDATE SET
            tier = EXCLUDED.tier,
            status = EXCLUDED.status,
            current_period_start = EXCLUDED.current_period_start,
            current_period_end = EXCLUDED.current_period_end,
            cancel_at_period_end = EXCLUDED.cancel_at_period_end,
            metadata = EXCLUDED.metadata,
            updated_at = now(),
            deleted_at = NULL
        RETURNING {_SELECT_COLUMNS}
    """
    metadata = {
        "stripe_snapshot_ts": datetime.now(timezone.utc).isoformat(),
        "stripe_latest_status": status_text,
    }
    params = (
        new_id,
        tenant_id,
        user_id,
        customer_id,
        sub_id,
        tier,
        status_text,
        period_start,
        period_end,
        cancel_at_period_end,
        json.dumps(metadata),
    )

    if conn is not None:
        row = await conn.fetchrow(insert_sql, *params)
    else:
        pool = get_pool()
        async with tenant_scoped(pool, tenant_id) as acquired:
            row = await acquired.fetchrow(insert_sql, *params)

    internal = _row_to_internal(dict(row))
    assert internal is not None  # RETURNING guarantees a row
    logger.info(
        "billing.subscription.upsert id=%s user=%s tier=%s status=%s",
        internal.id,
        user_id,
        tier,
        status_text,
    )
    return internal


async def mark_subscription_canceled(
    *,
    stripe_subscription_id: str,
    conn: Any | None = None,
) -> SubscriptionRow | None:
    """Soft-delete on ``customer.subscription.deleted``.

    Sets ``deleted_at = now()`` + ``status = 'canceled'``. Returns the
    updated row projection or ``None`` when the subscription id was
    never mirrored (idempotent: a delete event for an unknown id is a
    no-op + warning log).
    """

    sql = f"""
        UPDATE subscription
        SET status = 'canceled',
            deleted_at = now(),
            updated_at = now()
        WHERE stripe_subscription_id = $1
        RETURNING {_SELECT_COLUMNS}
    """
    if conn is not None:
        row = await conn.fetchrow(sql, stripe_subscription_id)
    else:
        pool = get_pool()
        async with pool.acquire() as acquired:
            row = await acquired.fetchrow(sql, stripe_subscription_id)

    if row is None:
        logger.warning(
            "billing.subscription.cancel_unknown stripe_sub_id=%s",
            stripe_subscription_id,
        )
        return None

    internal = _row_to_internal(dict(row))
    assert internal is not None
    logger.info(
        "billing.subscription.canceled id=%s stripe_sub_id=%s",
        internal.id,
        stripe_subscription_id,
    )
    return internal


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _from_unix(value: Any) -> datetime | None:
    """Convert a Stripe unix-epoch int to an aware UTC datetime.

    Stripe payloads carry period timestamps as seconds since epoch.
    None or 0 yields None so the column stays NULL.
    """

    if value in (None, 0):
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc)
    except (TypeError, ValueError):
        return None


__all__ = [
    "SubscriptionMeResponse",
    "SubscriptionRow",
    "SubscriptionSnapshot",
    "get_active_subscription_for_user",
    "get_subscription_by_stripe_id",
    "get_subscription_snapshot",
    "mark_subscription_canceled",
    "upsert_from_stripe_subscription",
]
