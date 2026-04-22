'use client';

//
// SearchBar.tsx (Coeus P3a)
//
// Conforms to: docs/contracts/search_ui.contract.md v0.1.0 (SearchBarProps)
//
// Controlled input component. Query state lives in the parent; SearchBar
// relays change and submit. A 300ms debounce on onQueryChange per soft
// guidance in coeus.md lets the parent decide whether to pre-fetch suggestions
// or wait for explicit submit.
//
// On submit, the component fires
// `marketplace.search.query_submitted` via the shared CustomEvent bridge
// (semantic_embedder.emitMarketplaceSearchEvent) and invokes onSubmit so the
// parent can call SearchRanker.rank. Empty queries no-op per contract
// Section 8.
//

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type CSSProperties,
} from 'react';

import {
  emitMarketplaceSearchEvent,
  type RankingContext,
  type SearchBarProps,
} from './semantic_embedder';

const DEBOUNCE_MS = 300;

const SURFACE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.375rem',
  borderRadius: '12px',
  background: 'var(--advisor-bg-elevated, #0f1020)',
  border: '1px solid var(--advisor-border, rgba(0, 240, 255, 0.18))',
  boxShadow: '0 12px 40px rgba(0, 240, 255, 0.08)',
  fontFamily:
    'var(--advisor-font-body, -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif)',
  color: 'var(--advisor-fg, #e7f2ff)',
};

const ICON: CSSProperties = {
  width: '18px',
  height: '18px',
  marginLeft: '0.5rem',
  marginRight: '0.25rem',
  color: 'var(--advisor-accent-cyan, #00f0ff)',
  flex: '0 0 auto',
};

const INPUT: CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'inherit',
  fontSize: '15px',
  padding: '0.5rem 0.25rem',
  fontFamily: 'inherit',
};

const CLEAR_BUTTON: CSSProperties = {
  appearance: 'none',
  background: 'transparent',
  color: 'var(--advisor-fg-muted, #94a3c4)',
  border: 'none',
  cursor: 'pointer',
  fontFamily:
    'var(--advisor-font-mono, "JetBrains Mono", "Fira Code", ui-monospace, Menlo, monospace)',
  fontSize: '11px',
  padding: '0.25rem 0.5rem',
  borderRadius: '6px',
};

const SUBMIT_BUTTON: CSSProperties = {
  appearance: 'none',
  background: 'var(--advisor-accent-cyan, #00f0ff)',
  color: 'var(--advisor-bg, #06060c)',
  border: 'none',
  borderRadius: '8px',
  padding: '0.5rem 0.875rem',
  fontFamily:
    'var(--advisor-font-display, "Space Grotesk", -apple-system, sans-serif)',
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  flex: '0 0 auto',
};

const SUBMIT_BUTTON_DISABLED: CSSProperties = {
  ...SUBMIT_BUTTON,
  opacity: 0.45,
  cursor: 'not-allowed',
};

const SPINNER: CSSProperties = {
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  background: 'var(--advisor-accent-cyan, #00f0ff)',
  animation: 'coeus-search-pulse 1.2s ease-in-out infinite',
  flex: '0 0 auto',
};

const HELPER: CSSProperties = {
  marginTop: '0.5rem',
  fontFamily:
    'var(--advisor-font-mono, "JetBrains Mono", "Fira Code", ui-monospace, Menlo, monospace)',
  fontSize: '11px',
  color: 'var(--advisor-fg-muted, #94a3c4)',
  letterSpacing: '0.04em',
};

interface SearchBarExtendedProps extends SearchBarProps {
  /**
   * Ranking context snapshot included with the query_submitted event so
   * Ananke can correlate ranking outcomes with filters and user preferred
   * tier. Optional; parent supplies when known.
   */
  ranking_context?: RankingContext;
}

export default function SearchBar(props: SearchBarExtendedProps): ReactElement {
  const {
    query,
    onQueryChange,
    onSubmit,
    isSearching,
    placeholder,
    ranking_context,
  } = props;

  const [draft, setDraft] = useState<string>(query);
  const debounce_timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(query);
  }, [query]);

  useEffect(
    () => () => {
      if (debounce_timer.current !== null) {
        clearTimeout(debounce_timer.current);
      }
    },
    [],
  );

  const scheduleChange = useCallback(
    (next: string) => {
      if (debounce_timer.current !== null) {
        clearTimeout(debounce_timer.current);
      }
      debounce_timer.current = setTimeout(() => {
        onQueryChange(next);
      }, DEBOUNCE_MS);
    },
    [onQueryChange],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setDraft(next);
      scheduleChange(next);
    },
    [scheduleChange],
  );

  const handleClear = useCallback(() => {
    setDraft('');
    if (debounce_timer.current !== null) {
      clearTimeout(debounce_timer.current);
      debounce_timer.current = null;
    }
    onQueryChange('');
  }, [onQueryChange]);

  const runSubmit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      return;
    }
    if (debounce_timer.current !== null) {
      clearTimeout(debounce_timer.current);
      debounce_timer.current = null;
    }
    onQueryChange(trimmed);
    emitMarketplaceSearchEvent({
      topic: 'marketplace.search.query_submitted',
      query: trimmed,
      ranking_context: ranking_context ?? { user_query: trimmed },
    });
    onSubmit();
  }, [draft, onQueryChange, onSubmit, ranking_context]);

  const handleFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      runSubmit();
    },
    [runSubmit],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runSubmit();
      }
    },
    [runSubmit],
  );

  const trimmed_length = draft.trim().length;
  const submit_disabled = isSearching || trimmed_length === 0;
  const submit_style = submit_disabled ? SUBMIT_BUTTON_DISABLED : SUBMIT_BUTTON;
  const show_clear = draft.length > 0 && !isSearching;

  return (
    <div role="search" aria-label="Search marketplace agents">
      <style>{`@keyframes coeus-search-pulse { 0%, 100% { opacity: 0.3; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.1); } }`}</style>
      <form style={SURFACE} onSubmit={handleFormSubmit}>
        <svg style={ICON} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M14 14L17.5 17.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <input
          type="text"
          style={INPUT}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            placeholder ??
            'Cari agent. Contoh: "agent pertanian cabai" atau "restaurant automation"'
          }
          aria-label="Marketplace search query"
          autoComplete="off"
          spellCheck={false}
        />
        {isSearching && (
          <span
            style={SPINNER}
            aria-hidden="true"
            data-testid="coeus-search-spinner"
          />
        )}
        {show_clear && (
          <button
            type="button"
            style={CLEAR_BUTTON}
            onClick={handleClear}
            aria-label="Clear search query"
          >
            Clear
          </button>
        )}
        <button
          type="submit"
          style={submit_style}
          disabled={submit_disabled}
          aria-label="Run search"
        >
          Search
        </button>
      </form>
      <div style={HELPER} aria-live="polite">
        {trimmed_length === 0
          ? 'Press Enter or tap Search. Try domain words plus an action, e.g. "cabai yield forecast".'
          : isSearching
            ? 'Ranking candidates...'
            : `Ready to rank ${trimmed_length} char query.`}
      </div>
    </div>
  );
}

export type { SearchBarExtendedProps as Props };
