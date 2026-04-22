'use client';

//
// WalletCard.tsx
//
// Conforms to: docs/contracts/wallet_ui.contract.md v0.1.0
//              docs/contracts/transaction_event.contract.md v0.1.0
//              docs/contracts/design_tokens.contract.md v0.1.0 (semantic classes only)
// Owner Agent: Dike (Banking Worker, Wallet plus Meter, P3a)
// Consumers:   Apollo (Advisor chat embed), Harmonia (aesthetic sweep).
//
// Buyer facing wallet surface: balance at top, top up button, recent
// transaction list. Honest claim badge "Demo balance" stays visible at
// all times per NarasiGhaisan Section 7 and Ghaisan Decision 2 pure mock
// posture. Top up opens a "coming soon" modal, never a real checkout.
//
// The card also accepts an optional hide_top_up flag so the same component
// can be reused for the creator earnings surface (EarningsDashboard wraps
// this layout with showTopUpButton off via hide_top_up).
//

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import type {
  Transaction,
  TransactionKind,
  WalletState,
} from '../schema/wallet.schema';
import { formatCurrency } from '../meter/cost_ticker';

export interface WalletCardProps {
  wallet: WalletState;
  onTopUpClick?: () => void;
  onViewHistoryClick?: () => void;
  onTransactionClick?: (transaction_id: string) => void;
  showTopUpButton?: boolean;
  // Wallet role label shown above the balance. Defaults to "Wallet" but
  // EarningsDashboard passes "Earnings" so the same visual surface reads
  // correctly for creator facing flows.
  role_label?: string;
  max_recent?: number;
}

const KIND_COPY: Record<TransactionKind, string> = {
  agent_invocation: 'Agent invocation',
  subscription_topup: 'Top up',
  creator_payout: 'Creator payout',
  platform_fee: 'Platform fee',
  refund: 'Refund',
  adjustment: 'Adjustment',
};

const KIND_DIRECTION: Record<TransactionKind, 'in' | 'out' | 'neutral'> = {
  agent_invocation: 'out',
  subscription_topup: 'in',
  creator_payout: 'in',
  platform_fee: 'out',
  refund: 'in',
  adjustment: 'neutral',
};

const KIND_TONE: Record<TransactionKind, 'success' | 'muted' | 'critical' | 'warning'> = {
  agent_invocation: 'muted',
  subscription_topup: 'success',
  creator_payout: 'success',
  platform_fee: 'muted',
  refund: 'warning',
  adjustment: 'muted',
};

