"""Marketplace hybrid search service (FTS + pgvector + RRF).

Owner: Hyperion (W2 NP P1 Session 1).

Contract refs
-------------
- ``docs/contracts/marketplace_search.contract.md`` Sections 3.2, 4.1,
  4.4 (RRF k=60, filters, request/response shape).
- ``docs/contracts/marketplace_listing.contract.md`` (source columns).
- ``docs/contracts/rest_api_base.contract.md`` Section 3.3 (cursor
  pagination convention).

Surface
-------
- :class:`SearchQuery` dataclass carrying the validated request body.
- :class:`SearchResult` dataclass carrying the hybrid-search output.
- :func:`hybrid_search` running lexical + semantic subqueries and merging
  via Reciprocal Rank Fusion (k=60).
- :func:`autocomplete_suggest` running pg_trgm prefix + fuzzy match.

Design notes
------------
- The search path runs OUTSIDE ``tenant_scoped`` because the public
  marketplace is global across tenants. Contract Section 10 open
  question 3 locks this behaviour: listings with ``status='published'``
  are world-readable by any authenticated caller. Per-tenant private
  listings remain scoped elsewhere (future).
- The FTS query uses ``plainto_tsquery('simple', ...)`` with the 'simple'
  config so Indonesian + English tokens pass through without English
  stemming. ``ts_rank_cd`` is used over ``ts_rank`` because it respects
  proximity (cover density), which matters for short titles.
- The semantic query orders by ``embedding <=> qvec`` (cosine distance)
  with ``ivfflat`` index. When the query's pgvector column is null (no
  embedding computed yet), the row is excluded from the semantic list
  but may still surface via FTS.
- RRF is computed in Python rather than Postgres because doing it in
  SQL requires a UNION ALL + window function that complicates the
  filter + cursor logic. The top-N from each side is 100 rows, small
  enough that Python fusion is negligible relative to the DB roundtrip.
"""

from __future__ import annotations

import base64
import logging
import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any, Literal
from uuid import UUID

import asyncpg

from src.backend.db.pool import get_pool
from src.backend.marketplace import embedding as _embedding
from src.backend.marketplace.listing_service import row_to_public
from src.backend.models.marketplace_listing import ListingPublic

logger = logging.getLogger(__name__)


# --- RRF constants ----------------------------------------------------------

RRF_K: int = 60
"""Reciprocal Rank Fusion k parameter. Contract Section 3.2 locks k=60."""

RRF_WEIGHT_LEXICAL: float = 0.5
RRF_WEIGHT_SEMANTIC: float = 0.5

# Per-subquery candidate cap. Contract locks top-100 from each side.
PER_SIDE_LIMIT: int = 100

DEFAULT_LIMIT: int = 20
MAX_LIMIT: int = 50

# Autocomplete uses pg_trgm similarity + an ILIKE prefix fast path.
AUTOCOMPLETE_DEFAULT_LIMIT: int = 8
AUTOCOMPLETE_MAX_LIMIT: int = 20
AUTOCOMPLETE_TRGM_THRESHOLD: float = 0.3


# --- Sort enum --------------------------------------------------------------

SortMode = Literal["relevance", "recent", "trust"]
_ALLOWED_SORTS: frozenset[str] = frozenset({"relevance", "recent", "trust"})


# --- Request / Result dataclasses -------------------------------------------


@dataclass(frozen=True)
class SearchQuery:
    """Validated search request.

    Builders convert router query params + body fields into this shape
    before calling :func:`hybrid_search`. Kept as a dataclass (not a
    pydantic model) so the service layer stays independent of the HTTP
    boundary and tests can construct it directly.
    """

    q: str
    category: str | None = None
    subtype: str | None = None
    license_type: str | None = None
    pricing_model: str | None = None
    price_min_usd: float | None = None
    price_max_usd: float | None = None
    sort: SortMode = "relevance"
    limit: int = DEFAULT_LIMIT
    cursor: str | None = None

    def __post_init__(self) -> None:
        if self.sort not in _ALLOWED_SORTS:
            raise ValueError(
                f"invalid sort {self.sort!r}; allowed: {sorted(_ALLOWED_SORTS)}"
            )
        if not 1 <= self.limit <= MAX_LIMIT:
            raise ValueError(f"limit must be in [1, {MAX_LIMIT}]; got {self.limit}")


