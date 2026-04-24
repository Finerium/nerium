"""Marketplace listing embedding indexer.

Owner: Hyperion (W2 NP P1 Session 1).

Surface
-------
- :func:`reindex_listing` async helper that loads a listing, computes the
  embedding via :mod:`src.backend.marketplace.embedding`, and writes it to
  the ``listing_embedding`` column.
- :func:`reindex_listing_job` Arq-registered wrapper matching the
  ``(ctx, *args)`` signature.
- :func:`enqueue_reindex` thin producer used by
  :mod:`src.backend.marketplace.listing_service.publish_listing` to
  schedule the embedding computation out-of-band of the publish request.

Contract refs
-------------
- ``docs/contracts/marketplace_search.contract.md`` Section 4.5
  (indexer wiring: load row, concatenate fields, call embedder, write
  embedding column, emit structured event).
- ``docs/contracts/workers_background.contract.md`` Arq registration
  pattern (function, on-startup hook).

Design notes
------------
- The job is idempotent: running it twice for the same listing_id
  simply recomputes and rewrites the same embedding. Useful for the
  backfill script + recovery from a failed job.
- The job runs WITHOUT a tenant binding because embedding computation
  only reads public-facing columns. The RLS policy on ``marketplace_listing``
  still blocks cross-tenant UPDATE, but embedding writes use the
  migration role which has the full write grant.
- Errors are logged + re-raised so Arq's retry policy kicks in. DLQ
  landing is handled by the shared worker settings (max_tries=5 with
  exponential backoff per :mod:`src.backend.workers.arq_worker`).
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from src.backend.db.pool import get_pool
from src.backend.marketplace import embedding as _embedding
from src.backend.marketplace.search import _vector_literal
from src.backend.workers.arq_worker import register_job

logger = logging.getLogger(__name__)


ARQ_JOB_REINDEX_LISTING = "marketplace_reindex_listing"
"""Stable job function name used by enqueuers."""


async def _load_listing_text(listing_id: UUID) -> dict[str, Any] | None:
    """Fetch the columns we need to build the embedding input.

    Returns ``None`` when the listing does not exist (e.g. deleted between
    publish and job pickup). The caller treats this as a no-op so a
    missing row does not trip Arq's retry loop.
    """

    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, title, short_description, long_description,
                   capability_tags, category, subtype, status, archived_at
            FROM marketplace_listing
            WHERE id = $1
            """,
            listing_id,
        )
    if row is None:
        return None
    return dict(row)


async def _write_embedding(listing_id: UUID, vector: list[float]) -> None:
    """Persist the computed embedding on ``listing_embedding``."""

    pool = get_pool()
    qvec_literal = _vector_literal(vector)
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE marketplace_listing
               SET listing_embedding = $2::vector,
                   updated_at = now()
             WHERE id = $1
            """,
            listing_id,
            qvec_literal,
        )


async def reindex_listing(listing_id: UUID) -> bool:
    """Compute and persist the embedding for a single listing.

    Returns ``True`` when a fresh embedding was written, ``False`` when
    the row was missing or archived so the caller can branch on a
    success signal without scraping logs.
    """

    row = await _load_listing_text(listing_id)
    if row is None:
        logger.info(
            "marketplace.reindex.row_missing listing_id=%s", listing_id
        )
        return False
    if row.get("archived_at") is not None:
        logger.info(
            "marketplace.reindex.row_archived listing_id=%s", listing_id
        )
        return False

    text = _embedding.build_listing_index_text(
        title=row.get("title") or "",
        short_description=row.get("short_description"),
        long_description=row.get("long_description"),
        capability_tags=list(row.get("capability_tags") or []),
        category=row.get("category"),
        subtype=row.get("subtype"),
    )

    embedder = _embedding.get_embedder()
    result = await embedder.embed(text)

    await _write_embedding(listing_id, result.vector)

    logger.info(
        "marketplace.reindex.updated listing_id=%s source=%s fallback=%s",
        listing_id,
        result.source,
        result.is_fallback,
    )
    return True


async def reindex_listing_job(ctx: dict[str, Any], listing_id: str) -> bool:
    """Arq job wrapper.

    Arq passes ``ctx`` as the first positional. Subsequent args come from
    the ``enqueue_job`` caller; we accept the listing id as a string so
    the JSON serialisation round-trip through Redis is straightforward.
    """

    del ctx  # Arq context not needed; logs carry job_id separately.
    try:
        lid = UUID(listing_id)
    except (TypeError, ValueError):
        logger.error(
            "marketplace.reindex.invalid_id listing_id=%r", listing_id
        )
        return False
    return await reindex_listing(lid)


# Register the job at import time so the worker picks it up. Mirrors the
# pattern in ``src.backend.realtime.audit_jobs``. The callable is
# renamed to ``marketplace_reindex_listing`` for queue visibility.
reindex_listing_job.__name__ = ARQ_JOB_REINDEX_LISTING
register_job(reindex_listing_job)


async def enqueue_reindex(listing_id: UUID) -> bool:
    """Schedule a reindex via Arq. Returns True when enqueue succeeded.

    Fails soft when the Arq redis handle is not yet installed (e.g. the
    FastAPI lifespan hasn't run): logs a warning and returns False so
    the publish path does not leak a 500 on a missing worker.
    """

    try:
        from src.backend.workers.arq_redis import get_arq_redis

        redis = get_arq_redis()
    except Exception as exc:  # noqa: BLE001 - degrade gracefully
        logger.warning(
            "marketplace.reindex.enqueue_unavailable listing_id=%s err=%s",
            listing_id,
            exc,
        )
        return False

    try:
        await redis.enqueue_job(ARQ_JOB_REINDEX_LISTING, str(listing_id))
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "marketplace.reindex.enqueue_failed listing_id=%s err=%s",
            listing_id,
            exc,
        )
        return False
    return True


async def list_missing_embeddings(limit: int = 1000) -> list[UUID]:
    """Return listing ids that have no embedding yet. Used by the backfill CLI."""

    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id
            FROM marketplace_listing
            WHERE listing_embedding IS NULL
              AND archived_at IS NULL
              AND status = 'published'
            ORDER BY created_at ASC
            LIMIT $1
            """,
            limit,
        )
    return [r["id"] for r in rows]


__all__ = [
    "ARQ_JOB_REINDEX_LISTING",
    "enqueue_reindex",
    "list_missing_embeddings",
    "reindex_listing",
    "reindex_listing_job",
]
