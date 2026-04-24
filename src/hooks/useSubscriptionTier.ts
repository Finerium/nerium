//
// src/hooks/useSubscriptionTier.ts
//
// Owner: Marshall (W2 NP P6 S1).
//
// Client-side subscription-tier hook. Single source of truth for the
// cross-pillar question "what tier is the current user on right now?"
// wired up against Plutus's GET /v1/billing/subscription/me endpoint.
//
// Design
// ------
// The hook is intentionally NOT wrapped in React Query; the repo only
// has Zustand on the dependency list per package.json. We model the
// tier state as a small Zustand store with a single `refresh()` action.
// The pricing page and every pillar UI that needs the current tier
// reads from the store so state stays consistent across components
// without redundant fetches.
//
// The cross-pillar consumers (Marketplace publish cap, Banking upgrade
// CTA, Registry premium badge gate, Protocol advanced adapter gate) call
// `useSubscriptionTier()` and branch on `tier` + `limits` without
// re-implementing the fetch themselves.
//
// Rationale for Zustand over Context
// ----------------------------------
// Multiple unrelated surfaces need the value, some mount conditionally.
// A Context provider would have to wrap the entire app tree; a Zustand
// store is zero-config and the existing repo pattern.
//

import { useEffect } from 'react';
import { create } from 'zustand';

export type Tier = 'free' | 'starter' | 'pro' | 'team';

export interface TierLimits {
  max_agents: number;
  max_sessions_per_day: number;
  max_storage_mb: number;
  priority_support: boolean;
  custom_domains: boolean;
  analytics_retention_days: number;
  // Product caps derived from tier. Marshall defines these for the
  // cross-pillar consumers; backend is the source of truth for the
  // hard caps (Plutus enforcement), these values drive UI gating.
  marketplace_publish_cap: number;
  registry_premium_verified: boolean;
  protocol_multi_vendor: boolean;
}

export interface TierState {
  tier: Tier;
  limits: TierLimits;
  expiresAt: string | null;
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
  isAuthed: boolean;
  // Actions
  refresh: () => Promise<void>;
  setFromSnapshot: (snap: SubscriptionSnapshot | null, authed: boolean) => void;
}

export interface SubscriptionSnapshot {
  tier: Tier;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

const DEFAULT_FREE_LIMITS: TierLimits = {
  max_agents: 1,
  max_sessions_per_day: 20,
  max_storage_mb: 100,
  priority_support: false,
  custom_domains: false,
  analytics_retention_days: 7,
  marketplace_publish_cap: 3,
  registry_premium_verified: false,
  protocol_multi_vendor: false,
};

// Tier -> product-cap map. Keep in lockstep with Plutus plans.py
// _PLAN_CATALOGUE for max_* values; marketplace / registry / protocol
// product caps are Marshall-defined for the cross-pillar gate.
const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: DEFAULT_FREE_LIMITS,
  starter: {
    max_agents: 5,
    max_sessions_per_day: 200,
    max_storage_mb: 2000,
    priority_support: false,
    custom_domains: false,
    analytics_retention_days: 30,
    marketplace_publish_cap: 20,
    registry_premium_verified: false,
    protocol_multi_vendor: false,
  },
  pro: {
    max_agents: 20,
    max_sessions_per_day: 1000,
    max_storage_mb: 10000,
    priority_support: true,
    custom_domains: true,
    analytics_retention_days: 90,
    marketplace_publish_cap: 100,
    registry_premium_verified: true,
    protocol_multi_vendor: false,
  },
  team: {
    max_agents: 100,
    max_sessions_per_day: 10000,
    max_storage_mb: 100000,
    priority_support: true,
    custom_domains: true,
    analytics_retention_days: 365,
    marketplace_publish_cap: Number.POSITIVE_INFINITY,
    registry_premium_verified: true,
    protocol_multi_vendor: true,
  },
};

const INITIAL_STATE: Omit<TierState, 'refresh' | 'setFromSnapshot'> = {
  tier: 'free',
  limits: DEFAULT_FREE_LIMITS,
  expiresAt: null,
  loading: false,
  error: null,
  lastFetchedAt: null,
  isAuthed: false,
};

export const useTierStore = create<TierState>((set, get) => ({
  ...INITIAL_STATE,
  setFromSnapshot: (snap, authed) => {
    if (!snap || !authed) {
      set({
        tier: 'free',
        limits: DEFAULT_FREE_LIMITS,
        expiresAt: null,
        isAuthed: authed,
        error: null,
        loading: false,
        lastFetchedAt: Date.now(),
      });
      return;
    }
    const nextTier: Tier = snap.tier;
    set({
      tier: nextTier,
      limits: TIER_LIMITS[nextTier],
      expiresAt: snap.current_period_end,
      isAuthed: true,
      error: null,
      loading: false,
      lastFetchedAt: Date.now(),
    });
  },
  refresh: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const resp = await fetch('/v1/billing/subscription/me', {
        credentials: 'include',
        headers: { accept: 'application/json' },
      });
      if (resp.status === 401 || resp.status === 403) {
        get().setFromSnapshot(null, false);
        return;
      }
      if (!resp.ok) {
        set({
          loading: false,
          error: `Could not load subscription (${resp.status})`,
        });
        return;
      }
      const data = (await resp.json()) as {
        subscription: SubscriptionSnapshot | null;
      };
      get().setFromSnapshot(data.subscription, true);
    } catch (err) {
      set({
        loading: false,
        error:
          err instanceof Error
            ? err.message
            : 'Subscription fetch failed for an unknown reason.',
      });
    }
  },
}));

// Reasonable auto-refresh TTL for cross-surface navigation. 30 seconds
// matches the Redis cache TTL suggested in the agent spec for the tier-
// state endpoint. Opt-in: surfaces that need "fresh on mount" call the
// hook; surfaces that care about live changes also call refresh() on
// focus.
const REFRESH_TTL_MS = 30_000;

export interface UseSubscriptionTierOptions {
  // Do NOT auto-fetch. Useful when the caller (Server Component) has
  // already hydrated the store from an SSR snapshot.
  skipAutoFetch?: boolean;
}

export function useSubscriptionTier(
  options: UseSubscriptionTierOptions = {},
): TierState {
  const state = useTierStore();
  useEffect(() => {
    if (options.skipAutoFetch) return;
    const age = state.lastFetchedAt
      ? Date.now() - state.lastFetchedAt
      : Number.POSITIVE_INFINITY;
    if (age > REFRESH_TTL_MS && !state.loading) {
      state.refresh();
    }
    // state.refresh is stable from Zustand so we only want effect on
    // mount + when skip toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.skipAutoFetch]);
  return state;
}

// Helper for cross-pillar guards: does the current tier allow the
// given feature gate? Keeps the branching out of callsites.
export function tierAllows(
  tier: Tier,
  feature:
    | 'marketplace_unlimited_publish'
    | 'registry_premium'
    | 'protocol_multi_vendor'
    | 'priority_support'
    | 'custom_domains',
): boolean {
  const limits = TIER_LIMITS[tier];
  switch (feature) {
    case 'marketplace_unlimited_publish':
      return limits.marketplace_publish_cap === Number.POSITIVE_INFINITY;
    case 'registry_premium':
      return limits.registry_premium_verified;
    case 'protocol_multi_vendor':
      return limits.protocol_multi_vendor;
    case 'priority_support':
      return limits.priority_support;
    case 'custom_domains':
      return limits.custom_domains;
    default:
      return false;
  }
}

export function getTierLimits(tier: Tier): TierLimits {
  return TIER_LIMITS[tier];
}
