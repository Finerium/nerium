// app/marketplace/browse/ListingCard.tsx
//
// NERIUM Marketplace browse surface: single-listing card.
// Conforms to docs/contracts/browse_ui.contract.md v0.1.0 Section 6 File Path
// Convention (ListingCard.tsx). Authoring agent: Artemis (P3a Marketplace
// Worker, Browse).
//
// This component is the grid unit used by BrowseCanvas and FeaturedAgents.
// Phoebe's IdentityCard (docs/contracts/identity_card.contract.md) will
// later compose inside the creator strip; today we render a trust band
// hint and a vendor origin badge directly so the browse grid renders
// end-to-end before P3b Registry lands.

'use client';

import {
  useCallback,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import type { AgentListing } from '../schema/listing.schema';
import {
  CAPABILITY_LABELS,
  VENDOR_LABELS,
  PRICING_LABELS,
  type ListingCardProps,
} from './types';

const cardShell: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  padding: '1rem',
  borderRadius: 'var(--radius-lg, 0.75rem)',
  border: '1px solid var(--color-border, #1e293b)',
  backgroundColor: 'color-mix(in oklch, var(--color-background, #0a0a0f) 92%, var(--color-foreground, #e8e8ea) 8%)',
  color: 'var(--color-foreground, #e8e8ea)',
  cursor: 'pointer',
  transition: 'transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease',
  textAlign: 'left',
  width: '100%',
  font: 'inherit',
};

const badgeBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.125rem 0.5rem',
  borderRadius: 'var(--radius-pill, 9999px)',
  fontSize: '0.7rem',
  lineHeight: 1,
  fontWeight: 500,
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
};

const pricingStyle: Record<string, CSSProperties> = {
  free: {
    ...badgeBase,
    backgroundColor: 'color-mix(in oklch, var(--color-success, #10b981) 22%, transparent)',
    color: 'var(--color-success, #10b981)',
    border: '1px solid color-mix(in oklch, var(--color-success, #10b981) 35%, transparent)',
  },
  cheap: {
    ...badgeBase,
    backgroundColor: 'color-mix(in oklch, var(--color-primary, #06b6d4) 18%, transparent)',
    color: 'var(--color-primary, #06b6d4)',
    border: '1px solid color-mix(in oklch, var(--color-primary, #06b6d4) 35%, transparent)',
  },
  mid: {
    ...badgeBase,
    backgroundColor: 'color-mix(in oklch, var(--color-secondary, #a855f7) 18%, transparent)',
    color: 'var(--color-secondary, #a855f7)',
    border: '1px solid color-mix(in oklch, var(--color-secondary, #a855f7) 35%, transparent)',
  },
  premium: {
    ...badgeBase,
    backgroundColor: 'color-mix(in oklch, var(--color-accent, #ec4899) 22%, transparent)',
    color: 'var(--color-accent, #ec4899)',
    border: '1px solid color-mix(in oklch, var(--color-accent, #ec4899) 35%, transparent)',
  },
};

const TRUST_BAND_LABEL: Record<NonNullable<ListingCardProps['trust_band_hint']>, string> = {
  unverified: 'Unverified',
  emerging: 'Emerging',
  established: 'Established',
  trusted: 'Trusted',
  elite: 'Elite',
};

function TrustBandPill({
  band,
}: {
  band: NonNullable<ListingCardProps['trust_band_hint']>;
}) {
  const accentByBand: Record<string, string> = {
    unverified: 'var(--color-muted, #64748b)',
    emerging: 'var(--color-warning, #f59e0b)',
    established: 'var(--color-primary, #06b6d4)',
    trusted: 'var(--color-secondary, #a855f7)',
    elite: 'var(--color-accent, #ec4899)',
  };
  const color = accentByBand[band];
  return (
    <span
      style={{
        ...badgeBase,
        backgroundColor: `color-mix(in oklch, ${color} 18%, transparent)`,
        color,
        border: `1px solid color-mix(in oklch, ${color} 35%, transparent)`,
      }}
      aria-label={`Trust band ${TRUST_BAND_LABEL[band]}`}
    >
      {TRUST_BAND_LABEL[band]}
    </span>
  );
}

