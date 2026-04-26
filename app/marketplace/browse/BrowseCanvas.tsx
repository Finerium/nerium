// app/marketplace/browse/BrowseCanvas.tsx
//
// NERIUM Marketplace browse surface: main browse canvas.
// Conforms to docs/contracts/browse_ui.contract.md v0.1.0 Section 3 and
// Section 4. Authoring agent: Artemis (P3a Marketplace Worker, Browse).
//
// Layout: left sidebar holds CategoryNav, VendorFilter, clear-all button.
// Top rail holds FeaturedAgents (curator-picked). Main pane holds the
// sort control plus the listing grid. States covered: skeleton, empty,
// error, populated.
//
// Contract-vs-VendorFilter reconciliation: BrowseFilter.vendor_origin is a
// single optional vendor; VendorFilterProps.selected is multi-select.
// Resolution is that multi-vendor selection is a local UI affordance. The
// canvas keeps selected vendors in local state, applies them as a
// client-side OR filter within the vendor axis, and only syncs the
// single-vendor slot on BrowseFilter when exactly one vendor is picked.
// See artemis.decisions.md ADR-02.

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  VENDOR_ORIGINS,
  CAPABILITY_TAGS,
  type AgentListing,
  type CapabilityTag,
  type VendorOrigin,
} from '../schema/listing.schema';
import type {
  BrowseCanvasProps,
  BrowseSortOrder,
} from './types';
import {
  BROWSE_EVENT_TOPICS,
  CAPABILITY_LABELS,
  VENDOR_LABELS,
  PRICING_LABELS,
} from './types';
import { CategoryNav } from './CategoryNav';
import { VendorFilter } from './VendorFilter';
import { FeaturedAgents } from './FeaturedAgents';
import { ListingCard } from './ListingCard';
import {
  mockCatalog,
  listByExtended,
  getCuratedFeatured,
  getTrustBandForListing,
  DEMO_SEED_NOTICE,
} from './mock_catalog';

const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  padding: '1.5rem',
  backgroundColor: 'var(--color-background, #0a0a0f)',
  color: 'var(--color-foreground, #e8e8ea)',
  minHeight: '100vh',
  fontFamily:
    'var(--font-family-body, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif)',
};

const layoutStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 260px) 1fr',
  gap: '1.5rem',
  alignItems: 'start',
};

const sidebarStyle: CSSProperties = {
  position: 'sticky',
  top: '1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.25rem',
  padding: '1rem',
  borderRadius: 'var(--radius-lg, 0.75rem)',
  border: '1px solid var(--color-border, #1e293b)',
  backgroundColor:
    'color-mix(in oklch, var(--color-background, #0a0a0f) 90%, var(--color-foreground, #e8e8ea) 10%)',
};

const mainStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  minWidth: 0,
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  gap: '1rem',
};

const skeletonStyle: CSSProperties = {
  ...gridStyle,
};

const skeletonItemStyle: CSSProperties = {
  height: '11rem',
  borderRadius: 'var(--radius-lg, 0.75rem)',
  border: '1px solid var(--color-border, #1e293b)',
  backgroundColor:
    'color-mix(in oklch, var(--color-background, #0a0a0f) 85%, var(--color-foreground, #e8e8ea) 15%)',
  animation: 'nerium-browse-pulse 1.4s ease-in-out infinite',
};

const SORT_OPTIONS: BrowseSortOrder['kind'][] = [
  'curator_picked',
  'trust_weighted',
  'recent',
  'popular',
];

const SORT_LABELS: Record<BrowseSortOrder['kind'], string> = {
  curator_picked: 'Curator picks',
  trust_weighted: 'Trust weighted',
  recent: 'Recently updated',
  popular: 'Most popular',
};

const PRICING_FILTER_OPTIONS = ['free', 'cheap', 'mid', 'premium'] as const;

function dispatchBrowseEvent(
  topic: (typeof BROWSE_EVENT_TOPICS)[keyof typeof BROWSE_EVENT_TOPICS],
  detail: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(topic, { detail }));
}

