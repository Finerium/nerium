'use client';

//
// app/marketplace/search/page.tsx
//
// Owner: Hyperion (W2 NP P1 V4 S2).
//
// Live marketplace search page consuming
// ``GET /v1/marketplace/search`` shipped in P1 S1. URL state is the
// canonical source of truth so a query is shareable + back-button
// safe; the page hydrates from `useSearchParams()` on mount and
// pushes updates via `router.replace()` so navigation history does
// not balloon with every keystroke.
//
// Layout:
//
//   /-----------------------------------------\
//   | MarketplaceSearchBar (full width, top)  |
//   |-----------------------------------------|
//   | filters |  results grid                 |
//   | side    |  (1 / 2 / 3 columns)          |
//   \-----------------------------------------/
//
// No em dash, no emoji.
//

import { useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';

import { HarnessShell } from '../../_harness/HarnessShell';
import {
  MarketplaceFilters,
  type MarketplaceCategory,
  type MarketplaceFilterState,
  type MarketplaceLicense,
  type MarketplacePricingModel,
  type MarketplaceSort,
} from '../../../src/components/marketplace/MarketplaceFilters';
import { MarketplaceSearchBar } from '../../../src/components/marketplace/MarketplaceSearchBar';
import {
  MarketplaceSearchResults,
  type SearchResultsResponse,
} from '../../../src/components/marketplace/MarketplaceSearchResults';

// ---------------------------------------------------------------------------
// URL <-> state helpers
// ---------------------------------------------------------------------------

const VALID_SORTS: ReadonlySet<string> = new Set([
  'relevance',
  'recent',
  'trust',
]);

const VALID_CATEGORIES: ReadonlySet<string> = new Set([
  'core_agent',
  'content',
  'infrastructure',
  'assets',
  'services',
  'premium',
  'data',
]);

const VALID_LICENSES: ReadonlySet<string> = new Set([
  'MIT',
  'CC0',
  'CC_BY_4',
  'CC_BY_SA_4',
  'CC_BY_NC_4',
  'APACHE_2',
  'CUSTOM_COMMERCIAL',
  'PROPRIETARY',
]);

const VALID_PRICING_MODELS: ReadonlySet<string> = new Set([
  'free',
  'one_time',
  'subscription_monthly',
  'subscription_yearly',
  'usage_based',
  'tiered',
]);

interface PageState {
  query: string;
  filters: MarketplaceFilterState;
}

function readNumberParam(
  params: URLSearchParams,
  key: string,
): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw === '') return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function readPageStateFromParams(params: URLSearchParams): PageState {
  const sortRaw = params.get('sort') ?? 'relevance';
  const sort: MarketplaceSort = VALID_SORTS.has(sortRaw)
    ? (sortRaw as MarketplaceSort)
    : 'relevance';

  const categoryRaw = params.get('category');
  const category =
    categoryRaw && VALID_CATEGORIES.has(categoryRaw)
      ? (categoryRaw as MarketplaceCategory)
      : undefined;

  const licenseRaw = params.get('license');
  const license =
    licenseRaw && VALID_LICENSES.has(licenseRaw)
      ? (licenseRaw as MarketplaceLicense)
      : undefined;

  const pricingRaw = params.get('pricing_model');
  const pricing_model =
    pricingRaw && VALID_PRICING_MODELS.has(pricingRaw)
      ? (pricingRaw as MarketplacePricingModel)
      : undefined;

  const subtype = params.get('subtype') ?? undefined;

  return {
    query: params.get('q') ?? '',
    filters: {
      sort,
      category,
      subtype: subtype === '' ? undefined : subtype,
      license,
      pricing_model,
      price_min: readNumberParam(params, 'price_min'),
      price_max: readNumberParam(params, 'price_max'),
    },
  };
}

