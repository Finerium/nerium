'use client';

//
// EarningsDashboard.tsx
//
// Conforms to: docs/contracts/wallet_ui.contract.md v0.1.0
//              docs/contracts/transaction_event.contract.md v0.1.0
//              docs/contracts/design_tokens.contract.md v0.1.0 (semantic classes only)
// Owner Agent: Dike (Banking Worker, Wallet plus Meter, P3a)
// Consumers:   Apollo (creator surface embed), Harmonia (aesthetic sweep).
//
// Creator facing earnings dashboard. Takes a creator wallet plus the full
// creator_payout history, filters by a period toggle, renders aggregated
// stats (total in period, count, average per payout) plus a compact daily
// bar chart, and shows the underlying payout list through WalletCard.
//
// Hackathon posture: pure mock per Ghaisan Decision 2. All earnings are
// synthetic from Tyche revenue share splits recorded into the ledger.
// Post hackathon wiring swaps the data source without changing this UI.
//

import { useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

import type { Transaction, WalletState } from '../schema/wallet.schema';
import { formatCurrency } from '../meter/cost_ticker';
import { WalletCard } from './WalletCard';

export type EarningsPeriod = 'last_7d' | 'last_30d' | 'all_time';

export interface EarningsDashboardProps {
  wallet: WalletState;
  payouts: Transaction[];
  period?: EarningsPeriod;
  onPeriodChange?: (next: EarningsPeriod) => void;
  onPayoutClick?: (transaction_id: string) => void;
  // Hackathon helper, allows parent to override "now" for deterministic
  // screenshots in demo recordings.
  now_ms?: number;
}

const PERIOD_ORDER: EarningsPeriod[] = ['last_7d', 'last_30d', 'all_time'];

const PERIOD_LABEL: Record<EarningsPeriod, string> = {
  last_7d: 'Last 7 days',
  last_30d: 'Last 30 days',
  all_time: 'All time',
};

const PERIOD_WINDOW_DAYS: Record<EarningsPeriod, number | null> = {
  last_7d: 7,
  last_30d: 30,
  all_time: null,
};

export function EarningsDashboard(props: EarningsDashboardProps) {
  const {
    wallet,
    payouts,
    period: controlledPeriod,
    onPeriodChange,
    onPayoutClick,
    now_ms,
  } = props;

  const [uncontrolledPeriod, setUncontrolledPeriod] =
    useState<EarningsPeriod>('last_7d');
  const period = controlledPeriod ?? uncontrolledPeriod;

  const handlePeriodChange = useCallback(
    (next: EarningsPeriod) => {
      if (controlledPeriod === undefined) setUncontrolledPeriod(next);
      onPeriodChange?.(next);
    },
    [controlledPeriod, onPeriodChange],
  );

  const now = now_ms ?? Date.now();
  const window_days = PERIOD_WINDOW_DAYS[period];
  const cutoff = window_days !== null ? now - window_days * 86_400_000 : null;

  const filtered = useMemo(
    () =>
      payouts
        .filter((p) => p.kind === 'creator_payout')
        .filter((p) => {
          if (cutoff === null) return true;
          const t = Date.parse(p.occurred_at);
          return Number.isFinite(t) && t >= cutoff;
        })
        .sort(
          (a, b) =>
            Date.parse(b.occurred_at) - Date.parse(a.occurred_at),
        ),
    [payouts, cutoff],
  );

  const stats = useMemo(
    () => computeStats(filtered, wallet.currency),
    [filtered, wallet.currency],
  );

  const daily = useMemo(
    () => bucketByDay(filtered, now, window_days),
    [filtered, now, window_days],
  );

  // Mirror creator wallet into a payouts-only view so WalletCard renders
  // the period filtered list without pulling in unrelated ledger activity.
  const period_wallet: WalletState = useMemo(
    () => ({
      ...wallet,
      recent_transactions: filtered,
    }),
    [wallet, filtered],
  );

  return (
    <section
      aria-label="Creator earnings dashboard"
      className="flex flex-col gap-4 rounded-lg border border-border bg-background/50 p-5 text-foreground backdrop-blur"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-muted">
            Creator earnings
          </span>
          <h2 className="text-xl font-semibold text-foreground">
            Revenue share summary
          </h2>
          <p className="text-xs text-muted">
            Reflects the 85 percent default creator share per Tyche ADR 002.
            Demo data, Stripe test mode wires post hackathon.
          </p>
        </div>
        <PeriodToggle value={period} onChange={handlePeriodChange} />
      </header>

      <EarningsStatsStrip stats={stats} currency={wallet.currency} period={period} />

      <DailySparkline
        daily={daily}
        currency={wallet.currency}
        window_days={window_days}
      />

      <div className="flex flex-col gap-2">
        <h3 className="text-xs uppercase tracking-wide text-muted">
          Payouts in {PERIOD_LABEL[period].toLowerCase()}
        </h3>
        {filtered.length === 0 ? (
          <EmptyEarningsState />
        ) : (
          <WalletCard
            wallet={period_wallet}
            role_label="Earnings"
            showTopUpButton={false}
            onTransactionClick={onPayoutClick}
            max_recent={Math.min(10, filtered.length)}
          />
        )}
      </div>
    </section>
  );
}

interface EarningsStats {
  total_usd: number;
  total_formatted: string;
  count: number;
  average_usd: number;
  average_formatted: string;
  best_usd: number;
  best_formatted: string;
}

function computeStats(
  payouts: Transaction[],
  currency: WalletState['currency'],
): EarningsStats {
  if (payouts.length === 0) {
    const zero_formatted = formatCurrency(0, currency).formatted;
    return {
      total_usd: 0,
      total_formatted: zero_formatted,
      count: 0,
      average_usd: 0,
      average_formatted: zero_formatted,
      best_usd: 0,
      best_formatted: zero_formatted,
    };
  }
  const total_usd = payouts.reduce(
    (acc, p) =>
      acc + (p.revenue_share?.creator_usd ?? p.amount_usd),
    0,
  );
  const count = payouts.length;
  const average_usd = count > 0 ? total_usd / count : 0;
  const best_usd = payouts.reduce(
    (max, p) =>
      Math.max(max, p.revenue_share?.creator_usd ?? p.amount_usd),
    0,
  );
  return {
    total_usd,
    total_formatted: formatCurrency(total_usd, currency).formatted,
    count,
    average_usd,
    average_formatted: formatCurrency(average_usd, currency).formatted,
    best_usd,
    best_formatted: formatCurrency(best_usd, currency).formatted,
  };
}

function EarningsStatsStrip({
  stats,
  currency,
  period,
}: {
  stats: EarningsStats;
  currency: WalletState['currency'];
  period: EarningsPeriod;
}) {
  return (
    <dl className="grid grid-cols-1 gap-2 rounded-md border border-border bg-muted/10 p-3 sm:grid-cols-3">
      <StatCell
        label={`Total earned, ${PERIOD_LABEL[period].toLowerCase()}`}
        value={stats.total_formatted}
        hint={currency === 'USD' ? 'USD' : 'IDR'}
        emphasize
      />
      <StatCell
        label="Payouts"
        value={String(stats.count)}
        hint={stats.count === 1 ? 'payout' : 'payouts'}
      />
      <StatCell
        label="Average per payout"
        value={stats.average_formatted}
        hint={`Best ${stats.best_formatted}`}
      />
    </dl>
  );
}

function StatCell({
  label,
  value,
  hint,
  emphasize = false,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd
        className={`tabular-nums font-mono ${emphasize ? 'text-2xl font-semibold text-foreground' : 'text-lg text-foreground'}`}
      >
        {value}
      </dd>
      {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
    </div>
  );
}

interface DailyBucket {
  day_iso: string;
  total_usd: number;
}

function bucketByDay(
  payouts: Transaction[],
  now_ms: number,
  window_days: number | null,
): DailyBucket[] {
  const buckets = new Map<string, number>();
  for (const p of payouts) {
    const t = Date.parse(p.occurred_at);
    if (!Number.isFinite(t)) continue;
    const day_iso = new Date(t).toISOString().slice(0, 10);
    const amount = p.revenue_share?.creator_usd ?? p.amount_usd;
    buckets.set(day_iso, (buckets.get(day_iso) ?? 0) + amount);
  }
  if (window_days === null) {
    return Array.from(buckets.entries())
      .map(([day_iso, total_usd]) => ({ day_iso, total_usd }))
      .sort((a, b) => a.day_iso.localeCompare(b.day_iso));
  }
  const result: DailyBucket[] = [];
  for (let i = window_days - 1; i >= 0; i -= 1) {
    const day_iso = new Date(now_ms - i * 86_400_000).toISOString().slice(0, 10);
    result.push({ day_iso, total_usd: buckets.get(day_iso) ?? 0 });
  }
  return result;
}

function DailySparkline({
  daily,
  currency,
  window_days,
}: {
  daily: DailyBucket[];
  currency: WalletState['currency'];
  window_days: number | null;
}) {
  if (daily.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/10 p-3 text-xs text-muted">
        No earnings in this window.
      </div>
    );
  }
  const max = Math.max(...daily.map((b) => b.total_usd), 0);
  const show_axis_labels = daily.length <= 14;
  return (
    <div
      aria-label={`Daily earnings for ${window_days ?? 'all time'} window`}
      className="flex flex-col gap-1 rounded-md border border-border bg-muted/10 p-3"
    >
      <div className="flex items-end gap-1">
        {daily.map((b) => {
          const height_pct = max > 0 ? Math.max(2, (b.total_usd / max) * 100) : 2;
          const label_day = b.day_iso.slice(5); // MM-DD
          return (
            <div key={b.day_iso} className="flex flex-1 flex-col items-center gap-1">
              <motion.div
                role="presentation"
                title={`${b.day_iso}, ${formatCurrency(b.total_usd, currency).formatted}`}
                className={`w-full rounded-sm ${b.total_usd > 0 ? 'bg-primary/70' : 'bg-muted/30'}`}
                initial={{ height: 0 }}
                animate={{ height: `${height_pct}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                style={{ minHeight: 2 }}
              />
              {show_axis_labels ? (
                <span className="text-[9px] text-muted">{label_day}</span>
              ) : null}
            </div>
          );
        })}
      </div>
      {!show_axis_labels ? (
        <div className="flex justify-between text-[10px] text-muted">
          <span>{daily[0]!.day_iso}</span>
          <span>{daily[daily.length - 1]!.day_iso}</span>
        </div>
      ) : null}
    </div>
  );
}

function PeriodToggle({
  value,
  onChange,
}: {
  value: EarningsPeriod;
  onChange: (next: EarningsPeriod) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Earnings period"
      className="inline-flex items-center rounded-pill border border-border bg-muted/10 p-1"
    >
      {PERIOD_ORDER.map((period_option) => {
        const active = period_option === value;
        return (
          <button
            key={period_option}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(period_option)}
            className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? 'bg-primary/20 text-foreground'
                : 'text-muted hover:text-foreground'
            }`}
          >
            {PERIOD_LABEL[period_option]}
          </button>
        );
      })}
    </div>
  );
}

function EmptyEarningsState() {
  return (
    <div
      role="status"
      aria-label="No earnings yet"
      className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border bg-muted/10 px-4 py-6 text-sm text-muted"
    >
      <span className="text-foreground">No earnings yet</span>
      <p className="text-xs">
        List a Builder specialist or MCP agent on the Marketplace. Once buyers
        dispatch runs, this dashboard fills in with kaya listrik micropayments
        at the 85 percent default creator share.
      </p>
      <a
        href="#marketplace-listings"
        className="text-xs text-foreground underline decoration-muted underline-offset-2 hover:decoration-foreground"
      >
        Explore Marketplace listings
      </a>
    </div>
  );
}
