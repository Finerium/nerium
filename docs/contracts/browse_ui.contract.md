# Browse UI

**Contract Version:** 0.1.0
**Owner Agent(s):** Artemis (browse component author)
**Consumer Agent(s):** Apollo (Marketplace entry point from Advisor), Coeus (search overlay composes with browse), Phoebe (identity card children), Harmonia (aesthetic sweep)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the buyer-facing Marketplace browse surface (category navigation, vendor filter, featured-agent home, listing grid) so buyers can discover agents across vendors without the fragmented vendor-locked storefront pain per NarasiGhaisan Section 5.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 5 fragmentation pain)
- `CLAUDE.md` (root)
- `docs/contracts/marketplace_listing.contract.md` (data source)
- `docs/contracts/search_ranking.contract.md` (featured selection logic)
- `docs/contracts/identity_card.contract.md` (creator card children)
- `docs/contracts/design_tokens.contract.md` (styling)

## 3. Schema Definition

```typescript
// app/marketplace/browse/types.ts

import type { AgentListing, CapabilityTag, VendorOrigin, PricingTier } from '@/marketplace/schema/listing.schema';

export interface BrowseFilter {
  capability_tag?: CapabilityTag;
  vendor_origin?: VendorOrigin;
  pricing_tier?: PricingTier;
}

export interface BrowseSortOrder {
  kind: 'recent' | 'trust_weighted' | 'curator_picked' | 'popular';
}

export interface BrowseCanvasProps {
  filter: BrowseFilter;
  sort: BrowseSortOrder;
  onFilterChange: (next: BrowseFilter) => void;
  onSortChange: (next: BrowseSortOrder) => void;
  onListingClick: (listing_id: string) => void;
  pageSize?: number;                 // default 24
}

export interface CategoryNavProps {
  capabilities: Array<{ tag: CapabilityTag; display_label: string; count: number }>;
  activeTag?: CapabilityTag;
  onTagSelect: (tag?: CapabilityTag) => void;
}

export interface VendorFilterProps {
  vendors: Array<{ vendor: VendorOrigin; display_label: string; count: number }>;
  selected: VendorOrigin[];          // multi-select
  onToggle: (vendor: VendorOrigin) => void;
}

export interface FeaturedAgentsProps {
  featured: AgentListing[];          // max 6 surfaced
  onListingClick: (listing_id: string) => void;
}
```

## 4. Interface / API Contract

- `<BrowseCanvas>` fetches listings via `MarketplaceCatalog.listBy(filter)` internally, composes with `<CategoryNav>` and `<VendorFilter>` slots, renders a responsive grid of listing cards.
- `<FeaturedAgents>` consumes the top 6 results from `SearchRanker.rank(allListings, emptyContext, featuredWeights)` using a dedicated featured-weights profile that emphasizes trust and recency.
- Pagination is cursor-based, keyed on `listing_id + updated_at`.
- Default sort: `curator_picked` on first load; `trust_weighted` on filter interaction.

## 5. Event Signatures

- `marketplace.browse.opened` payload: `{ filter, sort }`
- `marketplace.browse.listing_clicked` payload: `{ listing_id, position: number }`
- `marketplace.browse.filter_changed` payload: `{ previous: BrowseFilter, next: BrowseFilter }`

## 6. File Path Convention

- Canvas root: `app/marketplace/browse/BrowseCanvas.tsx`
- Category nav: `app/marketplace/browse/CategoryNav.tsx`
- Vendor filter: `app/marketplace/browse/VendorFilter.tsx`
- Featured: `app/marketplace/browse/FeaturedAgents.tsx`
- Card: `app/marketplace/browse/ListingCard.tsx`
- Types: `app/marketplace/browse/types.ts`

## 7. Naming Convention

- Sort kinds: lowercase `snake_case` single-word-pair literals.
- Filter field names: match `AgentListing` schema field names.
- Component files: `PascalCase.tsx`.

## 8. Error Handling

- Catalog fetch failure: render a subdued "Unable to load listings, retry" inline component; preserve last-known results if available.
- Empty filter result set: render an encouraging empty-state with a prompt to broaden filters or visit Featured.
- Slow fetch (>1s): render skeleton cards matching `pageSize` dimensions; fade in once data arrives.

## 9. Testing Surface

- Grid render: mock 24 listings, assert 24 cards render with accurate data binding.
- Filter interaction: toggle a capability tag, assert `onFilterChange` invoked and result count updates.
- Featured composition: inject 6 featured listings, assert Featured section renders exactly 6.
- Empty state: return no listings for a filter, assert empty-state component mounts with the expected CTA.
- Accessibility: tab navigation reaches every card in DOM order; each card exposes `aria-label` with the listing display name.

## 10. Open Questions

- None at contract draft. Default featured-agent selection logic (curator vs algorithmic) is an Artemis strategic_decision that does not affect this contract; it is encoded in the featuredWeights parameter passed to the ranker.

## 11. Post-Hackathon Refactor Notes

- Add personalized recommendations leveraging user build history.
- Introduce collections (creator-curated bundles, e.g., "SaaS launch starter pack") as a first-class browse axis.
- Support virtualized scrolling for large result sets (10,000 plus listings).
- Integrate with Banking to show live price ticks per listing when user has enabled the live ticker preference.
