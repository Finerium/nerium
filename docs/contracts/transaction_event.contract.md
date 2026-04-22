# Transaction Event

**Contract Version:** 0.1.0
**Owner Agent(s):** Tyche (transaction schema owner)
**Consumer Agent(s):** Dike (wallet and earnings dashboard), Rhea (live mock stream visualization), Ananke (audit log), Hecate (audit trail linkage to agent identity), Demeter (revenue-share settlement for listing creators)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the canonical transaction event schema for every agent invocation that incurs a charge or credit, including revenue-share splits between buyer, creator, and platform, so all Banking subscribers read from one shape.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 5 kaya listrik plus creator monetization)
- `CLAUDE.md` (root)
- `docs/contracts/billing_meter.contract.md` (companion schema)
- `docs/contracts/marketplace_listing.contract.md` (listing and creator identity linkage)
- `docs/contracts/agent_identity.contract.md` (creator identity foreign key)

## 3. Schema Definition

```typescript
// app/banking/schema/wallet.schema.ts

import type { CurrencyCode, PricingTier } from '@/banking/metering/meter_contract';

export type TransactionKind =
  | 'agent_invocation'
  | 'subscription_topup'
  | 'creator_payout'
  | 'platform_fee'
  | 'refund'
  | 'adjustment';

export type SettlementStatus = 'pending' | 'settled' | 'failed' | 'disputed';

export interface Transaction {
  transaction_id: string;            // uuid v4
  kind: TransactionKind;
  pipeline_run_id?: string;          // present for agent_invocation and refund
  buyer_identity_id?: string;        // present for agent_invocation and refund
  creator_identity_id?: string;      // present for agent_invocation payouts and creator_payout
  listing_id?: string;
  amount_usd: number;                // canonical USD
  display_amount: { amount: number; currency: CurrencyCode; formatted: string };
  revenue_share?: {
    creator_usd: number;
    platform_usd: number;
    referral_usd?: number;
  };
  status: SettlementStatus;
  occurred_at: string;
  settled_at?: string;
  memo?: string;
}

export interface RevenueShareFormula {
  platform_fee_pct: number;          // default 0.15 (15%)
  creator_share_pct: number;         // default 0.85 (85%)
  referral_share_pct?: number;       // default 0.00 (reserved post-hackathon)
}

export interface WalletState {
  wallet_id: string;
  identity_id: string;
  currency: CurrencyCode;            // binds to AdvisorSession.locale
  balance_usd: number;
  balance_display: { amount: number; currency: CurrencyCode; formatted: string };
  earnings_usd?: number;             // present for creator wallets
  recent_transactions: Transaction[];
}
```

## 4. Interface / API Contract

```typescript
export interface TransactionLedger {
  record(transaction: Transaction): Promise<void>;
  getForWallet(identity_id: string, limit?: number): Promise<Transaction[]>;
  getForPipelineRun(pipeline_run_id: string): Promise<Transaction[]>;
  computeRevenueShare(amount_usd: number, formula?: RevenueShareFormula): { creator_usd: number; platform_usd: number; referral_usd: number };
  settle(transaction_id: string): Promise<Transaction>;
}
```

- Ledger is append-only (no in-place updates except `status` transitions via `settle`).
- `computeRevenueShare` returns floating-point USD values rounded to 4 decimal places for internal precision; display-layer formatting rounds to 2 decimals.
- Hackathon implementation stores transactions in SQLite; no external payment API calls per Ghaisan Decision 2 (pure mock).

## 5. Event Signatures

- `banking.transaction.recorded` payload: `{ transaction: Transaction }`
- `banking.transaction.settled` payload: `{ transaction_id, settled_at }`
- `banking.transaction.failed` payload: `{ transaction_id, reason: string }`
- `banking.transaction.disputed` payload: `{ transaction_id, dispute_reason: string }` (post-hackathon actively used)

## 6. File Path Convention

- Schema: `app/banking/schema/wallet.schema.ts`
- Ledger implementation: `app/banking/ledger/SqliteTransactionLedger.ts`
- Revenue-share helper: `app/banking/ledger/revenue_share.ts`

## 7. Naming Convention

- `TransactionKind` values: lowercase `snake_case`.
- Percentage fields suffixed `_pct` (stored as decimal fraction, e.g., 0.15 = 15%).
- USD amounts use suffix `_usd`; display amounts always accompany with `CurrencyCode`.
- Field names: `snake_case`.

## 8. Error Handling

- `amount_usd` negative for a positive `kind` (invocation, topup): throws.
- `buyer_identity_id` missing for `agent_invocation` kind: throws `RequiredFieldMissing`.
- Settle of already-settled transaction: no-op, returns existing.
- Refund of unsettled transaction: throws `InvalidStateTransition`.
- Unknown currency: throws `UnsupportedCurrencyError`.

## 9. Testing Surface

- Record round trip: insert an `agent_invocation`, fetch by pipeline_run_id, assert retrieval matches.
- Revenue share split: 1.00 USD at default formula, assert creator 0.85 USD + platform 0.15 USD + referral 0.00 USD.
- Settle transition: record pending, call `settle`, assert `status: 'settled'` and `settled_at` populated.
- Refund: record invocation, record refund of same amount, assert net balance zero for that pipeline run.
- Currency display: record 10 USD in `id-ID` locale, assert `display_amount.formatted` is `'Rp 162.000'` (allowing rounding).

## 10. Open Questions

- None at contract draft. Real payment integration (Stripe test mode vs production) is a Tyche post-hackathon strategic_decision, fully stubbed for hackathon.

## 11. Post-Hackathon Refactor Notes

- Pure mock per Ghaisan Decision 2 (2026-04-22): the hackathon implementation never calls real payment APIs. Post-hackathon, connect to Stripe test mode first, then production.
- Add idempotency keys on `record` so retry-safe writes are possible under flaky networks.
- Partial refunds, multi-currency wallets, and per-creator payout schedules (weekly, monthly) are deferred to post-hackathon.
- Integrate with regulatory reporting (tax withholding, 1099-equivalent) when the platform expands to paying creators across jurisdictions.
- Introduce escrow flow for high-value transactions requiring dispute arbitration windows.
