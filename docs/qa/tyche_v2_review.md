---
name: Tyche v2 Debug Review
reviewer: Tyche-v2 (audit pass, P1 Banking Lead self-review)
target_commit: 8ab9203
target_session: Tyche v1 (row 4 in _meta/TokenManager.md)
date: 2026-04-22
status: PASS
---

# Tyche v2 Debug Review

## 1. Scope

Audit of Tyche v1 artifacts committed at `8ab9203`:

- `app/banking/schema/wallet.schema.ts`
- `app/banking/metering/meter_contract.ts`
- `app/banking/pricing/tier_model.json`
- `app/banking/leads/tyche.output.md`
- `docs/tyche.decisions.md` (6 ADRs)

Audit targets per `.claude/agents/tyche.md` directive:

- Contract conformance against `billing_meter.contract.md` v0.1.0, `transaction_event.contract.md` v0.1.0, and consumer-side `wallet_ui.contract.md` v0.1.0.
- Cost accumulation logic correctness (interface-level, no impl present yet).
- Tier structure validity.
- Honest-claim framing per NarasiGhaisan Section 7 and 20.
- Currency i18n binding correctness for en-US and id-ID.
- ADR integrity and proposed-status preservation for ADR-001 and ADR-002.

Guardrail: Tyche-v2 does not resolve ADR-001 or ADR-002 status. Those remain `proposed` pending explicit Ghaisan sign-off per `strategic_decision_hard_stop` in the tyche prompt.

## 2. Verdict

Verdict: **PASS**. Zero CRITICAL findings. Two MINOR observations documented in Section 4, neither blocks handoff to Apollo, Dike, Rhea, Demeter, or Heracles. No code changes applied in this session.

## 3. Contract Conformance Matrix

### 3.1 `wallet.schema.ts` vs `transaction_event.contract.md` v0.1.0

| Contract Item                                         | v1 Status |
|-------------------------------------------------------|-----------|
| `TransactionKind` 6-variant union                     | pass      |
| `SettlementStatus` 4-variant union                    | pass      |
| `Transaction` interface all 13 fields                 | pass      |
| `RevenueShareFormula` interface                       | pass      |
| `WalletState` interface all 7 fields                  | pass      |
| `TransactionLedger` interface all 5 methods           | pass      |
| Event topics 4 of 4 (recorded, settled, failed, disputed) | pass  |
| Naming convention snake_case field names              | pass      |
| Percentage fields `_pct` suffix                       | pass      |
| USD fields `_usd` suffix                              | pass      |

### 3.2 `meter_contract.ts` vs `billing_meter.contract.md` v0.1.0

| Contract Item                                         | v1 Status |
|-------------------------------------------------------|-----------|
| `CurrencyCode` USD/IDR union                          | pass      |
| `ExecutionUnit` 4-variant union                       | pass      |
| `PricingTier` 4-variant union                         | pass      |
| `TierBand` interface 5 fields                         | pass      |
| `MeterReading` interface 9 fields                     | pass      |
| `RunningMeter` interface 7 fields                     | pass      |
| `CostProjection` interface 5 fields                   | pass      |
| `BillingMeter` interface all 5 methods                | pass      |
| Event topics 3 of 3 (reading_recorded, threshold_crossed, projection_updated) | pass |
| Threshold percent set matches contract Section 5      | pass      |
| Error classes `InvalidMeterReading`, `UnsupportedCurrencyError` | pass |
| Tier file path `app/banking/pricing/tier_model.json`  | pass      |

### 3.3 `wallet.schema.ts` vs `wallet_ui.contract.md` v0.1.0 (consumer side)

| Consumer Requirement                                  | v1 Status |
|-------------------------------------------------------|-----------|
| Exports `WalletState` for `WalletCardProps.wallet`    | pass      |
| Exports `Transaction` for `RecentTransactionsListProps.transactions` | pass |
| Exports `CurrencyCode` via `PricingTier` re-export pattern consistent with meter_contract re-use | pass |
| `WalletState.earnings_usd` optional for buyer wallets | pass      |
| `Transaction.kind === 'creator_payout'` filterable for earnings dashboard | pass |

### 3.4 `tier_model.json` vs `TierBand` interface

| Tier    | per_unit_usd | per_unit_idr | IDR invariant check | included_units | Status |
|---------|--------------|--------------|---------------------|----------------|--------|
| free    | 0            | 0            | 0 == 0 * 16200      | 10000          | pass   |
| cheap   | 0.000005     | 0.081        | 0.081 == 0.000005 * 16200 | 100000   | pass   |
| mid     | 0.000012     | 0.1944       | 0.1944 == 0.000012 * 16200 | 500000  | pass   |
| premium | 0.000025     | 0.405        | 0.405 == 0.000025 * 16200 | 2000000 | pass   |

