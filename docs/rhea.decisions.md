---
name: Rhea ADR Log
owner: Rhea (Banking Worker, P3a)
status: draft
version: 0.1.0
last_updated: 2026-04-22
---

# Rhea Decisions Log

Architecture Decision Records for the Banking transaction pulse visualization.
Each entry states context, decision, status, and rationale. Items marked
`proposed` require explicit Ghaisan sign-off before they advance to
`accepted`.

## ADR-001: Framer Motion Plus Inline DOM Over Pixi.js

Status: accepted
Date: 2026-04-22

Context: `docs/contracts/transaction_stream.contract.md` section 4 names
Pixi.js as the preferred renderer with SVG fallback. Rhea prompt soft
guidance also names CSS keyframes or Framer Motion. The component must clear
`MAX_VISIBLE_PULSES = 8` concurrent entries at worst, with spawn rates
between 0.3 Hz and 3.0 Hz.

Decision: Render with Framer Motion animated DOM nodes. No Pixi canvas. The
component is a React functional component that consumes `motion.div`
elements inside an `AnimatePresence` boundary.

Rationale:
- Max 8 concurrent elements is well below any Pixi-scale threshold. DOM
  animation handles this load easily at 60 FPS on mid-tier laptops.
- DOM nodes carry the contract-mandated data-attributes
  (`data-synthetic`, `data-kind`, `data-amount-usd`, `data-currency`,
  `data-pulse-id`) natively. Nemea regression inspects DOM directly rather
  than extracting values from a canvas pixel buffer.
- Accessibility: `role="region"` on the container and `aria-hidden="true"`
  on decorative pulse nodes match the contract section 9 testing surface
  without the custom Pixi wiring.
- Post-hackathon scaling path: if the real transaction stream requires
  hundreds of concurrent pulses, this component swaps to a Pixi backend
  behind the same `TransactionPulseProps` surface. The contract shape
  survives the renderer swap.

Consequences: Harmonia aesthetic sweep acts directly on inline styles and
keyframes rather than Pixi shader config. No WebGL dependency in the
Banking pulse code path.

## ADR-002: Animation Density Resolved Via Pythia Contract Pre-Resolution

Status: accepted
Date: 2026-04-22
Source: `docs/contracts/transaction_stream.contract.md` v0.1.0 section 3.

Context: Rhea prompt flags animation density as
`strategic_decision_hard_stop`: too many pulses distract, too few feel
dead. Recommendation is default 1 Hz, adjustable 0.5 to 2 Hz.

Decision: Adopt the contract-declared density enum literally. Three levels:
- `low` spawns at 0.3 Hz (calm background for Apollo Advisor embedding).
- `medium` spawns at 1.0 Hz (default demo setting).
- `high` spawns at 3.0 Hz (hero Marketplace landing demo moment).

Rationale: Pythia contracts are the strict blocker per NarasiGhaisan
Section 9. When a contract pre-declares the numeric lever for a prompt-flagged
strategic decision, the contract wins and no halt-and-ferry is needed. The
contract value range (0.3 to 3.0 Hz) is a superset of the Rhea prompt range
(0.5 to 2.0 Hz), which means the prompt's acceptable zone is fully covered
while the contract also unlocks the hero-moment 3.0 Hz setting.

Consequences: No Ghaisan halt-and-ferry required for this decision.
`DENSITY_TO_SPAWN_HZ` is exported from `stream_types.ts` so Apollo and
Harmonia consumers cannot drift from the contract numbers.

## ADR-003: Honest-Claim Triad On Every Rendered Pulse

Status: accepted
Date: 2026-04-22
Source: NarasiGhaisan Section 16, CLAUDE.md anti-pattern rules,
`docs/contracts/transaction_stream.contract.md` section 4.

Context: Ghaisan mandates visible honest-claim annotation across any demo
surface that shows synthetic data. Rhea prompt explicitly flags missing
annotation as CRITICAL audit gap in a v2 debug pass.

Decision: Ship a three-layer honest-claim triad.

1. Visible header in the component itself: title `Demo Transactions` plus
   subtitle `Synthetic activity feed, not real payments.` always renders,
   never conditionally hidden. Indonesian locale renders the header in
   Bahasa Indonesia per `HONEST_CLAIM_HEADER.id`.
2. Visible `MOCK` badge pill in the header right column, in the magenta
   platform-fee palette so it stays visually distinct from actual pulses.
3. Data-attribute markers on every rendered pulse node:
   `data-synthetic="true"`, `data-kind`, `data-amount-usd`, `data-currency`,
   `data-pulse-id`. The container itself also carries `data-synthetic="true"`
   and an `aria-label` combining the honest-claim title and subtitle so
   screen readers announce the mock posture before any pulse.

Rationale: Any plausible demo-capture failure mode leaves at least two of
three honest-claim surfaces intact. A screenshot with the header cropped
still carries the MOCK badge; a DOM audit surfaces the data-attributes;
a visual regression test reads the aria-label. Triple redundancy is
proportionate to the CRITICAL audit severity Ghaisan declared.

Consequences: Any future change that removes or hides either the header
or the MOCK badge must surface through Nemea regression, which asserts
both against the DOM. The data-attribute contract is locked at
`HONEST_CLAIM_DATA_ATTRS` in `stream_types.ts`.

## ADR-004: Mock Posture Inherits Ghaisan Decision 2

Status: accepted
Date: 2026-04-22
Source: Ghaisan Decision 2 (2026-04-22) via V3 handoff, reaffirmed in
`docs/tyche.decisions.md` ADR-003.

Context: Hackathon scope on the Banking pillar is pure mock. Rhea could
either honor the shape by generating fake transactions or silently-assume a
hook for future real-stream data.

