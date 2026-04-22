---
name: Dike ADR Log
owner: Dike (Banking Worker, Wallet and Meter)
status: draft
version: 0.1.0
last_updated: 2026-04-22
---

# Dike Decisions Log

Architecture Decision Records for the wallet UI and live cost meter
surface of the Banking pillar. Each entry states context, decision,
status, and rationale. Items marked `proposed` require explicit Ghaisan
sign off before they advance to `accepted`.

Mandatory reading trail applied this session: `_meta/NarasiGhaisan.md`,
`CLAUDE.md`, `docs/contracts/wallet_ui.contract.md` v0.1.0,
`docs/contracts/cost_meter.contract.md` v0.1.0,
`docs/contracts/billing_meter.contract.md` v0.1.0,
`app/banking/schema/wallet.schema.ts`, `app/banking/metering/meter_contract.ts`,
`docs/phase_0/NERIUM_AGENT_STRUCTURE.md` Section 5.17,
`docs/tyche.decisions.md`.

## ADR-001: Meter Update Cadence

Status: proposed
Date: 2026-04-22

Context: Cost meter renders cost rising in real time during Builder runs.
Ticker frequency too slow and the meter reads static rather than kaya
listrik; too fast and CPU burns on every animation frame for no
perceptual benefit. WebSocket load also scales with cadence when the
event bus moves from in process to an SSE bridge. Dike prompt lists this
as a `strategic_decision_hard_stop`.

Decision: 250 millisecond coalesced pulse at the ticker layer plus 60
FPS Framer Motion interpolation at the component layer. On network
backpressure the ticker falls back to 4 Hz (still the 250ms floor), with
the 10 Hz ceiling reserved for the rAF driven digit roll inside a single
emitted snapshot. The `METER_TICK_INTERVAL_MS = 250` constant in
`meter_contract.ts` stays the single source of truth; `cost_ticker.ts`
reads it and accepts an override for non hackathon call sites.

Rationale: 4 Hz matches the lower bound of smooth perceived motion for a
digit counter (Tyche ADR 005 sets the same default for the same reason).
Discrete pulses on the bus combined with continuous rAF interpolation
for the visible digits gives the illusion of a continuously ticking
utility meter without inflating event bus write traffic. A busy pipeline
emitting twenty readings per second still only wakes UI listeners four
times per second, so the CPU cost of listeners never scales with
executor throughput.

Consequences: Harmonia visual sweep can adjust the interpolation
duration (currently 320 ms per Framer Motion animation) without changing
the event bus cadence. Apollo can subscribe to the ticker snapshot at
the same 4 Hz cadence without further debouncing.

Halt trigger: Flagged for Ghaisan sign off per dike prompt
`strategic_decision_hard_stop`. Treat as proposed until confirmed.

## ADR-002: Digit Roll Animation via Framer Motion Plus rAF

Status: accepted
Date: 2026-04-22

Context: The live meter needs an odometer style digit animation so the
cost visibly ticks rather than snaps between values. Three candidates
were evaluated: pure CSS transitions, Framer Motion `animate` on a
single motion value with derived format, and a requestAnimationFrame
driven interpolator operating on the pre formatted string.

Decision: Ship the rAF interpolator (`interpolateDigits` helper in
`cost_ticker.ts`) and let Framer Motion own the pulse dot, layout
transitions for per specialist rows, and the critical state glow.

Rationale: Pre formatted string interpolation preserves locale symbols
(`$`, `Rp`, thousand separators) byte for byte, which a numeric spring
would clobber during transition. Keeping the digit logic in a pure
function makes it trivially testable with string assertions. Framer
Motion still earns its keep for everything that is not character by
character rolling: dot pulse, row enter and exit, critical boxShadow
breathing, and the budget bar width ramp.

Consequences: Component layer stays declarative, logic layer stays
testable without any DOM.

## ADR-003: Top Up Flow is a Coming Soon Modal, No Checkout

Status: accepted
Date: 2026-04-22
Source: Ghaisan Decision 2 (2026-04-22) inherited via Tyche ADR-003.

Context: Wallet card exposes a prominent top up button. Hackathon
posture is pure mock per Ghaisan Decision 2 so the button must not
appear to process a payment. Three candidates existed: disable the
button entirely, link out to a Stripe test mode checkout, or show an
informational modal explaining the mock posture.

Decision: The button is fully interactive and opens an internal modal
titled "Top up opens post hackathon" that names the mock posture,
outlines what unlocks post hackathon, and confirms the Transaction
schema already aligns with the drop in Stripe adapter shape. The modal
closes cleanly by backdrop click, escape via button, or the Close CTA.

Rationale: Disabling the button would remove a demo affordance that
judges expect to see, and a Stripe test mode redirect violates the pure
mock posture. The informational modal honors the honest claim filter
(NarasiGhaisan Section 16) while letting the UX register as complete
rather than stubbed out.

Consequences: Post hackathon wiring replaces the modal body with a real
checkout session; the component public API stays stable.

## ADR-004: Demo Balance Honest Claim Badge Always Visible

Status: accepted
Date: 2026-04-22

Context: WalletCard surfaces a large balance figure. Without visible
labeling, a first time viewer could reasonably interpret the balance as
a real deposited credit. Dike prompt explicitly calls out "visible Mock
Data label or similar in wallet UI acceptable" per NarasiGhaisan
Section 16 honest claim filter.

