---
agent: coeus
tier: worker
pillar: marketplace
phase: P3a
parallel_group: P3a
model: opus-4-7
contract_refs:
  - docs/contracts/search_ui.contract.md v0.1.0
  - docs/contracts/search_ranking.contract.md v0.1.0
  - docs/contracts/living_template_customize.contract.md v0.1.0
  - docs/contracts/builder_specialist_executor.contract.md v0.1.0
version: 0.1.0
status: shipped
last_updated: 2026-04-22
---

# Coeus ADR Log

Cross-cutting Worker spanning Marketplace search plus Builder remix surface.
Each ADR documents a decision, options considered, chosen option, rationale,
and deferred work. Ordering reflects chronological decision flow during the
single P3a session.

## ADR-01 Keyword-primary embedding, Claude embedding behind flag (strategic)

**Context.** The `strategic_decision_hard_stop` in `coeus.md` and the halt trigger
listed in the prompt file both call out the embedding-choice decision: actually
call Claude for query embedding or use keyword match for the hackathon demo.
The prompt recommendation line reads: "keyword match primary, embedding call
behind flag for demo moments."

**Options considered.**
1. Call Claude Messages API per query for semantic embedding on every search,
   charge roughly $0.0015-0.0075 per query at Opus rates depending on context
   size.
2. Ship a client-side keyword match primary path that computes query-token
   overlap against listing text, and expose a flag-gated ClaudeEmbedderStub
   for demo moments (flag off by default in shipped build).
3. Skip semantic signals entirely, set the semantic_similarity weight to 0 in
   ranking_weights.json locally.

**Chosen option.** Option 2. KeywordEmbedder is the shipped primary path.
ClaudeEmbedderStub exists as a flag-gated surface; when invoked without an API
wiring it warns once and falls back to keyword, preserving the honest-claim
filter per NarasiGhaisan Section 16. The factory
`createEmbedder({ prefer_semantic, allow_claude_stub })` accepts an explicit
flag from the caller, defaulting to keyword for Day 1 demo.

**Rationale.**
- Matches prompt recommendation verbatim, so no strategic ambiguity.
- Zero cost path is reliable during demo with flaky network, judges watching.
- Honest UI treatment via the "keyword" badge on each result per
  search_ui.contract.md Section 8, so we do not oversell the ranking
  sophistication.
- Post-hackathon wiring to a real vector store (pgvector, Chroma) sits behind
  the same QueryEmbedder interface so the call sites do not change.

**Ferry status.** V3 pre-approved via the recommendation line in `coeus.md`.
Surfacing this ADR as the formal record; no halt was triggered because the
decision matched the pre-authorized path.

**Post-hackathon refactor.** Replace stub with an authenticated Claude
Messages API call using a cacheable embedding pattern, or swap to an
OpenAI-compatible embedding endpoint at the same interface boundary.

---

## ADR-02 Type definitions colocated in semantic_embedder.ts (scope preservation)

**Context.** Three contracts nominate dedicated type files:

- `search_ui.contract.md` Section 6: `app/marketplace/search/search_ui_types.ts`
- `search_ranking.contract.md` Section 6: `app/marketplace/search/ranking_types.ts`
- `living_template_customize.contract.md` Section 6: `app/marketplace/customize/living_template_types.ts`

The Coeus task specification lists exactly five output files, none of which is
a dedicated type module. Hard constraint in the prompt: "Output file paths
exactly per Task Specification."

**Options considered.**
1. Ship all three type files in addition to the five specified outputs.
2. Colocate all cross-component types in `semantic_embedder.ts` and re-export
   them; components import from `./semantic_embedder`.
3. Inline duplicated type definitions in each component file.

**Chosen option.** Option 2. All three type families sit at the top of
`semantic_embedder.ts` with contract-reference comments. Re-exported so
SearchBar, ResultList, and LivingTemplateChat import from the single module.

**Rationale.**
- Respects the five-file output budget exactly as instructed.
- Single source of truth prevents duplication drift between components.
- Import boundary is narrow and easy to refactor post-hackathon.
- Ranker scaffold (SimpleSearchRanker) colocated with the embedder keeps the
  search module cohesive for the demo; see ADR-05.

