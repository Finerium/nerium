# Cost Meter

**Contract Version:** 0.1.0
**Owner Agent(s):** Dike (live cost meter component author)
**Consumer Agent(s):** Apollo (embeds meter in Advisor UI during Builder runs), Helios (overlays meter position on pipeline viz), Harmonia (aesthetic sweep), Nemea (visual regression)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the live cost meter component that tick-updates during Builder runs, surfacing the "kaya listrik" framing by showing cost rising in real time in the session locale currency, so users see the pulse of per-agent execution as it happens.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 5 kaya listrik framing)
- `CLAUDE.md` (root)
- `docs/contracts/billing_meter.contract.md` (data source via `getRunningMeter`)
- `docs/contracts/event_bus.contract.md` (event subscription source)
- `docs/contracts/advisor_interaction.contract.md` (locale-currency binding)
- `docs/contracts/design_tokens.contract.md` (styling)

## 3. Schema Definition

```typescript
// app/banking/meter/cost_meter_types.ts

import type { CurrencyCode } from '@/banking/metering/meter_contract';

export interface LiveCostMeterProps {
  pipeline_run_id: string;
  currency: CurrencyCode;            // from active AdvisorSession.locale
  budget_cap_usd?: number;           // user-declared ceiling, triggers visual alerts
  compact?: boolean;                 // compact inline vs expanded card
}

export interface CostTickerState {
  current_usd: number;
  displayed_amount: { amount: number; currency: CurrencyCode; formatted: string };
  per_specialist: Array<{ specialist_id: string; role: string; cost_usd: number }>;
  percent_of_budget?: number;        // 0.0 to 1.0 when budget_cap_usd provided
  last_updated_at: string;
  is_streaming: boolean;             // true while pipeline actively running
}

export interface CostAlertState {
  level: 'none' | 'advisory' | 'warning' | 'critical';
  message?: string;
}
```

## 4. Interface / API Contract

- `<LiveCostMeter>` subscribes to `banking.meter.reading_recorded` and `banking.meter.threshold_crossed` events for the given `pipeline_run_id` on mount.
- Ticker updates animate with Framer Motion at 60 FPS; debounced to max 10 Hz for CPU cost.
- When `percent_of_budget >= 0.8`, the meter transitions to a visual "warning" state; at >=1.0, "critical" state with a pulsing border.
- Compact mode fits inline within a chat bubble or header; expanded mode is a full card with per-specialist breakdown.
- All currency formatting routes through `billing_meter.contract.md` helpers for consistency.

## 5. Event Signatures

Subscribes (does not publish) to:

- `banking.meter.reading_recorded`
- `banking.meter.threshold_crossed`
- `banking.meter.projection_updated`
- `pipeline.run.completed` (freeze final state)

## 6. File Path Convention

- Component: `app/banking/meter/LiveCostMeter.tsx`
- Ticker helper: `app/banking/meter/cost_ticker.ts`
- Types: `app/banking/meter/cost_meter_types.ts`
- Alert mapping: `app/banking/meter/alert_state.ts`

## 7. Naming Convention

- Component: `PascalCase.tsx`.
- Alert levels: lowercase single-word literals.
- USD canonical internal amount field suffixed `_usd`.
- Percent-of-budget stored as decimal fraction (0.8 == 80%).

## 8. Error Handling

- Event bus disconnect: meter displays a subtle "reconnecting" indicator; preserves last-known total.
- Missing pipeline_run_id (run not yet started): render the component in a dimmed "idle" state with zero values.
- Negative delta update (should not happen with append-only ledger): clamp to current, log console warning.
- `budget_cap_usd` zero or negative: treat as unlimited (no cap), do not throw.

## 9. Testing Surface

- Live tick: dispatch a sequence of `reading_recorded` events at 1s intervals, assert meter increments match cumulative sum.
- Currency display: mount with `id-ID` locale, assert every rendered number is `Rp` prefixed.
- Budget alert: set `budget_cap_usd` to 10, inject events summing to 9 USD, assert `warning` state; push over 10 USD, assert `critical`.
- Freeze on completion: dispatch `pipeline.run.completed`, assert `is_streaming: false` and subsequent events ignored.
- Compact vs expanded: toggle prop, assert layout switches without remount.

## 10. Open Questions

- None at contract draft. Real-time vs batched update frequency is a Dike strategic_decision; the 10 Hz default is documented but adjustable without contract change.

## 11. Post-Hackathon Refactor Notes

- Wire to real billing aggregation service (not in-memory SQLite) for multi-user production.
- Add user-controlled pause and resume affordance (hackathon: meter always streams when pipeline running).
- Integrate with Registry trust-discounted pricing: high-trust creators show lower projected costs.
- Support multi-currency overlay (display both USD canonical and local currency side-by-side for transparency).
- Per Ghaisan Decision 2 (2026-04-22), hackathon cost is synthetic from mock meter readings; real charges arrive post-hackathon when Stripe test mode is wired.
