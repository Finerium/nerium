'use client';

//
// src/components/marketplace/MarketplaceFilters.tsx
//
// Owner: Hyperion (W2 NP P1 V4 S2).
//
// Filter sidebar for the live ``GET /v1/marketplace/search`` endpoint.
// Surface params honor the contract Section 3.3 SearchRequest shape:
//   - category    (single-select; backend supports list but contract
//                  ships single-select for the V4 S2 surface to keep the
//                  query string short and shareable).
//   - subtype     (single-select, derived options from the picked category).
//   - license     (single-select).
//   - pricing_model (single-select).
//   - price_min, price_max (numeric, USD).
//   - sort        (relevance | recent | trust)
//
// The "trust score min slider" listed in the spawn brief is intentionally
// NOT rendered: the live ``/v1/marketplace/search`` endpoint does not
// accept a trust_score min query param (only ``sort=trust``). Adding a
// client-only filter would silently exclude rows from a server-paginated
// page and produce confusing empty states. The Sort=Trust dropdown
// option already surfaces trust as a primary signal.
//
// No em dash, no emoji. Keyboard-navigable: every control is a native
// <select> or <input type="number"> with a real <label>.
//

import {
  useCallback,
  useId,
  type CSSProperties,
  type ChangeEvent,
  type ReactElement,
} from 'react';

// ---------------------------------------------------------------------------
// Filter shape (kept narrow so the parent owns URL <-> state sync).
// ---------------------------------------------------------------------------

export type MarketplaceCategory =
  | 'core_agent'
  | 'content'
  | 'infrastructure'
  | 'assets'
  | 'services'
  | 'premium'
  | 'data';

export type MarketplaceLicense =
  | 'MIT'
  | 'CC0'
  | 'CC_BY_4'
  | 'CC_BY_SA_4'
  | 'CC_BY_NC_4'
  | 'APACHE_2'
  | 'CUSTOM_COMMERCIAL'
  | 'PROPRIETARY';

export type MarketplacePricingModel =
  | 'free'
  | 'one_time'
  | 'subscription_monthly'
  | 'subscription_yearly'
  | 'usage_based'
  | 'tiered';

export type MarketplaceSort = 'relevance' | 'recent' | 'trust';

export interface MarketplaceFilterState {
  category?: MarketplaceCategory;
  subtype?: string;
  license?: MarketplaceLicense;
  pricing_model?: MarketplacePricingModel;
  price_min?: number;
  price_max?: number;
  sort: MarketplaceSort;
}

export interface MarketplaceFiltersProps {
  state: MarketplaceFilterState;
  onChange: (next: MarketplaceFilterState) => void;
}

// ---------------------------------------------------------------------------
// Display labels + per-category subtype options (mirrors backend
// marketplace_listing.py ALLOWED_SUBTYPES so dropdowns are valid).
// ---------------------------------------------------------------------------

const CATEGORY_LABEL: Record<MarketplaceCategory, string> = {
  core_agent: 'Core agent',
  content: 'Content',
  infrastructure: 'Infrastructure',
  assets: 'Assets',
  services: 'Services',
  premium: 'Premium',
  data: 'Data',
};

const LICENSE_LABEL: Record<MarketplaceLicense, string> = {
  MIT: 'MIT',
  CC0: 'CC0',
  CC_BY_4: 'CC BY 4.0',
  CC_BY_SA_4: 'CC BY-SA 4.0',
  CC_BY_NC_4: 'CC BY-NC 4.0',
  APACHE_2: 'Apache 2.0',
  CUSTOM_COMMERCIAL: 'Custom commercial',
  PROPRIETARY: 'Proprietary',
};

const PRICING_MODEL_LABEL: Record<MarketplacePricingModel, string> = {
  free: 'Free',
  one_time: 'One time',
  subscription_monthly: 'Subscription monthly',
  subscription_yearly: 'Subscription yearly',
  usage_based: 'Usage based',
  tiered: 'Tiered',
};

