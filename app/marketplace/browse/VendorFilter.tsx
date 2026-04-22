// app/marketplace/browse/VendorFilter.tsx
//
// NERIUM Marketplace browse surface: vendor filter (multi-select).
// Conforms to docs/contracts/browse_ui.contract.md v0.1.0 Section 3 and
// Section 6. Authoring agent: Artemis (P3a Marketplace Worker, Browse).
//
// Multi-select checkbox list of vendor origins with count badges. Matches
// hard_constraints soft guidance: checkbox list with text-only labels
// because CC0 vendor icons are not yet in the public asset pool.

'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import type { VendorFilterProps } from './types';

const INITIAL_VISIBLE_COUNT = 6;

const groupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.125rem',
  margin: 0,
  padding: 0,
  border: 'none',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: 'var(--radius-md, 0.5rem)',
  border: '1px solid transparent',
  backgroundColor: 'transparent',
  color: 'var(--color-foreground, #e8e8ea)',
  cursor: 'pointer',
  transition: 'background-color 150ms ease, border-color 150ms ease',
};

const rowActive: CSSProperties = {
  backgroundColor:
    'color-mix(in oklch, var(--color-secondary, #a855f7) 14%, transparent)',
  borderColor:
    'color-mix(in oklch, var(--color-secondary, #a855f7) 40%, transparent)',
};

const countStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontSize: 'var(--scale-xs, 0.75rem)',
  color: 'var(--color-muted, #94a3b8)',
};

export function VendorFilter({
  vendors,
  selected,
  onToggle,
}: VendorFilterProps) {
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(
    () =>
      vendors
        .slice()
        .sort((a, b) => b.count - a.count || a.display_label.localeCompare(b.display_label)),
    [vendors],
  );

  const visible = expanded ? sorted : sorted.slice(0, INITIAL_VISIBLE_COUNT);
  const hasOverflow = sorted.length > INITIAL_VISIBLE_COUNT;
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const summary = selected.length === 0 ? 'All vendors' : `${selected.length} selected`;

  return (
    <fieldset
      aria-label="Filter by vendor origin"
      style={groupStyle}
    >
      <legend
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: '0.5rem',
          padding: 0,
        }}
      >
        <span
          style={{
            fontSize: 'var(--scale-xs, 0.75rem)',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-muted, #94a3b8)',
          }}
        >
          Vendor
        </span>
        <span style={countStyle}>{summary}</span>
      </legend>
      <ul
        role="list"
        style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.125rem' }}
      >
        {visible.map((v) => {
          const isSelected = selectedSet.has(v.vendor);
          return (
            <li key={v.vendor}>
              <label
                style={{
                  ...rowStyle,
                  ...(isSelected ? rowActive : {}),
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(v.vendor)}
                    aria-label={`Toggle vendor ${v.display_label}, ${v.count} matching listings`}
                    style={{
                      width: '1rem',
                      height: '1rem',
                      accentColor: 'var(--color-secondary, #a855f7)',
                      cursor: 'pointer',
                    }}
                  />
                  <span>{v.display_label}</span>
                </span>
                <span style={countStyle}>{v.count}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {hasOverflow && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          style={{
            ...rowStyle,
            marginTop: '0.25rem',
            color: 'var(--color-muted, #94a3b8)',
            fontSize: 'var(--scale-xs, 0.75rem)',
            font: 'inherit',
          }}
        >
          <span>
            {expanded
              ? 'Show fewer vendors'
              : `Show ${sorted.length - INITIAL_VISIBLE_COUNT} more`}
          </span>
          <span aria-hidden="true">{expanded ? '-' : '+'}</span>
        </button>
      )}
    </fieldset>
  );
}
