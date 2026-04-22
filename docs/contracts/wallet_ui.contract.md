# Wallet UI

**Contract Version:** 0.1.0
**Owner Agent(s):** Dike (wallet and earnings component author)
**Consumer Agent(s):** Apollo (embeds wallet in Advisor surface), Harmonia (aesthetic sweep), Nemea (visual regression target)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the buyer-facing wallet component (balance, top-up flow stub, recent transactions) and the creator-facing earnings dashboard component, both locale-currency aware and both pure-mock for hackathon per Ghaisan Decision 2.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 5 kaya listrik framing)
- `CLAUDE.md` (root)
- `docs/contracts/billing_meter.contract.md` (currency conventions)
- `docs/contracts/transaction_event.contract.md` (transaction list data source)
- `docs/contracts/advisor_interaction.contract.md` (locale source)
- `docs/contracts/design_tokens.contract.md` (styling)

## 3. Schema Definition

```typescript
// app/banking/wallet/wallet_ui_types.ts

import type { WalletState, Transaction } from '@/banking/schema/wallet.schema';
import type { CurrencyCode } from '@/banking/metering/meter_contract';

export interface WalletCardProps {
  wallet: WalletState;
  onTopUpClick: () => void;          // hackathon: opens a "coming soon" modal, no payment
  onViewHistoryClick: () => void;
  showTopUpButton?: boolean;         // default true; false for creator-earnings view
}

export interface EarningsDashboardProps {
  wallet: WalletState;                // with earnings_usd populated
  payouts: Transaction[];             // kind === 'creator_payout'
  onPayoutClick: (transaction_id: string) => void;
  period: 'last_7d' | 'last_30d' | 'all_time';
  onPeriodChange: (next: 'last_7d' | 'last_30d' | 'all_time') => void;
}

export interface RecentTransactionsListProps {
  transactions: Transaction[];
  currency: CurrencyCode;
  onTransactionClick: (transaction_id: string) => void;
  maxVisible?: number;                // default 10
}

export interface TopUpModalProps {
  open: boolean;
  onClose: () => void;
  message?: string;                   // defaults to "Top-up opens post-hackathon"
}
```

## 4. Interface / API Contract

- `<WalletCard>` renders balance in the session locale's currency via `billing_meter.contract.md` formatting helpers.
- `<EarningsDashboard>` surfaces creator revenue-share summaries over the selected period; internally queries `TransactionLedger.getForWallet` filtered to `kind: 'creator_payout'`.
- `<RecentTransactionsList>` renders each transaction with kind icon, amount in display currency, and timestamp. Clicking a row opens a detail drawer (detail component post-hackathon).
- `<TopUpModal>` for hackathon is a "coming soon" informational surface; real payment form is post-hackathon.
- All components are client components ('use client'); locale changes reactively update currency rendering without remount.

## 5. Event Signatures

- `banking.ui.wallet.opened` payload: `{ wallet_id, currency }`
- `banking.ui.wallet.topup_clicked` payload: `{ wallet_id }` (modal only; no downstream effect for hackathon)
- `banking.ui.earnings.period_changed` payload: `{ wallet_id, next_period }`
- `banking.ui.transaction.clicked` payload: `{ transaction_id }`

## 6. File Path Convention

- Wallet card: `app/banking/wallet/WalletCard.tsx`
- Earnings dashboard: `app/banking/wallet/EarningsDashboard.tsx`
- Recent transactions: `app/banking/wallet/RecentTransactions.tsx`
- Top-up modal: `app/banking/wallet/TopUpModal.tsx`
- Types: `app/banking/wallet/wallet_ui_types.ts`

## 7. Naming Convention

- Component files: `PascalCase.tsx`.
- Period kinds: `last_7d`, `last_30d`, `all_time`.
- Props interface names: `{Component}Props`.

## 8. Error Handling

- Missing `earnings_usd` on `<EarningsDashboard>`: render with zeroes and a "no earnings yet" empty state.
- Empty transactions list: renders an empty state with an encouraging call-to-action.
- Currency mismatch between `wallet.currency` and session locale: wallet currency takes precedence for display; a subtle badge indicates the mismatch and allows one-click re-sync.
- Top-up modal open with no message prop: renders default copy noting hackathon mock status.

## 9. Testing Surface

- Render currency: supply wallet with 100 USD balance in `en-US`, assert `"$100.00"`. Same wallet with `id-ID`, assert `"Rp 1.620.000"` formatted.
- Empty transactions: supply empty array, assert empty-state component mounts.
- Period change: click a period tab, assert `onPeriodChange` invoked with correct kind.
- Top-up click: click button, assert modal opens and `banking.ui.wallet.topup_clicked` event fires.
- Accessibility: every row exposes `aria-label` with kind and amount.

## 10. Open Questions

- None at contract draft. Real-time vs batched meter update frequency is a Dike strategic_decision tracked in `dike.decisions.md`.

## 11. Post-Hackathon Refactor Notes

- Wire `onTopUpClick` to real Stripe Checkout session creation (hackathon stub only per Ghaisan Decision 2).
- Support multi-currency per-wallet (creator earns in USD, spends in IDR) with intra-wallet conversion.
- Add alerts and budget caps: user sets a monthly cap, wallet renders warning states at 80%, 95%, 100%.
- Integrate with payout scheduler (weekly vs monthly creator payouts) with user-facing preferences.
- Add tax document generation link for creators crossing revenue thresholds.
