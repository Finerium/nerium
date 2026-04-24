"""One-shot seed: populate trust scores for every published listing + creator.

Owner: Astraea (W2 NP P1 S1).

Run::

    python -m src.backend.trust.scripts.seed_trust_scores

The script fetches every published, non-archived marketplace listing,
runs :func:`persist_listing_trust` with ``event_type='initial_seed'``,
then aggregates per creator and runs :func:`persist_creator_trust`.

Idempotent by design: running twice produces two snapshot rows per
subject (event_type='initial_seed' both times) but the denormalised
columns always reflect the most recent compute. The snapshot history
is intentional - it is the audit trail the contract Section 9
testing surface calls for.

Concurrency
-----------
Serialised. The initial seed set is the 23 Phanes demo rows plus
whatever has been published since; running them sequentially is fast
enough (a single recompute is sub-millisecond on the pure-math path)
and avoids surprising pg_cron interference when the real pg_cron
lane lands in a future revision.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from typing import Any
from uuid import UUID

from src.backend.config import get_settings
from src.backend.db.pool import close_pool, create_app_pool, set_pool
from src.backend.trust.service import (
    persist_creator_trust,
    persist_listing_trust,
)

logger = logging.getLogger("trust.seed")


async def _fetch_published_listings(pool) -> list[dict[str, Any]]:
    """Return the (id, tenant_id, creator_user_id) for every published row."""

    async with pool.acquire() as conn:
        # RLS requires a tenant binding; the seed script runs as the
        # migration role which bypasses RLS so we can read across all
        # tenants.
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
    """Return the (user_id, tenant_id) of every creator with at least one published row."""

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


async def seed() -> dict[str, int]:
    """Main entry point. Returns a progress dict."""

    settings = get_settings()
    pool = await create_app_pool(settings)
    set_pool(pool)

    progress = {"listings_ok": 0, "listings_failed": 0, "creators_ok": 0, "creators_failed": 0}
    try:
        listings = await _fetch_published_listings(pool)
        logger.info("trust.seed.start listings=%d", len(listings))

        for entry in listings:
            try:
                await persist_listing_trust(
                    listing_id=entry["id"],
                    tenant_id=entry["tenant_id"],
                    event_type="initial_seed",
                )
                progress["listings_ok"] += 1
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "trust.seed.listing_failed id=%s err=%s", entry["id"], exc
                )
                progress["listings_failed"] += 1

        creators = await _fetch_creators(pool)
        logger.info("trust.seed.creators count=%d", len(creators))

        for entry in creators:
            try:
                await persist_creator_trust(
                    user_id=entry["id"],
                    tenant_id=entry["tenant_id"],
                    event_type="initial_seed",
                )
                progress["creators_ok"] += 1
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "trust.seed.creator_failed id=%s err=%s", entry["id"], exc
                )
                progress["creators_failed"] += 1
    finally:
        await close_pool()

    logger.info("trust.seed.done progress=%s", progress)
    return progress


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    result = asyncio.run(seed())
    print(  # noqa: T201 - CLI progress print is intentional
        f"Trust seed complete: listings {result['listings_ok']} ok / "
        f"{result['listings_failed']} failed, creators "
        f"{result['creators_ok']} ok / {result['creators_failed']} failed."
    )
    return 0 if result["listings_failed"] == 0 and result["creators_failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
