// app/marketplace/browse/FeaturedAgents.tsx
//
// NERIUM Marketplace browse surface: featured-agents rail.
// Conforms to docs/contracts/browse_ui.contract.md v0.1.0 Section 3 and
// Section 6. Authoring agent: Artemis (P3a Marketplace Worker, Browse).
//
// Curator-picked rail per Demeter's featured_default_policy and per the
// Artemis strategic_decision_hard_stop recommendation ("curated for demo
// quality control"). The section is visually distinct from the main grid
// so buyers can skim top picks without losing taxonomy context.
//
// Honest-claim filter per NarasiGhaisan Section 20 and hard_constraints:
// this rail does not display fabricated usage counts or user testimonials.
// A subdued "demo seed" disclaimer is rendered beneath the heading so judges
// and reviewers see explicit scope transparency.

'use client';

import type { CSSProperties } from 'react';
import type { FeaturedAgentsProps } from './types';
import { ListingCard } from './ListingCard';
import { getTrustBandForListing } from './mock_catalog';

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  gap: '1rem',
};

export function FeaturedAgents({ featured, onListingClick }: FeaturedAgentsProps) {
  const clamped = featured.slice(0, 6);
  const visibleCount = clamped.length;

  if (visibleCount === 0) {
    return null;
  }

  return (
    <section aria-labelledby="featured-agents-heading" style={sectionStyle}>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <h2
            id="featured-agents-heading"
            style={{
              fontSize: 'var(--scale-xl, 1.25rem)',
              fontWeight: 600,
              lineHeight: 'var(--line-height-tight, 1.2)',
              margin: 0,
              color: 'var(--color-foreground, #e8e8ea)',
            }}
          >
            Featured agents
          </h2>
          <p
            style={{
              fontSize: 'var(--scale-xs, 0.75rem)',
              margin: 0,
              color: 'var(--color-muted, #94a3b8)',
            }}
          >
            Curator-picked rail, demo seed data for the hackathon prototype.
          </p>
        </div>
        <span
          aria-label="Featured count"
          style={{
            fontSize: 'var(--scale-xs, 0.75rem)',
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--color-muted, #94a3b8)',
            padding: '0.25rem 0.5rem',
            border: '1px solid var(--color-border, #1e293b)',
            borderRadius: 'var(--radius-pill, 9999px)',
          }}
        >
          {visibleCount} picks
        </span>
      </header>
      <ul
        role="list"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          ...gridStyle,
        }}
      >
        {clamped.map((listing) => (
          <li key={listing.listing_id} style={{ display: 'flex' }}>
            <ListingCard
              listing={listing}
              onClick={onListingClick}
              featured
              trust_band_hint={getTrustBandForListing(listing)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
