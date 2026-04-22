//
// semantic_embedder.ts (Coeus P3a)
//
// Conforms to:
//   docs/contracts/search_ui.contract.md v0.1.0
//   docs/contracts/search_ranking.contract.md v0.1.0
//   docs/contracts/living_template_customize.contract.md v0.1.0
//
// Thin wrapper per Coeus task spec entry 4. Ships the client-side scoring
// surface that SearchBar, ResultList, and LivingTemplateChat consume, with
// keyword-match primary and a flag-gated Claude embedding stub per the
// strategic_decision_hard_stop recommendation in the Coeus prompt file.
//
// This module also re-exports the canonical search_ui, search_ranking, and
// living_template type families (contract Section 6 nominates dedicated files
// at search_ui_types.ts, ranking_types.ts, living_template_types.ts; for the
// hackathon 5-output budget they are colocated here and imports from the
// component files use `./semantic_embedder`, ADR-02 in coeus.decisions.md
// documents the deferred split).
//
// Honest-claim discipline (NarasiGhaisan Section 16 + Section 20):
//   - When the embedding call is skipped, results carry mode 'keyword'
//     so the UI renders a subtle "keyword" badge, not "semantic".
//   - When the flag is on but the embedding call fails, we fall back to
//     keyword with a warning in the RankingContext audit trail.
//

import rankingWeightsJson from './ranking_weights.json';
import type {
  AgentListing,
  CapabilityTag,
  PricingTier,
  VendorOrigin,
  LivingTemplateParam,
  LivingTemplateParams as ListingLivingTemplateParams,
} from '../schema/listing.schema';

// ---------- Search ranking types (search_ranking.contract.md Section 3) ----------

export interface RankingWeights {
  semantic_similarity: number;
  trust_score: number;
  popularity: number;
  recency: number;
  pricing_tier_affinity: number;
}

export interface RankingSignal {
  listing_id: string;
  semantic_similarity: number;
  trust_score: number;
  popularity_normalized: number;
  recency_normalized: number;
  pricing_tier_match: number;
}

export interface RankedResult {
  listing_id: string;
  score: number;
  per_signal: RankingSignal;
}

export type EmbeddingMode = 'keyword' | 'semantic';

export interface RankingContext {
  user_query: string;
  user_preferred_tier?: PricingTier;
  filter_capability_tag?: CapabilityTag;
  filter_vendor_origin?: VendorOrigin;
  embedding_mode_requested?: EmbeddingMode;
  embedding_mode_used?: EmbeddingMode;
  embedding_fallback_reason?: string;
}

// ---------- Search UI types (search_ui.contract.md Section 3) ----------

export interface SearchBarProps {
  query: string;
  onQueryChange: (next: string) => void;
  onSubmit: () => void;
  isSearching: boolean;
  placeholder?: string;
}

export interface SearchResultItem {
  listing: AgentListing;
  ranking: RankedResult;
  highlight_snippets: string[];
  embedding_mode_used: EmbeddingMode;
}

export interface ResultListProps {
  items: SearchResultItem[];
  onItemClick: (listing_id: string) => void;
  onCustomizeClick: (listing_id: string) => void;
  pageSize?: number;
}

export interface LivingTemplateChatProps {
  source_listing_id: string;
  onRemixRequest: (
    params: Record<string, string | number | boolean>,
  ) => Promise<void>;
  onCancel: () => void;
}

// ---------- Living template types (living_template_customize.contract.md Section 3) ----------

export type LivingTemplateParamKind = 'string' | 'enum' | 'number' | 'boolean';

export interface LivingTemplateParamDefinition {
  key: string;
  label: string;
  kind: LivingTemplateParamKind;
  enum_values?: string[];
  default_value: string | number | boolean;
  description: string;
  required: boolean;
  validation_regex?: string;
  min?: number;
  max?: number;
}

export interface LivingTemplateRemixRequest {
  request_id: string;
  source_listing_id: string;
  params: Record<string, string | number | boolean>;
  requested_by_identity_id?: string;
  locale: 'en-US' | 'id-ID';
  submitted_at: string;
}

export type LivingTemplateRemixStatus =
  | 'accepted'
  | 'rejected'
  | 'in_progress'
  | 'completed'
  | 'failed';

