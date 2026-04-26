'use client';
//
// app/marketplace/page.tsx
//
// T7 pixel-art rebuild (2026-04-26). Wraps the existing Phanes BrowseCanvas
// and Hyperion MarketplaceSearchBar inside the
// T7MarketplacePixelShell so the marketplace web companion route inherits
// the Apollo Village night-themed shop interior aesthetic shipped by
// Helios-v2 in /play. All existing functionality preserved:
//
//   - Hyperion W2 NP P1 V4 S2 hybrid search affordance at the top routes
//     to /marketplace/search?q=... on submit.
//   - Artemis Phanes BrowseCanvas renders the demo seed catalog with the
//     same filter + sort + listing grid logic shipped in P1.
//
// HarnessShell still wraps everything so judges see the cross-pillar nav,
// the QA disclosure banner, and the canonical heading.
//

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { BrowseCanvas } from './browse/BrowseCanvas';
import type { BrowseFilter, BrowseSortOrder } from './browse/types';
import { HarnessShell } from '../_harness/HarnessShell';
import { MarketplaceSearchBar } from '../../src/components/marketplace/MarketplaceSearchBar';
import { T7MarketplacePixelShell } from '../../src/components/marketplace/T7MarketplacePixelShell';

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
      <T7MarketplacePixelShell
        eyebrow="Marketplace stall, Apollo Village"
        heading="Browse the storefront"
        tagline="Pixel-art companion view of the in-game marketplace. The same Hyperion search and Phanes catalog power the canonical surface inside /play."
      >
        <div className="t7-marketplace-search-frame">
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
      </T7MarketplacePixelShell>
    </HarnessShell>
  );
}
