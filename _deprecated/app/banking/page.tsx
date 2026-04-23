'use client';
//
// app/banking/page.tsx
//
// Nemea Phase 5 QA emergency harness (2026-04-22). Renders the Dike
// WalletCard plus the Rhea TransactionPulse side by side against a single
// synthetic WalletState. LiveCostMeter is intentionally omitted here; it
// expects a CostTickerBus from a live pipeline run context and is exercised
// via the /builder page where the visualizer surfaces a live stream.
//

import { WalletCard } from './wallet/WalletCard';
import { TransactionPulse } from './stream/TransactionPulse';
import type { WalletState, Transaction } from './schema/wallet.schema';
import { HarnessShell } from '../_harness/HarnessShell';

const DEMO_RECENT: Transaction[] = [
  {
    transaction_id: 'txn_demo_001',
    kind: 'subscription_topup',
    amount_usd: 25.0,
    display_amount: { amount: 25.0, currency: 'USD', formatted: '$25.00' },
    status: 'settled',
    occurred_at: '2026-04-22T10:00:00.000Z',
    settled_at: '2026-04-22T10:00:02.000Z',
    memo: 'Demo top up',
  },
  {
    transaction_id: 'txn_demo_002',
    kind: 'agent_invocation',
    pipeline_run_id: 'run_demo_lumio_a',
    listing_id: 'lst_001_restaurant_shift_scheduler',
    amount_usd: 0.08,
    display_amount: { amount: 0.08, currency: 'USD', formatted: '$0.08' },
    revenue_share: { creator_usd: 0.068, platform_usd: 0.012 },
    status: 'settled',
    occurred_at: '2026-04-22T10:15:00.000Z',
    settled_at: '2026-04-22T10:15:01.000Z',
  },
  {
    transaction_id: 'txn_demo_003',
    kind: 'agent_invocation',
    pipeline_run_id: 'run_demo_lumio_b',
    listing_id: 'lst_004_trading_signal_research_aid',
    amount_usd: 0.45,
    display_amount: { amount: 0.45, currency: 'USD', formatted: '$0.45' },
    revenue_share: { creator_usd: 0.383, platform_usd: 0.067 },
    status: 'settled',
    occurred_at: '2026-04-22T10:18:00.000Z',
    settled_at: '2026-04-22T10:18:01.000Z',
  },
];

const DEMO_WALLET: WalletState = {
  wallet_id: 'wallet_demo_001',
  identity_id: 'id_demo_buyer',
  currency: 'USD',
  balance_usd: 24.47,
  balance_display: { amount: 24.47, currency: 'USD', formatted: '$24.47' },
  earnings_usd: 0,
  recent_transactions: DEMO_RECENT,
};

export default function BankingPage() {
  return (
    <HarnessShell
      heading="Banking"
      sub="Usage-based billing for agents. Per-execution charging in the spirit of utility metering. Feed and balances are fully synthetic, no live Stripe."
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 380px) 1fr',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        <div>
          <WalletCard wallet={DEMO_WALLET} />
        </div>
        <div>
          <TransactionPulse currency="USD" density="medium" height_px={360} />
        </div>
      </div>
    </HarnessShell>
  );
}
