'use client';

//
// src/components/marketplace/MarketplaceSearchResults.tsx
//
// Owner: Hyperion (W2 NP P1 V4 S2).
//
// Render the items returned by ``GET /v1/marketplace/search`` as a
// responsive 1-2-3 column grid (mobile-first). Three states:
//   - loading   -> skeleton grid (6 placeholder cards).
//   - empty     -> empty-state illustration + reset CTA.
//   - populated -> grid of ListingPublic cards with trust badge,
//                  category pill, and price hint.
//
// The card is intentionally lightweight (~140 LOC of styles) and does
// NOT depend on the existing Artemis ListingCard (that one consumes
// the mock-catalog AgentListing shape, not the live ListingPublic
// projection). Coexistence is fine: Artemis renders mock browse,
// Hyperion S2 renders live search.
//
// No em dash, no emoji.
//

import {
  type CSSProperties,
  type ReactElement,
} from 'react';

// ---------------------------------------------------------------------------
// Wire types: 1:1 mirror of src/backend/models/marketplace_listing.py
// ListingPublic so a renamed field on the backend surfaces as a tsc
// error here, not a silent UI break.
// ---------------------------------------------------------------------------

export interface ListingPublic {
  id: string;
  creator_user_id: string;
  category: string;
  subtype: string;
  slug: string | null;
  title: string;
  short_description: string | null;
  capability_tags: string[];
  license: string;
  pricing_model: string;
  pricing_details: Record<string, unknown>;
  thumbnail_r2_key: string | null;
  trust_score_cached: number | null;
  status: string;
  version: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface SearchResultsResponse {
  items: ListingPublic[];
  fused_scores: number[];
  total_candidate_count: number;
  query_embedding_source: 'voyage' | 'openai' | 'deterministic';
  embedding_is_fallback: boolean;
  next_cursor: string | null;
  has_more: boolean;
}

export interface MarketplaceSearchResultsProps {
  /** Loaded result set, or null while the parent is fetching. */
  response: SearchResultsResponse | null;
  /** True while the parent is awaiting the search. */
  isLoading: boolean;
  /** Wire-level error from the parent. */
  errorMessage?: string | null;
  /** Click handler. Receives the listing id. */
  onListingClick?: (listingId: string) => void;
  /** Reset CTA handler invoked from the empty state. */
  onResetFilters?: () => void;
}

// ---------------------------------------------------------------------------
// Trust band derivation (mirrors src/backend/trust/score.py thresholds).
// ---------------------------------------------------------------------------

type TrustBand = 'unverified' | 'emerging' | 'established' | 'trusted' | 'elite';

const TRUST_BAND_LABEL: Record<TrustBand, string> = {
  unverified: 'Unverified',
  emerging: 'Emerging',
  established: 'Established',
  trusted: 'Trusted',
  elite: 'Elite',
};

function deriveTrustBand(score: number | null): TrustBand {
  if (score === null) return 'unverified';
  if (score >= 0.85) return 'elite';
  if (score >= 0.6) return 'trusted';
  if (score >= 0.4) return 'established';
  if (score >= 0.2) return 'emerging';
  return 'unverified';
}

const TRUST_BAND_COLOR: Record<TrustBand, string> = {
  unverified: 'var(--color-muted, #94a3b8)',
  emerging: 'var(--color-warning, #f59e0b)',
  established: 'var(--color-info, #06b6d4)',
  trusted: 'var(--color-success, #43f5b4)',
  elite: 'var(--color-primary, #06b6d4)',
};

function formatPrice(listing: ListingPublic): string {
  const details = listing.pricing_details as { amount_usd?: number };
  if (listing.pricing_model === 'free') return 'Free';
  if (typeof details?.amount_usd === 'number') {
    return `$${details.amount_usd.toFixed(2)}`;
  }
  return listing.pricing_model.replaceAll('_', ' ');
}

function formatCategory(raw: string): string {
  return raw
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function shortenDescription(raw: string | null, max = 140): string {
  if (raw === null || raw.length === 0) return '';
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 1)}.`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const ROOT: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  fontFamily:
    'var(--font-family-body, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif)',
  color: 'var(--color-foreground, #e8e8ea)',
};

const STATUS_LINE: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.5rem',
  fontSize: 'var(--scale-xs, 0.75rem)',
  color: 'var(--color-muted, #94a3b8)',
};

const GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  gap: '1rem',
  listStyle: 'none',
  margin: 0,
  padding: 0,
};

const CARD: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  padding: '1rem',
  borderRadius: 'var(--radius-lg, 0.75rem)',
  border: '1px solid var(--color-border, #1e293b)',
  background:
    'color-mix(in oklch, var(--color-background, #0a0a0f) 85%, var(--color-foreground, #e8e8ea) 15%)',
  textAlign: 'left',
  width: '100%',
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: 'inherit',
  transition: 'border-color 120ms ease, transform 120ms ease',
};

const CARD_HEADER: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '0.5rem',
};

const CARD_TITLE: CSSProperties = {
  margin: 0,
  fontSize: 'var(--scale-base, 1rem)',
  fontWeight: 600,
  letterSpacing: '0.005em',
  color: 'var(--color-foreground, #e8e8ea)',
};

const CARD_DESC: CSSProperties = {
  margin: 0,
  fontSize: 'var(--scale-sm, 0.875rem)',
  lineHeight: 1.45,
  color: 'var(--color-muted, #94a3b8)',
};

const PILL_ROW: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.375rem',
};

const PILL_BASE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.125rem 0.5rem',
  borderRadius: '999px',
  fontSize: 'var(--scale-2xs, 0.625rem)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  border: '1px solid var(--color-border, #1e293b)',
  color: 'var(--color-muted, #94a3b8)',
  background:
    'color-mix(in oklch, var(--color-background, #0a0a0f) 90%, var(--color-foreground, #e8e8ea) 10%)',
};

const TRUST_BADGE = (band: TrustBand): CSSProperties => ({
  ...PILL_BASE,
  border: `1px solid color-mix(in oklch, ${TRUST_BAND_COLOR[band]} 50%, transparent)`,
  color: TRUST_BAND_COLOR[band],
});

const FOOTER: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.5rem',
  marginTop: '0.25rem',
};

const PRICE: CSSProperties = {
  fontSize: 'var(--scale-sm, 0.875rem)',
  fontWeight: 600,
  color: 'var(--color-foreground, #e8e8ea)',
};

const SKELETON: CSSProperties = {
  ...CARD,
  cursor: 'default',
  height: '11rem',
  animation: 'hyperion-search-pulse 1.4s ease-in-out infinite',
};

const EMPTY: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.5rem',
  padding: '3rem 1.5rem',
  textAlign: 'center',
  borderRadius: 'var(--radius-lg, 0.75rem)',
  border: '1px dashed var(--color-border, #1e293b)',
};

const RESET_BUTTON: CSSProperties = {
  appearance: 'none',
  background:
    'color-mix(in oklch, var(--color-primary, #06b6d4) 18%, transparent)',
  border:
    '1px solid color-mix(in oklch, var(--color-primary, #06b6d4) 45%, transparent)',
  color: 'var(--color-primary, #06b6d4)',
  borderRadius: 'var(--radius-md, 0.5rem)',
  padding: '0.5rem 1rem',
  fontFamily: 'inherit',
  fontSize: 'var(--scale-sm, 0.875rem)',
  cursor: 'pointer',
};

const ALERT: CSSProperties = {
  padding: '1rem',
  borderRadius: 'var(--radius-lg, 0.75rem)',
  border:
    '1px solid color-mix(in oklch, var(--color-critical, #ef4444) 40%, transparent)',
  background:
    'color-mix(in oklch, var(--color-critical, #ef4444) 8%, transparent)',
  color: 'var(--color-critical, #ef4444)',
  fontSize: 'var(--scale-sm, 0.875rem)',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MarketplaceSearchResults(
  props: MarketplaceSearchResultsProps,
): ReactElement {
  const { response, isLoading, errorMessage, onListingClick, onResetFilters } =
    props;

  if (errorMessage) {
    return (
      <div style={ROOT}>
        <div role="alert" style={ALERT}>
          {errorMessage}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={ROOT}>
        <style>{`@keyframes hyperion-search-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }`}</style>
        <ul style={GRID} role="list" aria-busy="true" aria-label="Loading search results">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} style={SKELETON} />
          ))}
        </ul>
      </div>
    );
  }

  const items = response?.items ?? [];
  if (items.length === 0) {
    return (
      <div style={ROOT}>
        <div role="status" aria-live="polite" style={EMPTY}>
          <h3 style={{ margin: 0, fontSize: 'var(--scale-lg, 1.125rem)' }}>
            No listings match this query
          </h3>
          <p style={{ margin: 0, color: 'var(--color-muted, #94a3b8)' }}>
            Try a broader query, drop a filter, or clear all filters to see the
            full catalogue.
          </p>
          {onResetFilters && (
            <button
              type="button"
              style={RESET_BUTTON}
              onClick={onResetFilters}
              aria-label="Reset all filters"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>
    );
  }

  const result_summary =
    `${items.length} listing${items.length === 1 ? '' : 's'}` +
    (response && response.has_more ? ' (more available)' : '');

  const embedding_note = response?.embedding_is_fallback
    ? 'embedding via OpenAI fallback'
    : response
      ? `embedding via ${response.query_embedding_source}`
      : '';

  return (
    <div style={ROOT}>
      <div style={STATUS_LINE} aria-live="polite">
        <span>{result_summary}</span>
        {embedding_note && <span>{embedding_note}</span>}
      </div>

      <ul style={GRID} role="list" aria-label="Marketplace search results">
        {items.map((listing, index) => {
          const band = deriveTrustBand(listing.trust_score_cached);
          const fused = response?.fused_scores?.[index];
          return (
            <li key={listing.id} style={{ display: 'flex' }}>
              <button
                type="button"
                style={CARD}
                onClick={() => onListingClick?.(listing.id)}
                aria-label={`Open ${listing.title}, ${formatCategory(listing.category)} listing`}
              >
                <div style={CARD_HEADER}>
                  <h3 style={CARD_TITLE}>{listing.title}</h3>
                  <span style={TRUST_BADGE(band)}>{TRUST_BAND_LABEL[band]}</span>
                </div>
                <p style={CARD_DESC}>
                  {shortenDescription(listing.short_description)}
                </p>
                <div style={PILL_ROW} aria-label="Capability tags">
                  <span style={PILL_BASE}>{formatCategory(listing.category)}</span>
                  <span style={PILL_BASE}>{formatCategory(listing.subtype)}</span>
                  {listing.capability_tags.slice(0, 3).map((tag) => (
                    <span key={tag} style={PILL_BASE}>
                      {tag.replaceAll('_', ' ')}
                    </span>
                  ))}
                </div>
                <div style={FOOTER}>
                  <span style={PRICE}>{formatPrice(listing)}</span>
                  {fused !== undefined && (
                    <span style={PILL_BASE}>RRF {fused.toFixed(3)}</span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default MarketplaceSearchResults;
