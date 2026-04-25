//
// app/marketplace/dashboard/ListingsGrid.tsx
//
// Iapetus W2 NP S2. Creator listings overview grid.
//
// Each card surfaces the executions count, revenue last 30 days, and
// average rating + review count. Status pills route to the right
// palette token so draft + archived listings read distinctly from
// published ones.
//

import Link from 'next/link';
import {
  formatUsdCents,
  type DashboardListing,
  type ListingStatus,
} from './seedData';

interface Props {
  readonly listings: ReadonlyArray<DashboardListing>;
}

const STATUS_LABELS: Record<ListingStatus, string> = {
  published: 'Live',
  draft: 'Draft',
  archived: 'Archived',
};

const STATUS_COLORS: Record<ListingStatus, string> = {
  published: 'oklch(0.78 0.16 145)',
  draft: 'oklch(0.78 0.17 80)',
  archived: 'oklch(0.55 0.05 250)',
};

export function ListingsGrid({ listings }: Props) {
  return (
    <div
      role="list"
      aria-label="Creator listings"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '16px',
      }}
    >
      {listings.map((listing) => (
        <article
          role="listitem"
          key={listing.id}
          style={{
            background: 'oklch(0.18 0.015 250)',
            border: '1px solid oklch(0.32 0.02 250)',
            borderRadius: '10px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <header style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '14px',
                lineHeight: 1.3,
                color: 'oklch(0.92 0.02 250)',
                fontFamily: 'Space Grotesk, system-ui, sans-serif',
                fontWeight: 600,
              }}
            >
              {listing.title}
            </h3>
            <span
              style={{
                flexShrink: 0,
                padding: '2px 8px',
                borderRadius: '4px',
                background: STATUS_COLORS[listing.status],
                color: 'oklch(0.14 0.012 250)',
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                height: 'fit-content',
              }}
            >
              {STATUS_LABELS[listing.status]}
            </span>
          </header>

          <div
            style={{
              fontSize: '11px',
              color: 'oklch(0.6 0.02 250)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            {listing.category.replace(/_/g, ' ')}
          </div>

          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px 16px',
              margin: 0,
            }}
          >
            <Stat label="Executions 30d" value={listing.executionsLast30d.toLocaleString('en-US')} />
            <Stat label="Revenue 30d" value={formatUsdCents(listing.revenueCentsLast30d)} accent />
            <Stat
              label="Rating"
              value={
                listing.reviewCount > 0
                  ? `${listing.averageRating.toFixed(1)} / 5`
                  : 'No reviews yet'
              }
            />
            <Stat label="Reviews" value={String(listing.reviewCount)} />
          </dl>

          <footer style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
            <Link
              href={`/marketplace/listings/${listing.id}`}
              prefetch={false}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '6px 10px',
                borderRadius: '4px',
                background: 'transparent',
                border: '1px solid oklch(0.55 0.12 140)',
                color: 'oklch(0.85 0.18 140)',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                fontFamily: 'JetBrains Mono, monospace',
                textDecoration: 'none',
              }}
            >
              View
            </Link>
            <Link
              href={`/creator/submit?listing=${listing.id}`}
              prefetch={false}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '6px 10px',
                borderRadius: '4px',
                background: 'transparent',
                border: '1px solid oklch(0.32 0.02 250)',
                color: 'oklch(0.7 0.02 250)',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                fontFamily: 'JetBrains Mono, monospace',
                textDecoration: 'none',
              }}
            >
              Edit
            </Link>
          </footer>
        </article>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <dt
        style={{
          fontSize: '10px',
          color: 'oklch(0.6 0.02 250)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontFamily: 'JetBrains Mono, monospace',
          marginBottom: '2px',
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          fontSize: '13px',
          color: accent ? 'oklch(0.85 0.18 140)' : 'oklch(0.85 0.02 250)',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 600,
          margin: 0,
        }}
      >
        {value}
      </dd>
    </div>
  );
}
