"""Tests for the marketplace listing embedding indexer.

Owner: Hyperion (W2 NP P1 S1).
"""

from __future__ import annotations

from datetime import UTC
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.backend.marketplace import embedding, indexer


@pytest.fixture
def deterministic_embedder() -> None:
    stub = embedding.DeterministicPseudoEmbedder()
    embedding.set_embedder(stub)
    yield stub
    embedding.set_embedder(None)


@pytest.mark.asyncio
async def test_reindex_missing_row_returns_false(
    fake_listing_pool, deterministic_embedder
) -> None:
    fake_listing_pool._test_conn.fetchrow = AsyncMock(return_value=None)
    ok = await indexer.reindex_listing(uuid4())
    assert ok is False


@pytest.mark.asyncio
async def test_reindex_archived_row_returns_false(
    fake_listing_pool, deterministic_embedder
) -> None:
    from datetime import datetime

    fake_listing_pool._test_conn.fetchrow = AsyncMock(
        return_value={
            "id": uuid4(),
            "title": "x",
            "short_description": None,
            "long_description": None,
            "capability_tags": [],
            "category": "core_agent",
            "subtype": "agent",
            "status": "archived",
            "archived_at": datetime.now(UTC),
        }
    )
    ok = await indexer.reindex_listing(uuid4())
    assert ok is False


@pytest.mark.asyncio
async def test_reindex_happy_path_writes_embedding(
    fake_listing_pool, deterministic_embedder
) -> None:
    lid = uuid4()
    fake_listing_pool._test_conn.fetchrow = AsyncMock(
        return_value={
            "id": lid,
            "title": "Dragon Agent",
            "short_description": "short",
            "long_description": "long",
            "capability_tags": ["fire", "magic"],
            "category": "core_agent",
            "subtype": "agent",
            "status": "published",
            "archived_at": None,
        }
    )
    fake_listing_pool._test_conn.execute = AsyncMock(return_value="UPDATE 1")

    ok = await indexer.reindex_listing(lid)
    assert ok is True
    # Verify the UPDATE was issued with a vector literal (starts with '[').
    call_args = fake_listing_pool._test_conn.execute.call_args
    assert call_args is not None
    assert call_args.args[1] == lid
    assert call_args.args[2].startswith("[")
    assert call_args.args[2].endswith("]")


@pytest.mark.asyncio
async def test_reindex_idempotent_on_second_run(
    fake_listing_pool, deterministic_embedder
) -> None:
    """Running reindex twice writes the same embedding both times."""

    lid = uuid4()
    row = {
        "id": lid,
        "title": "Stable",
        "short_description": "s",
        "long_description": "l",
        "capability_tags": [],
        "category": "content",
        "subtype": "prompt",
        "status": "published",
        "archived_at": None,
    }
    fake_listing_pool._test_conn.fetchrow = AsyncMock(return_value=row)
    fake_listing_pool._test_conn.execute = AsyncMock(return_value="UPDATE 1")

    ok1 = await indexer.reindex_listing(lid)
    first_literal = fake_listing_pool._test_conn.execute.call_args.args[2]
    ok2 = await indexer.reindex_listing(lid)
    second_literal = fake_listing_pool._test_conn.execute.call_args.args[2]
    assert ok1 is True and ok2 is True
    # Deterministic embedder means the literals match byte-for-byte.
    assert first_literal == second_literal


@pytest.mark.asyncio
async def test_reindex_job_wraps_string_uuid(
    fake_listing_pool, deterministic_embedder
) -> None:
    lid = uuid4()
    fake_listing_pool._test_conn.fetchrow = AsyncMock(
        return_value={
            "id": lid,
            "title": "wrap",
            "short_description": None,
            "long_description": None,
            "capability_tags": [],
            "category": "content",
            "subtype": "prompt",
            "status": "published",
            "archived_at": None,
        }
    )
    fake_listing_pool._test_conn.execute = AsyncMock(return_value="UPDATE 1")

    ok = await indexer.reindex_listing_job({}, str(lid))
    assert ok is True


@pytest.mark.asyncio
async def test_reindex_job_rejects_malformed_id() -> None:
    ok = await indexer.reindex_listing_job({}, "not-a-uuid")
    assert ok is False


@pytest.mark.asyncio
async def test_enqueue_reindex_fails_soft_when_arq_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No Arq handle installed => enqueue logs + returns False, no raise."""

    # Ensure the arq_redis singleton is cleared.
    from src.backend.workers import arq_redis

    arq_redis.set_arq_redis(None)
    ok = await indexer.enqueue_reindex(uuid4())
    assert ok is False


@pytest.mark.asyncio
async def test_enqueue_reindex_uses_handle_when_present(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.backend.workers import arq_redis

    fake_handle = MagicMock()
    fake_handle.enqueue_job = AsyncMock(return_value=MagicMock())
    arq_redis.set_arq_redis(fake_handle)
    try:
        lid = uuid4()
        ok = await indexer.enqueue_reindex(lid)
        assert ok is True
        fake_handle.enqueue_job.assert_awaited_once_with(
            indexer.ARQ_JOB_REINDEX_LISTING, str(lid)
        )
    finally:
        arq_redis.set_arq_redis(None)


@pytest.mark.asyncio
async def test_list_missing_embeddings_returns_ids(fake_listing_pool) -> None:
    ids = [uuid4(), uuid4()]
    fake_listing_pool._test_conn.fetch = AsyncMock(
        return_value=[{"id": i} for i in ids]
    )
    got = await indexer.list_missing_embeddings(limit=100)
    assert got == ids


@pytest.mark.asyncio
async def test_backfill_run_idempotent_when_queue_empty(
    fake_listing_pool, deterministic_embedder
) -> None:
    """A backfill with no missing rows returns a zeroed progress dict."""

    from src.backend.marketplace.scripts import backfill_embeddings

    fake_listing_pool._test_conn.fetch = AsyncMock(return_value=[])
    progress = await backfill_embeddings.run_backfill()
    assert progress == {"ok": 0, "skipped": 0, "failed": 0}


@pytest.mark.asyncio
async def test_backfill_processes_listed_ids(
    fake_listing_pool, deterministic_embedder
) -> None:
    from src.backend.marketplace.scripts import backfill_embeddings

    lid = uuid4()
    # First fetch call: the list_missing_embeddings query. Subsequent
    # fetchrow calls inside reindex_listing return the listing row shape.
    fake_listing_pool._test_conn.fetch = AsyncMock(return_value=[{"id": lid}])
    fake_listing_pool._test_conn.fetchrow = AsyncMock(
        return_value={
            "id": lid,
            "title": "backfill",
            "short_description": "s",
            "long_description": "l",
            "capability_tags": [],
            "category": "content",
            "subtype": "prompt",
            "status": "published",
            "archived_at": None,
        }
    )
    fake_listing_pool._test_conn.execute = AsyncMock(return_value="UPDATE 1")
    progress = await backfill_embeddings.run_backfill()
    assert progress["ok"] == 1
    assert progress["failed"] == 0


def test_arq_job_registered_at_import_time() -> None:
    """reindex_listing_job must appear in the REGISTERED_JOBS list."""

    from src.backend.workers.arq_worker import REGISTERED_JOBS

    names = {fn.__name__ for fn in REGISTERED_JOBS}
    assert indexer.ARQ_JOB_REINDEX_LISTING in names
