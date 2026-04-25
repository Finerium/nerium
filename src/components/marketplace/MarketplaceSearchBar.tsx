'use client';

//
// src/components/marketplace/MarketplaceSearchBar.tsx
//
// Owner: Hyperion (W2 NP P1 V4 S2).
//
// Marketplace hybrid-search input. Consumes the live
// ``GET /v1/marketplace/search`` endpoint shipped in P1 S1 via the
// parent search page; this component is presentational.
//
// Behaviour
//   - Debounced 300ms onChange, fires onQueryChange with the trimmed
//     value so the parent re-fetches without spamming the backend.
//   - Enter or Search button submits immediately (cancels pending
//     debounce, fires onSubmit).
//   - Clear button (rendered when value != '') wipes the draft + emits
//     onQueryChange('') so the parent can reset filters too.
//   - Honors `aria-label`, focus-visible ring, keyboard nav per the
//     spawn brief accessibility line.
//
// No em dash, no emoji. OKLCH design tokens via the Marshall palette
// (see app/globals.css for the cyberpunk-marketplace surface vars).
//

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from 'react';

const DEBOUNCE_MS = 300;
const MAX_QUERY_CHARS = 200;

export interface MarketplaceSearchBarProps {
  /** Controlled query string. Source of truth lives in the parent page. */
  value: string;
  /** Fires after the 300ms debounce window OR immediately on clear. */
  onQueryChange: (next: string) => void;
  /** Fires on Enter or Search button click. */
  onSubmit: (query: string) => void;
  /** True while the parent is awaiting a backend response. Disables submit. */
  isSearching?: boolean;
  /** Override placeholder. Defaults to bilingual copy. */
  placeholder?: string;
  /** Auto-focus on mount when prominent in the page (e.g. /search). */
  autoFocus?: boolean;
}

const ROOT: CSSProperties = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.375rem',
  fontFamily:
    'var(--font-family-body, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif)',
  color: 'var(--color-foreground, #e8e8ea)',
};

const SURFACE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.5rem 0.625rem',
  borderRadius: 'var(--radius-lg, 0.75rem)',
  background:
    'color-mix(in oklch, var(--color-background, #0a0a0f) 90%, var(--color-foreground, #e8e8ea) 10%)',
  border: '1px solid var(--color-border, #1e293b)',
  transition: 'border-color 120ms ease, box-shadow 120ms ease',
};

const SURFACE_FOCUSED: CSSProperties = {
  ...SURFACE,
  borderColor:
    'color-mix(in oklch, var(--color-primary, #06b6d4) 55%, transparent)',
  boxShadow:
    '0 0 0 3px color-mix(in oklch, var(--color-primary, #06b6d4) 18%, transparent)',
};

const ICON: CSSProperties = {
  width: '18px',
  height: '18px',
  color: 'var(--color-primary, #06b6d4)',
  flex: '0 0 auto',
  marginLeft: '0.25rem',
};

const INPUT: CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'inherit',
  fontSize: 'var(--scale-base, 0.9375rem)',
  padding: '0.375rem 0.25rem',
  fontFamily: 'inherit',
};

const CLEAR_BUTTON: CSSProperties = {
  appearance: 'none',
  background: 'transparent',
  color: 'var(--color-muted, #94a3b8)',
  border: '1px solid transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'var(--scale-xs, 0.75rem)',
  padding: '0.25rem 0.5rem',
  borderRadius: 'var(--radius-md, 0.5rem)',
};

const SUBMIT_BUTTON: CSSProperties = {
  appearance: 'none',
  background: 'var(--color-primary, #06b6d4)',
  color: 'var(--color-primary-foreground, #06060c)',
  border: 'none',
  borderRadius: 'var(--radius-md, 0.5rem)',
  padding: '0.5rem 0.875rem',
  fontFamily: 'inherit',
  fontSize: 'var(--scale-sm, 0.875rem)',
  fontWeight: 600,
  letterSpacing: '0.04em',
  cursor: 'pointer',
  flex: '0 0 auto',
};

const SUBMIT_BUTTON_DISABLED: CSSProperties = {
  ...SUBMIT_BUTTON,
  opacity: 0.55,
  cursor: 'not-allowed',
};

const HELPER: CSSProperties = {
  fontSize: 'var(--scale-xs, 0.75rem)',
  color: 'var(--color-muted, #94a3b8)',
  letterSpacing: '0.02em',
};

export function MarketplaceSearchBar(
  props: MarketplaceSearchBarProps,
): ReactElement {
  const {
    value,
    onQueryChange,
    onSubmit,
    isSearching = false,
    placeholder,
    autoFocus = false,
  } = props;

  const [draft, setDraft] = useState<string>(value);
  const [focused, setFocused] = useState<boolean>(false);
  const debounce_timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input_ref = useRef<HTMLInputElement | null>(null);

  // Re-sync when the parent updates `value` (e.g. URL state hydration).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(
    () => () => {
      if (debounce_timer.current !== null) {
        clearTimeout(debounce_timer.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (autoFocus && input_ref.current) {
      input_ref.current.focus();
    }
  }, [autoFocus]);

  const scheduleChange = useCallback(
    (next: string) => {
      if (debounce_timer.current !== null) {
        clearTimeout(debounce_timer.current);
      }
      debounce_timer.current = setTimeout(() => {
        onQueryChange(next.trim());
      }, DEBOUNCE_MS);
    },
    [onQueryChange],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value.slice(0, MAX_QUERY_CHARS);
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
    if (input_ref.current) input_ref.current.focus();
  }, [onQueryChange]);

  const runSubmit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    if (debounce_timer.current !== null) {
      clearTimeout(debounce_timer.current);
      debounce_timer.current = null;
    }
    onQueryChange(trimmed);
    onSubmit(trimmed);
  }, [draft, onQueryChange, onSubmit]);

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
  const surface_style = focused ? SURFACE_FOCUSED : SURFACE;
  const show_clear = draft.length > 0;

  const helper_copy = isSearching
    ? 'Searching marketplace...'
    : trimmed_length === 0
      ? 'Press Enter to search. Bilingual ID + EN tokens supported.'
      : `${trimmed_length} character query ready.`;

  return (
    <div role="search" aria-label="Search marketplace listings" style={ROOT}>
      <form style={surface_style} onSubmit={handleFormSubmit}>
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
          ref={input_ref}
          type="text"
          style={INPUT}
          value={draft}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={
            placeholder ??
            'Cari agent, prompt, sprite pack, atau dataset. Misal: "agent pertanian cabai"'
          }
          aria-label="Marketplace search query"
          autoComplete="off"
          spellCheck={false}
          maxLength={MAX_QUERY_CHARS}
        />
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
          aria-label="Run marketplace search"
        >
          {isSearching ? 'Searching' : 'Search'}
        </button>
      </form>
      <div style={HELPER} aria-live="polite">
        {helper_copy}
      </div>
    </div>
  );
}

export default MarketplaceSearchBar;