export function WalletCard(props: WalletCardProps) {
  const {
    wallet,
    onTopUpClick,
    onViewHistoryClick,
    onTransactionClick,
    showTopUpButton = true,
    role_label = 'Wallet',
    max_recent = 5,
  } = props;

  const [topUpOpen, setTopUpOpen] = useState(false);

  const recent = useMemo(
    () => wallet.recent_transactions.slice(0, max_recent),
    [wallet.recent_transactions, max_recent],
  );

  function handleTopUpClick() {
    setTopUpOpen(true);
    onTopUpClick?.();
  }

  return (
    <section
      aria-label={`${role_label} card`}
      className="flex flex-col gap-4 rounded-lg border border-border bg-background/60 p-5 text-foreground backdrop-blur"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-muted">
            {role_label}
          </span>
          <WalletHeadlineBalance wallet={wallet} role_label={role_label} />
        </div>
        <div className="flex flex-col items-end gap-1">
          <DemoBalanceBadge />
          <span className="text-[11px] text-muted">
            {wallet.currency === 'USD' ? 'Displayed in USD' : 'Ditampilkan dalam IDR'}
          </span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {showTopUpButton ? (
          <button
            type="button"
            onClick={handleTopUpClick}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-primary/10 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden className="text-lg leading-none">+</span>
            Top up
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onViewHistoryClick?.()}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View full history
        </button>
      </div>

      <RecentTransactionsList
        transactions={recent}
        total_count={wallet.recent_transactions.length}
        currency_hint={wallet.currency}
        onTransactionClick={onTransactionClick}
      />

      <TopUpModal
        open={topUpOpen}
        onClose={() => setTopUpOpen(false)}
      />
    </section>
  );
}

function WalletHeadlineBalance({
  wallet,
  role_label,
}: {
  wallet: WalletState;
  role_label: string;
}) {
  const amount_formatted =
    wallet.balance_display?.formatted ??
    formatCurrency(wallet.balance_usd, wallet.currency).formatted;
  return (
    <motion.div
      className="flex items-baseline gap-2"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <span
        aria-label={`${role_label} balance, ${amount_formatted}`}
        className="tabular-nums font-mono text-3xl font-semibold text-foreground"
      >
        {amount_formatted}
      </span>
      {wallet.currency === 'USD' ? (
        <span className="text-xs text-muted">USD</span>
      ) : (
        <span className="text-xs text-muted">IDR</span>
      )}
    </motion.div>
  );
}

function RecentTransactionsList({
  transactions,
  total_count,
  currency_hint,
  onTransactionClick,
}: {
  transactions: Transaction[];
  total_count: number;
  currency_hint: WalletState['currency'];
  onTransactionClick?: (transaction_id: string) => void;
}) {
  if (transactions.length === 0) {
    return (
      <div
        role="status"
        aria-label="No recent transactions"
        className="flex flex-col items-start gap-1 rounded-md border border-dashed border-border bg-muted/10 px-3 py-4 text-sm text-muted"
      >
        <span className="text-foreground">No transactions yet</span>
        <span className="text-xs">
          Start a Builder run and this feed will light up with kaya listrik
          micropayments.
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted">
        <span>Recent activity</span>
        <span>
          {transactions.length} of {total_count}
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        <AnimatePresence initial={false}>
          {transactions.map((tx) => (
            <TransactionRow
              key={tx.transaction_id}
              transaction={tx}
              currency_hint={currency_hint}
              onClick={
                onTransactionClick
                  ? () => onTransactionClick(tx.transaction_id)
                  : undefined
              }
            />
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function TransactionRow({
  transaction,
  currency_hint,
  onClick,
}: {
  transaction: Transaction;
  currency_hint: WalletState['currency'];
  onClick?: () => void;
}) {
  const direction = KIND_DIRECTION[transaction.kind];
  const tone = KIND_TONE[transaction.kind];
  const amount_formatted = transaction.display_amount?.formatted
    ? transaction.display_amount.formatted
    : formatCurrency(transaction.amount_usd, transaction.display_amount?.currency ?? currency_hint).formatted;
  const amount_prefix = direction === 'in' ? '+' : direction === 'out' ? '-' : '';
  const amount_class =
    tone === 'success'
      ? 'text-success'
      : tone === 'critical'
        ? 'text-critical'
        : tone === 'warning'
          ? 'text-warning'
          : 'text-foreground';
  const clickable = Boolean(onClick);
  const base_class = `flex w-full items-center justify-between gap-3 rounded-md border border-transparent bg-muted/10 px-3 py-2 text-left text-sm transition-colors ${clickable ? 'hover:border-border hover:bg-muted/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring' : ''}`;
  const body = <TransactionRowBody transaction={transaction} direction={direction} tone={tone} amount_prefix={amount_prefix} amount_formatted={amount_formatted} amount_class={amount_class} />;
  if (clickable) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        aria-label={`${KIND_COPY[transaction.kind]}, ${amount_prefix}${amount_formatted}`}
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.22 }}
        className={base_class}
      >
        {body}
      </motion.button>
    );
  }
  return (
    <motion.li
      role="listitem"
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22 }}
      className={base_class}
    >
      {body}
    </motion.li>
  );
}

function TransactionRowBody({
  transaction,
  direction,
  tone,
  amount_prefix,
  amount_formatted,
  amount_class,
}: {
  transaction: Transaction;
  direction: 'in' | 'out' | 'neutral';
  tone: 'success' | 'muted' | 'critical' | 'warning';
  amount_prefix: string;
  amount_formatted: string;
  amount_class: string;
}) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <DirectionDot direction={direction} tone={tone} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-foreground">
            {KIND_COPY[transaction.kind]}
          </span>
          <span className="truncate text-xs text-muted">
            {formatCounterparty(transaction)}
            <span aria-hidden className="mx-1.5">
              ·
            </span>
            <span title={transaction.occurred_at}>
              {formatRelative(transaction.occurred_at)}
            </span>
            {transaction.status !== 'settled' ? (
              <>
                <span aria-hidden className="mx-1.5">
                  ·
                </span>
                <span className={statusClass(transaction.status)}>
                  {transaction.status}
                </span>
              </>
            ) : null}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className={`tabular-nums font-mono text-sm ${amount_class}`}>
          {amount_prefix}
          {amount_formatted}
        </span>
        {transaction.revenue_share ? (
          <span className="text-[10px] text-muted">
            Creator {shareRatio(transaction)}
          </span>
        ) : null}
      </div>
    </>
  );
}

