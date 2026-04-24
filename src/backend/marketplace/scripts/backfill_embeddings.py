"""One-shot backfill of ``listing_embedding`` for published rows.

Owner: Hyperion (W2 NP P1 Session 1).

Run::

    python -m src.backend.marketplace.scripts.backfill_embeddings

The script is idempotent: on each invocation it lists listings whose
``listing_embedding`` column is NULL (published + non-archived only),
reindexes them one-by-one with a small concurrency bound, and exits
when the queue empties. Re-running immediately is a no-op because
every row already has an embedding after the first pass.

The concurrency limit is deliberately low (4) so a bad-embedder loop
(e.g. Voyage rate-limiting under a big backfill) does not amplify the
failure rate. Each inner call inherits Arq's retry policy when routed
via :func:`src.backend.marketplace.indexer.enqueue_reindex`; this script
runs synchronously via :func:`reindex_listing` instead so errors surface
directly and operators can watch progress in the terminal.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys

from src.backend.config import get_settings
from src.backend.db.pool import close_pool, create_app_pool, set_pool
from src.backend.marketplace.indexer import (
    list_missing_embeddings,
    reindex_listing,
)

logger = logging.getLogger("marketplace.backfill")


CONCURRENCY: int = 4
BATCH_LIMIT: int = 200


async def _worker(queue: asyncio.Queue, progress: dict) -> None:
    while True:
        try:
            lid = await queue.get()
        except asyncio.CancelledError:  # pragma: no cover
            return
        if lid is None:
            queue.task_done()
            return
        try:
            ok = await reindex_listing(lid)
            if ok:
                progress["ok"] += 1
            else:
                progress["skipped"] += 1
        except Exception as exc:  # noqa: BLE001
            logger.exception("backfill.job_failed listing_id=%s err=%s", lid, exc)
            progress["failed"] += 1
        finally:
            queue.task_done()


async def run_backfill(batch_limit: int = BATCH_LIMIT) -> dict[str, int]:
    """Run the backfill loop once.

    Returns a progress dict ``{"ok": int, "skipped": int, "failed": int}``
    so callers (tests, operator scripts) can inspect outcomes.
    """

    ids = await list_missing_embeddings(limit=batch_limit)
    if not ids:
        logger.info("backfill.nothing_to_do")
        return {"ok": 0, "skipped": 0, "failed": 0}

    queue: asyncio.Queue = asyncio.Queue()
    for lid in ids:
        queue.put_nowait(lid)
    for _ in range(CONCURRENCY):
        queue.put_nowait(None)  # sentinel

    progress: dict[str, int] = {"ok": 0, "skipped": 0, "failed": 0}
    workers = [asyncio.create_task(_worker(queue, progress)) for _ in range(CONCURRENCY)]
    await queue.join()
    for w in workers:
        w.cancel()
    for w in workers:
        try:
            await w
        except asyncio.CancelledError:
            pass

    logger.info(
        "backfill.done count=%d ok=%d skipped=%d failed=%d",
        len(ids),
        progress["ok"],
        progress["skipped"],
        progress["failed"],
    )
    return progress


async def main() -> None:
    logging.basicConfig(
        level=os.environ.get("NERIUM_LOG_LEVEL", "INFO"),
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )
    pool = await create_app_pool(get_settings())
    set_pool(pool)
    try:
        total: dict[str, int] = {"ok": 0, "skipped": 0, "failed": 0}
        while True:
            batch = await run_backfill()
            for k in total:
                total[k] += batch[k]
            if all(v == 0 for v in batch.values()):
                break
        logger.info(
            "backfill.exit ok=%d skipped=%d failed=%d",
            total["ok"],
            total["skipped"],
            total["failed"],
        )
    finally:
        await close_pool()


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    sys.exit(asyncio.run(main()))
