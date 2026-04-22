'use client';

//
// ResultList.tsx (Coeus P3a)
//
// Conforms to: docs/contracts/search_ui.contract.md v0.1.0 (ResultListProps)
// Related:
//   docs/contracts/search_ranking.contract.md v0.1.0 (RankedResult score use)
//   docs/contracts/identity_card.contract.md v0.1.0 (Phoebe child slot hint)
//   docs/contracts/marketplace_listing.contract.md v0.1.0 (AgentListing shape)
//
// Presentational list. Accepts assembled SearchResultItem[] from the parent
// (parent runs SearchRanker + assembleSearchResultItems from
// semantic_embedder.ts). Emits marketplace.search.result_clicked on row click
// and marketplace.search.customize_opened when the Customize affordance fires.
//
// Honest-claim filter per contract Section 8: each item carries
// embedding_mode_used, we render a subtle "keyword" badge when the shipped
// hackathon path is the keyword-match fallback (not real semantic embedding).
//
// Pagination default 20 per contract Section 3 + soft guidance.
//

import {
  useCallback,
  useMemo,
  useState,
  type ReactElement,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import type { AgentListing, PricingTier } from '../schema/listing.schema';

import {
  emitMarketplaceSearchEvent,
  type ResultListProps,
  type SearchResultItem,
  type EmbeddingMode,
} from './semantic_embedder';

const DEFAULT_PAGE_SIZE = 20;

const ROOT: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  fontFamily:
    'var(--advisor-font-body, -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif)',
  color: 'var(--advisor-fg, #e7f2ff)',
};

const STATUS_LINE: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.75rem',
  fontFamily:
    'var(--advisor-font-mono, "JetBrains Mono", "Fira Code", ui-monospace, Menlo, monospace)',
  fontSize: '11px',
  color: 'var(--advisor-fg-muted, #94a3c4)',
  letterSpacing: '0.04em',
};

const MODE_BADGE_KEYWORD: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.125rem 0.5rem',
  borderRadius: '999px',
  border: '1px solid rgba(148, 163, 196, 0.4)',
  color: 'var(--advisor-fg-muted, #94a3c4)',
  background: 'transparent',
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const MODE_BADGE_SEMANTIC: CSSProperties = {
  ...MODE_BADGE_KEYWORD,
  borderColor: 'rgba(0, 240, 255, 0.45)',
  color: 'var(--advisor-accent-cyan, #00f0ff)',
};

const CARD: CSSProperties = {
  position: 'relative',
  padding: '0.875rem 1rem',
  borderRadius: '12px',
  background: 'var(--advisor-bg-elevated, #0f1020)',
  border: '1px solid var(--advisor-border, rgba(0, 240, 255, 0.18))',
  color: 'var(--advisor-fg, #e7f2ff)',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'border-color 120ms ease, transform 120ms ease',
};

const CARD_HEADER: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '0.75rem',
};

const CARD_TITLE: CSSProperties = {
  margin: 0,
  fontFamily:
    'var(--advisor-font-display, "Space Grotesk", -apple-system, sans-serif)',
  fontSize: '15px',
  fontWeight: 600,
  letterSpacing: '0.02em',
  color: 'var(--advisor-accent-cyan, #00f0ff)',
};

const CARD_VENDOR: CSSProperties = {
  fontFamily:
    'var(--advisor-font-mono, "JetBrains Mono", "Fira Code", ui-monospace, Menlo, monospace)',
  fontSize: '10px',
  color: 'var(--advisor-fg-muted, #94a3c4)',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  marginTop: '0.125rem',
};

const SHORT_DESC: CSSProperties = {
  margin: 0,
  fontSize: '13px',
  lineHeight: 1.45,
  color: 'var(--advisor-fg, #e7f2ff)',
};