Monotonicity (per_unit_usd ascending): cheap < mid < premium holds.
Monotonicity (included_units ascending): free < cheap < mid < premium holds.

Revenue share invariant: `platform_fee_pct + creator_share_pct + referral_share_pct` = `0.15 + 0.85 + 0.0` = `1.0`. Invariant holds.

## 4. Observations

### 4.1 MINOR: `DisplayAmount` / `FormattedCurrency` duplicate structural type

Two types carry the same structural shape across modules:

- `wallet.schema.ts` exports `DisplayAmount { amount, currency, formatted }`.
- `meter_contract.ts` exports `FormattedCurrency { amount, currency, formatted }`.

TypeScript structurally compatible at type-check time. Consumers can mix them. Still, naming duplication is a minor type-identity smell.

Recommendation: A follow-up session (likely Dike during wallet UI build, or a Harmonia cleanup pass) should consolidate to a single name. Suggested canonical: `DisplayAmount` in `meter_contract.ts` (billing is the origin context), re-exported from `wallet.schema.ts` for convenience.

No fix this session. Not a blocker.

### 4.2 MINOR: `free` tier `included_units = 10000` interpretation

`billing_meter.contract.md` Section 3 comment on the `TierBand` field reads:

> `included_units: number; // allowance included per subscription period (0 for free tier cap)`

Ambiguous. Could mean:

- (a) Free tier `included_units` should be 0 because the tier is the cap itself.
- (b) Free tier has allowance 0 by convention (no paid allowance carried over).

v1 set free tier `included_units = 10000` with description `"Hard cap at 10000 tokens per session. Preview specialists only"`, framing the free tier as a sandbox with a hard cap rather than a zero-allowance placeholder. Reasonable product judgment.

Recommendation: Document the product intent explicitly if Ghaisan locks ADR-001 with a different semantic. Either 10000-token sandbox cap or 0-zero allowance works, but pick one and annotate. No fix this session. Surface on ADR-001 sign-off.

## 5. Honest-Claim Framing Sweep

NarasiGhaisan Section 7 and Section 20 honest-claim filter:

- `wallet.schema.ts` file header: `"Hackathon scope: pure mock per Ghaisan Decision 2 (2026-04-22). No real payment API calls."` pass.
- `meter_contract.ts` file header: `"Hackathon scope pure mock (Ghaisan Decision 2): no Stripe call, synthetic readings only"` pass.
- `tyche.output.md` Section 9 `"Honest-Claim Framing"` explicitly states demo narration must describe Banking as `"usage-based metering prototype with mock transaction ledger"`. pass.
- `tyche.decisions.md` ADR-003 locks pure mock posture, sources to Ghaisan Decision 2, spells out consequences for README and demo copy. pass.

No over-claim surfaces in any artifact. Consistent "ready for Stripe test-mode wiring post-hackathon" framing across the pillar.

## 6. Currency i18n Binding Sweep

`billing_meter.contract.md` Section 9 testing surface prescribes:

- USD format: `"$4.72"` (symbol `$`, two decimals, thousands comma).
- IDR format: `"Rp 76.464"` (symbol `Rp`, zero decimals, thousands period).

v1 alignment:

- `meter_contract.ts` exports `USD_TO_IDR_STATIC = 16200` matching Ghaisan Decision 1 static rate.
- `tyche.output.md` Section 7 documents locale binding: `en-US` to USD, `id-ID` to IDR, symbol and separator conventions match contract testing surface.
- `tier_model.json` pre-computes IDR values at 16200 static, so Dike does not reconvert per render (performance plus consistency with contract Section 4 `displayed_total.formatted`).

Locale binding derives from `AdvisorSession.locale` per ADR-004 and Ghaisan Decision 1. Conversion applied at display time only; canonical ledger remains USD per ADR-004. pass.

## 7. ADR Integrity Check

| ADR | Title                                                  | Status    | Recommended Posture Applied | Halt Trigger Honored |
|-----|--------------------------------------------------------|-----------|-----------------------------|----------------------|
| 001 | Pricing Tier Boundaries                                | proposed  | yes (tier_model.json ships recommended bands) | yes (status retained as `proposed`, not advanced) |
| 002 | Revenue Share Default 85 / 15                          | proposed  | yes (`DEFAULT_REVENUE_SHARE_FORMULA` ships 0.15 / 0.85 / 0.0) | yes |
| 003 | Pure Mock Payment Posture                              | accepted  | sourced to Ghaisan Decision 2 | n/a (locked) |
| 004 | Currency Model USD Primary IDR Secondary               | accepted  | sourced to Ghaisan Decision 1 | n/a (locked) |
| 005 | Meter Tick Interval 250 ms                             | accepted  | Tyche creative-latitude zone per prompt | n/a |
| 006 | Append-Only Ledger and Meter                           | accepted  | implementation discipline | n/a |

