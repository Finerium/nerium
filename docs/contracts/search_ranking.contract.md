# Search Ranking

**Contract Version:** 0.1.0
**Owner Agent(s):** Demeter (ranking signal weights owner)
**Consumer Agent(s):** Coeus (executes search queries against these weights), Artemis (surfaces ranked featured agents), Ananke (analyzes ranking outcome logs)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the semantic similarity plus trust-weight plus popularity signal combination formula that ranks Marketplace listings in response to user queries, with explicit weights so the ranking behavior is auditable and tunable without code changes.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 5 Marketplace context)
- `CLAUDE.md` (root)
- `docs/contracts/marketplace_listing.contract.md` (the entity being ranked)
- `docs/contracts/trust_score.contract.md` (trust_score_pointer resolution)
- `docs/contracts/search_ui.contract.md` (UI consumer of ranked results)

## 3. Schema Definition

```typescript
// app/marketplace/search/ranking_types.ts

export interface RankingWeights {
  semantic_similarity: number;       // 0.0 to 1.0, default 0.55
  trust_score: number;               // 0.0 to 1.0, default 0.25
  popularity: number;                // 0.0 to 1.0, default 0.10
  recency: number;                   // 0.0 to 1.0, default 0.05
  pricing_tier_affinity: number;     // 0.0 to 1.0, default 0.05
  // Weights need not sum to 1.0; implementation normalizes.
}

export interface RankingSignal {
  listing_id: string;
  semantic_similarity: number;       // 0.0 to 1.0
  trust_score: number;               // 0.0 to 1.0
  popularity_normalized: number;     // 0.0 to 1.0 (view_count and invoke_count aggregate)
  recency_normalized: number;        // 0.0 to 1.0 (newer = higher)
  pricing_tier_match: number;        // 0.0 to 1.0 (1.0 if user's preferred tier matches)
}

export interface RankedResult {
  listing_id: string;
  score: number;                     // 0.0 to 1.0 after weighted combination
  per_signal: RankingSignal;
}

export interface RankingContext {
  user_query: string;
  user_preferred_tier?: 'free' | 'cheap' | 'mid' | 'premium';
  filter_capability_tag?: string;
  filter_vendor_origin?: string;
}
```

## 4. Interface / API Contract

```typescript
export interface SearchRanker {
  rank(candidates: string[], context: RankingContext, weights?: RankingWeights): Promise<RankedResult[]>;
  loadWeights(): Promise<RankingWeights>;
  saveWeights(weights: RankingWeights): Promise<void>;
}
```

- Weights load from `app/marketplace/search/ranking_weights.json` with the defaults above as the shipped Day-1 values.
- Score formula: `score = normalize(sum(weight_i * signal_i))` where `normalize` uses min-max over the candidate set so the top result is always 1.0.
- Ties break by `recency_normalized` descending, then `listing_id` lexicographic.

## 5. Event Signatures

- `marketplace.search.executed` payload: `{ query: string, result_count: number, top_listing_id: string, weights_version: string }`
- Logged by Ananke for ranking quality retrospectives.

## 6. File Path Convention

- Types: `app/marketplace/search/ranking_types.ts`
- Weights JSON: `app/marketplace/search/ranking_weights.json`
- Ranker implementation: `app/marketplace/search/Ranker.ts`
- Weight version history: `app/marketplace/search/weight_history/` (append-only)

## 7. Naming Convention

- Weight keys: `snake_case`.
- Signal field names: `snake_case` with semantic suffix `_normalized` when min-max rescaled.
- Weights JSON versioning field: `weights_version` following semver `MAJOR.MINOR.PATCH`.

## 8. Error Handling

- Missing weights file: fall back to hardcoded defaults, log warning, and persist defaults to disk on next `saveWeights`.
- Signal outside `[0, 1]`: clamp silently, log warning.
- Empty candidate set: return empty array, do not throw.
- Query longer than 500 chars: truncate to 500, log warning.

## 9. Testing Surface

- Deterministic ranking: supply fixed candidates with known signals and default weights, assert `RankedResult[]` order matches the expected ground truth array.
- Weight override: same candidates with heavily weighted `trust_score`, assert a low-similarity-high-trust listing ranks above a high-similarity-low-trust listing.
- Empty candidate set: returns empty array.
- Weight persistence round trip: save custom weights, reload via `loadWeights`, assert equality.
- Tie break: construct a tie case, assert lexicographic `listing_id` ordering.

## 10. Open Questions

- None at contract draft. Whether to call a Claude-backed embedding model for semantic similarity is a Coeus strategic_decision, not a schema concern.

## 11. Post-Hackathon Refactor Notes

- Replace linear weighted-sum with a learned ranking model trained on user click-through data.
- Introduce personalization: user's prior Builder builds inform `pricing_tier_affinity` per user.
- Add A/B testing framework: different weight versions served to different user cohorts, outcomes logged via `marketplace.search.executed` events.
- Integrate with Registry trust: trust score recency and decay functions applied so stale high-trust listings drop ranking.
- Add freshness penalty for stale-but-popular listings to prevent ranking fossilization.
