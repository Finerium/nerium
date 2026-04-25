//
// app/marketplace/dashboard/ReviewsList.tsx
//
// Iapetus W2 NP S2. Recent reviews list with sort toggle (date, rating).
//
// Wilson lower-bound ranking lives upstream in Astraea; this panel
// just reads the seed-shaped review list and surfaces a per-row
// rating + text + author handle. The sort toggle is local state so
// no contract endpoint is required for the demo path.
//

'use client';

import { useMemo, useState } from 'react';
import type { DashboardReview } from './seedData';

interface Props {
  readonly reviews: ReadonlyArray<DashboardReview>;
}

type Sort = 'recent' | 'rating';

export function ReviewsList({ reviews }: Props) {
  const [sort, setSort] = useState<Sort>('recent');

  const sorted = useMemo(() => {
    const copy = [...reviews];
    if (sort === 'recent') {
      copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else {
      copy.sort((a, b) => b.rating - a.rating || b.createdAt.localeCompare(a.createdAt));
    }
    return copy;
  }, [reviews, sort]);

  return (
    <div
      style={{
        background: 'oklch(0.18 0.015 250)',
        border: '1px solid oklch(0.32 0.02 250)',
        borderRadius: '12px',
        padding: '20px',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '14px',
            color: 'oklch(0.6 0.02 250)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 500,
          }}
        >
          Recent reviews
        </h3>
        <div role="radiogroup" aria-label="Review sort order" style={{ display: 'flex', gap: '4px' }}>
          <SortButton active={sort === 'recent'} onClick={() => setSort('recent')}>
            Recent
          </SortButton>
          <SortButton active={sort === 'rating'} onClick={() => setSort('rating')}>
            Top rated
          </SortButton>
        </div>
      </header>

      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {sorted.map((review) => (
          <li
            key={review.id}
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: 'oklch(0.22 0.018 250)',
              border: '1px solid oklch(0.28 0.02 250)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
              <span style={{ display: 'inline-flex', gap: '2px', alignItems: 'center' }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    style={{
                      color: i < review.rating ? 'oklch(0.85 0.18 140)' : 'oklch(0.32 0.02 250)',
                      fontSize: '14px',
                      lineHeight: 1,
                    }}
                  >
                    {'★'}
                  </span>
                ))}
                <span style={{ marginLeft: '6px', color: 'oklch(0.7 0.02 250)', fontSize: '11px' }}>
                  {review.rating}/5
                </span>
              </span>
              <span style={{ color: 'oklch(0.55 0.02 250)', fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }}>
                {new Date(review.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
            <p
              style={{
                margin: '0 0 6px',
                color: 'oklch(0.88 0.02 250)',
                fontSize: '13px',
                lineHeight: 1.5,
                fontFamily: 'Space Grotesk, system-ui, sans-serif',
              }}
            >
              {review.text}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'oklch(0.6 0.02 250)' }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{review.author}</span>
              <span>{review.listingTitle}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SortButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      style={{
        background: active ? 'oklch(0.85 0.18 140)' : 'transparent',
        color: active ? 'oklch(0.14 0.012 250)' : 'oklch(0.7 0.02 250)',
        border: `1px solid ${active ? 'oklch(0.85 0.18 140)' : 'oklch(0.32 0.02 250)'}`,
        padding: '4px 10px',
        borderRadius: '4px',
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        fontFamily: 'JetBrains Mono, monospace',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