**Trade-off.** `semantic_embedder.ts` is now broader than its contract-implied
narrow embedding wrapper. We accept this because the contract itself is the
design time artifact; the shipped code organization can legitimately vary
within the same folder as long as public imports match.

**Post-hackathon refactor.** Split into the three nominated type files and
update component imports in a mechanical rename sweep. No behavioral change.

---

## ADR-03 Erato bubble visual treatment reused via parallel class structure

**Context.** Soft guidance in `coeus.md`: "LivingTemplateChat reuses Erato
chat bubble visual treatment (coordinate via shared design token stub)". Erato
ships `app/advisor/ui/styles.css` with `.advisor-bubble` classes that include
gradient fills, role-keyed corner styling, and data-role attribute variants.

**Options considered.**
1. Import Erato's `styles.css` directly from LivingTemplateChat so classes are
   available without duplication.
2. Create a dedicated Coeus `styles.css` file that mirrors the relevant
   bubble rules.
3. Scope a small `<style>` element inside LivingTemplateChat.tsx that declares
   `.coeus-bubble*` classes with the same shape as Erato's `.advisor-bubble`,
   inheriting `--advisor-*` custom properties when AdvisorChat is mounted and
   using sensible fallbacks when isolated.

**Chosen option.** Option 3. LivingTemplateChat.tsx declares a scoped
`<style>` block with `.coeus-bubble`, `.coeus-bubble[data-role=...]`,
`.coeus-bubble-role` rules that mirror Erato's bubble shape and palette.

**Rationale.**
- Option 1 couples Coeus to Erato's file path; a future Erato rename or style
  sweep would silently break Coeus visuals.
- Option 2 requires shipping a sixth output file (violates spec).
- Option 3 preserves the file budget, keeps the visual family consistent, and
  fails gracefully when the cascade is not present.

**Trade-off.** Visual drift risk if Erato later alters `.advisor-bubble`
internals beyond the shared custom properties. Mitigation: ADR-06 in
erato.decisions.md already flags the Harmonia P4 token sweep, at which point
both components switch to the unified `design_tokens.ts` cascade and the
duplication collapses.

**Post-hackathon refactor.** Replace the scoped `<style>` block with class
references from a shared `app/shared/ui/bubble.css` authored by Harmonia as
part of the design token unification.

---

## ADR-04 Honest-claim filter on remix dispatch framing

**Context.** Hard constraint in `coeus.md`: "Honest-claim filter:
living-template remix demonstration surface MUST label clearly if remix result
is cached demo artifact vs live Builder run."

The shipped LivingTemplateChat component surfaces only the request dispatch;
the remix pipeline completion event lands elsewhere (via `marketplace.remix.*`
topics that Apollo routes through). The component therefore cannot truthfully
label the result because it never sees the result.

**Options considered.**
1. Add a `remixMode: 'live' | 'demo_cache'` prop to LivingTemplateChatProps
   and render a banner accordingly.
2. Keep the contract prop shape exactly as specified and move the honest
   framing to the dispatch-framing copy inside the component (submit caption,
   post-submit advisor bubble).
3. Surface honest framing entirely in the parent integration layer and keep
   the chat component mute on the topic.

**Chosen option.** Option 2. The submit caption explicitly reads that the
click dispatches a request to Apollo and that results will surface in the
Advisor chat. The post-submit advisor bubble reaffirms "Remix request
dispatched to Apollo." No implicit claim of completion is rendered inside
LivingTemplateChat.

**Rationale.**
- Option 1 extends the contract, which the schema lock prohibits at v0.1.0.
- Option 3 leaves honest framing to callers and risks inconsistency across
  mount sites.
- Option 2 respects the contract, keeps the component self-honest, and plays
  well with both demo-cache and live parent wiring because the copy only
  describes what Coeus actually does (dispatch a request).

**Post-hackathon refactor.** If a v0.2.0 bump adds a completion-result slot to
the contract, Coeus can render a stronger labeled result panel including
cached vs live provenance indicators.

---

## ADR-05 Minimal SimpleSearchRanker scaffold colocated with embedder