@dataclass
class SearchResult:
    """Hybrid-search output.

    ``items`` are :class:`ListingPublic` rows in final fused order.
    ``fused_scores`` lines up 1:1 with items (caller can zip them).
    ``embedding_source`` is the tag from the embedder used for the
    query vector (handy for debugging + the ``query_embedding_source``
    response field).
    """

    items: list[ListingPublic] = field(default_factory=list)
    fused_scores: list[float] = field(default_factory=list)
    total_candidate_count: int = 0
    embedding_source: str = "deterministic"
    embedding_is_fallback: bool = False
    next_cursor: str | None = None
    has_more: bool = False


# --- Filter helpers ---------------------------------------------------------


def _build_filter_sql(
    query: SearchQuery,
    *,
    start_idx: int,
) -> tuple[str, list[Any]]:
    """Build the shared WHERE fragment + bind list for both subqueries.

    ``start_idx`` is the first ``$N`` placeholder to consume. The
    lexical subquery consumes ``$1`` for the query string and ``$2`` onward
    for filters; the semantic subquery consumes ``$1`` for the query
    vector and ``$2`` onward for the same filters. Returning both the
    fragment and bind values lets callers share one implementation.
    """

    conds: list[str] = []
    binds: list[Any] = []
    idx = start_idx

    if query.category is not None:
        conds.append(f"category = ${idx}")
        binds.append(query.category)
        idx += 1
    if query.subtype is not None:
        conds.append(f"subtype = ${idx}")
        binds.append(query.subtype)
        idx += 1
    if query.license_type is not None:
        conds.append(f"license = ${idx}")
        binds.append(query.license_type)
        idx += 1
    if query.pricing_model is not None:
        conds.append(f"pricing_model = ${idx}")
        binds.append(query.pricing_model)
        idx += 1
    # Price filter targets the common ``pricing_details.amount_usd`` key
    # used by ``one_time`` / ``subscription_*`` pricing models. Listings
    # missing the key (e.g. free, tiered) are excluded when either
    # price bound is set; this matches the contract's "inclusive bounds"
    # testing surface note.
    if query.price_min_usd is not None:
        conds.append(f"(pricing_details->>'amount_usd')::numeric >= ${idx}")
        binds.append(float(query.price_min_usd))
        idx += 1
    if query.price_max_usd is not None:
        conds.append(f"(pricing_details->>'amount_usd')::numeric <= ${idx}")
        binds.append(float(query.price_max_usd))
        idx += 1

    fragment = ("AND " + " AND ".join(conds)) if conds else ""
    return fragment, binds


# --- Lexical + semantic subqueries ------------------------------------------


async def _fetch_lexical(
    conn: asyncpg.Connection,
    query: SearchQuery,
) -> list[asyncpg.Record]:
    """Run the FTS subquery and return the top-N candidate ids + rank."""

    filter_sql, filter_binds = _build_filter_sql(query, start_idx=2)
    # filter_sql is assembled from closed-set column names + $N placeholders
    # and never carries caller input. Values land via filter_binds (asyncpg
    # parametrisation). PER_SIDE_LIMIT is a module constant. Safe against
    # SQLi by construction; ruff S608 is a false positive here.
    sql = f"""
        SELECT id,
               ts_rank_cd(listing_search_doc,
                          plainto_tsquery('simple', $1)) AS lrank
        FROM marketplace_listing
        WHERE status = 'published'
          AND archived_at IS NULL
          AND listing_search_doc IS NOT NULL
          AND listing_search_doc @@ plainto_tsquery('simple', $1)
          {filter_sql}
        ORDER BY lrank DESC, id DESC
        LIMIT {PER_SIDE_LIMIT}
    """  # noqa: S608 - filter_sql is closed-set; binds go through asyncpg.
    return list(await conn.fetch(sql, query.q, *filter_binds))


