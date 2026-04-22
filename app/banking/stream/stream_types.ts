// app/banking/stream/stream_types.ts
//
// TransactionPulse visualization types.
// Schema conformance: docs/contracts/transaction_stream.contract.md v0.1.0
// Owner: Rhea (Banking Worker, P3a)
// Consumers: Apollo (optional subtle background in Advisor view), Harmonia
//            (aesthetic sweep), Nemea (visual regression).
//
// Hackathon scope pure mock per Ghaisan Decision 2 (2026-04-22). The live
// pulse feed is fully synthetic. Contract shape preserves the post-hackathon
// refactor path toward a real banking.transaction.recorded subscription.

import type {
  Transaction,
  TransactionKind,
} from '../schema/wallet.schema';
import type { CurrencyCode } from '../metering/meter_contract';

export type DensityLevel = 'low' | 'medium' | 'high';

export interface TransactionPulseProps {
  currency: CurrencyCode;
  density: DensityLevel;
  height_px?: number;
  opacity?: number;
  pauseOnHover?: boolean;
  className?: string;
}

export interface SyntheticTransaction extends Transaction {
  synthetic: true;
  visual_lane: number;
  pulse_id: string;
}

export interface MockGeneratorConfig {
  spawn_hz: number;
  currency: CurrencyCode;
  amount_distribution: { min_usd: number; max_usd: number };
  creator_id_pool: string[];
  buyer_id_pool: string[];
  listing_slug_pool: string[];
}

// Density to spawn frequency mapping per contract section 3. The contract
// pre-resolves Rhea strategic_decision_hard_stop on animation density by
// declaring the enum values; low is safe baseline, high is demo-hero load.
export const DENSITY_TO_SPAWN_HZ: Readonly<Record<DensityLevel, number>> = {
  low: 0.3,
  medium: 1.0,
  high: 3.0,
};

// Kind to visual color per contract section 4. Colors are expressed as
// OKLCH so they compose with the Harmonia design token layer when active;
// sRGB fallback survives browsers without OKLCH support via the Tailwind v4
// pipeline. These hues are intentionally distinct across kinds so a silent
// screenshot still communicates transaction type.
export const KIND_TO_OKLCH: Readonly<Record<TransactionKind, string>> = {
  agent_invocation: 'oklch(0.85 0.17 215)',
  creator_payout: 'oklch(0.82 0.15 85)',
  platform_fee: 'oklch(0.72 0.22 340)',
  refund: 'oklch(0.78 0.18 55)',
  subscription_topup: 'oklch(0.80 0.12 160)',
  adjustment: 'oklch(0.70 0.06 260)',
};

// Human-readable labels for tooltip and screen-reader exposure. Any change
// here MUST stay in lockstep with TransactionKind in wallet.schema.ts.
export const KIND_TO_LABEL: Readonly<Record<TransactionKind, string>> = {
  agent_invocation: 'Agent invocation',
  creator_payout: 'Creator payout',
  platform_fee: 'Platform fee',
  refund: 'Refund',
  subscription_topup: 'Subscription topup',
  adjustment: 'Adjustment',
};

// Pulse dwell duration. Contract section 4 specifies a 3 second fade window,
// covering the full entrance, glow, and exit arc for a single pulse node.
export const PULSE_DWELL_MS = 3000;

// Max visible pulses at one moment. Higher densities accept shorter dwell or
// more concurrent nodes; the cap prevents visual noise on high density.
export const MAX_VISIBLE_PULSES = 8;

// Render lanes for the flow animation. 4 lanes keep the row reading calm
// while still conveying platform-wide flow shape.
export const VISUAL_LANE_COUNT = 4;

// FPS below which the component auto-degrades density per contract section 8.
// Sampled over the auto-degrade window then stepped down one density level.
export const FPS_DEGRADE_THRESHOLD = 20;
export const FPS_SAMPLE_WINDOW_MS = 2500;

// Optional event topic emitted when the component reaches steady state. QA
// hooks in Nemea regression can subscribe to assert pulse spawn. Contract
// section 5 flags this as optional; Rhea emits it so Nemea has an anchor.
export const STREAM_RENDERED_TOPIC = 'banking.ui.stream.rendered' as const;

export type StreamRenderedEvent = {
  topic: typeof STREAM_RENDERED_TOPIC;
  payload: {
    visible_pulse_count: number;
    spawn_hz_effective: number;
    synthetic: true;
  };
};

// Honest-claim marker baked into every rendered pulse via data-attributes
// per contract section 4. Read-site only; do not mutate at runtime.
export const HONEST_CLAIM_DATA_ATTRS = {
  synthetic: 'data-synthetic',
  kind: 'data-kind',
  amount_usd: 'data-amount-usd',
  currency: 'data-currency',
  pulse_id: 'data-pulse-id',
} as const;

// Visible on-screen label per Ghaisan honest-claim mandate (NarasiGhaisan
// Section 16). Rendered in the component header and exposed via aria-label
// so screen readers announce the mock posture before any pulse.
export const HONEST_CLAIM_HEADER = {
  en: {
    title: 'Demo Transactions',
    subtitle: 'Synthetic activity feed, not real payments.',
  },
  id: {
    title: 'Transaksi Demo',
    subtitle: 'Feed aktivitas sintetis, bukan pembayaran asli.',
  },
} as const;