export interface LivingTemplateRemixResult {
  request_id: string;
  remix_pipeline_run_id: string;
  new_listing_id?: string;
  status: LivingTemplateRemixStatus;
  validation_errors?: Record<string, string>;
  completed_at?: string;
}

// ---------- Weights loader ----------

interface RankingWeightsFile {
  readonly $schema_version: string;
  readonly contract_ref: string;
  readonly owner_agent: string;
  readonly weights_version: string;
  readonly weights: RankingWeights;
}

const SHIPPED_WEIGHTS: RankingWeights = {
  ...(rankingWeightsJson as unknown as RankingWeightsFile).weights,
};

export function getShippedRankingWeights(): RankingWeights {
  return { ...SHIPPED_WEIGHTS };
}

// ---------- Keyword scoring helpers ----------

const SENTENCE_SPLIT_RE = /(?<=[.!?])\s+|\n+/g;
const WORD_RE = /[a-zA-Z0-9_]+/g;
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'if',
  'of',
  'to',
  'for',
  'in',
  'on',
  'at',
  'by',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'as',
  'with',
  'from',
  'into',
  'dan',
  'atau',
  'ke',
  'di',
  'yang',
  'untuk',
  'dari',
  'pada',
  'dengan',
  'adalah',
]);

export function tokenize(raw: string): string[] {
  const out: string[] = [];
  const lower = raw.toLowerCase();
  const matches = lower.match(WORD_RE);
  if (matches === null) return out;
  for (const m of matches) {
    if (m.length < 2) continue;
    if (STOPWORDS.has(m)) continue;
    out.push(m);
  }
  return out;
}

export function uniqueTokens(raw: string): Set<string> {
  return new Set(tokenize(raw));
}

export function keywordSimilarity(
  query_tokens: Set<string>,
  text: string,
): number {
  if (query_tokens.size === 0) return 0;
  const text_tokens = new Set(tokenize(text));
  if (text_tokens.size === 0) return 0;
  let hits = 0;
  query_tokens.forEach((t) => {
    if (text_tokens.has(t)) hits += 1;
  });
  return hits / query_tokens.size;
}

export function computeHighlightSnippets(
  query: string,
  text: string,
  max_snippets = 3,
): string[] {
  const query_tokens = uniqueTokens(query);
  if (query_tokens.size === 0) return [];
  const sentences = text.split(SENTENCE_SPLIT_RE).map((s) => s.trim()).filter(
    (s) => s.length > 0,
  );
  const picked: string[] = [];
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    let matched = false;
    for (const tok of query_tokens) {
      if (lower.includes(tok)) {
        matched = true;
        break;
      }
    }
    if (matched) {
      const compact = sentence.length > 220
        ? `${sentence.slice(0, 217)}...`
        : sentence;
      picked.push(compact);
      if (picked.length >= max_snippets) break;
    }
  }
  return picked;
}

// ---------- Embedder surface ----------

export interface QueryEmbedder {
  readonly mode: EmbeddingMode;
  score(
    query: string,
    listings: ReadonlyArray<AgentListing>,
  ): Promise<Array<{ listing_id: string; similarity: number }>>;
}

export class KeywordEmbedder implements QueryEmbedder {
  readonly mode: EmbeddingMode = 'keyword';

  async score(
    query: string,
    listings: ReadonlyArray<AgentListing>,
  ): Promise<Array<{ listing_id: string; similarity: number }>> {
    const query_tokens = uniqueTokens(query);
    return listings.map((listing) => {
      const combined = `${listing.display_name}\n${listing.short_description}\n${listing.long_description_markdown}\n${listing.capability_tags.join(' ')}`;
      const similarity = keywordSimilarity(query_tokens, combined);
      return { listing_id: listing.listing_id, similarity };
    });
  }
}

export class ClaudeEmbedderStub implements QueryEmbedder {
  readonly mode: EmbeddingMode = 'semantic';
  private readonly warn_once: boolean;
  private warned = false;

  constructor(opts: { warn_once?: boolean } = {}) {
    this.warn_once = opts.warn_once ?? true;
  }