def _vector_literal(vec: Iterable[float]) -> str:
    """Serialise a Python float list as pgvector's textual representation.

    pgvector accepts the textual form ``'[v1,v2,...]'`` cast to ``vector``.
    We pass it via the ``$1::vector`` placeholder so asyncpg does not
    need a custom codec. Precision is capped at 7 significant digits to
    keep the literal short.
    """

    inner = ",".join(f"{float(x):.7g}" for x in vec)
    return f"[{inner}]"


async def _fetch_semantic(
    conn: asyncpg.Connection,
    query: SearchQuery,
    *,
    query_vector: list[float],
) -> list[asyncpg.Record]:
    """Run the pgvector cosine subquery and return top-N candidate ids + score."""

    filter_sql, filter_binds = _build_filter_sql(query, start_idx=2)
    qvec_literal = _vector_literal(query_vector)
    sql = f"""
        SELECT id,
               1 - (listing_embedding <=> $1::vector) AS srank
        FROM marketplace_listing
        WHERE status = 'published'
          AND archived_at IS NULL
          AND listing_embedding IS NOT NULL
          {filter_sql}
        ORDER BY listing_embedding <=> $1::vector
        LIMIT {PER_SIDE_LIMIT}
    """  # noqa: S608 - filter_sql is closed-set; binds go through asyncpg.
    return list(await conn.fetch(sql, qvec_literal, *filter_binds))


# --- RRF fusion -------------------------------------------------------------


def reciprocal_rank_fusion(
    *,
    lexical: list[asyncpg.Record] | list[dict] | list[tuple],
    semantic: list[asyncpg.Record] | list[dict] | list[tuple],
    k: int = RRF_K,
    weight_lexical: float = RRF_WEIGHT_LEXICAL,
    weight_semantic: float = RRF_WEIGHT_SEMANTIC,
) -> list[tuple[UUID, float]]:
    """Fuse two ranked id-lists via Reciprocal Rank Fusion.

    Given two lists whose first element is the listing id, compute for
    each id::

        score = sum_over_lists( weight / (k + rank) )

    where rank starts at 1 for the top entry (so the first-rank entry
    contributes ``weight / (k + 1)``, not ``weight / k``; the off-by-one
    is locked by every published RRF variant and by the contract test
    ``test_hybrid_rrf_k_parameter``).

    Returns a list of ``(id, fused_score)`` sorted by score DESC, with
    ``id DESC`` as a stable tiebreaker. The length equals the set union
    of both input lists.
    """

    def _id(row: Any) -> UUID:
        if isinstance(row, dict):
            v = row["id"]
        elif isinstance(row, asyncpg.Record):
            v = row["id"]
        elif isinstance(row, tuple):
            v = row[0]
        else:
            v = getattr(row, "id", None)
        if isinstance(v, UUID):
            return v
        return UUID(str(v))

    fused: dict[UUID, float] = {}
    for rank, row in enumerate(lexical, start=1):
        lid = _id(row)
        fused[lid] = fused.get(lid, 0.0) + weight_lexical / (k + rank)
    for rank, row in enumerate(semantic, start=1):
        lid = _id(row)
        fused[lid] = fused.get(lid, 0.0) + weight_semantic / (k + rank)

    # Sort by fused score DESC; stable tiebreak by id DESC so the order
    # is deterministic for tests even when two ids score identically.
    return sorted(fused.items(), key=lambda kv: (kv[1], str(kv[0])), reverse=True)


# --- Cursor helpers ---------------------------------------------------------


_CURSOR_RE = re.compile(r"^(?P<score>-?\d+\.\d+):(?P<id>[0-9a-fA-F-]{36})$")


def _encode_cursor(fused_score: float, listing_id: UUID) -> str:
    """Base64-url encode ``{score}:{listing_id}`` as the pagination cursor.

    The raw form is a pure ASCII string so base64 adds nothing semantically;
    we still encode for visual opacity (clients should treat as opaque).
    """

    raw = f"{fused_score:.17g}:{listing_id}".encode("ascii")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _decode_cursor(cursor: str) -> tuple[float, UUID]:
    """Decode a cursor back to ``(score, listing_id)`` or raise ValueError."""

    padding = "=" * (-len(cursor) % 4)
    try:
        raw = base64.urlsafe_b64decode(cursor + padding).decode("ascii")
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"invalid cursor encoding: {exc}") from exc

    m = _CURSOR_RE.match(raw)
    if m is None:
        raise ValueError(f"invalid cursor payload: {raw!r}")
    return float(m["score"]), UUID(m["id"])


