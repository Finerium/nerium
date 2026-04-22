# Transaction Stream

**Contract Version:** 0.1.0
**Owner Agent(s):** Rhea (mock transaction stream component author)
**Consumer Agent(s):** Apollo (optional subtle background in Advisor view), Harmonia (aesthetic sweep), Nemea (visual regression)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the pulsing mock transaction visualization component that renders synthetic transactions flowing across NERIUM (creator earnings, buyer invocations, platform fees) as a "living platform" demo surface, pure mock for hackathon per Ghaisan Decision 2.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor)
- `CLAUDE.md` (root)
- `docs/contracts/transaction_event.contract.md` (transaction shape the stream renders)
- `docs/contracts/billing_meter.contract.md` (currency formatting alignment)
- `docs/contracts/advisor_interaction.contract.md` (locale source)
- `docs/contracts/design_tokens.contract.md` (styling)

## 3. Schema Definition

```typescript
// app/banking/stream/stream_types.ts

import type { Transaction } from '@/banking/schema/wallet.schema';
import type { CurrencyCode } from '@/banking/metering/meter_contract';

export interface TransactionPulseProps {
  currency: CurrencyCode;            // active AdvisorSession.locale binding
  density: 'low' | 'medium' | 'high';  // affects spawn rate
  height_px?: number;                 // default 200
  opacity?: number;                   // default 0.6 for subtle background
  pauseOnHover?: boolean;             // default true
}

export interface SyntheticTransaction extends Transaction {
  synthetic: true;                    // marker: this transaction is mock, never real
  visual_lane: number;                // 0..3 rendering lane
  pulse_id: string;                   // unique per rendered pulse
}

export interface MockGeneratorConfig {
  spawn_hz: number;                   // derived from density: low=0.3, medium=1.0, high=3.0
  currency: CurrencyCode;
  amount_distribution: { min_usd: number; max_usd: number };
  creator_id_pool: string[];          // sample identities, hackathon hardcoded
  buyer_id_pool: string[];
  listing_slug_pool: string[];
}
```

## 4. Interface / API Contract

- `<TransactionPulse>` renders an animated canvas (Pixi.js preferred, SVG fallback) showing transaction pulses flowing from buyers to creators along 4 visual lanes.
- The mock generator ticks at `spawn_hz` and emits `SyntheticTransaction` objects into the renderer's local queue; pulses fade after 3 seconds.
- Pulses color-code by `TransactionKind`: `agent_invocation` (cyan), `creator_payout` (gold), `platform_fee` (magenta), `refund` (orange).
- Every visible pulse includes a tooltip-ready data attribute exposing the transaction kind, amount, and `synthetic: true` marker so any screenshot is honestly labeled per NarasiGhaisan Section 16.

## 5. Event Signatures

Does not subscribe to the pipeline event bus (hackathon mock is fully self-contained). Optionally emits `banking.ui.stream.rendered` when reaching steady state for QA test hooks.

## 6. File Path Convention

- Component: `app/banking/stream/TransactionPulse.tsx`
- Mock generator: `app/banking/stream/mock_generator.ts`
- Types: `app/banking/stream/stream_types.ts`
- Sample data pools: `app/banking/stream/mock_pools.json`

## 7. Naming Convention

- Component files: `PascalCase.tsx`.
- Density values: lowercase single word.
- Pulse IDs: `pulse_{timestamp_ms}_{random_suffix}`.
- Every `SyntheticTransaction` carries the literal `synthetic: true` discriminator.

## 8. Error Handling

- High density on low-end hardware (FPS drops below 20): auto-degrade to `medium` density and log a console warning.
- Empty identity or listing pools in config: initialize with minimal fallback pool and render a warning.
- Currency not in `{USD, IDR}`: fall back to USD with a console warning.

## 9. Testing Surface

- Pulse spawn: mount at `high` density for 2 seconds, assert at least 5 pulses rendered.
- Honest marker: inspect DOM, assert every pulse has `data-synthetic="true"` attribute.
- Pause on hover: hover a pulse, assert spawn rate drops to 0 while hover active.
- Kind color mapping: force spawn each kind once, assert each renders with the expected CSS color class.
- Accessibility: `aria-hidden="true"` on decorative pulses, `role="region" aria-label` on the container for screen-reader bypass.

## 10. Open Questions

- None at contract draft. Animation density (too many pulses distract vs too few feel dead) is a Rhea strategic_decision already exposed as a prop.

## 11. Post-Hackathon Refactor Notes

- Replace mock generator with a live subscription to a real `banking.transaction.recorded` event stream across the platform (aggregated, anonymized per privacy policy).
- Add density auto-tuning based on real throughput (early-growth platforms need higher visual density to feel alive; mature platforms can reduce).
- Drill-down: clicking a pulse opens a transaction detail drawer referencing the real transaction.
- Apply privacy filters: redact buyer and creator identities by default, reveal only on authorized views.
- Per Ghaisan Decision 2 (2026-04-22), hackathon implementation is fully synthetic with no real transaction ingestion; real data hooks arrive post-hackathon.