**Context.** The search_ranking.contract.md v0.1.0 Section 6 assigns
`app/marketplace/search/Ranker.ts` ownership to Demeter. Demeter's shipped
output (`app/marketplace/leads/demeter.output.md`) lists the weights JSON and
schema file as shipped artifacts, but not a `Ranker.ts` implementation. Coeus
must display ranked results in ResultList; without a callable Ranker the
demo path breaks.

**Options considered.**
1. Block the Coeus session, halt, ferry to V3 asking Demeter to ship Ranker.ts
   before Coeus continues.
2. Ship a minimal working `SimpleSearchRanker` class in `semantic_embedder.ts`
   that implements the `SearchRanker` interface contract end-to-end.
3. Mock the ranking entirely inside ResultList (hardcoded scores).

**Chosen option.** Option 2. `SimpleSearchRanker` in semantic_embedder.ts
consumes the shipped `ranking_weights.json`, applies embedder-produced
semantic similarity, derives trust from the listing's `trust_score_pointer`
via a deterministic hash (Registry mocks per demeter.output.md Section 9),
derives popularity via an injectable lookup (default 0.5), recency via a
30-day half-life curve, pricing tier match via preferred-tier comparison,
applies weighted sum, normalizes min-max per contract Section 4, and ties
break by recency then listing_id lexicographic.

**Rationale.**
- Option 1 stalls the P3a parallel group unacceptably given the five-day
  budget.
- Option 3 is dishonest about ranking logic and violates the honest-claim
  filter.
- Option 2 respects the contract interface exactly and gives Demeter a clean
  drop-in replacement point post-hackathon; the method signature already
  matches.

**Trade-off.** Cross-pillar ownership blur between Coeus (UI surface) and
Demeter (ranking algorithm). Mitigated by clear ADR documentation and by
keeping the ranker callable as an injected `SearchRanker` from outside, so a
Demeter-authored implementation can replace `SimpleSearchRanker` at mount time
without touching Coeus UI code.

**Ferry status.** Surfaced in this ADR for V3 awareness; not a blocking
strategic decision because the scaffold matches the contract and is easily
replaced. V3 may choose to ferry to Demeter for a canonical authoring pass
post-hackathon.

**Post-hackathon refactor.** Move `SimpleSearchRanker` to
`app/marketplace/search/Ranker.ts` under Demeter ownership, optionally
replacing the linear weighted-sum with a learned ranker per
`search_ranking.contract.md` Section 11.

---

## ADR-06 Highlight snippet algorithm: sentence-overlap, max three

**Context.** `search_ui.contract.md` Section 4 specifies that semantic
highlight snippets are computed client-side from the query terms. No
algorithm is mandated; the contract only requires client-side computation.

**Options considered.**
1. Character-window highlights: for each matched token, extract a 60-char
   window around the match and deduplicate.
2. Sentence-level matches: split the listing's descriptive text into
   sentences, pick up to three that contain any query token, truncate each to
   220 chars.
3. Full-text TF-IDF ranking of sentences, pick top three by score.

**Chosen option.** Option 2.

**Rationale.**
- Sentence-level context reads better for buyer scan than character windows
  that frequently cut mid-word.
- TF-IDF requires a corpus pass that is cold-start expensive at small
  catalog sizes typical of the hackathon demo.
- Three is the right ceiling: enough to convey relevance, few enough that the
  result card stays compact. Contract Section 3 suggests `highlight_snippets:
  string[]` without a count, soft guidance on card compactness comes from the
  overall CLAUDE.md brevity directives.

**Post-hackathon refactor.** Replace sentence-overlap with a richer highlighter
that handles multi-term phrase matches and diacritic normalization for
Indonesian locale (`ubah` variants, trailing particles, etc.).

---

## ADR-07 Pagination default 20, client-side slice

**Context.** Contract Section 3 nominates `pageSize?: number` with default
value 20. Soft guidance in `coeus.md` reinforces "pagination optional (20
default)."

**Options considered.**
1. Ship no pagination, render all results as a single scrollable column.
2. Client-side slice with simple Prev/Next buttons, default 20 per page.
3. Server-side pagination with cursor tokens.

**Chosen option.** Option 2.

**Rationale.**
- Hackathon catalog size is small (demo fixtures only); server-side
  pagination adds complexity without benefit.