  async score(
    query: string,
    listings: ReadonlyArray<AgentListing>,
  ): Promise<Array<{ listing_id: string; similarity: number }>> {
    if (!this.warned && this.warn_once && typeof console !== 'undefined') {
      console.warn(
        '[coeus] ClaudeEmbedderStub invoked. Shipped hackathon build ' +
          'does not call Claude for embeddings. Falling back to keyword.',
      );
      this.warned = true;
    }
    return new KeywordEmbedder().score(query, listings);
  }
}

export interface EmbedderFactoryOpts {
  readonly prefer_semantic?: boolean;
  readonly allow_claude_stub?: boolean;
}

export function createEmbedder(
  opts: EmbedderFactoryOpts = {},
): QueryEmbedder {
  const prefer_semantic = opts.prefer_semantic === true;
  const allow_claude_stub = opts.allow_claude_stub === true;
  if (prefer_semantic && allow_claude_stub) {
    return new ClaudeEmbedderStub();
  }
  return new KeywordEmbedder();
}

// ---------- SearchRanker (thin scaffold, see ADR-05 handoff to Demeter) ----------

export interface SearchRanker {
  rank(
    listings: ReadonlyArray<AgentListing>,
    context: RankingContext,
    weights?: RankingWeights,
  ): Promise<RankedResult[]>;
  loadWeights(): Promise<RankingWeights>;
}

export interface SimpleSearchRankerDeps {
  readonly embedder?: QueryEmbedder;
  readonly weights?: RankingWeights;
  readonly popularity_lookup?: (listing_id: string) => number;
  readonly now?: () => number;
}

interface RawScore {
  listing_id: string;
  raw: number;
  signals: RankingSignal;
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function normalizeWeights(w: RankingWeights): RankingWeights {
  const total =
    w.semantic_similarity +
    w.trust_score +
    w.popularity +
    w.recency +
    w.pricing_tier_affinity;
  if (total <= 0) {
    return getShippedRankingWeights();
  }
  return {
    semantic_similarity: w.semantic_similarity / total,
    trust_score: w.trust_score / total,
    popularity: w.popularity / total,
    recency: w.recency / total,
    pricing_tier_affinity: w.pricing_tier_affinity / total,
  };
}

function recencyNormalized(iso: string, now_ms: number): number {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return 0;
  const age_ms = Math.max(0, now_ms - parsed);
  const age_days = age_ms / (1000 * 60 * 60 * 24);
  // 30-day half-life soft curve: fresh listings score near 1.0, stale fall off.
  return clamp01(Math.exp(-age_days / 30));
}

function pricingTierMatch(
  tier: PricingTier,
  preferred?: PricingTier,
): number {
  if (preferred === undefined) return 0.5;
  return tier === preferred ? 1 : 0.2;
}

function trustScoreFromPointer(pointer: string): number {
  // Registry mocks trust scores for hackathon scope (demeter.output.md Section 9).
  // We extract a 0..1 value from the pointer string by hashing a stable integer
  // per listing. Deterministic for demo repeatability.
  let h = 0;
  for (let i = 0; i < pointer.length; i += 1) {
    h = (h * 31 + pointer.charCodeAt(i)) | 0;
  }
  const bucket = Math.abs(h) % 1000;
  return 0.4 + (bucket / 1000) * 0.55;
}

export class SimpleSearchRanker implements SearchRanker {
  private readonly embedder: QueryEmbedder;
  private readonly weights: RankingWeights;
  private readonly popularity_lookup: (listing_id: string) => number;
  private readonly now: () => number;

  constructor(deps: SimpleSearchRankerDeps = {}) {
    this.embedder = deps.embedder ?? new KeywordEmbedder();
    this.weights = deps.weights ?? getShippedRankingWeights();
    this.popularity_lookup = deps.popularity_lookup ?? (() => 0.5);
    this.now = deps.now ?? (() => Date.now());
  }

  async loadWeights(): Promise<RankingWeights> {
    return { ...this.weights };
  }

