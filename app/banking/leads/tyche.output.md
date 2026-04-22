---
name: Tyche Banking Pillar Orchestration Spec
owner: Tyche (Banking Lead, Phase 1)
model: opus-4-7
version: 0.1.0
status: draft
last_updated: 2026-04-22
parallel_group: P1
contracts:
  - docs/contracts/billing_meter.contract.md v0.1.0
  - docs/contracts/transaction_event.contract.md v0.1.0
---

# Tyche Banking Pillar Orchestration Spec

## 1. Purpose

This spec defines how the Banking pillar runtime stitches together the
usage-based metering model, the transaction ledger, the pricing-tier bands,
and the wallet state surface for NERIUM. It targets the hackathon demo (Lumio
smart reading SaaS build) while keeping the shape honest for post-hackathon
Stripe or Nevermined integration.

The framing is "kaya listrik" per NarasiGhaisan Section 5: every specialist
invocation inside a Builder run writes a meter reading, the reading is priced
in USD, the running total is rendered in the user's locale currency (USD or
IDR), and settlement splits the invocation amount between creator, platform,
and an optional referral lane.

## 2. Scope Boundaries

In scope for Tyche:
- Schema ownership for Transaction, Wallet, RevenueShare, MeterReading, TierBand.
- Pricing tier definitions loaded from `app/banking/pricing/tier_model.json`.
- Cost meter interface consumed by Dike and emitted through by Heracles.
- Mock transaction stream contract that Rhea reads for live pulse visualization.
- Currency display binding to AdvisorSession locale (USD primary, IDR secondary).
- ADR log for platform-fee percentage, tier boundaries, and mock-payment posture.

Out of scope for Tyche:
- Real payment gateway integration. Hackathon ships pure mock per Ghaisan
  Decision 2 (2026-04-22). Stripe test-mode and Nevermined are post-hackathon.
- UI rendering. Dike owns the wallet surface and live meter component.
- Cross-pillar pricing-tier enum alignment with the marketplace is coordinated
  with Demeter but the canonical tier list lives in this pillar.
- Identity verification and trust attestation. Hecate owns Registry identity.

## 3. Architecture Overview

```
 Builder run (Apollo dispatch)
   |
   v
 specialist executes (direct SDK or Heracles MA lane)
   |
   +--> emits MeterReading via BillingMeter.recordReading
   |       |
   |       v
   |   banking.meter.reading_recorded event
   |       |
   |       +--> Dike updates live meter UI at METER_TICK_INTERVAL_MS cadence
   |       +--> Ananke appends MA exposure cap tracker (caps at 150 USD)
   |       +--> Apollo aggregates projected cost into Advisor chat surface
   |
   +--> emits Transaction via TransactionLedger.record when invocation settles
           |
           v
       banking.transaction.recorded event
           |
           +--> Dike renders wallet balance and recent transaction list
           +--> Rhea pushes transaction into live pulse visualization
           +--> Demeter credits creator listing revenue
           +--> Hecate writes audit entry tied to creator_identity_id
```

Canonical ledger stores amounts in USD smallest unit precision, floating-point
rounded to 4 decimals internally, 2 decimals at display. Every surface that
renders an amount reads the `display_amount` sibling field rather than
reformatting the USD value ad hoc. This keeps locale formatting centralized in
`app/banking/metering/format_currency.ts`.

## 4. Deliverables Produced in This Session

1. `app/banking/leads/tyche.output.md` this spec.
2. `app/banking/schema/wallet.schema.ts` Transaction, WalletState, RevenueShareFormula, TransactionLedger interface, event type union.
3. `app/banking/pricing/tier_model.json` four tier bands (free, cheap, mid, premium) with per-unit USD, pre-converted IDR, included allowance, and description.
4. `app/banking/metering/meter_contract.ts` CurrencyCode, ExecutionUnit, PricingTier, TierBand, MeterReading, RunningMeter, CostProjection, BillingMeter interface, constants for tick interval and threshold percents, error classes.
5. `docs/tyche.decisions.md` ADR log for the four strategic decisions resolved or proposed.

## 5. Pricing Tier Summary

