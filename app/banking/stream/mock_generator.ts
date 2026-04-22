// app/banking/stream/mock_generator.ts
//
// Synthetic transaction generator for the TransactionPulse visualization.
// Schema conformance: docs/contracts/transaction_stream.contract.md v0.1.0
// Owner: Rhea (Banking Worker, P3a)
//
// Hackathon scope pure mock per Ghaisan Decision 2 (2026-04-22). Zero real
// payment API calls. Every emitted transaction carries the literal
// synthetic: true discriminator so downstream consumers and screenshot
// surfaces stay honestly labeled per NarasiGhaisan Section 16.

import type {
  Transaction,
  TransactionKind,
  SettlementStatus,
} from '../schema/wallet.schema';
import {
  DEFAULT_REVENUE_SHARE_FORMULA,
} from '../schema/wallet.schema';
import type { CurrencyCode } from '../metering/meter_contract';
import { USD_TO_IDR_STATIC } from '../metering/meter_contract';

import type {
  DensityLevel,
  MockGeneratorConfig,
  SyntheticTransaction,
} from './stream_types';
import {
  DENSITY_TO_SPAWN_HZ,
  VISUAL_LANE_COUNT,
} from './stream_types';

import mockPools from './mock_pools.json';

type KindWeightMap = Record<TransactionKind, number>;

const DEFAULT_KIND_WEIGHTS: KindWeightMap = mockPools.kind_weights as unknown as KindWeightMap;

const DEFAULT_AMOUNT_DISTRIBUTION = {
  min_usd: mockPools.amount_distribution.min_usd,
  max_usd: mockPools.amount_distribution.max_usd,
};

export interface GeneratorController {
  start(onEmit: (tx: SyntheticTransaction) => void): void;
  stop(): void;
  pause(): void;
  resume(): void;
  setDensity(level: DensityLevel): void;
  setCurrency(currency: CurrencyCode): void;
  getEffectiveSpawnHz(): number;
  isPaused(): boolean;
}

export interface MockGeneratorInit {
  currency: CurrencyCode;
  density: DensityLevel;
  config_overrides?: Partial<MockGeneratorConfig>;
  kind_weights?: Partial<KindWeightMap>;
}

// Build a MockGeneratorConfig from the shared pools plus caller overrides.
// Pools come from mock_pools.json so they stay hand-editable without a code
// change; the override knob is reserved for Nemea regression fixtures.
export function buildMockConfig(init: MockGeneratorInit): MockGeneratorConfig {
  const override = init.config_overrides ?? {};
  return {
    spawn_hz: override.spawn_hz ?? DENSITY_TO_SPAWN_HZ[init.density],
    currency: override.currency ?? init.currency,
    amount_distribution: override.amount_distribution ?? DEFAULT_AMOUNT_DISTRIBUTION,
    creator_id_pool: override.creator_id_pool ?? (mockPools.creator_id_pool as string[]),
    buyer_id_pool: override.buyer_id_pool ?? (mockPools.buyer_id_pool as string[]),
    listing_slug_pool: override.listing_slug_pool ?? (mockPools.listing_slug_pool as string[]),
  };
}

// Format an amount in the active display currency using Intl.NumberFormat.
// Canonical ledger stays USD per Tyche ADR-004 so conversion applies only at
// display time. Kept inline until the shared format_currency utility Tyche
// plans under app/banking/metering/format_currency.ts materializes, at which
// point this helper becomes a one-line re-export.
export function formatDisplayAmount(
  amount_usd: number,
  currency: CurrencyCode,
): { amount: number; currency: CurrencyCode; formatted: string } {
  if (currency === 'IDR') {
    const idr = Math.round(amount_usd * USD_TO_IDR_STATIC);
    const formatted = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(idr);
    return { amount: idr, currency: 'IDR', formatted };
  }
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount_usd);
  return { amount: Number(amount_usd.toFixed(2)), currency: 'USD', formatted };
}

// Weighted kind pick. Walks the cumulative weight distribution so kinds with
// zero weight get skipped cleanly. Falls back to agent_invocation on any
// numerical drift (weights sum to less than 1).
function pickKind(weights: KindWeightMap): TransactionKind {
  const entries = Object.entries(weights) as Array<[TransactionKind, number]>;
  const total = entries.reduce((acc, [, w]) => acc + Math.max(w, 0), 0);
  if (total <= 0) {
    return 'agent_invocation';
  }
  let roll = Math.random() * total;
  for (const [kind, weight] of entries) {
    roll -= Math.max(weight, 0);
    if (roll <= 0) {
      return kind;
    }
  }
  return 'agent_invocation';
}