const HIGHLIGHT_LIST: CSSProperties = {
  margin: 0,
  padding: '0.5rem 0.75rem',
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  fontFamily:
    'var(--advisor-font-mono, "JetBrains Mono", "Fira Code", ui-monospace, Menlo, monospace)',
  fontSize: '11px',
  color: 'var(--advisor-fg-muted, #94a3c4)',
  background: 'var(--advisor-bg-subtle, rgba(0, 240, 255, 0.04))',
  borderRadius: '8px',
  border: '1px dashed var(--advisor-border, rgba(0, 240, 255, 0.18))',
};

const TAG_ROW: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.375rem',
};

const TAG: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.125rem 0.5rem',
  borderRadius: '999px',
  background: 'rgba(139, 92, 246, 0.15)',
  border: '1px solid rgba(139, 92, 246, 0.4)',
  color: 'var(--advisor-fg, #e7f2ff)',
  fontSize: '10px',
  letterSpacing: '0.04em',
  textTransform: 'lowercase',
};

const CONFIDENCE_TRACK: CSSProperties = {
  position: 'relative',
  height: '4px',
  borderRadius: '999px',
  background: 'rgba(148, 163, 196, 0.16)',
  overflow: 'hidden',
  flex: '1 1 auto',
};

const CONFIDENCE_META: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  fontFamily:
    'var(--advisor-font-mono, "JetBrains Mono", "Fira Code", ui-monospace, Menlo, monospace)',
  fontSize: '10px',
  color: 'var(--advisor-fg-muted, #94a3c4)',
};

const FOOTER_ROW: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.75rem',
  marginTop: '0.25rem',
};

const PRICE_BADGE_BASE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.125rem 0.5rem',
  borderRadius: '6px',
  fontSize: '10px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontFamily:
    'var(--advisor-font-mono, "JetBrains Mono", "Fira Code", ui-monospace, Menlo, monospace)',
};

const CUSTOMIZE_BUTTON: CSSProperties = {
  appearance: 'none',
  border: '1px solid var(--advisor-accent-magenta, #ff2e88)',
  background: 'transparent',
  color: 'var(--advisor-accent-magenta, #ff2e88)',
  fontFamily:
    'var(--advisor-font-display, "Space Grotesk", -apple-system, sans-serif)',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  padding: '0.375rem 0.75rem',
  borderRadius: '8px',
  cursor: 'pointer',
};

const PAGINATION: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: '0.5rem',
  gap: '0.5rem',
  fontFamily:
    'var(--advisor-font-mono, "JetBrains Mono", "Fira Code", ui-monospace, Menlo, monospace)',
  fontSize: '11px',
  color: 'var(--advisor-fg-muted, #94a3c4)',
};

const PAGE_BUTTON: CSSProperties = {
  appearance: 'none',
  background: 'transparent',
  border: '1px solid var(--advisor-border, rgba(0, 240, 255, 0.18))',
  color: 'var(--advisor-fg, #e7f2ff)',
  borderRadius: '6px',
  padding: '0.25rem 0.625rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '11px',
  letterSpacing: '0.04em',
};

const PAGE_BUTTON_DISABLED: CSSProperties = {
  ...PAGE_BUTTON,
  opacity: 0.4,
  cursor: 'not-allowed',
};

const EMPTY_STATE: CSSProperties = {
  padding: '2rem 1.25rem',
  border: '1px dashed var(--advisor-border, rgba(0, 240, 255, 0.18))',
  borderRadius: '12px',
  textAlign: 'center',
  color: 'var(--advisor-fg-muted, #94a3c4)',
  fontFamily: 'inherit',
  fontSize: '13px',
  lineHeight: 1.5,
};

function priceBadgeStyle(tier: PricingTier): CSSProperties {
  const palette: Record<PricingTier, { bg: string; border: string; fg: string }> = {
    free: {
      bg: 'rgba(67, 245, 180, 0.12)',
      border: 'rgba(67, 245, 180, 0.45)',
      fg: 'var(--advisor-success, #43f5b4)',
    },
    cheap: {
      bg: 'rgba(139, 92, 246, 0.12)',
      border: 'rgba(139, 92, 246, 0.45)',
      fg: 'var(--advisor-accent-violet, #8b5cf6)',
    },
    mid: {
      bg: 'rgba(0, 240, 255, 0.1)',
      border: 'rgba(0, 240, 255, 0.4)',
      fg: 'var(--advisor-accent-cyan, #00f0ff)',
    },
    premium: {
      bg: 'rgba(255, 46, 136, 0.12)',
      border: 'rgba(255, 46, 136, 0.45)',
      fg: 'var(--advisor-accent-magenta, #ff2e88)',
    },
  };
  const p = palette[tier];
  return {
    ...PRICE_BADGE_BASE,
    background: p.bg,
    border: `1px solid ${p.border}`,
    color: p.fg,
  };
}