function pageSlice<T>(items: T[], pageSize: number): T[] {
  return items.slice(0, pageSize);
}

function humanizeError(error: unknown): string {
  if (!error) return 'Unable to load listings.';
  if (error instanceof Error) return error.message;
  return String(error);
}

export function BrowseCanvas(props: BrowseCanvasProps) {
  const {
    filter,
    sort,
    onFilterChange,
    onSortChange,
    onListingClick,
    pageSize = 24,
  } = props;

  const [allListings, setAllListings] = useState<AgentListing[]>([]);
  const [visibleListings, setVisibleListings] = useState<AgentListing[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVendors, setSelectedVendors] = useState<VendorOrigin[]>(
    filter.vendor_origin ? [filter.vendor_origin] : [],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    mockCatalog
      .listBy({})
      .then((rows) => {
        if (cancelled) return;
        setAllListings(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(humanizeError(e));
        setAllListings([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    listByExtended(
      {
        capability_tag: filter.capability_tag,
        pricing_tier: filter.pricing_tier,
      },
      selectedVendors.length > 0 ? selectedVendors : null,
      sort.kind,
    )
      .then((rows) => {
        if (cancelled) return;
        setVisibleListings(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(humanizeError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [filter.capability_tag, filter.pricing_tier, selectedVendors, sort.kind]);

  useEffect(() => {
    dispatchBrowseEvent(BROWSE_EVENT_TOPICS.opened, { filter, sort });
    // Intentionally fire only once on mount per contract Section 5.

  }, []);

  const capabilityCounts = useMemo(() => {
    const base = CAPABILITY_TAGS.map((tag) => ({
      tag,
      display_label: CAPABILITY_LABELS[tag],
      count: allListings.filter((l) => l.capability_tags.includes(tag)).length,
    }));
    return base.filter((c) => c.count > 0);
  }, [allListings]);

  const vendorCounts = useMemo(() => {
    const base = VENDOR_ORIGINS.map((v) => ({
      vendor: v,
      display_label: VENDOR_LABELS[v],
      count: allListings.filter((l) => l.vendor_origin === v).length,
    }));
    return base.filter((v) => v.count > 0);
  }, [allListings]);

  const featured = useMemo(() => getCuratedFeatured(6), []);

  // Contract Section 4: "Default sort: curator_picked on first load;
  // trust_weighted on filter interaction." The helper below switches the
  // sort exactly once, on the first filter interaction of the session, and
  // only if the sort is still at the initial curator_picked default. After
  // the first transition the ref latches so an explicit user sort pick is
  // never overwritten by a subsequent filter change.
  const hasFilteredRef = useRef(false);
  const maybeSwitchDefaultSort = useCallback(() => {
    if (hasFilteredRef.current) return;
    hasFilteredRef.current = true;
    if (sort.kind === 'curator_picked') {
      onSortChange({ kind: 'trust_weighted' });
    }
  }, [sort.kind, onSortChange]);

  const handleTagSelect = useCallback(
    (tag: CapabilityTag | undefined) => {
      const previous = { ...filter };
      const next = { ...filter, capability_tag: tag };
      onFilterChange(next);
      dispatchBrowseEvent(BROWSE_EVENT_TOPICS.filter_changed, { previous, next });
      maybeSwitchDefaultSort();
    },
    [filter, onFilterChange, maybeSwitchDefaultSort],
  );

  const handleVendorToggle = useCallback(
    (vendor: VendorOrigin) => {
      setSelectedVendors((prev) => {
        const nextSelected = prev.includes(vendor)
          ? prev.filter((v) => v !== vendor)
          : [...prev, vendor];
        const previousFilter = { ...filter };
        let nextFilter = { ...filter };
        if (nextSelected.length === 1) {
          nextFilter = { ...filter, vendor_origin: nextSelected[0] };
        } else {
          nextFilter = { ...filter, vendor_origin: undefined };
        }
        onFilterChange(nextFilter);
        dispatchBrowseEvent(BROWSE_EVENT_TOPICS.filter_changed, {
          previous: previousFilter,
          next: nextFilter,
        });
        return nextSelected;
      });
      maybeSwitchDefaultSort();
    },
    [filter, onFilterChange, maybeSwitchDefaultSort],
  );

  const handlePricingSelect = useCallback(
    (tier: BrowseCanvasProps['filter']['pricing_tier'] | undefined) => {
      const previous = { ...filter };
      const next = { ...filter, pricing_tier: tier };
      onFilterChange(next);
      dispatchBrowseEvent(BROWSE_EVENT_TOPICS.filter_changed, { previous, next });
      maybeSwitchDefaultSort();
    },
    [filter, onFilterChange, maybeSwitchDefaultSort],
  );

  const handleClearAll = useCallback(() => {
    const previous = { ...filter };
    const next = {};
    setSelectedVendors([]);
    onFilterChange(next);
    onSortChange({ kind: 'curator_picked' });
    dispatchBrowseEvent(BROWSE_EVENT_TOPICS.filter_changed, { previous, next });
  }, [filter, onFilterChange, onSortChange]);

  const handleListingClick = useCallback(
    (listing_id: string, position: number) => {
      onListingClick(listing_id);
      dispatchBrowseEvent(BROWSE_EVENT_TOPICS.listing_clicked, {
        listing_id,
        position,
      });
    },
    [onListingClick],
  );

  const handleSortChange = useCallback(
    (kind: BrowseSortOrder['kind']) => {
      onSortChange({ kind });
    },
    [onSortChange],
  );

  const hasAnyFilter =
    Boolean(filter.capability_tag) ||
    Boolean(filter.pricing_tier) ||
    selectedVendors.length > 0 ||
    sort.kind !== 'curator_picked';

  const paged = pageSlice(visibleListings, pageSize);

  return (
    <div style={rootStyle}>
      <style>{`
        @keyframes nerium-browse-pulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
        .nerium-browse-card-hover:hover {
          transform: translateY(-2px);
          border-color: var(--color-ring, #06b6d4);
        }
        .nerium-browse-card-hover:focus-visible {
          outline: 2px solid var(--color-ring, #06b6d4);
          outline-offset: 2px;
        }
      `}</style>

      {/* Helios-v2 W3 S10: marketplace hero banner using AI-generated PNG. */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          minHeight: '180px',
          maxHeight: '260px',
          overflow: 'hidden',
          borderRadius: 'var(--radius-lg, 0.75rem)',
          backgroundImage: 'url(/assets/ai/ui/marketplace/marketplace_hero_banner.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          aspectRatio: '4 / 1',
          // Inset gradient overlay to keep header text readable.
          boxShadow: 'inset 0 0 0 9999px rgba(10, 10, 15, 0.45)',
        }}
        aria-hidden="true"
        data-helios-s10="marketplace-hero-banner"
      />

      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <h1
          style={{
            fontSize: 'var(--scale-3xl, 1.875rem)',
            lineHeight: 'var(--line-height-tight, 1.2)',
            fontWeight: 700,
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          Marketplace
        </h1>
        <p
          style={{
            fontSize: 'var(--scale-sm, 0.875rem)',
            margin: 0,
            color: 'var(--color-muted, #94a3b8)',
            maxWidth: '64ch',
          }}
        >
          Cross-vendor agent discovery. {DEMO_SEED_NOTICE}
        </p>
      </header>

      <FeaturedAgents featured={featured} onListingClick={(id) => handleListingClick(id, -1)} />

      <div style={layoutStyle}>
        <aside aria-label="Browse filters" style={sidebarStyle}>
          <CategoryNav
            capabilities={capabilityCounts}
            activeTag={filter.capability_tag}
            onTagSelect={handleTagSelect}
          />

          <VendorFilter
            vendors={vendorCounts}
            selected={selectedVendors}
            onToggle={handleVendorToggle}
          />

          <fieldset
            aria-label="Filter by pricing tier"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.125rem',
              margin: 0,
              padding: 0,
              border: 'none',
            }}
          >
            <legend
              style={{
                fontSize: 'var(--scale-xs, 0.75rem)',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-muted, #94a3b8)',
                marginBottom: '0.5rem',
                padding: 0,
              }}
            >
              Pricing tier
            </legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
              <button
                type="button"
                onClick={() => handlePricingSelect(undefined)}
                aria-pressed={filter.pricing_tier === undefined}
                style={{
                  padding: '0.25rem 0.625rem',
                  borderRadius: 'var(--radius-pill, 9999px)',
                  border: `1px solid ${
                    filter.pricing_tier === undefined
                      ? 'color-mix(in oklch, var(--color-primary, #06b6d4) 45%, transparent)'
                      : 'var(--color-border, #1e293b)'
                  }`,
                  backgroundColor:
                    filter.pricing_tier === undefined
                      ? 'color-mix(in oklch, var(--color-primary, #06b6d4) 18%, transparent)'
                      : 'transparent',
                  color:
                    filter.pricing_tier === undefined
                      ? 'var(--color-primary, #06b6d4)'
                      : 'var(--color-foreground, #e8e8ea)',
                  cursor: 'pointer',
                  font: 'inherit',
                  fontSize: 'var(--scale-xs, 0.75rem)',
                }}
              >
                Any
              </button>
              {PRICING_FILTER_OPTIONS.map((tier) => {
                const isActive = filter.pricing_tier === tier;
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => handlePricingSelect(tier)}
                    aria-pressed={isActive}
                    style={{
                      padding: '0.25rem 0.625rem',
                      borderRadius: 'var(--radius-pill, 9999px)',
                      border: `1px solid ${
                        isActive
                          ? 'color-mix(in oklch, var(--color-primary, #06b6d4) 45%, transparent)'
                          : 'var(--color-border, #1e293b)'
                      }`,
                      backgroundColor: isActive
                        ? 'color-mix(in oklch, var(--color-primary, #06b6d4) 18%, transparent)'
                        : 'transparent',
                      color: isActive
                        ? 'var(--color-primary, #06b6d4)'
                        : 'var(--color-foreground, #e8e8ea)',
                      cursor: 'pointer',
                      font: 'inherit',
                      fontSize: 'var(--scale-xs, 0.75rem)',
                    }}
                  >
                    {PRICING_LABELS[tier]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={handleClearAll}
            disabled={!hasAnyFilter}
            aria-label="Clear all filters"
            style={{
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              borderRadius: 'var(--radius-md, 0.5rem)',
              border: '1px solid var(--color-border, #1e293b)',
              backgroundColor: 'transparent',
              color: hasAnyFilter
                ? 'var(--color-foreground, #e8e8ea)'
                : 'var(--color-muted, #64748b)',
              cursor: hasAnyFilter ? 'pointer' : 'not-allowed',
              font: 'inherit',
              fontSize: 'var(--scale-xs, 0.75rem)',
              opacity: hasAnyFilter ? 1 : 0.5,
            }}
          >
            Clear all filters
          </button>
        </aside>

        <main style={mainStyle}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div
              aria-live="polite"
              style={{
                fontSize: 'var(--scale-sm, 0.875rem)',
                color: 'var(--color-muted, #94a3b8)',
              }}
            >
              {loading
                ? 'Loading listings...'
                : `${visibleListings.length} listing${
                    visibleListings.length === 1 ? '' : 's'
                  }${visibleListings.length > pageSize ? ` (showing ${pageSize})` : ''}`}
            </div>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: 'var(--scale-xs, 0.75rem)',
                color: 'var(--color-muted, #94a3b8)',
              }}
            >
              <span>Sort by</span>
              <select
                value={sort.kind}
                onChange={(e) => handleSortChange(e.target.value as BrowseSortOrder['kind'])}
                aria-label="Sort order"
                style={{
                  padding: '0.375rem 0.5rem',
                  borderRadius: 'var(--radius-md, 0.5rem)',
                  border: '1px solid var(--color-border, #1e293b)',
                  backgroundColor: 'var(--color-background, #0a0a0f)',
                  color: 'var(--color-foreground, #e8e8ea)',
                  fontSize: 'var(--scale-sm, 0.875rem)',
                  font: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {SORT_LABELS[opt]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && !loading && (
            <div
              role="alert"
              style={{
                padding: '1rem',
                borderRadius: 'var(--radius-lg, 0.75rem)',
                border:
                  '1px solid color-mix(in oklch, var(--color-critical, #ef4444) 40%, transparent)',
                backgroundColor:
                  'color-mix(in oklch, var(--color-critical, #ef4444) 8%, transparent)',
                color: 'var(--color-critical, #ef4444)',
                fontSize: 'var(--scale-sm, 0.875rem)',
              }}
            >
              Unable to load listings, retry. {error}
            </div>
          )}

          {loading && (
            <ul
              role="list"
              aria-busy="true"
              style={{ listStyle: 'none', margin: 0, padding: 0, ...skeletonStyle }}
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} style={skeletonItemStyle} />
              ))}
            </ul>
          )}

          {!loading && !error && visibleListings.length === 0 && (
            <EmptyState onClearAll={handleClearAll} />
          )}

          {!loading && !error && visibleListings.length > 0 && (
            <ul
              role="list"
              style={{ listStyle: 'none', margin: 0, padding: 0, ...gridStyle }}
            >
              {paged.map((listing, index) => (
                <li key={listing.listing_id} style={{ display: 'flex' }}>
                  <div className="nerium-browse-card-hover" style={{ width: '100%', display: 'flex' }}>
                    <ListingCard
                      listing={listing}
                      onClick={(id) => handleListingClick(id, index)}
                      trust_band_hint={getTrustBandForListing(listing)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyState({ onClearAll }: { onClearAll: () => void }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        borderRadius: 'var(--radius-lg, 0.75rem)',
        border: '1px dashed var(--color-border, #1e293b)',
        // Helios-v2 W3 S10: marketplace empty-state hero illustration.
        backgroundImage:
          'linear-gradient(0deg, rgba(10, 10, 15, 0.78), rgba(10, 10, 15, 0.78)), url(/assets/ai/ui/marketplace/marketplace_empty_state.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        minHeight: '320px',
        backgroundColor:
          'color-mix(in oklch, var(--color-background, #0a0a0f) 95%, var(--color-foreground, #e8e8ea) 5%)',
      }}
    >
      <h3
        style={{
          fontSize: 'var(--scale-lg, 1.125rem)',
          fontWeight: 600,
          margin: 0,
          color: 'var(--color-foreground, #e8e8ea)',
        }}
      >
        No listings match these filters
      </h3>
      <p
        style={{
          fontSize: 'var(--scale-sm, 0.875rem)',
          margin: 0,
          color: 'var(--color-muted, #94a3b8)',
          maxWidth: '48ch',
        }}
      >
        Try broadening the capability, vendor, or pricing tier. Or visit the
        featured rail above for curator picks.
      </p>
      <button
        type="button"
        onClick={onClearAll}
        style={{
          padding: '0.5rem 1rem',
          borderRadius: 'var(--radius-md, 0.5rem)',
          border:
            '1px solid color-mix(in oklch, var(--color-primary, #06b6d4) 45%, transparent)',
          backgroundColor:
            'color-mix(in oklch, var(--color-primary, #06b6d4) 18%, transparent)',
          color: 'var(--color-primary, #06b6d4)',
          cursor: 'pointer',
          font: 'inherit',
          fontSize: 'var(--scale-sm, 0.875rem)',
        }}
      >
        Clear filters
      </button>
    </div>
  );
}

export default BrowseCanvas;