Decision: Generate fully synthetic transactions in-process via
`mock_generator.ts`. Zero real Stripe call. Zero real event-bus
subscription. The generator emits `SyntheticTransaction` objects that
extend the canonical `Transaction` type with a literal `synthetic: true`
discriminator plus `visual_lane` and `pulse_id` fields for the renderer.

Rationale:
- Pure mock per Ghaisan Decision 2 is already the Banking pillar policy.
- The generator's shape matches the real post-hackathon
  `banking.transaction.recorded` payload (which carries `Transaction`)
  exactly minus the visualization-only fields, so post-hackathon swap to
  a real subscription is a one-file change in the component wiring.
- Contract section 11 post-hackathon notes confirm this path explicitly.

Consequences: Public surfaces (README, demo video narration, Twitter
announcement) MUST describe the transaction pulse feed as synthetic demo
data, never as a real transaction flow. The honest-claim triad from
ADR-003 enforces this at the component level, but narrative surfaces
need equivalent wording.

## ADR-005: Currency Formatting Inline Pending Tyche Shared Util

Status: proposed
Date: 2026-04-22

Context: `docs/tyche.output.md` section 7 plans a shared
`app/banking/metering/format_currency.ts` utility that centralizes
locale-aware currency rendering. That file does not exist at P3a start.
Rhea needs currency formatting today for the `SyntheticTransaction.display_amount`
field.

Decision: Implement `formatDisplayAmount(amount_usd, currency)` inline
inside `mock_generator.ts`. Uses the Web-platform `Intl.NumberFormat`
API directly:
- `en-US` locale with `currency: 'USD'`, two decimal places.
- `id-ID` locale with `currency: 'IDR'`, zero decimal places, applying the
  `USD_TO_IDR_STATIC` (16200) conversion constant from `meter_contract.ts`.

Rationale: Blocking on Tyche's shared utility would serialize Rhea behind
a non-existent dependency. `Intl.NumberFormat` in the browser and in Node
produce identical output for these two locales, so the inline helper is
indistinguishable from the eventual shared util's output.

Consequences: When Tyche ships `format_currency.ts`, Rhea refactors the
inline helper to a one-line re-export. The refactor is mechanical and
covered by a single regression test (the `formatDisplayAmount` contract
currently lives under Rhea's self-check item 14).

Halt trigger: None. Refactor deferred post-hackathon or on Tyche's next
commit, whichever comes first.

## ADR-006: Contract-Driven Additional File Set

Status: accepted
Date: 2026-04-22

Context: Rhea prompt lists three output files: `TransactionPulse.tsx`,
`mock_generator.ts`, `rhea.decisions.md`. Contract section 6 lists four
code files plus a JSON pool: `TransactionPulse.tsx`, `mock_generator.ts`,
`stream_types.ts`, `mock_pools.json`.

Decision: Ship the union of both lists. Five total artifacts:

1. `app/banking/stream/TransactionPulse.tsx` (per prompt and contract).
2. `app/banking/stream/mock_generator.ts` (per prompt and contract).
3. `app/banking/stream/stream_types.ts` (per contract, beyond prompt list).
4. `app/banking/stream/mock_pools.json` (per contract, beyond prompt list).
5. `docs/rhea.decisions.md` (per prompt).

Rationale: Pythia contracts are the strict blocker per Ghaisan Section 9.
Contract-declared file paths win over prompt-declared lists where the
prompt is silent. The additional `stream_types.ts` centralizes shared
types and constants, so Apollo and Harmonia consumers import from one
anchor rather than deep-reaching into the generator file. The JSON pool
is hand-editable by non-technical designers during polish, keeping code
diffs clean.

Consequences: Self-check item 10 (file path convention consistent) reads
against the full five-file set. Nemea regression asserts against the
contract section 6 file paths, not the prompt list.

## ADR-007: Auto-Degrade Density On Sub-20 FPS

Status: accepted
Date: 2026-04-22
Source: `docs/contracts/transaction_stream.contract.md` section 8.

Context: Mid-tier laptops and shared demo machines occasionally drop
below 20 FPS under multi-tab load. Contract section 8 requires
auto-degrade to a lower density with a console warning.

Decision: Sample FPS via `requestAnimationFrame` for 2.5 seconds after
each density change. If the sampled FPS drops below 20, step down one
density level (`high` to `medium` to `low`) and log a warning. Sampler
detaches at the `low` level since it cannot step down further.

Rationale: 2.5 seconds is long enough to smooth out layout-thrash spikes
at component mount while short enough to react before the viewer notices
sustained jank. One-step degrade prevents oscillation (a component that
degrades `high` to `low` in one pass would spike empty, re-assess, and
promote back to `high`).

Consequences: Nemea QA sampler that instruments the demo machine's FPS
can surface the degrade log line as a weak signal of hardware saturation
without failing the regression.

## Open Questions

1. Apollo Advisor background embedding: Apollo prompt indicates Rhea is
   an optional subtle background in the Advisor view. Rhea defaults the
   `opacity` prop to 0.6 and `density` prop mandatory so the Advisor
   host chooses the intensity. Apollo decides when to embed; Rhea makes
   the embedding safe either way.
2. Harmonia aesthetic sweep pass may introduce world-specific palette
   overrides for the four TransactionKind colors. The current OKLCH
   defaults in `KIND_TO_OKLCH` are designed for the cyberpunk_shanghai
   palette neighborhood. Medieval_desert and steampunk_victorian palettes
   may prefer warmer hues for creator_payout and refund. Pending
   Harmonia decision.
3. Post-hackathon: replace the mock generator with a real subscription
   to `banking.transaction.recorded`. Tracked in
   `docs/contracts/transaction_stream.contract.md` section 11.