function formatUsd(low: number, high: number): string {
  if (low === 0 && high === 0) return 'free';
  if (low === high) return `$${low.toFixed(3)}`;
  return `$${low.toFixed(3)} to $${high.toFixed(2)}`;
}

function formatVendor(key: string): string {
  return key.replaceAll('_', ' ');
}

function formatTag(tag: string): string {
  return tag.replaceAll('_', ' ');
}

function modeCopy(mode: EmbeddingMode): string {
  return mode === 'semantic' ? 'semantic' : 'keyword';
}

function modeStyle(mode: EmbeddingMode): CSSProperties {
  return mode === 'semantic' ? MODE_BADGE_SEMANTIC : MODE_BADGE_KEYWORD;
}

interface ItemCardProps {
  item: SearchResultItem;
  position: number;
  onItemClick: (listing: AgentListing) => void;
  onCustomizeClick: (listing: AgentListing) => void;
}

function ItemCard(props: ItemCardProps): ReactElement {
  const { item, position, onItemClick, onCustomizeClick } = props;
  const { listing, ranking, highlight_snippets, embedding_mode_used } = item;

  const confidence_pct = Math.round(ranking.score * 100);
  const confidence_bar_style: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: `${confidence_pct}%`,
    background:
      'linear-gradient(90deg, var(--advisor-accent-cyan, #00f0ff), var(--advisor-accent-magenta, #ff2e88))',
    borderRadius: '999px',
  };

  const handleActivate = useCallback(() => {
    onItemClick(listing);
  }, [listing, onItemClick]);

  const handleCustomize = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onCustomizeClick(listing);
    },
    [listing, onCustomizeClick],
  );

  const handleKey = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleActivate();
      }
    },
    [handleActivate],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      style={CARD}
      onClick={handleActivate}
      onKeyDown={handleKey}
      aria-label={`${listing.display_name}, rank ${position + 1}, confidence ${confidence_pct} percent`}
    >
      <div style={CARD_HEADER}>
        <div>
          <h3 style={CARD_TITLE}>{listing.display_name}</h3>
          <div style={CARD_VENDOR}>
            {formatVendor(listing.vendor_origin)}
            {listing.living_template_params && listing.living_template_params.length > 0
              ? ' . living template ready'
              : ''}
          </div>
        </div>
        <span
          style={modeStyle(embedding_mode_used)}
          aria-label={`Similarity signal mode ${modeCopy(embedding_mode_used)}`}
        >
          {modeCopy(embedding_mode_used)}
        </span>
      </div>

      <p style={SHORT_DESC}>{listing.short_description}</p>

      {highlight_snippets.length > 0 && (
        <ul style={HIGHLIGHT_LIST} aria-label="Matching snippets">
          {highlight_snippets.map((s, i) => (
            <li key={`snippet-${i}`}>{s}</li>
          ))}
        </ul>
      )}

      <div style={TAG_ROW} aria-label="Capability tags">
        {listing.capability_tags.map((t) => (
          <span key={t} style={TAG}>
            {formatTag(t)}
          </span>
        ))}
      </div>

      <div style={CONFIDENCE_META} aria-label="Ranking confidence">
        <span>rank {position + 1}</span>
        <div style={CONFIDENCE_TRACK}>
          <div style={confidence_bar_style} />
        </div>
        <span>{confidence_pct}%</span>
      </div>

      <div style={FOOTER_ROW}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={priceBadgeStyle(listing.pricing_tier)}>
            {listing.pricing_tier}
          </span>
          <span style={CONFIDENCE_META}>
            {formatUsd(
              listing.usage_cost_hint.estimate_range.low_usd,
              listing.usage_cost_hint.estimate_range.high_usd,
            )}{' '}
            per {listing.usage_cost_hint.per_execution_unit}
          </span>
        </div>
        <button
          type="button"
          style={CUSTOMIZE_BUTTON}
          onClick={handleCustomize}
          aria-label={`Customize ${listing.display_name} via living template`}
          disabled={
            listing.living_template_params === undefined ||
            listing.living_template_params.length === 0
          }
        >
          Customize
        </button>
      </div>
    </div>
  );
}