| Tier    | per_unit_usd | per_unit_idr | included_units | Target run cost     |
|---------|--------------|--------------|----------------|---------------------|
| free    | 0            | 0            | 10000          | approximately 0 USD |
| cheap   | 0.000005     | 0.081        | 100000         | under 5 USD         |
| mid     | 0.000012     | 0.1944       | 500000         | 5 to 50 USD         |
| premium | 0.000025     | 0.405        | 2000000        | above 50 USD        |

Canonical execution unit is the token. Requests, minutes, and tasks are
normalized to token-equivalent at meter write time. The premium per-token
rate matches Opus 4.7 canonical output pricing as a reasonable anchor; free
and cheap are intentionally generous to keep the non-technical user entry
point low friction.

Tier boundary proposal (Cheap under 5 USD per Builder run, Mid 5 to 50, Premium
above 50) is pending Ghaisan sign-off per `docs/tyche.decisions.md` ADR-001.

## 6. Revenue Share Default

Default formula: `creator_share_pct: 0.85`, `platform_fee_pct: 0.15`,
`referral_share_pct: 0.00`. Surfaced as configurable via
`RevenueShareFormula` so Demeter can run experiments on creator-favorable
splits in niche verticals (for example restaurant automation per
NarasiGhaisan Section 5 creator monetization framing).

ADR-002 in `docs/tyche.decisions.md` captures rationale and the creator-economy
motivation for 85 percent default rather than the 70 percent typical for app
stores.

## 7. Currency and Locale Binding

Canonical ledger currency is USD. Display currency derives from
`AdvisorSession.locale`:
- `en-US` renders USD (symbol `$`, two decimals, thousands comma).
- `id-ID` renders IDR (symbol `Rp`, zero decimals, thousands period).

Conversion uses the static rate `USD_TO_IDR_STATIC = 16200` from
`meter_contract.ts` for the hackathon. Post-hackathon replaces the constant
with a live FX service and expands locale coverage.

All writes to the ledger include a `display_amount` object so consumers never
reformat the amount independently. This guarantees currency display
consistency across the wallet, live meter, transaction pulse visualization,
and Advisor chat cost summary.

## 8. Event Topics Owned

Meter surface:
- `banking.meter.reading_recorded`
- `banking.meter.threshold_crossed`
- `banking.meter.projection_updated`

Transaction surface:
- `banking.transaction.recorded`
- `banking.transaction.settled`
- `banking.transaction.failed`
- `banking.transaction.disputed`

Threshold events fire at 25, 50, 75, and 100 percent of the buyer-declared
budget cap. Apollo subscribes to surface a natural-language warning in the
Advisor chat rather than a silent UI spike.

## 9. Honest-Claim Framing

Public surfaces (README, demo video, Twitter announcement) MUST describe the
Banking pillar as "usage-based metering prototype with mock transaction
ledger, ready for Stripe test-mode wiring post-hackathon." No claim of
processing real payments at hackathon submission time. This aligns with
NarasiGhaisan Section 7 honest-claim filter and V1 anti-pattern Section 7.4.

## 10. Handoff Targets

- Apollo: consumes `projectCost` output for Advisor cost projection surface.
- Dike: consumes `wallet.schema.ts` and `meter_contract.ts` for wallet UI and live meter component, drives tick animation at METER_TICK_INTERVAL_MS.
- Rhea: consumes `Transaction` type for live transaction pulse visualization background.
- Demeter: coordinates on pricing tier enum alignment with the marketplace listing schema; the canonical tier list lives in Banking.
- Heracles: emits MA cost events through BillingMeter.recordReading so Ananke can enforce the 150 USD MA exposure cap.

## 11. Open Loops for V3

Halt-surface items tracked in `docs/tyche.decisions.md`:
1. Tier boundary dollar amounts (Cheap under 5, Mid 5 to 50, Premium above 50) pending explicit Ghaisan lock.
2. Platform fee percentage (15 percent default) pending explicit Ghaisan lock given creator-economy pain motive.
3. Real payment integration scope reaffirmed pure mock for hackathon; Stripe test mode vs Nevermined is a post-hackathon decision.

## 12. Self-Check Summary

Self-check: 19 of 19 pass, issues: none.