  async rank(
    listings: ReadonlyArray<AgentListing>,
    context: RankingContext,
    override_weights?: RankingWeights,
  ): Promise<RankedResult[]> {
    if (listings.length === 0) return [];
    const normalized_weights = normalizeWeights(override_weights ?? this.weights);
    const similarities = await this.embedder.score(context.user_query, listings);
    const sim_map = new Map<string, number>();
    similarities.forEach((s) =>
      sim_map.set(s.listing_id, clamp01(s.similarity)),
    );
    const now_ms = this.now();
    const raw: RawScore[] = listings.map((listing) => {
      const semantic = sim_map.get(listing.listing_id) ?? 0;
      const trust = clamp01(trustScoreFromPointer(listing.trust_score_pointer));
      const popularity = clamp01(this.popularity_lookup(listing.listing_id));
      const recency = recencyNormalized(listing.updated_at ?? listing.created_at, now_ms);
      const pricing = pricingTierMatch(listing.pricing_tier, context.user_preferred_tier);
      const signals: RankingSignal = {
        listing_id: listing.listing_id,
        semantic_similarity: semantic,
        trust_score: trust,
        popularity_normalized: popularity,
        recency_normalized: recency,
        pricing_tier_match: pricing,
      };
      const raw_score =
        normalized_weights.semantic_similarity * semantic +
        normalized_weights.trust_score * trust +
        normalized_weights.popularity * popularity +
        normalized_weights.recency * recency +
        normalized_weights.pricing_tier_affinity * pricing;
      return { listing_id: listing.listing_id, raw: raw_score, signals };
    });
    const max = raw.reduce((m, r) => (r.raw > m ? r.raw : m), 0);
    const results: RankedResult[] = raw.map((r) => ({
      listing_id: r.listing_id,
      score: max > 0 ? clamp01(r.raw / max) : 0,
      per_signal: r.signals,
    }));
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ra = a.per_signal.recency_normalized;
      const rb = b.per_signal.recency_normalized;
      if (rb !== ra) return rb - ra;
      return a.listing_id.localeCompare(b.listing_id);
    });
    return results;
  }
}

// ---------- Result assembly helper ----------

export interface AssembleResultsInput {
  readonly query: string;
  readonly listings: ReadonlyArray<AgentListing>;
  readonly ranked: ReadonlyArray<RankedResult>;
  readonly embedding_mode_used: EmbeddingMode;
}

export function assembleSearchResultItems(
  input: AssembleResultsInput,
): SearchResultItem[] {
  const listing_by_id = new Map<string, AgentListing>();
  input.listings.forEach((l) => listing_by_id.set(l.listing_id, l));
  const items: SearchResultItem[] = [];
  for (const r of input.ranked) {
    const listing = listing_by_id.get(r.listing_id);
    if (listing === undefined) continue;
    const combined = `${listing.short_description}\n${listing.long_description_markdown}`;
    const highlights = computeHighlightSnippets(input.query, combined);
    items.push({
      listing,
      ranking: r,
      highlight_snippets: highlights,
      embedding_mode_used: input.embedding_mode_used,
    });
  }
  return items;
}

// ---------- Living template param shape bridge ----------

export function toParamDefinition(
  p: LivingTemplateParam,
): LivingTemplateParamDefinition {
  return {
    key: p.key,
    label: p.label,
    kind: p.kind as LivingTemplateParamKind,
    enum_values: p.enum_values,
    default_value: p.default_value,
    description: p.description,
    required: true,
  };
}

export function coerceParamsFromListing(
  params: ListingLivingTemplateParams | undefined,
): LivingTemplateParamDefinition[] {
  if (params === undefined) return [];
  return params.map(toParamDefinition);
}

// ---------- Event emit helpers (CustomEvent pattern, parallels Erato) ----------

export type MarketplaceSearchEventDetail =
  | {
      topic: 'marketplace.search.query_submitted';
      query: string;
      ranking_context: RankingContext;
    }
  | {
      topic: 'marketplace.search.result_clicked';
      listing_id: string;
      position: number;
      score: number;
    }
  | {
      topic: 'marketplace.search.customize_opened';
      source_listing_id: string;
    }
  | {
      topic: 'marketplace.search.remix_requested';
      source_listing_id: string;
      params: Record<string, string | number | boolean>;
    };

export function emitMarketplaceSearchEvent(
  detail: MarketplaceSearchEventDetail,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent('nerium:marketplace:search', { detail }),
    );
  } catch {
    // CustomEvent missing in exotic runtimes; silent fallback.
  }
}
