'use client';
//
// app/marketplace/page.tsx
//
// Nemea Phase 5 QA emergency harness (2026-04-22). Renders the Artemis
// BrowseCanvas against the shipped Artemis demo-seed catalog. Props managed
// as local state because the canonical BrowseCanvasProps surface expects
// filter, sort, and change callbacks to be owned by the parent.
//
// Hyperion W2 NP P1 V4 S2 (2026-04-26): added a prominent live-search
// affordance at the top so the canonical browse landing surfaces the
// hybrid /v1/marketplace/search endpoint. Submitting from the bar
// navigates to /marketplace/search?q=... where the live results page
// owns filters, URL state, and pagination.
//

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { BrowseCanvas } from './browse/BrowseCanvas';
import type { BrowseFilter, BrowseSortOrder } from './browse/types';
import { HarnessShell } from '../_harness/HarnessShell';
import { MarketplaceSearchBar } from '../../src/components/marketplace/MarketplaceSearchBar';

export default function MarketplacePage() {
  const router = useRouter();
  const [filter, setFilter] = useState<BrowseFilter>({});
  const [sort, setSort] = useState<BrowseSortOrder>({ kind: 'curator_picked' });
  const [searchDraft, setSearchDraft] = useState<string>('');

  const handleSearchSubmit = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length === 0) return;
      const params = new URLSearchParams({ q: trimmed });
      router.push(`/marketplace/search?${params.toString()}`);
    },
    [router],
  );

  return (
    <HarnessShell
      heading="Marketplace"
      sub="Open cross-vendor storefront for AI agents. Every listing here is demo seed data authored for the NERIUM hackathon prototype, not a live marketplace entry."
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          padding: '1.5rem 1.5rem 0',
        }}
      >
        <MarketplaceSearchBar
          value={searchDraft}
          onQueryChange={setSearchDraft}
          onSubmit={handleSearchSubmit}
          placeholder="Search the marketplace. Press Enter to open hybrid search."
        />
      </div>
      <BrowseCanvas
        filter={filter}
        sort={sort}
        onFilterChange={setFilter}
        onSortChange={setSort}
        onListingClick={() => {
          /* demo: no-op */
        }}
      />
    </HarnessShell>
  );
}
