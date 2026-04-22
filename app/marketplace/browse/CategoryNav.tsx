// app/marketplace/browse/CategoryNav.tsx
//
// NERIUM Marketplace browse surface: category navigation.
// Conforms to docs/contracts/browse_ui.contract.md v0.1.0 Section 3 and
// Section 6. Authoring agent: Artemis (P3a Marketplace Worker, Browse).
//
// The component emits CapabilityTag selections via onTagSelect per the
// contract. Soft guidance: collapse/expand per category group. Here we
// implement that as "show top N, expand the rest" because the contract
// models a flat CapabilityTag list rather than a two-level vertical tree;
// vertical grouping is a candidate post-hackathon refactor noted in
// artemis.decisions.md ADR-04.

'use client';

import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import type { CategoryNavProps } from './types';

const INITIAL_VISIBLE_COUNT = 6;

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.125rem',
};

const itemBase: CSSProperties = {
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
  textAlign: 'left',
  font: 'inherit',
  transition: 'background-color 150ms ease, border-color 150ms ease',
};

const itemActive: CSSProperties = {
  backgroundColor:
    'color-mix(in oklch, var(--color-primary, #06b6d4) 18%, transparent)',
  borderColor:
    'color-mix(in oklch, var(--color-primary, #06b6d4) 45%, transparent)',
  color: 'var(--color-primary, #06b6d4)',
};

const countStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontSize: 'var(--scale-xs, 0.75rem)',
  color: 'var(--color-muted, #94a3b8)',
};

export function CategoryNav({
  capabilities,
  activeTag,
  onTagSelect,
}: CategoryNavProps) {
  const [expanded, setExpanded] = useState(false);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const sorted = useMemo(
    () =>
      capabilities
        .slice()
        .sort((a, b) => b.count - a.count || a.display_label.localeCompare(b.display_label)),
    [capabilities],
  );

  const visible = expanded ? sorted : sorted.slice(0, INITIAL_VISIBLE_COUNT);
  const hasOverflow = sorted.length > INITIAL_VISIBLE_COUNT;
  const totalCount = useMemo(
    () => capabilities.reduce((acc, c) => acc + c.count, 0),
    [capabilities],
  );

  const focusAt = (index: number) => {
    const item = buttonRefs.current[index];
    if (item) item.focus();
  };

  const handleKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    const total = visible.length + 1; // +1 for the "All" entry at index 0
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusAt((currentIndex + 1) % total);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusAt((currentIndex - 1 + total) % total);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusAt(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusAt(total - 1);
    }
  };

  return (
    <nav aria-label="Category navigation">
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: '0.5rem',
        }}
      >
        <h2
          style={{
            fontSize: 'var(--scale-xs, 0.75rem)',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-muted, #94a3b8)',
            margin: 0,
          }}
        >
          Category
        </h2>
        <span style={countStyle}>{totalCount}</span>
      </header>
      <ul role="list" style={listStyle}>
        <li>
          <button
            type="button"
            ref={(el) => {
              buttonRefs.current[0] = el;
            }}
            onClick={() => onTagSelect(undefined)}
            onKeyDown={(e) => handleKey(e, 0)}
            aria-current={activeTag === undefined ? 'page' : undefined}
            aria-pressed={activeTag === undefined}
            style={{
              ...itemBase,
              ...(activeTag === undefined ? itemActive : {}),
            }}
          >
            <span>All</span>
            <span style={countStyle}>{totalCount}</span>
          </button>
        </li>
        {visible.map((cap, i) => {
          const index = i + 1;
          const isActive = activeTag === cap.tag;
          return (
            <li key={cap.tag}>
              <button
                type="button"
                ref={(el) => {
                  buttonRefs.current[index] = el;
                }}
                onClick={() => onTagSelect(cap.tag)}
                onKeyDown={(e) => handleKey(e, index)}
                aria-current={isActive ? 'page' : undefined}
                aria-pressed={isActive}
                aria-label={`Filter by ${cap.display_label}, ${cap.count} matching listings`}
                style={{ ...itemBase, ...(isActive ? itemActive : {}) }}
              >
                <span>{cap.display_label}</span>
                <span style={countStyle}>{cap.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {hasOverflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="category-list-overflow"
          style={{
            ...itemBase,
            marginTop: '0.25rem',
            color: 'var(--color-muted, #94a3b8)',
            fontSize: 'var(--scale-xs, 0.75rem)',
          }}
        >
          <span>
            {expanded
              ? 'Show fewer categories'
              : `Show ${sorted.length - INITIAL_VISIBLE_COUNT} more`}
          </span>
          <span aria-hidden="true">{expanded ? '-' : '+'}</span>
        </button>
      )}
    </nav>
  );
}
