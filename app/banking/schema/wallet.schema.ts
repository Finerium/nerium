// app/banking/schema/wallet.schema.ts
//
// Wallet, Transaction, and RevenueShare types.
// Schema conformance: docs/contracts/transaction_event.contract.md v0.1.0
// Owner: Tyche (Banking Lead, P1)
// Consumers: Dike (wallet UI), Rhea (transaction stream), Ananke (audit),
//            Hecate (identity linkage), Demeter (creator settlement).
//
// Hackathon scope: pure mock per Ghaisan Decision 2 (2026-04-22). No real
// payment API calls. SQLite-backed ledger, synthetic revenue-share splits.

import type { CurrencyCode, PricingTier } from '../metering/meter_contract';

export type TransactionKind =
  | 'agent_invocation'
  | 'subscription_topup'
  | 'creator_payout'
  | 'platform_fee'
  | 'refund'
  | 'adjustment';

export type SettlementStatus = 'pending' | 'settled' | 'failed' | 'disputed';

export interface DisplayAmount {
  amount: number;
  currency: CurrencyCode;
  formatted: string;
}

export interface RevenueShareSplit {
  creator_usd: number;
  platform_usd: number;
  referral_usd?: number;
}

export interface Transaction {
  transaction_id: string;
  kind: TransactionKind;
  pipeline_run_id?: string;
  buyer_identity_id?: string;
  creator_identity_id?: string;
  listing_id?: string;
  amount_usd: number;
  display_amount: DisplayAmount;
  revenue_share?: RevenueShareSplit;
  status: SettlementStatus;
  occurred_at: string;
  settled_at?: string;
  memo?: string;
}

// Default formula referenced in docs/tyche.decisions.md ADR-002.
// platform_fee_pct and creator_share_pct MUST sum to 1.0 together with
// referral_share_pct. Referral lane reserved for post-hackathon rollout.
export interface RevenueShareFormula {
  platform_fee_pct: number;
  creator_share_pct: number;
  referral_share_pct?: number;
}

export const DEFAULT_REVENUE_SHARE_FORMULA: RevenueShareFormula = {
  platform_fee_pct: 0.15,
  creator_share_pct: 0.85,
  referral_share_pct: 0.0,
};

export interface WalletState {
  wallet_id: string;
  identity_id: string;
  currency: CurrencyCode;
  balance_usd: number;
  balance_display: DisplayAmount;
  earnings_usd?: number;
  recent_transactions: Transaction[];
}

export interface TransactionLedger {
  record(transaction: Transaction): Promise<void>;
  getForWallet(identity_id: string, limit?: number): Promise<Transaction[]>;
  getForPipelineRun(pipeline_run_id: string): Promise<Transaction[]>;
  computeRevenueShare(
    amount_usd: number,
    formula?: RevenueShareFormula,
  ): Required<RevenueShareSplit>;
  settle(transaction_id: string): Promise<Transaction>;
}

export type TransactionRecordedEvent = {
  topic: 'banking.transaction.recorded';
  payload: { transaction: Transaction };
};

export type TransactionSettledEvent = {
  topic: 'banking.transaction.settled';
  payload: { transaction_id: string; settled_at: string };
};

export type TransactionFailedEvent = {
  topic: 'banking.transaction.failed';
  payload: { transaction_id: string; reason: string };
};

export type TransactionDisputedEvent = {
  topic: 'banking.transaction.disputed';
  payload: { transaction_id: string; dispute_reason: string };
};

export type TransactionEvent =
  | TransactionRecordedEvent
  | TransactionSettledEvent
  | TransactionFailedEvent
  | TransactionDisputedEvent;

// Re-export tier enum for convenience so Rhea and Dike can import wallet
// schema alone without pulling meter_contract explicitly when they only
// need the pricing tier shape attached to a transaction record.
export type { PricingTier };
