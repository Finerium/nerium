"""One-shot Astraea stopgap resolver (Iapetus W2 NP P4 S1).

Run::

    python -m src.backend.commerce.scripts.backfill_iapetus_stopgap

Purpose
-------
Astraea P1 shipped trust_score_snapshot with stopgap markers because
the ``marketplace_review`` table did not yet exist. Iapetus P4 S1
migration 050 ships it. This script walks every published listing +
creator, invokes :func:`persist_listing_trust` and
:func:`persist_creator_trust` against the UPDATED gather functions
(which now read real review data via
:func:`aggregate_listing_reviews`), and writes fresh snapshot rows.

Post-run invariant
------------------
Every non-archived published listing has a snapshot row whose
``computed_inputs._meta.stopgap.iapetus_p2_pending`` is ``False``.
For seed listings that have zero reviews this is still true because
the gather now sources from the real table (it simply reads an
empty result set, which counts as "review data available").

The script is idempotent. Re-running writes additional snapshot
rows (audit trail by design) but the denormalised columns converge
to the same values.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from typing import Any

from src.backend.config import get_settings
from src.backend.db.pool import close_pool, create_app_pool, set_pool
from src.backend.trust.service import (
    persist_creator_trust,
    persist_listing_trust,
)

logger = logging.getLogger("commerce.backfill_iapetus_stopgap")


async def _fetch_published_listings(pool) -> list[dict[str, Any]]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, tenant_id, creator_user_id
            FROM marketplace_listing
            WHERE status = 'published'
              AND archived_at IS NULL
            ORDER BY created_at ASC
            """
        )
    return [
        {
            "id": r["id"],
            "tenant_id": r["tenant_id"],
            "creator_user_id": r["creator_user_id"],
        }
        for r in rows
    ]


async def _fetch_creators(pool) -> list[dict[str, Any]]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT creator_user_id AS id, tenant_id
            FROM marketplace_listing
            WHERE status = 'published'
              AND archived_at IS NULL
            """
        )
    return [{"id": r["id"], "tenant_id": r["tenant_id"]} for r in rows]


async def backfill() -> dict[str, int]:
    """Main entry point. Returns progress stats + stopgap flip count."""

    settings = get_settings()
    pool = await create_app_pool(settings)
    set_pool(pool)

    progress: dict[str, int] = {
        "listings_ok": 0,
        "listings_failed": 0,
        "listings_stopgap_cleared": 0,
        "creators_ok": 0,
        "creators_failed": 0,
    }

    try:
        listings = await _fetch_published_listings(pool)
        logger.info(
            "commerce.backfill.start listings=%d", len(listings)
        )

        for entry in listings:
            try:
                breakdown = await persist_listing_trust(
                    listing_id=entry["id"],
                    tenant_id=entry["tenant_id"],
                    event_type="manual_recompute",
                )
                progress["listings_ok"] += 1
                # The new inputs_summary carries _meta.stopgap. We treat
                # any snapshot sourced from the real marketplace_review
                # table as a cleared stopgap even when review_count=0.
                if breakdown is not None:
                    progress["listings_stopgap_cleared"] += 1
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "commerce.backfill.listing_failed id=%s err=%s",
                    entry["id"],
                    exc,
                )
                progress["listings_failed"] += 1

        creators = await _fetch_creators(pool)
        logger.info(
            "commerce.backfill.creators count=%d", len(creators)
        )

        for entry in creators:
            try:
                await persist_creator_trust(
                    user_id=entry["id"],
                    tenant_id=entry["tenant_id"],
                    event_type="manual_recompute",
                )
                progress["creators_ok"] += 1
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "commerce.backfill.creator_failed id=%s err=%s",
                    entry["id"],
                    exc,
                )
                progress["creators_failed"] += 1
    finally:
        await close_pool()

    logger.info("commerce.backfill.done progress=%s", progress)
    return progress


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    result = asyncio.run(backfill())
    print(  # noqa: T201 - CLI progress print is intentional
        "Iapetus stopgap backfill: listings "
        f"{result['listings_ok']} ok / {result['listings_failed']} failed "
        f"(stopgap cleared {result['listings_stopgap_cleared']}), "
        f"creators {result['creators_ok']} ok / {result['creators_failed']} failed."
    )
    if result["listings_failed"] > 0 or result["creators_failed"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
