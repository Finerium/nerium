//
// cost_ticker.ts
//
// Conforms to: docs/contracts/cost_meter.contract.md v0.1.0
//              docs/contracts/billing_meter.contract.md v0.1.0
// Owner Agent: Dike (Banking Worker, Wallet plus Meter, P3a)
// Consumers:   app/banking/meter/LiveCostMeter.tsx
//
// Pulse engine for the live cost meter. Subscribes to meter and pipeline
// events, accumulates an append only running total per pipeline run, and
// coalesces listener notifications to METER_TICK_INTERVAL_MS so the meter
// UI reads as kaya listrik per NarasiGhaisan Section 5 without burning
// render budget. Pure logic only, no React imports, so the file is trivial
// to unit test with a fake bus and a mock clock.
//
// Hackathon posture: pure mock per Ghaisan Decision 2 (2026-04-22). Meter
// readings come from InMemoryEventBus emissions, never a real billing
// service. Shape aligns with post-hackathon Stripe test mode wiring.
//

import {
  METER_TICK_INTERVAL_MS,
  USD_TO_IDR_STATIC,
  UnsupportedCurrencyError,
  type CurrencyCode,
  type FormattedCurrency,
  type MeterReading,
} from '../metering/meter_contract';

// Subset of the canonical EventBus shape that cost_ticker actually needs.
// Kept local so the ticker can be driven by a stub bus in tests without
// importing the full Builder pipeline types. The topic list mirrors the
// subscription set in cost_meter.contract.md Section 5.
export type CostTickerTopic =
  | 'banking.meter.reading_recorded'
  | 'banking.meter.threshold_crossed'
  | 'banking.meter.projection_updated'
  | 'pipeline.run.completed';

export interface CostTickerEvent<TPayload = unknown> {
  readonly topic: string;
  readonly pipeline_run_id?: string;
  readonly payload: TPayload;
}

export type CostTickerUnsubscribe = () => void;

export interface CostTickerBus {
  subscribe(
    topic: CostTickerTopic | '*',
    handler: (event: CostTickerEvent) => void,
  ): CostTickerUnsubscribe;
}

export type AlertLevel = 'none' | 'advisory' | 'warning' | 'critical';

export interface PerSpecialistCost {
  specialist_id: string;
  role: string;
  cost_usd: number;
}

export interface CostTickerSnapshot {
  pipeline_run_id: string;
  currency: CurrencyCode;
  current_usd: number;
  displayed_amount: FormattedCurrency;
  per_specialist: PerSpecialistCost[];
  percent_of_budget?: number;
  alert_level: AlertLevel;
  last_updated_at: string;
  is_streaming: boolean;
}

export interface CostTickerOptions {
  pipeline_run_id: string;
  currency: CurrencyCode;
  bus: CostTickerBus;
  budget_cap_usd?: number;
  tick_interval_ms?: number; // override for non-hackathon use, default 250ms
  now?: () => number; // injectable clock for deterministic tests
  schedule?: (fn: () => void, delay_ms: number) => number; // setTimeout shape
  cancel?: (handle: number) => void; // clearTimeout shape
}

export type CostTickerListener = (snapshot: CostTickerSnapshot) => void;

export interface CostTicker {
  getSnapshot(): CostTickerSnapshot;
  subscribe(listener: CostTickerListener): CostTickerUnsubscribe;
  ingestReading(reading: MeterReading, role?: string): void;
  stop(): void;
}

// Threshold mapping per cost_meter.contract.md Section 4. Warning and
// critical states are the visually salient ones; advisory is a softer
// pre warn surface we render as a subtle color shift before 80 percent.
const ADVISORY_THRESHOLD = 0.5;
const WARNING_THRESHOLD = 0.8;
const CRITICAL_THRESHOLD = 1.0;

export function mapAlertLevel(percent_of_budget: number | undefined): AlertLevel {
  if (percent_of_budget === undefined) return 'none';
  if (percent_of_budget >= CRITICAL_THRESHOLD) return 'critical';
  if (percent_of_budget >= WARNING_THRESHOLD) return 'warning';
  if (percent_of_budget >= ADVISORY_THRESHOLD) return 'advisory';
  return 'none';
}