function CapabilityChip({ tag }: { tag: AgentListing['capability_tags'][number] }) {
  return (
    <span
      style={{
        ...badgeBase,
        backgroundColor: 'color-mix(in oklch, var(--color-foreground, #e8e8ea) 8%, transparent)',
        color: 'var(--color-foreground, #e8e8ea)',
        border: '1px solid var(--color-border, #1e293b)',
      }}
    >
      {CAPABILITY_LABELS[tag]}
    </span>
  );
}

function VendorBadge({ vendor }: { vendor: AgentListing['vendor_origin'] }) {
  return (
    <span
      style={{
        ...badgeBase,
        backgroundColor: 'transparent',
        color: 'var(--color-muted, #94a3b8)',
        border: '1px solid var(--color-border, #1e293b)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontSize: '0.65rem',
      }}
      aria-label={`Vendor origin ${VENDOR_LABELS[vendor]}`}
    >
      {VENDOR_LABELS[vendor]}
    </span>
  );
}

function formatCostHint(listing: AgentListing): string {
  const { per_execution_unit, estimate_range } = listing.usage_cost_hint;
  if (estimate_range.low_usd === 0 && estimate_range.high_usd === 0) {
    return `$0.00 per ${per_execution_unit}`;
  }
  const low = estimate_range.low_usd.toFixed(estimate_range.low_usd < 0.1 ? 3 : 2);
  const high = estimate_range.high_usd.toFixed(estimate_range.high_usd < 0.1 ? 3 : 2);
  return `$${low} to $${high} per ${per_execution_unit}`;
}

export function ListingCard({
  listing,
  onClick,
  trust_band_hint,
  featured = false,
}: ListingCardProps) {
  const handleClick = useCallback(() => {
    onClick(listing.listing_id);
  }, [onClick, listing.listing_id]);

  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick(listing.listing_id);
      }
    },
    [onClick, listing.listing_id],
  );

  const visibleTags = listing.capability_tags.slice(0, 3);
  const overflowCount = listing.capability_tags.length - visibleTags.length;

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKey}
      aria-label={`Open ${listing.display_name} listing`}
      data-testid={`listing-card-${listing.listing_id}`}
      data-featured={featured ? 'true' : 'false'}
      style={{
        ...cardShell,
        boxShadow: featured
          ? '0 0 0 1px color-mix(in oklch, var(--color-accent, #ec4899) 40%, transparent), 0 8px 24px color-mix(in oklch, var(--color-accent, #ec4899) 18%, transparent)'
          : 'none',
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
          <span style={pricingStyle[listing.pricing_tier]}>
            {PRICING_LABELS[listing.pricing_tier]}
          </span>
          {trust_band_hint && <TrustBandPill band={trust_band_hint} />}
          <VendorBadge vendor={listing.vendor_origin} />
        </div>
        <h3
          style={{
            fontSize: 'var(--scale-lg, 1.125rem)',
            fontWeight: 600,
            lineHeight: 'var(--line-height-tight, 1.2)',
            margin: 0,
          }}
        >
          {listing.display_name}
        </h3>
      </header>
      <p
        style={{
          fontSize: 'var(--scale-sm, 0.875rem)',
          lineHeight: 'var(--line-height-normal, 1.5)',
          margin: 0,
          color: 'var(--color-muted, #94a3b8)',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {listing.short_description}
      </p>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.375rem',
          marginTop: 'auto',
        }}
      >
        {visibleTags.map((t) => (
          <CapabilityChip key={t} tag={t} />
        ))}
        {overflowCount > 0 && (
          <span
            style={{
              ...badgeBase,
              backgroundColor: 'transparent',
              color: 'var(--color-muted, #94a3b8)',
              border: '1px dashed var(--color-border, #1e293b)',
            }}
            aria-label={`${overflowCount} more capability tags`}
          >
            +{overflowCount}
          </span>
        )}
      </div>
      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 'var(--scale-xs, 0.75rem)',
          color: 'var(--color-muted, #94a3b8)',
        }}
      >
        <span>{formatCostHint(listing)}</span>
        <span aria-hidden="true" style={{ fontSize: '1rem' }}>
          {'>'}
        </span>
      </footer>
    </button>
  );
}
