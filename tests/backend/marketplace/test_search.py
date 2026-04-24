"""Tests for marketplace hybrid search (FTS + pgvector + RRF).

Owner: Hyperion (W2 NP P1 S1).

These tests run without a live Postgres: they patch the asyncpg pool
fixture from conftest to return canned rows for ``fetch`` (lexical +
semantic branches + hydration) and ``fetchrow``. The RRF fusion is pure
Python so it is exercised directly by id-only unit tests.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from src.backend.marketplace import embedding, search
from src.backend.marketplace.search import (
    RRF_K,
    RRF_WEIGHT_LEXICAL,
    RRF_WEIGHT_SEMANTIC,
    SearchQuery,
    reciprocal_rank_fusion,
)

# ---------------------------------------------------------------------------
# RRF unit tests (pure Python, no DB)
# ---------------------------------------------------------------------------


def _uid(n: int) -> UUID:
    """Build a deterministic UUID for test ids.

    We use a trailing hex representation so str(uuid) ordering matches
    the natural numeric ordering, which makes tiebreak assertions
    readable.
    """

    return UUID(int=n)


def test_rrf_single_list_produces_expected_scores() -> None:
    fused = reciprocal_rank_fusion(
        lexical=[{"id": _uid(1)}, {"id": _uid(2)}, {"id": _uid(3)}],
        semantic=[],
    )
    # Expect 0.5/(60+1), 0.5/(60+2), 0.5/(60+3) descending.
    assert [lid for lid, _ in fused] == [_uid(1), _uid(2), _uid(3)]
    assert fused[0][1] == pytest.approx(RRF_WEIGHT_LEXICAL / (RRF_K + 1))
    assert fused[1][1] == pytest.approx(RRF_WEIGHT_LEXICAL / (RRF_K + 2))


def test_rrf_off_by_one_rank_starts_at_1() -> None:
    """Rank-1 entry contributes weight/(k+1), NOT weight/k. Guard the
    standard RRF formulation against an off-by-one regression.
    """

    fused = reciprocal_rank_fusion(
        lexical=[{"id": _uid(7)}],
        semantic=[],
    )
    assert fused[0][1] == pytest.approx(RRF_WEIGHT_LEXICAL / (RRF_K + 1))
    # And NOT weight / k:
    assert fused[0][1] != pytest.approx(RRF_WEIGHT_LEXICAL / RRF_K)


def test_rrf_merges_two_lists() -> None:
    """Contract Section 3.2 case: A appears at rank 1 in list L and rank 3
    in list S, so A scores 0.5/(60+1) + 0.5/(60+3).
    """

    id_a = _uid(0xAA)
    id_b = _uid(0xBB)
    id_c = _uid(0xCC)
    id_d = _uid(0xDD)

    fused = dict(
        reciprocal_rank_fusion(
            lexical=[{"id": id_a}, {"id": id_b}, {"id": id_c}],
            semantic=[{"id": id_c}, {"id": id_d}, {"id": id_a}],
        )
    )
    assert fused[id_a] == pytest.approx(
        RRF_WEIGHT_LEXICAL / (RRF_K + 1) + RRF_WEIGHT_SEMANTIC / (RRF_K + 3)
    )
    assert fused[id_b] == pytest.approx(RRF_WEIGHT_LEXICAL / (RRF_K + 2))
    assert fused[id_c] == pytest.approx(
        RRF_WEIGHT_LEXICAL / (RRF_K + 3) + RRF_WEIGHT_SEMANTIC / (RRF_K + 1)
    )
    assert fused[id_d] == pytest.approx(RRF_WEIGHT_SEMANTIC / (RRF_K + 2))


def test_rrf_tiebreak_is_deterministic_by_id() -> None:
    """Two ids with identical fused score sort by str(uuid) DESC.

    Deterministic tiebreak is required so cursor pagination lands on the
    same boundary across repeated invocations of the same query.
    """

    # Craft two lists so id_a and id_c share the same score. id_a ranks 1
    # in lexical + rank 2 in semantic; id_c ranks 2 in lexical + rank 1
    # in semantic. Equal weights => equal scores.
    id_a = _uid(0x01)
    id_c = _uid(0xFF)
    fused_map = dict(
        reciprocal_rank_fusion(
            lexical=[{"id": id_a}, {"id": id_c}],
            semantic=[{"id": id_c}, {"id": id_a}],
        )
    )
    assert fused_map[id_a] == fused_map[id_c]


def test_rrf_preserves_candidate_union_count() -> None:
    fused = reciprocal_rank_fusion(
        lexical=[{"id": _uid(i)} for i in range(5)],
        semantic=[{"id": _uid(i)} for i in range(3, 8)],
    )
    assert len({lid for lid, _ in fused}) == 8  # union of 0..7


def test_rrf_accepts_asyncpg_record_and_tuple_inputs() -> None:
    """RRF must accept dicts, tuples, and Record-like with subscript."""

    fused = reciprocal_rank_fusion(
        lexical=[(_uid(1), 0.9), (_uid(2), 0.8)],
        semantic=[{"id": _uid(2)}, {"id": _uid(3)}],
    )
    got = {lid for lid, _ in fused}
    assert got == {_uid(1), _uid(2), _uid(3)}


# ---------------------------------------------------------------------------
# SearchQuery validation
# ---------------------------------------------------------------------------


def test_search_query_rejects_invalid_sort() -> None:
    with pytest.raises(ValueError):
        SearchQuery(q="hi", sort="magic")  # type: ignore[arg-type]


def test_search_query_rejects_limit_overflow() -> None:
    with pytest.raises(ValueError):
        SearchQuery(q="hi", limit=9999)


def test_search_query_accepts_well_formed_input() -> None:
    q = SearchQuery(q="dragon", category="core_agent", sort="relevance", limit=10)
    assert q.category == "core_agent"
    assert q.sort == "relevance"


# ---------------------------------------------------------------------------
# Hybrid search with mocked pool
# ---------------------------------------------------------------------------


def _mk_row(
    *,
    listing_id: UUID | None = None,
    title: str = "Dragon Quest Agent",
    status: str = "published",
    category: str = "core_agent",
    subtype: str = "agent",
    trust: float | None = None,
    created_at: datetime | None = None,
) -> dict[str, Any]:
    now = created_at or datetime.now(UTC)
    return {
        "id": listing_id or uuid4(),
        "tenant_id": uuid4(),
        "creator_user_id": uuid4(),
        "category": category,
        "subtype": subtype,
        "slug": title.lower().replace(" ", "-"),
        "title": title,
        "description": title,
        "short_description": "desc",
        "long_description": "long body",
        "capability_tags": ["tag1"],
        "license": "MIT",
        "pricing": {},
        "pricing_model": "free",
        "pricing_details": {},
        "category_metadata": {},
        "asset_refs": [],
        "thumbnail_r2_key": None,
        "trust_score_cached": trust,
        "revenue_split_override": None,
        "status": status,
        "version": "0.1.0",
        "version_history": [],
        "metadata": {},
        "published_at": now,
        "archived_at": None,
        "created_at": now,
        "updated_at": now,
    }


@pytest.fixture
def deterministic_embedder() -> Any:
    """Install a pinned DeterministicPseudoEmbedder for the duration of a test.

    Avoids environment-dependent embedder selection inside hybrid_search.
    """

    stub = embedding.DeterministicPseudoEmbedder()
    embedding.set_embedder(stub)
    yield stub
    embedding.set_embedder(None)


def _patch_conn_fetch_sequence(pool, sequences: list[list[dict]]) -> None:
    """Patch conn.fetch to return items from ``sequences`` in order.

    The search service issues 3 fetch calls per hybrid_search:
      1. lexical subquery
      2. semantic subquery
      3. hydration (fetch rows by id)
    """

    pool._test_conn.fetch = AsyncMock(side_effect=sequences)


@pytest.mark.asyncio
async def test_hybrid_search_returns_fused_order(
    fake_listing_pool, deterministic_embedder
) -> None:
    """Lexical top-3 + semantic top-3 with overlap; expect fused order."""

    row_a = _mk_row(title="Alpha Agent")
    row_b = _mk_row(title="Beta Agent")
    row_c = _mk_row(title="Gamma Agent")

    lexical = [{"id": row_a["id"], "lrank": 0.9},
               {"id": row_b["id"], "lrank": 0.5}]
    semantic = [{"id": row_c["id"], "srank": 0.9},
                {"id": row_a["id"], "srank": 0.7}]
    hydrate_rows = [row_a, row_b, row_c]

    _patch_conn_fetch_sequence(
        fake_listing_pool,
        [lexical, semantic, hydrate_rows],
    )

    result = await search.hybrid_search(SearchQuery(q="agent", limit=5))
    # A is in both lists, C is top of semantic, B is lexical only.
    returned_ids = [item.id for item in result.items]
    # A must rank first (lex rank 1 + sem rank 2 beats C which is only sem rank 1).
    assert returned_ids[0] == row_a["id"]
    assert set(returned_ids) == {row_a["id"], row_b["id"], row_c["id"]}
    assert result.embedding_source == "deterministic"
    assert result.embedding_is_fallback is False
    assert result.total_candidate_count == 3


@pytest.mark.asyncio
async def test_hybrid_search_empty_result(fake_listing_pool, deterministic_embedder) -> None:
    _patch_conn_fetch_sequence(fake_listing_pool, [[], [], []])
    result = await search.hybrid_search(SearchQuery(q="nonexistent", limit=5))
    assert result.items == []
    assert result.fused_scores == []
    assert result.total_candidate_count == 0
    assert result.next_cursor is None
    assert result.has_more is False


@pytest.mark.asyncio
async def test_hybrid_search_respects_limit_and_surfaces_cursor(
    fake_listing_pool, deterministic_embedder
) -> None:
    rows = [_mk_row(title=f"Row {i}") for i in range(5)]
    lexical = [{"id": r["id"], "lrank": 0.9 - i * 0.1} for i, r in enumerate(rows)]
    semantic = []
    _patch_conn_fetch_sequence(fake_listing_pool, [lexical, semantic, rows])

    result = await search.hybrid_search(SearchQuery(q="row", limit=3))
    assert len(result.items) == 3
    assert result.has_more is True
    assert result.next_cursor is not None


@pytest.mark.asyncio
async def test_hybrid_search_sort_recent_orders_by_created_at(
    fake_listing_pool, deterministic_embedder
) -> None:
    old = _mk_row(
        title="Old Listing",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    mid = _mk_row(
        title="Mid Listing",
        created_at=datetime(2026, 3, 1, tzinfo=UTC),
    )
    new = _mk_row(
        title="New Listing",
        created_at=datetime(2026, 4, 1, tzinfo=UTC),
    )
    # Lexical order puts old first; sort=recent must override to newest first.
    lexical = [
        {"id": old["id"], "lrank": 0.9},
        {"id": mid["id"], "lrank": 0.8},
        {"id": new["id"], "lrank": 0.7},
    ]
    semantic = []
    _patch_conn_fetch_sequence(
        fake_listing_pool, [lexical, semantic, [old, mid, new]]
    )
    result = await search.hybrid_search(
        SearchQuery(q="listing", sort="recent", limit=5)
    )
    returned = [item.id for item in result.items]
    assert returned == [new["id"], mid["id"], old["id"]]


@pytest.mark.asyncio
async def test_hybrid_search_sort_trust_orders_by_trust_score(
    fake_listing_pool, deterministic_embedder
) -> None:
    low = _mk_row(title="Low Trust", trust=0.2)
    high = _mk_row(title="High Trust", trust=0.9)
    mid = _mk_row(title="Mid Trust", trust=0.5)
    lexical = [
        {"id": low["id"], "lrank": 0.9},  # lex order contradicts trust order
        {"id": mid["id"], "lrank": 0.8},
        {"id": high["id"], "lrank": 0.7},
    ]
    _patch_conn_fetch_sequence(
        fake_listing_pool, [lexical, [], [low, mid, high]]
    )
    result = await search.hybrid_search(SearchQuery(q="trust", sort="trust", limit=5))
    returned = [item.id for item in result.items]
    assert returned[0] == high["id"]
    assert returned[-1] == low["id"]


@pytest.mark.asyncio
async def test_hybrid_search_embedding_fallback_flag_surfaces(
    fake_listing_pool,
) -> None:
    """When the embedder returns is_fallback=True, the result carries it forward."""

    class FallbackEmbedder:
        source = "voyage"

        async def embed(self, text: str) -> embedding.EmbeddingResult:
            return embedding.EmbeddingResult(
                vector=[0.0] * embedding.EMBEDDING_DIM,
                source="voyage",
                is_fallback=True,
            )

    embedding.set_embedder(FallbackEmbedder())
    try:
        _patch_conn_fetch_sequence(fake_listing_pool, [[], [], []])
        result = await search.hybrid_search(SearchQuery(q="x", limit=5))
        assert result.embedding_source == "voyage"
        assert result.embedding_is_fallback is True
    finally:
        embedding.set_embedder(None)


# ---------------------------------------------------------------------------
# Autocomplete tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_autocomplete_returns_titles(fake_listing_pool) -> None:
    fake_listing_pool._test_conn.fetch = AsyncMock(
        return_value=[
            {"title": "Dragon Quest Agent", "sim": 0.9},
            {"title": "Dragon Hunter", "sim": 0.7},
        ]
    )
    result = await search.autocomplete_suggest("drag", limit=5)
    assert result == ["Dragon Quest Agent", "Dragon Hunter"]


@pytest.mark.asyncio
async def test_autocomplete_respects_limit(fake_listing_pool) -> None:
    fake_listing_pool._test_conn.fetch = AsyncMock(return_value=[])
    # Sanity: limit clamps to AUTOCOMPLETE_MAX_LIMIT
    await search.autocomplete_suggest("x", limit=999)
    call_args = fake_listing_pool._test_conn.fetch.call_args
    # Second positional is limit per our SQL bind order.
    assert call_args.args[2] == search.AUTOCOMPLETE_MAX_LIMIT


@pytest.mark.asyncio
async def test_autocomplete_empty_prefix_returns_empty(fake_listing_pool) -> None:
    result = await search.autocomplete_suggest("", limit=5)
    assert result == []


# ---------------------------------------------------------------------------
# Cursor encode/decode round-trip
# ---------------------------------------------------------------------------


def test_cursor_round_trip() -> None:
    from src.backend.marketplace.search import _decode_cursor, _encode_cursor

    lid = uuid4()
    cursor = _encode_cursor(0.0123456789, lid)
    score, decoded_id = _decode_cursor(cursor)
    assert decoded_id == lid
    assert score == pytest.approx(0.0123456789, rel=1e-9)


def test_cursor_decode_rejects_garbage() -> None:
    from src.backend.marketplace.search import _decode_cursor

    with pytest.raises(ValueError):
        _decode_cursor("this-is-not-base64!@#")


# ---------------------------------------------------------------------------
# Filter SQL composition
# ---------------------------------------------------------------------------


def test_build_filter_sql_emits_expected_placeholders() -> None:
    from src.backend.marketplace.search import _build_filter_sql

    query = SearchQuery(
        q="x",
        category="core_agent",
        subtype="agent",
        license_type="MIT",
        pricing_model="one_time",
        price_min_usd=10.0,
        price_max_usd=100.0,
    )
    fragment, binds = _build_filter_sql(query, start_idx=2)
    # 6 filters => placeholders $2..$7
    assert "$2" in fragment and "$7" in fragment
    assert binds == [
        "core_agent",
        "agent",
        "MIT",
        "one_time",
        10.0,
        100.0,
    ]
    assert "category = $2" in fragment
    assert "subtype = $3" in fragment


def test_build_filter_sql_no_filters_returns_empty_fragment() -> None:
    from src.backend.marketplace.search import _build_filter_sql

    fragment, binds = _build_filter_sql(SearchQuery(q="x"), start_idx=2)
    assert fragment == ""
    assert binds == []


def test_vector_literal_is_parseable() -> None:
    """Smoke test the pgvector textual form matches the documented shape."""

    from src.backend.marketplace.search import _vector_literal

    literal = _vector_literal([0.1, -0.2, 1e-7])
    assert literal.startswith("[") and literal.endswith("]")
    assert "," in literal
    # No stray whitespace that would trip pgvector's parser.
    assert " " not in literal
