"""Nightly trust score refresh cron (Astraea V4 S2).

Owner: Astraea (W2 Registry trust, NP phase, V4 S2 pack).

Purpose
-------
Recompute and persist ``trust_score_cached`` for every published
``marketplace_listing`` whose latest snapshot is older than the
freshness window (default 24 hours) or has never been computed.

Runs at 02:00 UTC daily per ``docs/contracts/trust_score.contract.md``
Section 4.1. The contract describes a pg_cron primary path with an Arq
cron fallback; this module IS the Arq fallback. Both paths run the
same compute logic via :func:`src.backend.trust.service.persist_listing_trust`
so the snapshot rows are formula-version-stamped consistently.

Design notes
------------
- Tenant-aware: the cron iterates tenants from ``app_tenant`` and
  binds the asyncpg connection to each tenant id before issuing the
  per-tenant ``SELECT`` -- tenant_scoped() is the project-wide RLS
  binding helper -- so the SELECT respects RLS without bypassing the
  policy.
- Batched: the SELECT pulls at most ``MAX_LISTINGS_PER_RUN`` listings
  per tenant per run. Listings ordered by ``trust_score_cached_at
  ASC NULLS FIRST`` so the most-stale rows refresh first; the next
  cron tick mops up the tail. Contract Section 8 caps the runtime at
  10K rows to keep the nightly window bounded.
- Idempotent: rerunning the cron is safe; each call writes a new
  ``trust_score_snapshot`` row + denormalises onto
  ``marketplace_listing``. The downstream UI surfaces cached values
  so duplicate snapshot rows do not affect read latency.
- Failure isolation: a single listing failure logs ERROR + emits a
  metric but does NOT abort the rest of the batch; the next nightly
  run retries.
- Manual trigger: :func:`enqueue_refresh_batch` enqueues the same job
  via Arq's ``enqueue_job`` so an admin endpoint can trigger an
  immediate batch run without waiting for the next 02:00 UTC tick.

Contract refs
-------------
- ``docs/contracts/trust_score.contract.md`` Section 4.1 cron schedule.
- ``docs/contracts/trust_score.contract.md`` Section 8 row-count cap.
- ``docs/contracts/trust_score.contract.md`` Section 5 event signatures
  (``trust.refresh.batch_completed``).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from arq.cron import cron

from src.backend.db.pool import get_pool
from src.backend.db.tenant import tenant_scoped
from src.backend.trust.service import persist_listing_trust
from src.backend.workers.arq_worker import register_cron_job, register_job

logger = logging.getLogger(__name__)


ARQ_JOB_TRUST_REFRESH_BATCH = "trust_refresh_batch"
"""Stable job function name surfaced to Arq's queue + admin enqueuer."""

CRON_NAME = "trust.refresh_scores_nightly"
"""Human-readable name for the cron registration; appears in worker logs."""

DEFAULT_FRESHNESS_WINDOW_HOURS: int = 24
"""Listings whose snapshot is at least this old qualify for refresh.

Aligned with :data:`src.backend.trust.service.CACHE_TTL_SECONDS` which
is also 24 hours; the on-demand read path triggers a single-listing
refresh when stale, while this cron handles the batch sweep so most
queries hit a fresh-cached row.
"""

MAX_LISTINGS_PER_RUN: int = 1000
"""Per-tenant batch cap per Section 8 (`Batch compute row count > 10K
throttle via LIMIT 1000 per run`).

A tenant with more than 1000 stale listings drains across multiple
nightly runs (1000 / day). At submission scale (single demo tenant,
< 100 listings) the cap is non-binding.
"""


# ---------------------------------------------------------------------------
# Per-listing helper (failure-isolated)
# ---------------------------------------------------------------------------


async def _refresh_one_listing(
    *,
    listing_id: UUID,
    tenant_id: UUID,
    actor_user_id: UUID | None,
) -> bool:
    """Refresh one listing; return True on success, False on caught failure.

    Wraps :func:`persist_listing_trust` with a logged catch-all so a
    single bad row does not abort the whole batch. Service-level
    failures (asyncpg exceptions, RLS misconfig, etc.) propagate as
    ``False`` after a structured ERROR log.
    """

    try:
        breakdown = await persist_listing_trust(
            listing_id=listing_id,
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            event_type="cron_refresh",
        )
    except Exception as exc:  # noqa: BLE001 - cron must not abort batch
        logger.error(
            "trust.refresh.listing_failed listing_id=%s tenant_id=%s err=%s",
            listing_id,
            tenant_id,
            exc,
        )
        return False
    if breakdown is None:
        logger.warning(
            "trust.refresh.listing_missing listing_id=%s tenant_id=%s",
            listing_id,
            tenant_id,
        )
        return False
    return True