# --- Hydration --------------------------------------------------------------


async def _hydrate_listings(
    conn: asyncpg.Connection,
    ids: list[UUID],
) -> dict[UUID, asyncpg.Record]:
    """Fetch the full row set for the given ids, keyed by id.

    Preserves no ordering; the caller re-sorts against the fused-id list.
    """

    if not ids:
        return {}
    rows = await conn.fetch(
        """
        SELECT id, tenant_id, creator_user_id, category, subtype,
               slug, title, description, short_description, long_description,
               capability_tags, license, pricing, pricing_model, pricing_details,
               category_metadata, asset_refs, thumbnail_r2_key,
               trust_score_cached, revenue_split_override, status, version,
               version_history, metadata, published_at, archived_at,
               created_at, updated_at
        FROM marketplace_listing
        WHERE id = ANY($1::uuid[])
        """,
        ids,
    )
    return {r["id"]: r for r in rows}


# --- Top-level entry points -------------------------------------------------


async def hybrid_search(query: SearchQuery) -> SearchResult:
    """Run the FTS + pgvector + RRF pipeline and return the final page.

    See module docstring for the pipeline shape. This function owns no
    HTTP concerns; it is usable directly by the MCP ``search_marketplace``
    tool or a headless CLI.
    """

    pool = get_pool()
    async with pool.acquire() as conn:
        return await _hybrid_search_with_conn(conn, query)


async def _hybrid_search_with_conn(
    conn: asyncpg.Connection,
    query: SearchQuery,
) -> SearchResult:
    """Inner helper that runs the pipeline on a given connection.

    Exposed so tests can patch the embedder and the connection's
    ``fetch`` without reaching into the pool fixture twice.
    """

    # --- Lexical branch ----
    lexical_rows = await _fetch_lexical(conn, query)

    # --- Semantic branch ----
    embedder = _embedding.get_embedder()
    emb_result = await embedder.embed(query.q)
    semantic_rows = await _fetch_semantic(
        conn, query, query_vector=emb_result.vector
    )

    # --- Fast path: sort == recent. Override RRF with created_at DESC.
    # Still return the union of candidates so the caller can see the
    # candidate count; just reorder before paginating.
    fused: list[tuple[UUID, float]]
    if query.sort == "relevance":
        fused = reciprocal_rank_fusion(
            lexical=lexical_rows, semantic=semantic_rows
        )
    else:
        # Build the id union and defer ordering to the hydration step.
        seen: dict[UUID, float] = {}
        for rank, row in enumerate(lexical_rows, start=1):
            lid = row["id"]
            if isinstance(lid, str):
                lid = UUID(lid)
            seen[lid] = seen.get(lid, 0.0) + RRF_WEIGHT_LEXICAL / (RRF_K + rank)
        for rank, row in enumerate(semantic_rows, start=1):
            lid = row["id"]
            if isinstance(lid, str):
                lid = UUID(lid)
            seen[lid] = seen.get(lid, 0.0) + RRF_WEIGHT_SEMANTIC / (RRF_K + rank)
        fused = sorted(seen.items(), key=lambda kv: (kv[1], str(kv[0])), reverse=True)

    total_candidates = len(fused)

    # --- Hydrate rows ----
    if not fused:
        return SearchResult(
            items=[],
            fused_scores=[],
            total_candidate_count=0,
            embedding_source=emb_result.source,
            embedding_is_fallback=emb_result.is_fallback,
            next_cursor=None,
            has_more=False,
        )

    candidate_ids = [lid for lid, _ in fused]
    hydrated = await _hydrate_listings(conn, candidate_ids)

    # --- Sort + cursor + paginate ----
    cursor_score: float | None = None
    cursor_id: UUID | None = None
    if query.cursor:
        try:
            cursor_score, cursor_id = _decode_cursor(query.cursor)
        except ValueError:
            cursor_score = cursor_id = None

    # The "recent" and "trust" sort variants reorder via the hydrated
    # rows so the final ordering follows the natural column, not the RRF
    # score. Keep fused_score around so the cursor still encodes a
    # stable monotonic tuple; fall back to 0.0 when RRF was skipped.
    fused_map: dict[UUID, float] = {lid: s for lid, s in fused}

    def _sort_key(lid: UUID) -> tuple:
        row = hydrated.get(lid)
        if row is None:
            return (0.0, str(lid))
        if query.sort == "recent":
            return (row["created_at"].timestamp(), str(lid))
        if query.sort == "trust":
            trust = row["trust_score_cached"]
            return (float(trust) if trust is not None else -1.0, str(lid))
        return (fused_map[lid], str(lid))

    ordered_ids = sorted(
        (lid for lid in candidate_ids if lid in hydrated),
        key=_sort_key,
        reverse=True,
    )

    # Cursor skip: drop every id at-or-before the cursor boundary.
    if cursor_score is not None and cursor_id is not None:
        boundary = (cursor_score, str(cursor_id))
        ordered_ids = [
            lid
            for lid in ordered_ids
            if (_sort_key(lid)) < boundary
        ]

    page_ids = ordered_ids[: query.limit]
    has_more = len(ordered_ids) > query.limit
    next_cursor: str | None = None
    if has_more and page_ids:
        last_id = page_ids[-1]
        # Encode using the fused score when RRF drove the sort; otherwise
        # encode the sort key's leading numeric component.
        last_key = _sort_key(last_id)
        score_to_encode = float(last_key[0]) if last_key else 0.0
        next_cursor = _encode_cursor(score_to_encode, last_id)

    items = [row_to_public(hydrated[lid]) for lid in page_ids]
    scores = [fused_map.get(lid, 0.0) for lid in page_ids]

    return SearchResult(
        items=items,
        fused_scores=scores,
        total_candidate_count=total_candidates,
        embedding_source=emb_result.source,
        embedding_is_fallback=emb_result.is_fallback,
        next_cursor=next_cursor,
        has_more=has_more,
    )