// Locale aware currency formatter. Centralized here so the ticker emits a
// ready to render displayed_amount, which frees the component from doing
// formatting work on every animation frame. Static conversion per ADR 004.
export function formatCurrency(
  amount_usd: number,
  currency: CurrencyCode,
): FormattedCurrency {
  if (currency === 'USD') {
    return {
      amount: amount_usd,
      currency: 'USD',
      formatted: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount_usd),
    };
  }
  if (currency === 'IDR') {
    const amount_idr = amount_usd * USD_TO_IDR_STATIC;
    return {
      amount: amount_idr,
      currency: 'IDR',
      formatted: new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount_idr),
    };
  }
  throw new UnsupportedCurrencyError(currency as string);
}

// Append only aggregation of meter readings for one pipeline run. Duplicate
// reading_id values are ignored, matching the append only posture in
// tyche.decisions.md ADR 006. Negative deltas clamp to zero rather than
// decrement, so any stray compensating rows never cause visible rollback.
class CostAccumulator {
  private total_usd = 0;
  private per_specialist = new Map<string, PerSpecialistCost>();
  private seen_readings = new Set<string>();

  add(reading: MeterReading, role?: string): boolean {
    if (this.seen_readings.has(reading.reading_id)) return false;
    this.seen_readings.add(reading.reading_id);
    if (reading.cost_usd <= 0) return false;
    this.total_usd += reading.cost_usd;
    const prior = this.per_specialist.get(reading.specialist_id);
    if (prior) {
      prior.cost_usd += reading.cost_usd;
    } else {
      this.per_specialist.set(reading.specialist_id, {
        specialist_id: reading.specialist_id,
        role: role ?? reading.specialist_id,
        cost_usd: reading.cost_usd,
      });
    }
    return true;
  }

  getTotalUsd(): number {
    return this.total_usd;
  }

  getPerSpecialist(): PerSpecialistCost[] {
    return Array.from(this.per_specialist.values()).sort(
      (a, b) => b.cost_usd - a.cost_usd,
    );
  }
}

// Runtime ticker. Coalesces event ingestion into tick_interval_ms sized
// windows so a busy pipeline with 20 readings per second still only wakes
// UI listeners four times per second at default cadence.
class CoalescingCostTicker implements CostTicker {
  private readonly pipeline_run_id: string;
  private readonly currency: CurrencyCode;
  private readonly budget_cap_usd?: number;
  private readonly tick_interval_ms: number;
  private readonly accumulator = new CostAccumulator();
  private readonly listeners = new Set<CostTickerListener>();
  private readonly unsubscribers: CostTickerUnsubscribe[] = [];
  private readonly now: () => number;
  private readonly schedule: (fn: () => void, delay_ms: number) => number;
  private readonly cancel: (handle: number) => void;

  private dirty = false;
  private is_streaming = true;
  private last_updated_at: string;
  private scheduled_handle: number | null = null;
  private stopped = false;

  constructor(options: CostTickerOptions) {
    this.pipeline_run_id = options.pipeline_run_id;
    this.currency = options.currency;
    this.budget_cap_usd =
      options.budget_cap_usd && options.budget_cap_usd > 0
        ? options.budget_cap_usd
        : undefined;
    this.tick_interval_ms = options.tick_interval_ms ?? METER_TICK_INTERVAL_MS;
    this.now = options.now ?? (() => Date.now());
    this.schedule =
      options.schedule ??
      ((fn, delay) =>
        setTimeout(fn, delay) as unknown as number);
    this.cancel =
      options.cancel ??
      ((handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>));
    this.last_updated_at = new Date(this.now()).toISOString();
    this.wireBusSubscriptions(options.bus);
  }

  private wireBusSubscriptions(bus: CostTickerBus): void {
    this.unsubscribers.push(
      bus.subscribe('banking.meter.reading_recorded', (event) => {
        const payload = event.payload as { reading?: MeterReading; role?: string } | null;
        if (!payload?.reading) return;
        if (payload.reading.pipeline_run_id !== this.pipeline_run_id) return;
        this.ingestReading(payload.reading, payload.role);
      }),
    );
    this.unsubscribers.push(
      bus.subscribe('banking.meter.threshold_crossed', (event) => {
        const payload = event.payload as
          | { pipeline_run_id?: string }
          | null;
        if (payload?.pipeline_run_id !== this.pipeline_run_id) return;
        // Threshold crossings do not change accumulated cost. They still
        // warrant a snapshot emission so the UI can surface the alert
        // without waiting for the next reading.
        this.markDirty();
      }),
    );
    this.unsubscribers.push(
      bus.subscribe('banking.meter.projection_updated', () => {
        this.markDirty();
      }),
    );
    this.unsubscribers.push(
      bus.subscribe('pipeline.run.completed', (event) => {
        const run_id = event.pipeline_run_id;
        if (run_id && run_id !== this.pipeline_run_id) return;
        this.is_streaming = false;
        this.flushImmediate();
      }),
    );
  }

