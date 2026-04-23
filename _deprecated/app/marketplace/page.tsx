'use client';
//
// app/marketplace/page.tsx
//
// Nemea Phase 5 QA emergency harness (2026-04-22). Renders the Artemis
// BrowseCanvas against the shipped Artemis demo-seed catalog. Props managed
// as local state because the canonical BrowseCanvasProps surface expects
// filter, sort, and change callbacks to be owned by the parent.
//

import { useState } from 'react';
import { BrowseCanvas } from './browse/BrowseCanvas';
import type { BrowseFilter, BrowseSortOrder } from './browse/types';
import { HarnessShell } from '../_harness/HarnessShell';

export default function MarketplacePage() {
  const [filter, setFilter] = useState<BrowseFilter>({});
  const [sort, setSort] = useState<BrowseSortOrder>({ kind: 'curator_picked' });

  return (
    <HarnessShell
      heading="Marketplace"
      sub="Open cross-vendor storefront for AI agents. Every listing here is demo seed data authored for the NERIUM hackathon prototype, not a live marketplace entry."
    >
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