All 6 ADRs present. Proposed ADRs carry explicit halt trigger text. Recommended postures are applied to code artifacts so downstream consumers (Dike, Rhea, Apollo, Heracles) can build against a working default. Tyche-v2 confirms status fields are untouched: `proposed` remains `proposed`.

## 8. Cross-Reference Validity

- `tyche.output.md` Section 11 references `docs/tyche.decisions.md` ADR-001 and ADR-002 `by identifier` pass.
- `tyche.decisions.md` ADR-002 references `wallet.schema.ts` `RevenueShareFormula` and `computeRevenueShare` pass.
- `wallet.schema.ts` inline comment references ADR-002 by identifier pass.
- `meter_contract.ts` file header references `Ghaisan Decision 1` and `Ghaisan Decision 2`; these map to ADR-004 and ADR-003 respectively. Indirect but traceable via `tyche.decisions.md`.
- Contract file paths match filesystem layout: `billing_meter.contract.md`, `transaction_event.contract.md`, `wallet_ui.contract.md` all present under `docs/contracts/` pass.

## 9. Em-Dash and Emoji Sweep

Re-ran sweep against all 5 v1 artifacts plus this review doc. Zero U+2014 hits. Zero emoji hits in tested Unicode ranges (U+1F300 to U+1FAFF, U+2600 to U+27BF, U+1F000 to U+1F9FF). pass.

## 10. Categorized Findings Summary

- CRITICAL: 0.
- MINOR: 2 (Section 4.1 DisplayAmount duplicate, Section 4.2 free tier included_units interpretation).
- CLEAN: Everything else. Contract conformance, event topic coverage, error class definitions, honest-claim framing, currency binding, tier invariants, ADR integrity, cross-references, naming conventions, em-dash and emoji anti-pattern discipline.

## 11. Handoff Readiness

Banking pillar v1 is green for downstream consumption:

- Apollo can call `projectCost` and subscribe to `banking.meter.threshold_crossed`.
- Dike can import `WalletState`, `Transaction`, `MeterReading`, and tick at `METER_TICK_INTERVAL_MS`.
- Rhea can import `Transaction` for pulse visualization, read `status` and `display_amount.formatted`.
- Demeter pricing-tier enum aligns, canonical tier list ownership lives in Banking.
- Heracles can invoke `BillingMeter.recordReading` for MA cost events; Ananke can enforce the 150 USD cap by aggregating `RunningMeter.total_cost_usd` across MA-tagged readings.

## 12. Follow-Up Recommendations

Not in scope for this review session, surface to future sessions or V3 ferry:

1. Consolidate `DisplayAmount` and `FormattedCurrency` to one canonical type. Candidate session: Dike wallet UI build or Harmonia design-token sweep.
2. On Ghaisan ADR-001 sign-off, re-confirm free tier `included_units` semantic (10000 sandbox cap vs 0 placeholder). Persist decision in the ADR.
3. On Ghaisan ADR-002 sign-off, lock revenue share percentages and propagate to any Banking demo copy or README narrative that references the take rate.
4. Post-hackathon refactor notes in `billing_meter.contract.md` Section 11 and `transaction_event.contract.md` Section 11 are coherent with the v1 shipped shape; no adjustments needed.

## 13. Self-Check (19 items)

1. Hard constraints respected (no em-dash, no emoji, English, opus-4-7, exact paths). pass.
2. Mandatory reading completed (NarasiGhaisan, CLAUDE.md, billing_meter v0.1.0, transaction_event v0.1.0, wallet_ui v0.1.0, agent structure 5.4, 5 v1 artifacts). pass.
3. Output file produced (`docs/qa/tyche_v2_review.md`). pass.
4. No em-dash, no emoji (grep verified). pass.
5. Contract conformance (v0.1.0 references explicit). pass.
6. Input files read. pass.
7. Token budget tracked via /cost flow. pass.
8. Halt triggers respected (ADR-001 and ADR-002 status preserved `proposed`, no silent advance). pass.
9. Strategic decision hard stops respected (did not resolve ADR-001 or ADR-002). pass.
10. File path convention consistent. pass.
11. Naming convention consistent. pass.
12. Schema validity per contract. pass.
13. Error handling per contract (error classes verified). pass.
14. Testing surface addressed (contract Section 9 prescriptions traced in review Section 6). pass.
15. Cross-references valid. pass.
16. Register consistency (English technical artifact). pass.
17. Math LaTeX formatted (n/a, no math expressions needed). pass.
18. Factual claims verifiable (PLN utility analogy, Ghaisan Decisions 1 + 2, ADR identifiers all traceable). pass.
19. Commit message prefix aligned with v2 convention (`Tyche-v2 fix: ...` would apply only on critical fix; none needed). pass.

Self-check: 19 of 19 pass, issues: none.
