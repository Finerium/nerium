# Marketplace Search

**Contract Version:** 0.1.0
**Owner Agent(s):** Hyperion (search authority, FTS + pgvector hybrid, RRF merge, Voyage embeddings)
**Consumer Agent(s):** Phanes (indexer upstream on listing publish/update), Iapetus (search filters feed purchase flow), Khronos (MCP `search_marketplace` tool dispatches here), Astraea (trust score boost consumer), Crius (vendor adapter for embedding API fallback), Frontend Marketplace UI, Selene (OTel span per query), Nemea-RV-v2 (search E2E regression)
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the Marketplace hybrid search surface: Postgres full-text search (tsvector + GIN + pg_trgm) combined with pgvector cosine similarity on Voyage embeddings via Reciprocal Rank Fusion (RRF, k=60). Supports bilingual Indonesian + English query tokenization via `'simple'` config, category + subtype + license + pricing_model + price filters, trust-score boost sort, faceted counts, autocomplete suggestion.

Embedding model primary: Voyage `voyage-3.5` (1024-dim, Anthropic-affiliated). Fallback: OpenAI `text-embedding-3-small` (1536-dim) via Crius vendor adapter. No Algolia, no Typesense, no Meilisearch, no Elasticsearch (per M1 C.18 zero-infra principle locked).

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 5 marketplace pain)
- `CLAUDE.md` (root)
- `docs/phase_np/RV_NP_RESEARCH.md` (Section C.18 hybrid search)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.5 Hyperion)
- `docs/contracts/marketplace_listing.contract.md` (source of truth catalog)
- `docs/contracts/postgres_multi_tenant.contract.md` (RLS awareness)
- `docs/contracts/vendor_adapter.contract.md` (embedding API fallback chain)
- `docs/contracts/trust_score.contract.md` (boost signal)

## 3. Schema Definition

### 3.1 Indexes on `marketplace_listing`

Assumes `marketplace_listing` table per `marketplace_listing.contract.md` Section 3.

```sql
-- Full-text search column (generated)
ALTER TABLE marketplace_listing ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(short_description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(capability_tags, ' '), '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(long_description, '')), 'D')
  ) STORED;

CREATE INDEX idx_listing_search_tsv ON marketplace_listing USING GIN (search_tsv);

-- Trigram index for fuzzy match
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_listing_title_trgm ON marketplace_listing USING GIN (title gin_trgm_ops);
CREATE INDEX idx_listing_slug_trgm ON marketplace_listing USING GIN (slug gin_trgm_ops);

-- Vector index
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE marketplace_listing ADD COLUMN embedding vector(1024);
CREATE INDEX idx_listing_embedding ON marketplace_listing USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Filter indexes
CREATE INDEX idx_listing_category ON marketplace_listing(category, subtype);
CREATE INDEX idx_listing_license ON marketplace_listing(license);
CREATE INDEX idx_listing_pricing_model ON marketplace_listing(pricing_model);
CREATE INDEX idx_listing_trust ON marketplace_listing(trust_score DESC) WHERE visibility = 'public';
CREATE INDEX idx_listing_created ON marketplace_listing(created_at DESC) WHERE visibility = 'public';
```

`'simple'` config (not `'english'`) preserves Indonesian tokens without stemming. Trade-off: no English plural collapsing; hybrid relies on semantic vector for that.

### 3.2 RRF merge parameters

```
k = 60                                                   # RRF constant
weight_lexical = 0.5
weight_semantic = 0.5
weight_trust = 0.2                                       # boost, additive after RRF normalize
new_agent_boost_factor = 0.1                             # for first-7-day agents
```

### 3.3 Request + response models

```python
class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=200)
    category: list[str] | None = None                    # subset of category enum
    subtype: list[str] | None = None
    license: list[str] | None = None
    pricing_model: list[str] | None = None
    price_min_usd: float | None = None
    price_max_usd: float | None = None
    creator_handle: str | None = None
    sort: Literal["relevance", "trust", "newest", "price_asc", "price_desc"] = "relevance"
    limit: int = Field(default=20, ge=1, le=100)
    cursor: str | None = None
    include_facets: bool = False

class SearchHit(BaseModel):
    listing_id: str
    slug: str
    title: str
    short_description: str
    category: str
    subtype: str
    license: str
    pricing_model: str
    price_hint: dict | None
    trust_score: float
    rrf_score: float
    lexical_rank: int | None
    semantic_rank: int | None
    creator_handle: str
    thumbnail_url: str | None
    created_at: str

class SearchFacets(BaseModel):
    category: dict[str, int]                             # {"core_agent": 12, "content": 34, ...}
    subtype: dict[str, int]
    license: dict[str, int]
    pricing_model: dict[str, int]

class SearchResponse(BaseModel):
    items: list[SearchHit]
    total_hits: int
    query_echo: str
    facets: SearchFacets | None = None
    next_cursor: str | None = None
    has_more: bool
    debug: dict | None = None                            # only when ?debug=1 + admin scope
```