  ingestReading(reading: MeterReading, role?: string): void {
    if (this.stopped) return;
    const added = this.accumulator.add(reading, role);
    if (!added) return;
    this.last_updated_at = new Date(this.now()).toISOString();
    this.markDirty();
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.scheduled_handle !== null) return;
    if (!this.is_streaming) {
      this.flushImmediate();
      return;
    }
    this.scheduled_handle = this.schedule(() => {
      this.scheduled_handle = null;
      this.flushIfDirty();
    }, this.tick_interval_ms);
  }

  private flushIfDirty(): void {
    if (!this.dirty) return;
    this.flushImmediate();
  }

  private flushImmediate(): void {
    this.dirty = false;
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        // Listener errors never propagate. Mirror event_bus.contract.md
        // Section 8 handler failure isolation policy.
        // eslint-disable-next-line no-console
        console.error('[cost_ticker] listener threw', err);
      }
    }
  }

  getSnapshot(): CostTickerSnapshot {
    const total_usd = this.accumulator.getTotalUsd();
    const displayed_amount = formatCurrency(total_usd, this.currency);
    const percent_of_budget = this.budget_cap_usd
      ? clamp(total_usd / this.budget_cap_usd, 0, Number.POSITIVE_INFINITY)
      : undefined;
    return {
      pipeline_run_id: this.pipeline_run_id,
      currency: this.currency,
      current_usd: total_usd,
      displayed_amount,
      per_specialist: this.accumulator.getPerSpecialist(),
      percent_of_budget,
      alert_level: mapAlertLevel(percent_of_budget),
      last_updated_at: this.last_updated_at,
      is_streaming: this.is_streaming,
    };
  }

  subscribe(listener: CostTickerListener): CostTickerUnsubscribe {
    this.listeners.add(listener);
    // Fire once with current state so a late subscriber is not stuck at zero.
    queueMicrotask(() => listener(this.getSnapshot()));
    return () => {
      this.listeners.delete(listener);
    };
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.is_streaming = false;
    if (this.scheduled_handle !== null) {
      this.cancel(this.scheduled_handle);
      this.scheduled_handle = null;
    }
    while (this.unsubscribers.length > 0) {
      const unsub = this.unsubscribers.pop();
      try {
        unsub?.();
      } catch {
        // Swallow. A stopping ticker never throws at the caller.
      }
    }
    this.listeners.clear();
  }
}

function clamp(value: number, lo: number, hi: number): number {
  if (Number.isNaN(value)) return lo;
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

export function createCostTicker(options: CostTickerOptions): CostTicker {
  return new CoalescingCostTicker(options);
}

// Digit roll helper for the meter odometer animation. Returns the digit
// characters at the interpolation fraction between from and to so the
// component can Framer Motion translate them vertically. The fraction is
// clamped to 0..1 so a buggy animation driver never drifts out of range.
export function interpolateDigits(
  from_formatted: string,
  to_formatted: string,
  fraction: number,
): string {
  const clamped = clamp(fraction, 0, 1);
  const pad_len = Math.max(from_formatted.length, to_formatted.length);
  const from_padded = from_formatted.padStart(pad_len, ' ');
  const to_padded = to_formatted.padStart(pad_len, ' ');
  if (clamped === 0) return from_padded;
  if (clamped === 1) return to_padded;
  let out = '';
  for (let i = 0; i < pad_len; i += 1) {
    const from_char = from_padded[i];
    const to_char = to_padded[i];
    if (from_char === to_char) {
      out += to_char;
      continue;
    }
    const from_digit = Number.parseInt(from_char, 10);
    const to_digit = Number.parseInt(to_char, 10);
    if (Number.isFinite(from_digit) && Number.isFinite(to_digit)) {
      const mid = Math.round(from_digit + (to_digit - from_digit) * clamped);
      out += String(clamp(mid, 0, 9));
    } else {
      out += clamped < 0.5 ? from_char : to_char;
    }
  }
  return out;
}