export default function ResultList(props: ResultListProps): ReactElement {
  const { items, onItemClick, onCustomizeClick, pageSize } = props;
  const page_size = pageSize ?? DEFAULT_PAGE_SIZE;
  const [page, setPage] = useState<number>(0);

  const total_pages = useMemo(
    () => Math.max(1, Math.ceil(items.length / page_size)),
    [items.length, page_size],
  );

  const clamped_page = page >= total_pages ? 0 : page;
  const slice_start = clamped_page * page_size;
  const slice_end = slice_start + page_size;
  const visible = items.slice(slice_start, slice_end);

  const mode_on_list: EmbeddingMode | null =
    items.length === 0 ? null : items[0].embedding_mode_used;

  const handleItemClick = useCallback(
    (listing: AgentListing) => {
      const idx = items.findIndex((it) => it.listing.listing_id === listing.listing_id);
      const score = idx >= 0 ? items[idx].ranking.score : 0;
      emitMarketplaceSearchEvent({
        topic: 'marketplace.search.result_clicked',
        listing_id: listing.listing_id,
        position: idx >= 0 ? idx : 0,
        score,
      });
      onItemClick(listing.listing_id);
    },
    [items, onItemClick],
  );

  const handleCustomize = useCallback(
    (listing: AgentListing) => {
      emitMarketplaceSearchEvent({
        topic: 'marketplace.search.customize_opened',
        source_listing_id: listing.listing_id,
      });
      onCustomizeClick(listing.listing_id);
    },
    [onCustomizeClick],
  );

  if (items.length === 0) {
    return (
      <div style={ROOT}>
        <div style={EMPTY_STATE} role="status" aria-live="polite">
          Belum ada hasil. Try a different query or broaden the capability tag.
          <br />
          Contoh: ubah "pertanian cabai" jadi "pertanian yield forecast".
        </div>
      </div>
    );
  }

  return (
    <div style={ROOT} aria-label="Search results">
      <div style={STATUS_LINE}>
        <span>
          {items.length} result{items.length === 1 ? '' : 's'}
          {total_pages > 1 ? ` . page ${clamped_page + 1} of ${total_pages}` : ''}
        </span>
        {mode_on_list !== null && (
          <span style={modeStyle(mode_on_list)}>
            ranking mode {modeCopy(mode_on_list)}
          </span>
        )}
      </div>

      {visible.map((item, i) => (
        <ItemCard
          key={item.listing.listing_id}
          item={item}
          position={slice_start + i}
          onItemClick={handleItemClick}
          onCustomizeClick={handleCustomize}
        />
      ))}

      {total_pages > 1 && (
        <div style={PAGINATION}>
          <button
            type="button"
            style={clamped_page === 0 ? PAGE_BUTTON_DISABLED : PAGE_BUTTON}
            disabled={clamped_page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            aria-label="Previous page"
          >
            Prev
          </button>
          <span>
            page {clamped_page + 1} of {total_pages}
          </span>
          <button
            type="button"
            style={
              clamped_page >= total_pages - 1 ? PAGE_BUTTON_DISABLED : PAGE_BUTTON
            }
            disabled={clamped_page >= total_pages - 1}
            onClick={() =>
              setPage((p) => Math.min(total_pages - 1, p + 1))
            }
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export type { ResultListProps as Props };