### 3.4 Autocomplete

```python
class AutocompleteRequest(BaseModel):
    prefix: str = Field(..., min_length=1, max_length=50)
    limit: int = Field(default=10, ge=1, le=20)

class AutocompleteSuggestion(BaseModel):
    text: str
    kind: Literal["title", "tag", "creator_handle", "category"]
    listing_id: str | None = None                        # if kind == "title"
    score: float                                         # trgm similarity
```

## 4. Interface / API Contract

### 4.1 GET `/v1/marketplace/search`

Query params mirror `SearchRequest`. Supports repeated params for array fields (`?category=core_agent&category=content`).

Response `SearchResponse`. Default `include_facets: false` to minimize latency; set `true` when rendering filter sidebar.

Pagination: cursor per `rest_api_base.contract.md` Section 3.3. Cursor encodes last RRF score + listing_id.

### 4.2 GET `/v1/marketplace/autocomplete`

Trigram-based prefix suggestion. Returns union of title + tag + creator_handle prefix matches ranked by `similarity()`.

### 4.3 POST `/v1/marketplace/search/reindex`

Admin-only (per `rest_api_base.contract.md` admin pattern). Triggers full re-embedding of all public listings. Accepts `?tenant_id=<id>` for scoped reindex. Enqueues Arq job `reindex_tenant`.

### 4.4 RRF computation

```python
# src/backend/search/hybrid_rrf.py

async def hybrid_search(req: SearchRequest, tenant_id: UUID | None) -> SearchResponse:
    filters_sql = build_filters(req)

    # Lexical: ts_rank_cd over plainto_tsquery, top 100
    lexical_hits = await conn.fetch(f"""
        SELECT id, ts_rank_cd(search_tsv, plainto_tsquery('simple', $1)) AS lrank
        FROM marketplace_listing
        WHERE visibility = 'public' AND search_tsv @@ plainto_tsquery('simple', $1)
          {filters_sql}
        ORDER BY lrank DESC
        LIMIT 100
    """, req.query)

    # Semantic: embed query, cosine against listing.embedding, top 100
    query_emb = await embedding_client.embed(req.query)    # Crius vendor adapter
    semantic_hits = await conn.fetch(f"""
        SELECT id, 1 - (embedding <=> $1) AS score
        FROM marketplace_listing
        WHERE visibility = 'public' AND embedding IS NOT NULL
          {filters_sql}
        ORDER BY embedding <=> $1
        LIMIT 100
    """, query_emb)

    # RRF merge: score = sum(weight / (k + rank_in_list))
    rrf_map = {}
    for rank, row in enumerate(lexical_hits, start=1):
        rrf_map[row['id']] = rrf_map.get(row['id'], 0) + 0.5 / (60 + rank)
    for rank, row in enumerate(semantic_hits, start=1):
        rrf_map[row['id']] = rrf_map.get(row['id'], 0) + 0.5 / (60 + rank)

    # Boost by trust score
    for lid in list(rrf_map.keys()):
        trust = await astraea.get_trust_score(lid)
        rrf_map[lid] += 0.2 * trust
        if astraea.is_new_agent(lid, days=7):
            rrf_map[lid] += 0.1

    # Sort, paginate, hydrate
    ranked = sorted(rrf_map.items(), key=lambda kv: kv[1], reverse=True)
    page = paginate(ranked, req.cursor, req.limit)
    hits = await hydrate_listings([lid for lid, _ in page])

    return SearchResponse(items=hits, total_hits=len(ranked), ...)
```

### 4.5 Indexer

Phanes calls Hyperion `enqueue_index(listing_id)` on publish/update. Hyperion:

1. Loads listing.
2. Concatenates title + short_description + capability_tags + long_description.
3. Calls embedding client (Voyage primary, Crius fallback to OpenAI).
4. Writes `embedding` column.
5. On license change: re-index not strictly needed (license is a filter, not content); emits cache invalidation event.

Batch re-embedding via Arq cron nightly (optional): `reindex_all_daily` re-embeds listings modified in last 7 days to catch prompt-tuning drift.

### 4.6 Query caching

Results cached in Redis for 60 s keyed by normalized request hash `cache:search:<sha256(canonical_json(req))>`. Cache bust on any listing publish/update via Redis pub/sub `flag:invalidate` channel (reused from Hemera pattern).

## 5. Event Signatures

Structured log:

| Event | Fields |
|---|---|
| `search.query.executed` | `query_hash`, `user_id`, `duration_ms`, `total_hits`, `cache_hit`, `embedding_duration_ms` |
| `search.index.updated` | `listing_id`, `source` (`publish`, `update`, `reindex_cron`), `embedding_duration_ms` |
| `search.index.failed` | `listing_id`, `error_kind` (`embedding_api_error`, `db_error`) |
| `search.cache.invalidated` | `reason`, `affected_count_estimate` |