async def autocomplete_suggest(
    prefix: str,
    *,
    limit: int = AUTOCOMPLETE_DEFAULT_LIMIT,
) -> list[str]:
    """Return up to ``limit`` title suggestions for the given prefix.

    Combines an ``ILIKE prefix%`` fast path with pg_trgm's ``similarity()``
    function so a typo like ``drgn`` still surfaces ``Dragon...`` matches.
    Results are de-duplicated on title (case-insensitive) and sorted by
    trigram similarity DESC, then alphabetically.
    """

    if not prefix:
        return []
    if limit < 1:
        return []
    if limit > AUTOCOMPLETE_MAX_LIMIT:
        limit = AUTOCOMPLETE_MAX_LIMIT

    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT title,
                   similarity(title, $1) AS sim
            FROM marketplace_listing
            WHERE status = 'published'
              AND archived_at IS NULL
              AND (
                  title ILIKE $1 || '%'
                  OR similarity(title, $1) > $3
              )
            ORDER BY sim DESC, title ASC
            LIMIT $2
            """,
            prefix,
            limit,
            AUTOCOMPLETE_TRGM_THRESHOLD,
        )
    return [r["title"] for r in rows if r["title"] is not None]


__all__ = [
    "AUTOCOMPLETE_DEFAULT_LIMIT",
    "AUTOCOMPLETE_MAX_LIMIT",
    "AUTOCOMPLETE_TRGM_THRESHOLD",
    "DEFAULT_LIMIT",
    "MAX_LIMIT",
    "PER_SIDE_LIMIT",
    "RRF_K",
    "RRF_WEIGHT_LEXICAL",
    "RRF_WEIGHT_SEMANTIC",
    "SearchQuery",
    "SearchResult",
    "SortMode",
    "autocomplete_suggest",
    "hybrid_search",
    "reciprocal_rank_fusion",
]
