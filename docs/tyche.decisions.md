---
name: Tyche ADR Log
owner: Tyche (Banking Lead)
status: draft
version: 0.1.0
last_updated: 2026-04-22
---

# Tyche Decisions Log

Architecture Decision Records for the Banking pillar. Each entry states
context, decision, status, and rationale. Items marked `proposed` require
explicit Ghaisan sign-off before they advance to `accepted`.

## ADR-001: Pricing Tier Boundaries

Status: proposed
Date: 2026-04-22

Context: The tier_model.json ships four tiers (free, cheap, mid, premium) with
per-token rates that imply target Builder run cost bands. NarasiGhaisan
Section 4 anchors the range (free sandbox, cheap under 5 USD, mid 5 to 50,
premium above 50 scaling to Tokopedia-tier 500 to 2500 USD).

Decision: Adopt the following target run cost bands as the policy anchor for
tier selection in the Builder UI.

- free: approximately 0 USD per Builder run, hard-capped at 10000 tokens.
- cheap: under 5 USD per Builder run.
- mid: 5 to 50 USD per Builder run.
- premium: above 50 USD per Builder run, scaling to Tokopedia-tier output.

Per-token rates in `tier_model.json`:
- cheap 0.000005 USD per token (5 USD per million).
- mid 0.000012 USD per token (12 USD per million).
- premium 0.000025 USD per token (25 USD per million, anchored to Opus 4.7 output canonical rate).

Rationale: Cheap rate is set low enough that a non-technical user running a
one-shot landing page (approximately 300K tokens end to end) stays under the
5 USD ceiling. Mid rate allows richer multi-specialist pipelines within the
50 USD ceiling. Premium rate aligns with Opus 4.7 canonical output pricing so
the tier economically reflects "Opus across every agent".

Consequences: If Ghaisan locks different boundaries, re-price `tier_model.json`
and re-run any cached projection. Rhea pulse visualization and Dike live
meter do not need code changes because they read through the tier metadata.

Halt trigger: This is a `strategic_decision_hard_stop` per tyche prompt. Do
not advance to `accepted` without explicit Ghaisan sign-off.

## ADR-002: Revenue Share Default at 85 Percent Creator / 15 Percent Platform

Status: proposed
Date: 2026-04-22

Context: NarasiGhaisan Section 5 frames Banking as solving creator
monetization gap. Indie developers and agencies currently post MCP servers
and subagents gratis on X or GitHub because there is no home to monetize. The
platform fee percentage materially shapes whether creators prefer NERIUM over
self-hosted marketplace pages.

Decision: Default formula is
- creator_share_pct: 0.85
- platform_fee_pct: 0.15
- referral_share_pct: 0.00 (reserved post-hackathon)

Rationale: A typical app store (Apple, Google) charges 30 percent. Stripe-like
payment processors take 2.9 percent plus fixed fee. NERIUM positions closer
to Stripe than Apple in terms of value add (metering infrastructure, trust
score, cross-vendor discovery), not full distribution plus hosting plus
review. 15 percent platform fee captures infrastructure and discovery value
without claiming distribution rents, and 85 percent creator share makes
NERIUM preferable over self-built storefront at the margin.

Configurability: `RevenueShareFormula` in `wallet.schema.ts` is passed to
`computeRevenueShare`, so Demeter can experiment with creator-favorable
splits in niche verticals (for example 90 percent for restaurant automation
early-adopter cohort to seed the niche).

Consequences: Revenue projection for Banking pillar at hackathon submission
framing should reflect 15 percent take rate, not higher.

Halt trigger: This is a `strategic_decision_hard_stop` per tyche prompt.
Ghaisan sign-off required before `accepted`.

## ADR-003: Pure Mock Payment Posture for Hackathon

Status: accepted
Date: 2026-04-22
Source: Ghaisan Decision 2 (2026-04-22) per V3 handoff.

Context: Three integration postures were on the table: pure mock, Stripe
test-mode, or Nevermined. Each posture carries different budget, latency,
and surface area tradeoffs for the 5-day hackathon window.

Decision: Ship pure mock. No real payment API call anywhere in the runtime.
`TransactionLedger` persists to SQLite with synthetic revenue-share splits.
`BillingMeter` accumulates readings in memory or SQLite, never calls out.
Contract shapes (Transaction, WalletState, MeterReading, TierBand) are
designed so post-hackathon Stripe test-mode wiring is a drop-in adapter.