function pickFrom<T>(pool: readonly T[], fallback: T): T {
  if (pool.length === 0) {
    return fallback;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

// Log-uniform sample across the amount distribution. Keeps most pulses
// small (micropayment feel) while still surfacing the occasional higher
// amount so the viewer reads platform variety instead of a flat price line.
function sampleAmountUsd(min_usd: number, max_usd: number): number {
  const safeMin = Math.max(min_usd, 0.0001);
  const safeMax = Math.max(max_usd, safeMin * 1.01);
  const logMin = Math.log(safeMin);
  const logMax = Math.log(safeMax);
  const sampled = Math.exp(logMin + Math.random() * (logMax - logMin));
  return Number(sampled.toFixed(4));
}

function newPulseId(): string {
  const suffix = Math.floor(Math.random() * 1_000_000)
    .toString(36)
    .padStart(4, '0');
  return `pulse_${Date.now()}_${suffix}`;
}

function newTransactionId(): string {
  // Hackathon-grade uuid-like string. Not cryptographically strong; adequate
  // for mock ledger keys only. Real Stripe test-mode path replaces this.
  const block = () =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
  return `${block()}-${block().slice(0, 4)}-${block().slice(0, 4)}-${block().slice(0, 4)}-${block()}${block().slice(0, 4)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// Core pulse factory. Applies kind-specific identity wiring so the tooltip
// narrative stays coherent (creator_payout attributes the creator as
// recipient, platform_fee omits creator, etc.). Revenue share split uses
// the Tyche 85/15 default for agent_invocation kinds.
function generateOne(
  config: MockGeneratorConfig,
  kind_weights: KindWeightMap,
  lane: number,
): SyntheticTransaction {
  const kind = pickKind(kind_weights);
  const amount_usd = sampleAmountUsd(
    config.amount_distribution.min_usd,
    config.amount_distribution.max_usd,
  );
  const display_amount = formatDisplayAmount(amount_usd, config.currency);

  const creator_id = pickFrom(config.creator_id_pool, 'creator-placeholder');
  const buyer_id = pickFrom(config.buyer_id_pool, 'buyer-placeholder');
  const listing_id = pickFrom(config.listing_slug_pool, 'listing-placeholder');

  const occurred_at = nowIso();
  const status: SettlementStatus = kind === 'refund' ? 'pending' : 'settled';
  const settled_at = status === 'settled' ? occurred_at : undefined;

  const base: Transaction = {
    transaction_id: newTransactionId(),
    kind,
    amount_usd,
    display_amount,
    status,
    occurred_at,
    settled_at,
  };

  switch (kind) {
    case 'agent_invocation': {
      const formula = DEFAULT_REVENUE_SHARE_FORMULA;
      const creator_usd = Number(
        (amount_usd * formula.creator_share_pct).toFixed(4),
      );
      const platform_usd = Number(
        (amount_usd * formula.platform_fee_pct).toFixed(4),
      );
      const referral_usd = Number(
        (amount_usd * (formula.referral_share_pct ?? 0)).toFixed(4),
      );
      base.buyer_identity_id = buyer_id;
      base.creator_identity_id = creator_id;
      base.listing_id = listing_id;
      base.revenue_share = { creator_usd, platform_usd, referral_usd };
      break;
    }
    case 'creator_payout': {
      base.creator_identity_id = creator_id;
      base.listing_id = listing_id;
      break;
    }
    case 'platform_fee': {
      base.buyer_identity_id = buyer_id;
      base.listing_id = listing_id;
      break;
    }
    case 'refund': {
      base.buyer_identity_id = buyer_id;
      base.creator_identity_id = creator_id;
      base.listing_id = listing_id;
      base.memo = 'Synthetic refund demo pulse.';
      break;
    }
    case 'subscription_topup': {
      base.buyer_identity_id = buyer_id;
      break;
    }
    case 'adjustment': {
      base.buyer_identity_id = buyer_id;
      base.memo = 'Synthetic adjustment demo pulse.';
      break;
    }
  }

  return {
    ...base,
    synthetic: true,
    visual_lane: lane,
    pulse_id: newPulseId(),
  };
}

// Create the generator controller. Lifecycle: start, pause, resume, stop.
// Spawn cadence is driven by setTimeout rescheduling so density changes and
// pause toggles take effect at the next tick rather than the next frame.
export function createMockGenerator(init: MockGeneratorInit): GeneratorController {
  let config = buildMockConfig(init);
  const weights: KindWeightMap = {
    ...DEFAULT_KIND_WEIGHTS,
    ...(init.kind_weights ?? {}),
  } as KindWeightMap;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let paused = false;
  let laneCursor = 0;
  let emit: ((tx: SyntheticTransaction) => void) | null = null;

  const nextIntervalMs = (): number => {
    const hz = Math.max(config.spawn_hz, 0.1);
    const base = 1000 / hz;
    const jitter = base * (Math.random() * 0.3 - 0.15);
    return Math.max(base + jitter, 80);
  };

  const scheduleNext = () => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(tick, nextIntervalMs());
  };

  const tick = () => {
    if (paused || !emit) {
      scheduleNext();
      return;
    }
    const lane = laneCursor % VISUAL_LANE_COUNT;
    laneCursor = (laneCursor + 1) % (VISUAL_LANE_COUNT * 1000);
    try {
      const tx = generateOne(config, weights, lane);
      emit(tx);
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.warn('[rhea] mock_generator tick failed, continuing:', err);
      }
    }
    scheduleNext();
  };

  return {
    start(onEmit) {
      emit = onEmit;
      paused = false;
      scheduleNext();
    },
    stop() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      emit = null;
      paused = false;
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    setDensity(level) {
      config = {
        ...config,
        spawn_hz: DENSITY_TO_SPAWN_HZ[level],
      };
    },
    setCurrency(currency) {
      config = { ...config, currency };
    },
    getEffectiveSpawnHz() {
      return config.spawn_hz;
    },
    isPaused() {
      return paused;
    },
  };
}

// Named export for tests that want to exercise the factory without the
// timer lifecycle. Returns a one-shot SyntheticTransaction snapshot.
export function generateSyntheticTransactionForTest(
  init: MockGeneratorInit & { lane?: number },
): SyntheticTransaction {
  const config = buildMockConfig(init);
  const weights: KindWeightMap = {
    ...DEFAULT_KIND_WEIGHTS,
    ...(init.kind_weights ?? {}),
  } as KindWeightMap;
  return generateOne(config, weights, init.lane ?? 0);
}
