# Search UI

**Contract Version:** 0.1.0
**Owner Agent(s):** Coeus (search surface component author)
**Consumer Agent(s):** Apollo (routes living-template remix requests), Demeter (search signal feedback loop), Artemis (composition with browse), Phoebe (result card children), Harmonia (aesthetic)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the user-facing search surface (query bar, result list, semantic highlight, living-template customization entry-point) so buyers can semantically find agents and trigger the "ubah agent pertanian cabai jadi anggur" remix flow per NarasiGhaisan Section 5.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 5 Marketplace living template examples)
- `CLAUDE.md` (root)
- `docs/contracts/marketplace_listing.contract.md` (result entity)
- `docs/contracts/search_ranking.contract.md` (ranking signals)
- `docs/contracts/living_template_customize.contract.md` (remix entry-point)
- `docs/contracts/identity_card.contract.md` (result card children)

## 3. Schema Definition

```typescript
// app/marketplace/search/search_ui_types.ts

import type { AgentListing } from '@/marketplace/schema/listing.schema';
import type { RankedResult, RankingContext } from '@/marketplace/search/ranking_types';

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
  highlight_snippets: string[];      // sentence fragments from listing description matching the query
}

export interface ResultListProps {
  items: SearchResultItem[];
  onItemClick: (listing_id: string) => void;
  onCustomizeClick: (listing_id: string) => void;
  pageSize?: number;                 // default 20
}

export interface LivingTemplateChatProps {
  source_listing_id: string;
  onRemixRequest: (params: Record<string, string | number | boolean>) => Promise<void>;
  onCancel: () => void;
}
```

## 4. Interface / API Contract

- `<SearchBar>` is a controlled component. On submit, invokes a parent handler which calls `SearchRanker.rank` then renders `<ResultList>`.
- `<ResultList>` renders each item with the listing card, ranking score badge, and a "Customize" affordance that opens `<LivingTemplateChat>`.
- `<LivingTemplateChat>` is a short-turn chat surface (max 3 Advisor sentences per turn, mirroring Advisor brevity discipline per `advisor_interaction.contract.md`) that collects living-template parameter values and submits them to Apollo via `onRemixRequest`.
- Semantic highlight snippets are computed client-side from the query terms; server-side embedding retrieval is stubbed for hackathon scope and documented in `coeus.decisions.md`.

## 5. Event Signatures

- `marketplace.search.query_submitted` payload: `{ query: string, ranking_context: RankingContext }`
- `marketplace.search.result_clicked` payload: `{ listing_id, position: number, score: number }`
- `marketplace.search.customize_opened` payload: `{ source_listing_id }`
- `marketplace.search.remix_requested` payload: `{ source_listing_id, params: Record<string, unknown> }` (handoff to Apollo)

## 6. File Path Convention

- Search bar: `app/marketplace/search/SearchBar.tsx`
- Result list: `app/marketplace/search/ResultList.tsx`
- Living template chat: `app/marketplace/search/LivingTemplateChat.tsx`
- Semantic embedder thin wrapper: `app/marketplace/search/semantic_embedder.ts`
- Types: `app/marketplace/search/search_ui_types.ts`

## 7. Naming Convention

- Event topics in the `marketplace.search.*` namespace.
- Component files: `PascalCase.tsx`.
- Remix params keys match the source listing's `living_template_params[i].key`.

## 8. Error Handling

- Empty query submit: no-op, do not fire event.
- Search backend failure: render an inline error with retry, preserve prior result set.
- Remix request failure (Apollo rejected): render a concise error toast and re-open `<LivingTemplateChat>` with prior params preserved.
- Live embedding call skipped (hackathon fallback to keyword match): label results with a subtle "keyword" badge instead of "semantic" to retain honest framing per NarasiGhaisan Section 16.

## 9. Testing Surface

- Bar submit: type "cabai to anggur", submit, assert `marketplace.search.query_submitted` event fires with the query.
- Result click: click an item, assert `onItemClick(listing_id)` invoked with correct id.
- Customize flow: click customize, assert `<LivingTemplateChat>` opens with the correct `source_listing_id`.
- Remix submit: complete params, assert `onRemixRequest(params)` invoked once with matching payload.
- Keyword fallback badge: force embedding unavailable, assert results carry the "keyword" indicator.

## 10. Open Questions

- None at contract draft. Whether the hackathon demo calls Claude for embedding versus uses keyword match is a Coeus strategic_decision; contract supports both via the `semantic_embedder.ts` abstraction.

## 11. Post-Hackathon Refactor Notes

- Wire `semantic_embedder.ts` to a persistent vector store (pgvector or Chroma) populated from listing descriptions.
- Add query auto-complete surfacing recent successful searches.
- Multi-modal search: allow user to upload an existing agent's output sample and find similar agents.
- Personalized ranking context: use prior user builds and purchases as additional signal.
- Support multi-turn `<LivingTemplateChat>` where Apollo can clarify ambiguous customization requests.