# ---------------------------------------------------------------------------
# Per-tenant helper
# ---------------------------------------------------------------------------


async def _select_stale_listings(
    *,
    tenant_id: UUID,
    freshness_cutoff: datetime,
    limit: int,
) -> list[UUID]:
    """Return up to ``limit`` listing ids whose snapshot is stale.

    A row qualifies when:
    - ``status = 'published'`` (drafts + archived rows have no public
      trust surface).
    - ``archived_at IS NULL``.
    - ``trust_score_cached_at IS NULL`` OR older than ``freshness_cutoff``.

    Ordered ``trust_score_cached_at ASC NULLS FIRST`` so never-scored
    rows surface first, then the most-stale.
    """

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        rows = await conn.fetch(
            """
            SELECT id
            FROM marketplace_listing
            WHERE status = 'published'
              AND archived_at IS NULL
              AND (
                trust_score_cached_at IS NULL
                OR trust_score_cached_at < $1
              )
            ORDER BY trust_score_cached_at ASC NULLS FIRST,
                     created_at ASC
            LIMIT $2
            """,
            freshness_cutoff,
            limit,
        )
    return [r["id"] for r in rows]


async def _list_active_tenants() -> list[UUID]:
    """Return ids of every active (non-suspended) tenant.

    The cron iterates tenants because the per-listing path uses
    ``tenant_scoped`` which sets the RLS GUC; one tenant binding cannot
    span multiple tenants in the same connection. We accept the extra
    overhead because submission-scale tenant counts stay small.

    Tenants with ``status = 'suspended'`` are skipped so a banned
    tenant's stale rows do not get refreshed silently.
    """

    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id
            FROM app_tenant
            WHERE status = 'active'
            ORDER BY created_at ASC
            """
        )
    return [r["id"] for r in rows]


# ---------------------------------------------------------------------------
# Top-level batch runner (called by both the cron + the manual enqueue)
# ---------------------------------------------------------------------------


async def run_refresh_batch(
    *,
    freshness_window_hours: int = DEFAULT_FRESHNESS_WINDOW_HOURS,
    max_listings_per_tenant: int = MAX_LISTINGS_PER_RUN,
    now: datetime | None = None,
) -> dict[str, int]:
    """Iterate every active tenant + refresh stale listings.

    Returns a small summary so the caller (Arq job result, manual
    admin endpoint) can surface a count without scraping logs.

    Parameters
    ----------
    freshness_window_hours:
        How many hours after the last snapshot a row counts as stale.
        Defaults to 24 to match the on-demand cache TTL.
    max_listings_per_tenant:
        Per-tenant batch cap (defends against runaway nightly runs).
    now:
        Override the wall clock for tests. Defaults to UTC now.

    Returns
    -------
    dict
        ``{'tenants_visited', 'listings_attempted', 'listings_refreshed',
        'listings_failed', 'duration_ms'}``.
    """

    started = (now or datetime.now(timezone.utc))
    cutoff = started - timedelta(hours=freshness_window_hours)
    logger.info(
        "trust.refresh.begin window_hours=%d cap_per_tenant=%d cutoff=%s",
        freshness_window_hours,
        max_listings_per_tenant,
        cutoff.isoformat(),
    )

    tenants = await _list_active_tenants()
    listings_attempted = 0
    listings_refreshed = 0
    listings_failed = 0

    for tenant_id in tenants:
        try:
            stale_ids = await _select_stale_listings(
                tenant_id=tenant_id,
                freshness_cutoff=cutoff,
                limit=max_listings_per_tenant,
            )
        except Exception as exc:  # noqa: BLE001 - tenant isolation
            logger.error(
                "trust.refresh.tenant_select_failed tenant_id=%s err=%s",
                tenant_id,
                exc,
            )
            continue

        if not stale_ids:
            logger.debug(
                "trust.refresh.tenant_clean tenant_id=%s", tenant_id
            )
            continue

        for listing_id in stale_ids:
            listings_attempted += 1
            ok = await _refresh_one_listing(
                listing_id=listing_id,
                tenant_id=tenant_id,
                actor_user_id=None,
            )
            if ok:
                listings_refreshed += 1
            else:
                listings_failed += 1

    finished = datetime.now(timezone.utc)
    duration_ms = int((finished - started).total_seconds() * 1000)
    summary: dict[str, int] = {
        "tenants_visited": len(tenants),
        "listings_attempted": listings_attempted,
        "listings_refreshed": listings_refreshed,
        "listings_failed": listings_failed,
        "duration_ms": duration_ms,
    }
    logger.info(
        "trust.refresh.batch_completed tenants=%d attempted=%d refreshed=%d failed=%d duration_ms=%d",
        summary["tenants_visited"],
        summary["listings_attempted"],
        summary["listings_refreshed"],
        summary["listings_failed"],
        summary["duration_ms"],
    )
    return summary


# ---------------------------------------------------------------------------
# Arq registrations: cron (nightly 02:00 UTC) + manual job (enqueue-on-demand)
# ---------------------------------------------------------------------------


async def trust_refresh_batch_cron(ctx: dict[str, Any]) -> dict[str, int]:
    """Arq cron body. Runs at 02:00 UTC nightly per contract Section 4.1."""

    del ctx  # unused; ctx fields surfaced via Arq logger separately
    return await run_refresh_batch()


async def trust_refresh_batch_job(
    ctx: dict[str, Any],
    *,
    freshness_window_hours: int = DEFAULT_FRESHNESS_WINDOW_HOURS,
    max_listings_per_tenant: int = MAX_LISTINGS_PER_RUN,
) -> dict[str, int]:
    """Arq job body. Called by :func:`enqueue_refresh_batch`.

    Accepts kwargs so an admin endpoint can shrink the freshness window
    (e.g. force-refresh anything older than 1 hour) without redeploying.
    """

    del ctx
    return await run_refresh_batch(
        freshness_window_hours=freshness_window_hours,
        max_listings_per_tenant=max_listings_per_tenant,
    )


trust_refresh_batch_job.__name__ = ARQ_JOB_TRUST_REFRESH_BATCH


# Cron registration: 02:00 UTC nightly. Contract Section 4.1.
register_cron_job(
    cron(
        trust_refresh_batch_cron,
        name=CRON_NAME,
        hour={2},
        minute={0},
        run_at_startup=False,
    )
)

# Manual-enqueue job registration: lets the admin batch endpoint trigger
# an immediate refresh sweep without waiting for the nightly tick.
register_job(trust_refresh_batch_job)


# ---------------------------------------------------------------------------
# Producer for the admin manual-trigger endpoint
# ---------------------------------------------------------------------------


async def enqueue_refresh_batch(
    *,
    freshness_window_hours: int | None = None,
    max_listings_per_tenant: int | None = None,
) -> bool:
    """Enqueue an out-of-band refresh batch via Arq.

    Returns True on enqueue success, False when the Arq redis handle is
    not yet installed (e.g. lifespan has not run during a test) so the
    caller can surface a 503 without leaking a 500.
    """

    try:
        from src.backend.workers.arq_redis import get_arq_redis

        redis = get_arq_redis()
    except Exception as exc:  # noqa: BLE001 - degrade gracefully
        logger.warning("trust.refresh.enqueue_unavailable err=%s", exc)
        return False

    payload: dict[str, Any] = {}
    if freshness_window_hours is not None:
        payload["freshness_window_hours"] = freshness_window_hours
    if max_listings_per_tenant is not None:
        payload["max_listings_per_tenant"] = max_listings_per_tenant

    try:
        await redis.enqueue_job(ARQ_JOB_TRUST_REFRESH_BATCH, **payload)
    except Exception as exc:  # noqa: BLE001
        logger.warning("trust.refresh.enqueue_failed err=%s", exc)
        return False
    return True


__all__ = [
    "ARQ_JOB_TRUST_REFRESH_BATCH",
    "CRON_NAME",
    "DEFAULT_FRESHNESS_WINDOW_HOURS",
    "MAX_LISTINGS_PER_RUN",
    "enqueue_refresh_batch",
    "run_refresh_batch",
    "trust_refresh_batch_cron",
    "trust_refresh_batch_job",
]