Decision: Render a small pill labeled "Demo balance" with a warning dot
to the immediate right of the balance at all times, never behind a
toggle or menu. A matching "Demo data" badge also sits on the live
cost meter header.

Rationale: Placement within the same visual unit as the balance figure
guarantees anyone who screenshots the card for promo purposes carries
the honest claim disclaimer with it. The dot plus pill typography match
the alert badge design in the meter so the surface reads as one
consistent honesty signal, not a disclaimer bolted on.

Consequences: Harmonia aesthetic sweep should preserve the badge
visibility in every world theme. Any theme that removes the badge is a
contract violation against `wallet_ui.contract.md` v0.1.0.

## ADR-005: Alert Band Mapping Above Threshold Events

Status: accepted
Date: 2026-04-22

Context: Tyche billing meter fires `banking.meter.threshold_crossed`
events at 25, 50, 75, and 100 percent of the buyer declared budget cap.
The cost meter UI also surfaces its own visual alert bands. The bands
should align with the events but the event set alone does not dictate
the per band visual treatment.

Decision: Map the ticker snapshot to four alert levels.
- `none`: percent_of_budget below 0.5, neutral styling.
- `advisory`: 0.5 to 0.8, soft warning border and warning dot.
- `warning`: 0.8 to 1.0, hard warning treatment, matches contract
  Section 4 "meter transitions to a visual warning state" at 80 percent.
- `critical`: percent_of_budget at or above 1.0, pulsing boxShadow and
  critical colors, matches contract Section 4 "pulsing border" at 100.

Rationale: The 50 percent event already fires per Tyche spec, so the
`advisory` band gives Apollo a low friction copy surface ("approaching
half of cap") without fabricating a new event. Pulsing glow reserves
itself for the cap reached state so users do not desensitize to it.

Consequences: Apollo can echo natural language warnings to the Advisor
chat on the same boundaries the meter color crosses, keeping visual and
textual surfaces synchronized.

## ADR-006: Five File Output Discipline, Subcomponents Inlined

Status: accepted
Date: 2026-04-22

Context: `wallet_ui.contract.md` v0.1.0 Section 6 names four files
(`WalletCard.tsx`, `EarningsDashboard.tsx`, `RecentTransactions.tsx`,
`TopUpModal.tsx`) plus a types module. Dike prompt Section Task
Specification lists five outputs total and names only `WalletCard.tsx`
and `EarningsDashboard.tsx` on the wallet side. The two shapes look
contradictory on a glance.

Decision: Honor the Dike prompt file list exactly. Inline
`RecentTransactions` and `TopUpModal` as file private subcomponents of
`WalletCard.tsx`. The contract's extra file paths promote to real files
post hackathon, when the subcomponents pick up independent consumers.

Rationale: Dike prompt Hard Constraints flag "Output file paths exactly
per Task Specification." Shipping extra files would violate a hard
constraint; the contract's extra paths are refactor targets, not
hackathon deliverables. Subcomponents stay internal to the same file so
API surface stays minimal and the public export list matches the prompt.

Consequences: Post hackathon refactor extracts the subcomponents back
into their own files once a second consumer appears. The contract's
Section 11 refactor note already earmarks this work.

## ADR-007: Surface Creator Share Ratio on Transaction Rows

Status: accepted
Date: 2026-04-22

Context: Tyche ADR-002 sets the default revenue share at 85 percent
creator plus 15 percent platform. The transaction schema already carries
a `revenue_share` object. The question is whether to surface that ratio
in the wallet UI or leave it implicit.

Decision: Render a small "Creator 85 percent" caption under the amount
of any transaction that carries a `revenue_share`. Platform and referral
splits are not rendered in the row to avoid visual noise, but the ratio
communicates the creator favorable posture at a glance.

Rationale: NarasiGhaisan Section 5 frames creator monetization as the
pain Banking solves. Surfacing the share ratio in the creator facing
dashboard converts a schema field into a perceived value proposition
without any marketing copy.

Consequences: Demeter listing surface can cite the same percent number
to align the creator journey end to end.

## ADR-008: Shared Currency Formatter Lives in Cost Ticker

Status: accepted
Date: 2026-04-22

Context: Tyche spec references a future `format_currency.ts` helper for
locale formatting; the helper is not yet checked in. Dike needs a
formatter on day one to power both the wallet and the meter without
duplicating logic.

Decision: Ship `formatCurrency(amount_usd, currency)` inside
`app/banking/meter/cost_ticker.ts`. The wallet card imports it. When
Tyche or a follow up Worker creates the dedicated helper file, both
surfaces swap their import over in a single commit without shape
changes.

Rationale: A single helper avoids two codepaths drifting on IDR
rendering. Placement inside `cost_ticker.ts` keeps the meter self
contained for the hackathon demo while the contract level path migration
is a pure refactor.

Consequences: Nemea regression should compare wallet and meter formatted
strings for parity on a 42.00 USD fixture in both locales.

## Open Questions

1. Whether Harmonia's aesthetic sweep should reintroduce a per world
   tint to the meter critical glow (currently rgba red). Deferred to
   Harmonia handoff.
2. Whether the Advisor chat surface embeds the wallet card or a thinner
   balance only badge. Coordinated with Apollo before Phase 3 polish.
3. Whether the payout history inside `EarningsDashboard` should export a
   CSV for creator accounting. Deferred post hackathon.