function writePageStateToParams(state: PageState): URLSearchParams {
  const next = new URLSearchParams();
  if (state.query.length > 0) next.set('q', state.query);
  if (state.filters.category) next.set('category', state.filters.category);
  if (state.filters.subtype) next.set('subtype', state.filters.subtype);
  if (state.filters.license) next.set('license', state.filters.license);
  if (state.filters.pricing_model) {
    next.set('pricing_model', state.filters.pricing_model);
  }
  if (state.filters.price_min !== undefined) {
    next.set('price_min', String(state.filters.price_min));
  }
  if (state.filters.price_max !== undefined) {
    next.set('price_max', String(state.filters.price_max));
  }
  if (state.filters.sort !== 'relevance') {
    next.set('sort', state.filters.sort);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Backend fetch helper
// ---------------------------------------------------------------------------

async function runSearch(
  state: PageState,
  signal: AbortSignal,
): Promise<SearchResultsResponse> {
  const params = new URLSearchParams();
  params.set('q', state.query);
  if (state.filters.category) params.set('category', state.filters.category);
  if (state.filters.subtype) params.set('subtype', state.filters.subtype);
  if (state.filters.license) params.set('license', state.filters.license);
  if (state.filters.pricing_model) {
    params.set('pricing_model', state.filters.pricing_model);
  }
  if (state.filters.price_min !== undefined) {
    params.set('price_min', String(state.filters.price_min));
  }
  if (state.filters.price_max !== undefined) {
    params.set('price_max', String(state.filters.price_max));
  }
  params.set('sort', state.filters.sort);

  const response = await fetch(`/v1/marketplace/search?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Search failed: HTTP ${response.status} ${text ? `(${text.slice(0, 120)})` : ''}`,
    );
  }
  const json = (await response.json()) as SearchResultsResponse;
  return json;
}

// ---------------------------------------------------------------------------
// Page body (wrapped in Suspense for useSearchParams).
// ---------------------------------------------------------------------------

const ROOT: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
};

const LAYOUT: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 280px) 1fr',
  gap: '1.5rem',
  alignItems: 'start',
};

const LAYOUT_MOBILE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

function MarketplaceSearchBody(): ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Hydrate state from URL on every searchParams change (back/forward
  // navigation, deep links, share-paste).
  const initial = useMemo(
    () => readPageStateFromParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [state, setState] = useState<PageState>(initial);
  const [response, setResponse] = useState<SearchResultsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const fetch_abort = useRef<AbortController | null>(null);

  // Re-hydrate when URL changes (e.g. user hits back).
  useEffect(() => {
    setState(initial);
  }, [initial]);

  // Track viewport for layout switch (single column under 768px).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Debounced fetch on state change. The MarketplaceSearchBar already
  // debounces typing; this useEffect fires on the resulting trimmed
  // query update + every filter change.
  useEffect(() => {
    if (state.query.trim().length === 0) {
      setResponse(null);
      setErrorMessage(null);
      setIsLoading(false);
      return;
    }
    if (fetch_abort.current) fetch_abort.current.abort();
    const controller = new AbortController();
    fetch_abort.current = controller;
    setIsLoading(true);
    setErrorMessage(null);
    runSearch(state, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setResponse(res);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : 'Marketplace search failed.';
        setErrorMessage(message);
        setResponse(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [state]);

  // URL sync: every state change pushes a new replace() call so the
  // address bar always matches the active filters. Initial hydration
  // (when the URL already matches) is a no-op because Next dedupes
  // identical replace() calls.
  useEffect(() => {
    const params = writePageStateToParams(state);
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(`/marketplace/search${next ? `?${next}` : ''}`, {
        scroll: false,
      });
    }
    // We deliberately do not include `searchParams` in the dep array:
    // hydration handled by the separate effect above; including it
    // would create an infinite loop.

  }, [state, router]);

  const handleQueryChange = useCallback((next: string) => {
    setState((s) => ({ ...s, query: next }));
  }, []);

  const handleSubmit = useCallback((next: string) => {
    setState((s) => ({ ...s, query: next }));
  }, []);

  const handleFiltersChange = useCallback(
    (filters: MarketplaceFilterState) => {
      setState((s) => ({ ...s, filters }));
    },
    [],
  );

  const handleResetFilters = useCallback(() => {
    setState((s) => ({ query: s.query, filters: { sort: 'relevance' } }));
  }, []);

  const handleListingClick = useCallback(
    (listingId: string) => {
      router.push(`/marketplace/listings/${listingId}`);
    },
    [router],
  );

  const layout = isMobile ? LAYOUT_MOBILE : LAYOUT;

  return (
    <div style={ROOT}>
      <MarketplaceSearchBar
        value={state.query}
        onQueryChange={handleQueryChange}
        onSubmit={handleSubmit}
        isSearching={isLoading}
        autoFocus
      />
      <div style={layout}>
        <MarketplaceFilters
          state={state.filters}
          onChange={handleFiltersChange}
        />
        <MarketplaceSearchResults
          response={response}
          isLoading={isLoading}
          errorMessage={errorMessage}
          onListingClick={handleListingClick}
          onResetFilters={handleResetFilters}
        />
      </div>
    </div>
  );
}

export default function MarketplaceSearchPage(): ReactElement {
  return (
    <HarnessShell
      heading="Marketplace search"
      sub="Hybrid full-text + semantic search via the live /v1/marketplace/search endpoint. Bilingual ID + EN tokenization. Filters and sort are URL-shareable."
    >
      <Suspense fallback={null}>
        <MarketplaceSearchBody />
      </Suspense>
    </HarnessShell>
  );
}
