// app/banking/metering/meter_contract.ts
//
// Billing meter interface and shared types.
// Schema conformance: docs/contracts/billing_meter.contract.md v0.1.0
// Owner: Tyche (Banking Lead, P1)
// Consumers: Dike (live meter UI), Heracles (MA executor cost emission),
//            Apollo (cost projection aggregation), Ananke (MA exposure cap tracker).
//
// "Kaya listrik" metering per NarasiGhaisan Section 5: append-only per-execution
// readings, formatted in the locale-bound currency derived from AdvisorSession.
// Hackathon scope pure mock (Ghaisan Decision 2): no Stripe call, synthetic
// readings only; shape aligned for post-hackathon Stripe test-mode wiring.

export type CurrencyCode = 'USD' | 'IDR';

export type ExecutionUnit = 'token' | 'request' | 'minute' | 'task';

export type PricingTier = 'free' | 'cheap' | 'mid' | 'premium';

export interface TierBand {
  tier: PricingTier;
  per_unit_usd: number;
  per_unit_idr: number;
  included_units: number;
  description: string;
}

export interface MeterReading {
  reading_id: string;
  pipeline_run_id: string;
  specialist_id: string;
  execution_unit: ExecutionUnit;
  units_consumed: number;
  unit_cost_usd: number;
  cost_usd: number;
  tier: PricingTier;
  occurred_at: string;
}

export interface FormattedCurrency {
  amount: number;
  currency: CurrencyCode;
  formatted: string;
}

export interface RunningMeter {
  pipeline_run_id: string;
  currency: CurrencyCode;
  total_cost_usd: number;
  displayed_total: FormattedCurrency;
  per_specialist: Array<{ specialist_id: string; cost_usd: number }>;
  started_at: string;
  updated_at: string;
}

export interface CostProjection {
  pipeline_run_id: string;
  projected_total_usd: number;
  projected_per_tier: Record<PricingTier, number>;
  confidence_band: 'high' | 'medium' | 'low';
  generated_at: string;
}

export interface BillingMeter {
  recordReading(reading: MeterReading): Promise<void>;
  getRunningMeter(
    pipeline_run_id: string,
    currency: CurrencyCode,
  ): Promise<RunningMeter>;
  projectCost(
    pipeline_run_id: string,
    planned_specialists: string[],
  ): Promise<CostProjection>;
  loadTierBands(): Promise<TierBand[]>;
  convertUsdToDisplay(
    amount_usd: number,
    currency: CurrencyCode,
  ): { amount: number; formatted: string };
}

// Demo pulse tick frequency. Dike consumes this to drive the live meter
// animation cadence so the visual billing ticker reads as "kaya listrik".
// 250ms gives four pulses per second, perceptibly live yet cheap to render.
export const METER_TICK_INTERVAL_MS = 250;

// Hackathon-static USD to IDR conversion per Ghaisan Decision 1. A live FX
// service replaces this post-hackathon. Conversion is applied at display
// time only; canonical ledger remains USD.
export const USD_TO_IDR_STATIC = 16200;

// Threshold percentages that trigger banking.meter.threshold_crossed relative
// to the user-declared budget cap. Apollo subscribes to surface warnings in
// the Advisor chat before the buyer exhausts allowance.
export const METER_THRESHOLD_PERCENTS: readonly number[] = [0.25, 0.5, 0.75, 1.0];

export type MeterReadingRecordedEvent = {
  topic: 'banking.meter.reading_recorded';
  payload: { reading: MeterReading };
};

export type MeterThresholdCrossedEvent = {
  topic: 'banking.meter.threshold_crossed';
  payload: {
    pipeline_run_id: string;
    threshold_usd: number;
    current_usd: number;
  };
};

export type MeterProjectionUpdatedEvent = {
  topic: 'banking.meter.projection_updated';
  payload: { projection: CostProjection };
};

export type MeterEvent =
  | MeterReadingRecordedEvent
  | MeterThresholdCrossedEvent
  | MeterProjectionUpdatedEvent;

export class InvalidMeterReading extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMeterReading';
  }
}

export class UnsupportedCurrencyError extends Error {
  constructor(currency: string) {
    super(`Unsupported currency: ${currency}. Expected USD or IDR.`);
    this.name = 'UnsupportedCurrencyError';
  }
}
