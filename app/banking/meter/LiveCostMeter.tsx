'use client';

//
// LiveCostMeter.tsx
//
// Conforms to: docs/contracts/cost_meter.contract.md v0.1.0
//              docs/contracts/billing_meter.contract.md v0.1.0
//              docs/contracts/design_tokens.contract.md v0.1.0 (semantic classes only)
// Owner Agent: Dike (Banking Worker, Wallet plus Meter, P3a)
// Consumers:   Apollo (Advisor chat surface), Helios (pipeline viz overlay),
//              Harmonia (aesthetic sweep).
//
// Real time kaya listrik billing meter surface per NarasiGhaisan Section 5.
// Subscribes to the banking meter and pipeline event streams through a
// CostTickerBus supplied by context, coalesces readings into 250ms pulses
// via cost_ticker, and animates the displayed total with a digit roll that
// reads as electricity meter ticking rather than discrete jumps.
//
// Hackathon posture: all cost is synthetic per Ghaisan Decision 2. A demo
// badge is visible at all times so no judge mistakes the ticker for real
// money movement.
//

import { useEffect, useMemo, useRef, useState, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import type { CurrencyCode } from '../metering/meter_contract';
import {
  createCostTicker,
  formatCurrency,
  interpolateDigits,
  type AlertLevel,
  type CostTicker,
  type CostTickerBus,
  type CostTickerSnapshot,
} from './cost_ticker';

// Apollo wraps the Advisor surface with this provider so every embedded
// LiveCostMeter share one bus instance. Banking contract says components
// receive locale via AdvisorSession, so the bus lives up at the session
// provider tier, not inside the meter itself.
export const BankingEventBusContext = createContext<CostTickerBus | null>(null);

export interface LiveCostMeterProps {
  pipeline_run_id: string;
  currency: CurrencyCode;
  budget_cap_usd?: number;
  compact?: boolean;
  // Opt out of the demo badge only if the meter renders inside an already
  // labeled honest claim surface (Apollo chat header shows its own badge).
  hide_mock_badge?: boolean;
}

const STALE_THRESHOLD_MS = 3000;

const ALERT_BORDER_CLASS: Record<AlertLevel, string> = {
  none: 'border-border',
  advisory: 'border-warning/40',
  warning: 'border-warning',
  critical: 'border-critical',
};

const ALERT_TEXT_CLASS: Record<AlertLevel, string> = {
  none: 'text-foreground',
  advisory: 'text-foreground',
  warning: 'text-warning',
  critical: 'text-critical',
};

const ALERT_DOT_CLASS: Record<AlertLevel, string> = {
  none: 'bg-success',
  advisory: 'bg-warning',
  warning: 'bg-warning',
  critical: 'bg-critical',
};

const ALERT_LABEL: Record<AlertLevel, string> = {
  none: 'Within budget',
  advisory: 'Approaching half of cap',
  warning: 'Warning, near cap',
  critical: 'Critical, cap reached',
};

export function LiveCostMeter(props: LiveCostMeterProps) {
  const { pipeline_run_id, currency, budget_cap_usd, compact = false, hide_mock_badge = false } =
    props;
  const bus = useContext(BankingEventBusContext);
  const snapshot = useLiveCostSnapshot({ pipeline_run_id, currency, budget_cap_usd, bus });
  const stale = useStaleDetector(snapshot);

  if (!bus || !pipeline_run_id) {
    return <IdleMeter currency={currency} compact={compact} />;
  }

  const borderClass = ALERT_BORDER_CLASS[snapshot.alert_level];
  const critical = snapshot.alert_level === 'critical';

  if (compact) {
    return (
      <motion.div
        role="status"
        aria-live="polite"
        aria-label={`Live cost meter, ${snapshot.displayed_amount.formatted}, ${ALERT_LABEL[snapshot.alert_level]}`}
        className={`inline-flex items-center gap-2 rounded-pill border bg-background/80 px-3 py-1 text-sm ${borderClass}`}
        animate={
          critical
            ? { boxShadow: ['0 0 0 rgba(239, 68, 68, 0)', '0 0 12px rgba(239, 68, 68, 0.55)', '0 0 0 rgba(239, 68, 68, 0)'] }
            : { boxShadow: 'none' }
        }
        transition={critical ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
      >
        <PulseDot
          is_streaming={snapshot.is_streaming && !stale}
          alert_level={snapshot.alert_level}
        />
        <DigitOdometer
          amount_formatted={snapshot.displayed_amount.formatted}
          className={`tabular-nums font-mono font-semibold ${ALERT_TEXT_CLASS[snapshot.alert_level]}`}
        />
        {stale && snapshot.is_streaming ? <ReconnectingBadge /> : null}
        {!hide_mock_badge ? <MockBadge compact /> : null}
      </motion.div>
    );
  }

  return (
    <motion.section
      role="status"
      aria-live="polite"
      aria-label="Live cost meter"
      className={`relative flex flex-col gap-3 rounded-lg border bg-background/60 p-4 text-foreground backdrop-blur ${borderClass}`}
      animate={
        critical
          ? { boxShadow: ['0 0 0 rgba(239, 68, 68, 0)', '0 0 22px rgba(239, 68, 68, 0.55)', '0 0 0 rgba(239, 68, 68, 0)'] }
          : { boxShadow: 'none' }
      }
      transition={critical ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PulseDot
            is_streaming={snapshot.is_streaming && !stale}
            alert_level={snapshot.alert_level}
          />
          <span className="text-xs uppercase tracking-wide text-muted">
            {snapshot.is_streaming ? 'Live cost' : 'Final cost'}
          </span>
        </div>
        {!hide_mock_badge ? <MockBadge /> : null}
      </header>

      <div className="flex items-baseline gap-3">
        <DigitOdometer
          amount_formatted={snapshot.displayed_amount.formatted}
          className={`tabular-nums font-mono text-3xl font-semibold ${ALERT_TEXT_CLASS[snapshot.alert_level]}`}
        />
        <span className="text-xs text-muted">
          {currency === 'USD' ? 'USD' : 'IDR'}
        </span>
      </div>

      {typeof snapshot.percent_of_budget === 'number' ? (
        <BudgetBar
          percent_of_budget={snapshot.percent_of_budget}
          alert_level={snapshot.alert_level}
          budget_cap_usd={budget_cap_usd!}
          currency={currency}
        />
      ) : (
        <p className="text-xs text-muted">
          No budget cap declared. Set one to see alert thresholds at 25, 50, 75, and 100 percent.
        </p>
      )}

      <PerSpecialistBreakdown snapshot={snapshot} />

      <footer className="flex items-center justify-between text-xs text-muted">
        <span aria-label="Last updated timestamp">
          Last tick, {formatRelative(snapshot.last_updated_at)}
        </span>
        {stale && snapshot.is_streaming ? <ReconnectingBadge /> : null}
      </footer>
    </motion.section>
  );
}

function useLiveCostSnapshot(params: {
  pipeline_run_id: string;
  currency: CurrencyCode;
  budget_cap_usd?: number;
  bus: CostTickerBus | null;
}): CostTickerSnapshot {
  const { pipeline_run_id, currency, budget_cap_usd, bus } = params;
  const initial = useMemo<CostTickerSnapshot>(
    () => ({
      pipeline_run_id,
      currency,
      current_usd: 0,
      displayed_amount: formatCurrency(0, currency),
      per_specialist: [],
      percent_of_budget: budget_cap_usd ? 0 : undefined,
      alert_level: 'none',
      last_updated_at: new Date().toISOString(),
      is_streaming: Boolean(pipeline_run_id),
    }),
    [pipeline_run_id, currency, budget_cap_usd],
  );
  const [snapshot, setSnapshot] = useState<CostTickerSnapshot>(initial);
  const tickerRef = useRef<CostTicker | null>(null);

  useEffect(() => {
    if (!bus || !pipeline_run_id) return undefined;
    setSnapshot(initial);
    const ticker = createCostTicker({
      pipeline_run_id,
      currency,
      budget_cap_usd,
      bus,
    });
    tickerRef.current = ticker;
    const unsubscribe = ticker.subscribe((next) => {
      setSnapshot(next);
    });
    return () => {
      unsubscribe();
      ticker.stop();
      tickerRef.current = null;
    };
  }, [bus, pipeline_run_id, currency, budget_cap_usd, initial]);

  return snapshot;
}

function useStaleDetector(snapshot: CostTickerSnapshot): boolean {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (!snapshot.is_streaming) {
      setStale(false);
      return undefined;
    }
    setStale(false);
    const last = Date.parse(snapshot.last_updated_at);
    if (!Number.isFinite(last)) return undefined;
    const handle = window.setTimeout(() => setStale(true), STALE_THRESHOLD_MS);
    return () => window.clearTimeout(handle);
  }, [snapshot.last_updated_at, snapshot.is_streaming]);
  return stale;
}

function PulseDot({
  is_streaming,
  alert_level,
}: {
  is_streaming: boolean;
  alert_level: AlertLevel;
}) {
  return (
    <motion.span
      aria-hidden
      className={`inline-block size-2 rounded-pill ${ALERT_DOT_CLASS[alert_level]}`}
      animate={is_streaming ? { scale: [1, 1.35, 1], opacity: [0.65, 1, 0.65] } : { scale: 1, opacity: 0.4 }}
      transition={is_streaming ? { duration: 1, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
    />
  );
}

function DigitOdometer({
  amount_formatted,
  className,
}: {
  amount_formatted: string;
  className?: string;
}) {
  const priorRef = useRef<string>(amount_formatted);
  const [displayed, setDisplayed] = useState<string>(amount_formatted);

  useEffect(() => {
    if (priorRef.current === amount_formatted) {
      setDisplayed(amount_formatted);
      return undefined;
    }
    const from = priorRef.current;
    const to = amount_formatted;
    const duration_ms = 320;
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let raf = 0;
    const step = (t: number) => {
      const elapsed = t - start;
      const frac = Math.min(1, elapsed / duration_ms);
      setDisplayed(interpolateDigits(from, to, frac));
      if (frac < 1) {
        raf = requestAnimationFrame(step);
      } else {
        priorRef.current = to;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [amount_formatted]);

  return <span className={className}>{displayed}</span>;
}

function BudgetBar({
  percent_of_budget,
  alert_level,
  budget_cap_usd,
  currency,
}: {
  percent_of_budget: number;
  alert_level: AlertLevel;
  budget_cap_usd: number;
  currency: CurrencyCode;
}) {
  const percent_clamped = Math.min(1, Math.max(0, percent_of_budget));
  const cap_formatted = formatCurrency(budget_cap_usd, currency).formatted;
  const fillClass =
    alert_level === 'critical'
      ? 'bg-critical'
      : alert_level === 'warning'
        ? 'bg-warning'
        : alert_level === 'advisory'
          ? 'bg-warning/60'
          : 'bg-success';
  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent_of_budget * 100)}
        aria-label={`Cost at ${Math.round(percent_of_budget * 100)} percent of ${cap_formatted} cap`}
        className="relative h-2 w-full overflow-hidden rounded-pill bg-muted/30"
      >
        <motion.div
          className={`absolute inset-y-0 left-0 ${fillClass}`}
          initial={{ width: 0 }}
          animate={{ width: `${percent_clamped * 100}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{Math.round(percent_of_budget * 100)} percent of cap</span>
        <span>Cap {cap_formatted}</span>
      </div>
    </div>
  );
}

function PerSpecialistBreakdown({ snapshot }: { snapshot: CostTickerSnapshot }) {
  if (snapshot.per_specialist.length === 0) {
    return (
      <p className="text-xs text-muted">
        No specialist readings yet. Ticker will light up as soon as the first
        meter reading is recorded.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      <AnimatePresence initial={false}>
        {snapshot.per_specialist.slice(0, 5).map((row) => (
          <motion.li
            key={row.specialist_id}
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="flex items-center justify-between rounded-md bg-muted/10 px-2 py-1 text-xs"
          >
            <span className="truncate text-foreground" aria-label={`Specialist ${row.role}`}>
              {row.role}
            </span>
            <span className="tabular-nums font-mono text-muted">
              {formatCurrency(row.cost_usd, snapshot.currency).formatted}
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
      {snapshot.per_specialist.length > 5 ? (
        <li className="text-xs text-muted">
          Plus {snapshot.per_specialist.length - 5} more specialists in this run
        </li>
      ) : null}
    </ul>
  );
}

function IdleMeter({
  currency,
  compact,
}: {
  currency: CurrencyCode;
  compact: boolean;
}) {
  const zero = formatCurrency(0, currency).formatted;
  if (compact) {
    return (
      <div
        role="status"
        aria-label="Cost meter idle, no pipeline run active"
        className="inline-flex items-center gap-2 rounded-pill border border-border bg-background/50 px-3 py-1 text-sm text-muted"
      >
        <span className="inline-block size-2 rounded-pill bg-muted/60" aria-hidden />
        <span className="tabular-nums font-mono">{zero}</span>
      </div>
    );
  }
  return (
    <section
      role="status"
      aria-label="Cost meter idle"
      className="flex flex-col gap-3 rounded-lg border border-border bg-background/40 p-4 text-muted"
    >
      <div className="flex items-center gap-2">
        <span className="inline-block size-2 rounded-pill bg-muted/60" aria-hidden />
        <span className="text-xs uppercase tracking-wide">Idle</span>
      </div>
      <span className="tabular-nums font-mono text-3xl">{zero}</span>
      <p className="text-xs">
        Meter ticks once a Builder run is dispatched and the first specialist
        records a reading.
      </p>
    </section>
  );
}

function MockBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-label="Demo data, no real money"
      className={`inline-flex items-center rounded-pill border border-border bg-muted/20 text-muted ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      }`}
    >
      Demo data
    </span>
  );
}

function ReconnectingBadge() {
  return (
    <span
      aria-label="Event stream reconnecting"
      className="inline-flex items-center gap-1 rounded-pill bg-warning/10 px-2 py-0.5 text-[11px] text-warning"
    >
      <span className="inline-block size-1.5 animate-pulse rounded-pill bg-warning" aria-hidden />
      Reconnecting
    </span>
  );
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'moments ago';
  const delta = Date.now() - t;
  if (delta < 1000) return 'just now';
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return `${Math.round(delta / 3_600_000)}h ago`;
}