const SUBTYPES_BY_CATEGORY: Record<MarketplaceCategory, readonly string[]> = {
  core_agent: ['agent', 'agent_bundle', 'agent_team'],
  content: [
    'prompt',
    'skill',
    'quest_template',
    'dialogue_tree',
    'context_pack',
  ],
  infrastructure: ['mcp_config', 'connector', 'workflow', 'eval_suite'],
  assets: ['voice_profile', 'visual_theme', 'sprite_pack', 'sound_pack'],
  services: ['custom_build_service', 'consulting_hour'],
  premium: [
    'verified_certification',
    'priority_listing',
    'custom_domain_agent',
  ],
  data: ['dataset', 'analytics_dashboard'],
};

const SORT_LABEL: Record<MarketplaceSort, string> = {
  relevance: 'Relevance (RRF hybrid)',
  recent: 'Newest first',
  trust: 'Highest trust score',
};

const formatLabel = (raw: string): string =>
  raw
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

// ---------------------------------------------------------------------------
// Styles (OKLCH design tokens via CSS vars; the Marshall palette).
// ---------------------------------------------------------------------------

const ROOT: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  padding: '1rem',
  borderRadius: 'var(--radius-lg, 0.75rem)',
  border: '1px solid var(--color-border, #1e293b)',
  background:
    'color-mix(in oklch, var(--color-background, #0a0a0f) 90%, var(--color-foreground, #e8e8ea) 10%)',
  fontFamily:
    'var(--font-family-body, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif)',
  color: 'var(--color-foreground, #e8e8ea)',
};

const HEADING: CSSProperties = {
  margin: 0,
  fontSize: 'var(--scale-sm, 0.875rem)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-muted, #94a3b8)',
};

const FIELD: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
};

const FIELD_ROW: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '0.5rem',
};

const LABEL: CSSProperties = {
  fontSize: 'var(--scale-xs, 0.75rem)',
  letterSpacing: '0.04em',
  color: 'var(--color-muted, #94a3b8)',
};

const SELECT: CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.625rem',
  borderRadius: 'var(--radius-md, 0.5rem)',
  border: '1px solid var(--color-border, #1e293b)',
  background: 'var(--color-background, #0a0a0f)',
  color: 'var(--color-foreground, #e8e8ea)',
  fontSize: 'var(--scale-sm, 0.875rem)',
  font: 'inherit',
};

const NUMBER_INPUT: CSSProperties = {
  ...SELECT,
};