- Client-side slice renders instantly on page change and preserves keyboard
  focus patterns.
- Default 20 matches the contract and is a familiar card-density for the
  search surface.

**Post-hackathon refactor.** Swap to server-side pagination backed by SQLite
(Demeter catalog) with cursor tokens once the catalog grows past a few
hundred entries.

---

## ADR-08 Event emission via CustomEvent bridge (parallels Erato pattern)

**Context.** Contract Section 5 defines four `marketplace.search.*` event
signatures. These topics are outside the `PipelineEventTopic` enum defined in
`app/shared/events/pipeline_event.ts`. The existing event bus is narrowly
scoped to pipeline events and does not support Marketplace namespaces
natively.

**Options considered.**
1. Extend `PipelineEventTopic` to include Marketplace topics.
2. Author a new `MarketplaceEventBus` in `app/shared/events/`.
3. Use `window.dispatchEvent(new CustomEvent(...))` with a single namespaced
   event name (`nerium:marketplace:search`), `detail` carries the `topic`
   field plus payload.

**Chosen option.** Option 3, mirroring the pattern Erato uses for
prediction-warning action events in `AdvisorChat.tsx`
(`nerium:prediction-warning-action`).

**Rationale.**
- Option 1 extends a typed enum across contract boundaries, requires a
  contract version bump, and couples Marketplace events to pipeline semantics
  that do not fit (no `pipeline_run_id` field for search events).
- Option 2 ships a new shared infrastructure file (violates the five-output
  budget).
- Option 3 is lightweight, deferred-infrastructure friendly, and Ananke can
  hook the same window events for telemetry in the same way it hooks
  Erato's.

**Post-hackathon refactor.** Promote to a unified event bus once the
`event_bus.contract.md` Section 11 namespace extension ships.

---

## ADR-09 resolveListing callback as LivingTemplateChat extension

**Context.** `search_ui.contract.md` Section 3 defines
`LivingTemplateChatProps` with exactly three props: `source_listing_id`,
`onRemixRequest`, `onCancel`. To render the per-param form, the component
needs the source listing's `living_template_params`. The contract-specified
props do not include a way to fetch the listing.

**Options considered.**
1. Fetch the listing directly via a Demeter `MarketplaceCatalog` import.
2. Add a `resolveListing` callback prop as an extension to the contract
   shape.
3. Pass the listing itself as a prop, making the component a pure presenter.

**Chosen option.** Option 2. The component exports
`LivingTemplateChatExtendedProps` that extends the contract's
`LivingTemplateChatProps` with a `resolveListing` callback. The base contract
shape is still exported as `LivingTemplateChatProps` via
`semantic_embedder.ts` for contract-level conformance checks.

**Rationale.**
- Option 1 tightly couples Coeus to Demeter's catalog surface and breaks
  testability (can't mock listing resolution).
- Option 3 forces the parent to fetch the listing synchronously before the
  chat can open, adding a render-blocking await to the Customize click flow.
- Option 2 keeps the chat asynchronous (shows a loading state), preserves the
  base contract prop names, and extends cleanly via a named extended props
  type.

**Ferry status.** Non-strategic extension. Documented here for traceability.

**Post-hackathon refactor.** Promote `resolveListing` into a contract v0.2.0
surface or move to a React context provider that injects the catalog and
identity pointer once the MarketplaceCatalog becomes a ubiquitous dependency.

---

## Honest-claim summary (Public surface + demo)

- Ranking mode badge ("keyword" or "semantic") is rendered on every result
  card per search_ui.contract.md Section 8 honest-framing guidance.
- Coeus does not claim to perform actual remix execution: the submit caption
  copy in LivingTemplateChat names "Apollo dispatch" explicitly.
- The ClaudeEmbedderStub warns on first invocation if called without a real
  wiring, making the fallback behavior observable to developers.
- No marketing language in any visible string; copy stays in the range of
  "dispatched, in progress, rejected, ready to rank."

## Self-check run (19/19 PASS)

All 19 items in the self-check protocol verified silently against the shipped
artifacts before the final commit. See the commit message for the audit
surface and the end-of-session emit for the token manager row append.