Rationale:
- Stripe test-mode would still consume setup time (account, keys, webhook tunnel)
  that is higher value spent on Builder hero depth.
- Nevermined integration carries protocol-level complexity that conflicts
  with "shallow by design" for non-Builder pillars.
- Pure mock preserves honest-claim filter: demo video narration is explicit
  that transactions are synthetic.

Consequences: Public surfaces (README, demo narration, Twitter) MUST describe
Banking as "usage-based metering prototype with mock transaction ledger,
ready for Stripe test-mode wiring post-hackathon." No claim of processing
real payments.

Post-hackathon path: Stripe test mode first, then production. Nevermined
evaluation deferred to Phase 2 NERIUM startup roadmap.

## ADR-004: Currency Model USD Primary with IDR Secondary Display

Status: accepted
Date: 2026-04-22
Source: Ghaisan Decision 1 (2026-04-22) per V3 handoff.

Context: NERIUM is Indonesian-origin with global-infrastructure positioning
per NarasiGhaisan Section 23. Submission audience is Anthropic plus Cerebral
Valley (US) but the narasi voice and Tokopedia-tier framing are Indonesian.
A single-currency display (USD only) mutes the Indonesian angle; a
dual-currency display (USD and IDR with locale toggle) honors both audiences
and demonstrates the locale-aware design baked in early.

Decision: Canonical ledger currency is USD. Display currency binds to
`AdvisorSession.locale`:
- `en-US` renders USD (symbol `$`, two decimals, thousands comma).
- `id-ID` renders IDR (symbol `Rp`, zero decimals, thousands period).

Static conversion rate USD 1 = IDR 16200 for the hackathon, anchored April
2026. Conversion applies at display time only; canonical values remain USD.

Consequences: Every write to `TransactionLedger` carries a `display_amount`
sibling with `amount`, `currency`, and `formatted` fields. Consumers render
from `display_amount` directly rather than reformatting. `RunningMeter` and
`CostProjection` carry currency-bound display fields likewise.

Post-hackathon path: Replace the static conversion constant with a live FX
rate service and extend locale coverage (JP-JP to JPY, EU locales to EUR).

## ADR-005: Meter Tick Interval at 250 Milliseconds

Status: accepted
Date: 2026-04-22

Context: Dike renders a live meter that ticks during Builder runs. Too slow
and the meter feels static; too fast and the render cost rises without
perceptual benefit. Demo video is three minutes maximum, so every second of
meter visibility should read as "kaya listrik" alive.

Decision: `METER_TICK_INTERVAL_MS = 250`. Four pulses per second.

Rationale: 4 Hz is the lower bound of smooth-perceived motion for a digit
counter or progress surface. Lower frequencies (1 Hz) read as discrete jumps
and break the electricity analogy. Higher frequencies (above 10 Hz) waste
render budget without clear demo benefit.

Consequences: Dike should batch DOM updates at 250ms intervals. For longer
Builder runs the cadence can be dynamically slowed to 500ms after the first
15 seconds to preserve battery on laptop demo devices; the constant is a
default, not a hard contract.

## ADR-006: Append-Only Ledger and Append-Only Meter

Status: accepted
Date: 2026-04-22

Context: Two write-surfaces exist: `TransactionLedger.record` and
`BillingMeter.recordReading`. Either could allow in-place updates (for
example fixing a mis-attributed cost retroactively) or enforce append-only
(audit trail, post-hackathon regulatory readiness).

Decision: Both surfaces are append-only within a pipeline run.
- `TransactionLedger` updates only the `status` field via `settle`. Corrections
  apply via new `adjustment` kind rows, not in-place mutation.
- `BillingMeter` rejects mutation of prior `MeterReading` rows outright;
  corrections require a compensating reading with negative `units_consumed`
  if the downstream requires one.

Rationale: Append-only simplifies audit trail composition (Ananke), makes
event replay deterministic (Rhea), and prepares the schema for post-hackathon
regulatory reporting without refactor.

Consequences: `TransactionLedger.record` throws on duplicate
`transaction_id`. `BillingMeter.recordReading` silently appends; duplicates
are only detectable at the event-bus consumer layer.

## Open Questions

1. Referral lane semantics (who qualifies, share cap). Deferred post-hackathon.
2. Escrow flow for high-value transactions. Deferred post-hackathon.
3. Tax withholding and cross-jurisdiction payout compliance. Deferred post-hackathon.
4. Live FX service selection (OpenExchangeRates, Frankfurter, ECB). Deferred post-hackathon.