const RESET_BUTTON: CSSProperties = {
  appearance: 'none',
  background: 'transparent',
  border: '1px solid var(--color-border, #1e293b)',
  borderRadius: 'var(--radius-md, 0.5rem)',
  color: 'var(--color-foreground, #e8e8ea)',
  padding: '0.5rem 0.75rem',
  fontFamily: 'inherit',
  fontSize: 'var(--scale-xs, 0.75rem)',
  cursor: 'pointer',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MarketplaceFilters(
  props: MarketplaceFiltersProps,
): ReactElement {
  const { state, onChange } = props;
  const fieldset_id = useId();

  const handleCategoryChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const raw = event.target.value;
      if (raw === '') {
        onChange({ ...state, category: undefined, subtype: undefined });
        return;
      }
      // Reset subtype when category changes (the available subtype list
      // depends on the category).
      onChange({
        ...state,
        category: raw as MarketplaceCategory,
        subtype: undefined,
      });
    },
    [onChange, state],
  );

  const handleSubtypeChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const raw = event.target.value;
      onChange({
        ...state,
        subtype: raw === '' ? undefined : raw,
      });
    },
    [onChange, state],
  );

  const handleLicenseChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const raw = event.target.value;
      onChange({
        ...state,
        license: raw === '' ? undefined : (raw as MarketplaceLicense),
      });
    },
    [onChange, state],
  );

  const handlePricingModelChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const raw = event.target.value;
      onChange({
        ...state,
        pricing_model:
          raw === '' ? undefined : (raw as MarketplacePricingModel),
      });
    },
    [onChange, state],
  );

  const handlePriceMinChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      onChange({
        ...state,
        price_min: raw === '' ? undefined : Number(raw),
      });
    },
    [onChange, state],
  );

  const handlePriceMaxChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      onChange({
        ...state,
        price_max: raw === '' ? undefined : Number(raw),
      });
    },
    [onChange, state],
  );

  const handleSortChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onChange({
        ...state,
        sort: event.target.value as MarketplaceSort,
      });
    },
    [onChange, state],
  );

  const handleReset = useCallback(() => {
    onChange({ sort: 'relevance' });
  }, [onChange]);

  const subtype_options =
    state.category !== undefined ? SUBTYPES_BY_CATEGORY[state.category] : [];

  const has_any_filter =
    state.category !== undefined ||
    state.subtype !== undefined ||
    state.license !== undefined ||
    state.pricing_model !== undefined ||
    state.price_min !== undefined ||
    state.price_max !== undefined ||
    state.sort !== 'relevance';

  return (
    <aside
      aria-label="Marketplace search filters"
      aria-describedby={`${fieldset_id}-help`}
      style={ROOT}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h2 style={HEADING}>Filters</h2>
        <button
          type="button"
          style={RESET_BUTTON}
          onClick={handleReset}
          disabled={!has_any_filter}
          aria-label="Reset all filters"
        >
          Reset
        </button>
      </header>

      <div id={`${fieldset_id}-help`} style={{ ...LABEL, fontSize: 'var(--scale-xs, 0.75rem)' }}>
        Narrow the hybrid search by category, license, pricing model, or price range.
      </div>

      <div style={FIELD}>
        <label htmlFor={`${fieldset_id}-category`} style={LABEL}>
          Category
        </label>
        <select
          id={`${fieldset_id}-category`}
          style={SELECT}
          value={state.category ?? ''}
          onChange={handleCategoryChange}
        >
          <option value="">All categories</option>
          {(Object.keys(CATEGORY_LABEL) as MarketplaceCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </div>

      <div style={FIELD}>
        <label htmlFor={`${fieldset_id}-subtype`} style={LABEL}>
          Subtype
        </label>
        <select
          id={`${fieldset_id}-subtype`}
          style={SELECT}
          value={state.subtype ?? ''}
          onChange={handleSubtypeChange}
          disabled={state.category === undefined}
          aria-disabled={state.category === undefined}
        >
          <option value="">
            {state.category === undefined ? 'Pick a category first' : 'Any subtype'}
          </option>
          {subtype_options.map((s) => (
            <option key={s} value={s}>
              {formatLabel(s)}
            </option>
          ))}
        </select>
      </div>

      <div style={FIELD}>
        <label htmlFor={`${fieldset_id}-license`} style={LABEL}>
          License
        </label>
        <select
          id={`${fieldset_id}-license`}
          style={SELECT}
          value={state.license ?? ''}
          onChange={handleLicenseChange}
        >
          <option value="">Any license</option>
          {(Object.keys(LICENSE_LABEL) as MarketplaceLicense[]).map((l) => (
            <option key={l} value={l}>
              {LICENSE_LABEL[l]}
            </option>
          ))}
        </select>
      </div>

      <div style={FIELD}>
        <label htmlFor={`${fieldset_id}-pricing`} style={LABEL}>
          Pricing model
        </label>
        <select
          id={`${fieldset_id}-pricing`}
          style={SELECT}
          value={state.pricing_model ?? ''}
          onChange={handlePricingModelChange}
        >
          <option value="">Any pricing model</option>
          {(Object.keys(PRICING_MODEL_LABEL) as MarketplacePricingModel[]).map(
            (m) => (
              <option key={m} value={m}>
                {PRICING_MODEL_LABEL[m]}
              </option>
            ),
          )}
        </select>
      </div>

      <div style={FIELD}>
        <span style={LABEL}>Price range (USD)</span>
        <div style={FIELD_ROW}>
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            placeholder="Min"
            aria-label="Minimum price USD"
            style={NUMBER_INPUT}
            value={state.price_min ?? ''}
            onChange={handlePriceMinChange}
          />
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            placeholder="Max"
            aria-label="Maximum price USD"
            style={NUMBER_INPUT}
            value={state.price_max ?? ''}
            onChange={handlePriceMaxChange}
          />
        </div>
      </div>

      <div style={FIELD}>
        <label htmlFor={`${fieldset_id}-sort`} style={LABEL}>
          Sort
        </label>
        <select
          id={`${fieldset_id}-sort`}
          style={SELECT}
          value={state.sort}
          onChange={handleSortChange}
        >
          {(Object.keys(SORT_LABEL) as MarketplaceSort[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
    </aside>
  );
}

export default MarketplaceFilters;