OTel spans: `search.hybrid` root → `search.lexical` + `search.semantic` + `search.embedding` child spans.

## 6. File Path Convention

- Search router: `src/backend/routers/v1/marketplace/search.py`
- Autocomplete router: `src/backend/routers/v1/marketplace/autocomplete.py`
- Hybrid RRF: `src/backend/search/hybrid_rrf.py`
- Indexer: `src/backend/search/indexer.py`
- Embedding client wrapper: `src/backend/search/embedding.py` (delegates to `vendor_adapter.contract.md`)
- FTS helpers: `src/backend/search/fts.py`
- Cache: `src/backend/search/cache.py`
- Migration: `src/backend/db/migrations/XXX_search_indexes.py`
- Tests: `tests/search/test_rrf_merge.py`, `test_bilingual_tokenization.py`, `test_autocomplete.py`, `test_filter_composition.py`, `test_embedding_fallback.py`, `test_trust_boost.py`

## 7. Naming Convention

- Endpoint paths: `/v1/marketplace/search`, `/v1/marketplace/autocomplete`, `/v1/marketplace/search/reindex`.
- Query param names: `snake_case`.
- Index names: `idx_listing_<column>[_<modifier>]`.
- Cache key: `cache:search:<sha256>`.
- Sort enum values: `relevance`, `trust`, `newest`, `price_asc`, `price_desc`.
- Event names: `search.<subject>.<action>`.

## 8. Error Handling

- Empty query string: HTTP 422 `unprocessable_entity`.
- Query > 200 chars: HTTP 422.
- pgvector extension missing at query time: HTTP 503 `service_unavailable` with problem+json `search_degraded`. Degraded mode returns FTS-only results with `debug.semantic_disabled: true`.
- Voyage API rate limit: Crius adapter falls back to OpenAI; if both fail, FTS-only degraded.
- Embedding dimension mismatch (pgvector column 1024 vs OpenAI 1536): reject fallback, emit ERROR log; pre-check at Crius vendor config.
- Unknown sort field: HTTP 400 `invalid_sort`.
- Unknown filter value (e.g., `category=nonexistent`): ignore silently, log WARN (do not 400; forward-compat).
- Invalid cursor (base64 decode fail): HTTP 400 `invalid_cursor`.
- Reindex request for nonexistent listing: HTTP 404 ignored, job completes no-op.

## 9. Testing Surface

- Bilingual query: `query="agen data"` (Indonesian) + `query="data agent"` (English) return overlapping results for same concept.
- RRF merge determinism: fixed 10 lexical + 10 semantic hits produce same merged order on repeat.
- Trust boost: listing with trust 0.9 outranks listing with trust 0.5 given equal RRF.
- New-agent boost: 3-day-old listing gets +0.1; 8-day-old does not.
- Filter composition AND: `?category=core_agent&license=MIT` returns listings matching both.
- Filter repeated param OR: `?license=MIT&license=APACHE_2` returns union.
- Price range filter: `?pricing_model=one_time&price_min_usd=10&price_max_usd=100` returns in-range.
- Autocomplete: `prefix=voi` returns `voice_profile` tag + any titles starting with "Voi...".
- Cache hit: second identical request within 60 s returns cached result (verify `debug.cache_hit: true`).
- Cache bust: listing publish emits `flag:invalidate`, next search re-executes (verify cache miss).
- Embedding fallback: mock Voyage 500, search succeeds via OpenAI fallback.
- pgvector missing: disable extension in test, search returns FTS-only with `search_degraded` header.
- Public-only visibility: draft + archived listings never returned.
- Reindex: admin POST reindex, Arq job processes listings, `search.index.updated` events emitted.

## 10. Open Questions

- Embedding dimension 1024 (Voyage) vs 1536 (OpenAI fallback): downgrade path. Store both columns `embedding_1024` + `embedding_1536` with NOT NULL on at least one? Recommend single `embedding` column matched to Voyage; fallback only pads/truncates on mismatch with clear logging.
- Autocomplete personalization: weight by user's past click behavior? Defer post-hackathon.
- Per-tenant search: is search global across all public listings, or scoped? Global public listings. Tenant-private listings searchable only within tenant (future).

## 11. Post-Hackathon Refactor Notes

- Migrate to pgvector `hnsw` index (faster query, higher recall) when Postgres 16 extensions update.
- Add learned-to-rank layer: collect click-through data, fine-tune weights.
- Multi-vector embeddings (ColBERT-style) for late interaction at query time.
- Query rewriter (spell correction + synonym expansion) before FTS step.
- Result diversification via MMR (Maximal Marginal Relevance) to avoid near-duplicate listings dominating top.
- Semantic categories auto-classification: cluster embeddings, propose new categories.
- Saved searches + alerts (user subscribes to query, gets notified on new hits).
- Search analytics dashboard in Eunomia (top queries, zero-result queries, CTR per result slot).