function DirectionDot({
  direction,
  tone,
}: {
  direction: 'in' | 'out' | 'neutral';
  tone: 'success' | 'muted' | 'critical' | 'warning';
}) {
  const tone_class =
    tone === 'success'
      ? 'bg-success'
      : tone === 'critical'
        ? 'bg-critical'
        : tone === 'warning'
          ? 'bg-warning'
          : 'bg-muted/60';
  const glyph = direction === 'in' ? '+' : direction === 'out' ? '-' : '~';
  return (
    <span
      aria-hidden
      className={`inline-flex size-6 items-center justify-center rounded-pill text-xs text-background ${tone_class}`}
    >
      {glyph}
    </span>
  );
}

function DemoBalanceBadge() {
  return (
    <span
      aria-label="Demo balance, mock data, no real money"
      className="inline-flex items-center gap-1 rounded-pill border border-border bg-muted/20 px-2 py-0.5 text-[11px] text-muted"
    >
      <span aria-hidden className="inline-block size-1.5 rounded-pill bg-warning" />
      Demo balance
    </span>
  );
}

function TopUpModal({
  open,
  onClose,
  message,
}: {
  open: boolean;
  onClose: () => void;
  message?: string;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="wallet-topup-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wallet-topup-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button
            type="button"
            aria-label="Close top up dialog"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className="relative flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-background p-6 text-foreground shadow-xl"
          >
            <header className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-muted">
                Banking
              </span>
              <h2
                id="wallet-topup-title"
                className="text-xl font-semibold text-foreground"
              >
                Top up opens post hackathon
              </h2>
            </header>
            <p className="text-sm text-muted">
              {message ??
                'Stripe test mode wiring ships right after the hackathon submission. For now the wallet renders mock balances so judges can see the kaya listrik meter without real money moving.'}
            </p>
            <ul className="flex flex-col gap-2 rounded-md bg-muted/10 p-3 text-xs text-muted">
              <li>
                <span className="text-foreground">Why the stub.</span> Pure
                mock posture per Ghaisan Decision 2, 2026 April 22. No payment
                API call anywhere in the runtime.
              </li>
              <li>
                <span className="text-foreground">What unlocks.</span> Drop in
                Stripe adapter maps this onClose to a real checkout session.
              </li>
              <li>
                <span className="text-foreground">Contract stable.</span>{' '}
                Transaction schema and wallet state already align with the
                post hackathon shape.
              </li>
            </ul>
            <footer className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Close
              </button>
            </footer>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function formatCounterparty(tx: Transaction): string {
  if (tx.listing_id) return `Listing ${truncateId(tx.listing_id)}`;
  if (tx.creator_identity_id) return `Creator ${truncateId(tx.creator_identity_id)}`;
  if (tx.buyer_identity_id) return `Buyer ${truncateId(tx.buyer_identity_id)}`;
  if (tx.pipeline_run_id) return `Run ${truncateId(tx.pipeline_run_id)}`;
  return tx.memo ?? 'Internal adjustment';
}

function truncateId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-3)}`;
}

function shareRatio(tx: Transaction): string {
  if (!tx.revenue_share) return '';
  const creator = tx.revenue_share.creator_usd;
  const platform = tx.revenue_share.platform_usd;
  const total = creator + platform + (tx.revenue_share.referral_usd ?? 0);
  if (total <= 0) return '';
  const pct = Math.round((creator / total) * 100);
  return `${pct} percent`;
}

function statusClass(
  status: 'pending' | 'settled' | 'failed' | 'disputed',
): string {
  switch (status) {
    case 'pending':
      return 'text-warning';
    case 'failed':
      return 'text-critical';
    case 'disputed':
      return 'text-warning';
    default:
      return 'text-muted';
  }
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'just now';
  const delta = Date.now() - t;
  if (delta < 1000) return 'just now';
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  return `${Math.round(delta / 86_400_000)}d ago`;
}
