# Billing Meter

**Contract Version:** 0.1.0
**Owner Agent(s):** Tyche (meter contract definer, pricing-tier owner)
**Consumer Agent(s):** Dike (renders live meter UI), Heracles (Managed Agents executor emits cost events through this meter), Apollo (aggregates cost projections for user surfacing), Ananke (tracks MA exposure cap against $150 ceiling)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the usage-based metering model ("kaya listrik" per NarasiGhaisan Section 5): per-execution micropayment schema, pricing tier bands, currency-locale binding, and the interface the cost meter UI consumes, so live agent execution cost is tracked, attributable, and renderable in the user's locale-appropriate currency.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 5 kaya listrik framing, Section 4 Tokopedia-tier cost awareness)
- `CLAUDE.md` (root)
- `docs/contracts/transaction_event.contract.md` (companion event schema)
- `docs/contracts/advisor_interaction.contract.md` (locale source)
- `docs/contracts/marketplace_listing.contract.md` (pricing-tier enum alignment)

## 3. Schema Definition

```typescript
// app/banking/metering/meter_contract.ts

export type CurrencyCode = 'USD' | 'IDR';
// Currency binds to AdvisorSession.locale per Ghaisan Decision 1 (2026-04-22):
//   'en-US' renders USD; 'id-ID' renders IDR.
// Conversion rates are hackathon-static (~USD 1 = IDR 16200, sourced April 2026).
// Post-hackathon: live FX rate service and broader locale-to-currency map.

export type ExecutionUnit = 'token' | 'request' | 'minute' | 'task';

export type PricingTier = 'free' | 'cheap' | 'mid' | 'premium';

export interface TierBand {
  tier: PricingTier;
  per_unit_usd: number;              // canonical pricing in USD
  per_unit_idr: number;              // pre-converted IDR for hackathon static render
  included_units: number;            // allowance included per subscription period (0 for free tier cap)
  description: string;
}

export interface MeterReading {
  reading_id: string;
  pipeline_run_id: string;
  specialist_id: string;
  execution_unit: ExecutionUnit;
  units_consumed: number;
  unit_cost_usd: number;
  cost_usd: number;                  // units_consumed * unit_cost_usd
  tier: PricingTier;
  occurred_at: string;               // ISO-8601 UTC
}

export interface RunningMeter {
  pipeline_run_id: string;
  currency: CurrencyCode;            // derived from AdvisorSession.locale
  total_cost_usd: number;
  displayed_total: { amount: number; currency: CurrencyCode; formatted: string };
  per_specialist: Array<{ specialist_id: string; cost_usd: number }>;
  started_at: string;
  updated_at: string;
}

export interface CostProjection {
  pipeline_run_id: string;
  projected_total_usd: number;
  projected_per_tier: Record<PricingTier, number>;
  confidence_band: 'high' | 'medium' | 'low';
  generated_at: string;
}
```

## 4. Interface / API Contract

```typescript
export interface BillingMeter {
  recordReading(reading: MeterReading): Promise<void>;
  getRunningMeter(pipeline_run_id: string, currency: CurrencyCode): Promise<RunningMeter>;
  projectCost(pipeline_run_id: string, planned_specialists: string[]): Promise<CostProjection>;
  loadTierBands(): Promise<TierBand[]>;
  convertUsdToDisplay(amount_usd: number, currency: CurrencyCode): { amount: number; formatted: string };
}
```

- `recordReading` appends an entry; the meter is append-only within a pipeline run.
- `getRunningMeter` aggregates readings and formats per the requested currency; `formatted` uses locale-appropriate conventions (`"$4.72"` for USD, `"Rp 76.464"` for IDR).
- `projectCost` heuristically estimates based on tier bands and historical averages per specialist role.
- Tier bands load from `app/banking/pricing/tier_model.json` and are the single source of truth for both Marketplace price display and runtime meter.

## 5. Event Signatures

- `banking.meter.reading_recorded` payload: `{ reading: MeterReading }`
- `banking.meter.threshold_crossed` payload: `{ pipeline_run_id, threshold_usd, current_usd }` (fires at 25%, 50%, 75%, 100% of user-declared budget cap)
- `banking.meter.projection_updated` payload: `{ projection: CostProjection }`

## 6. File Path Convention

- Contract: `app/banking/metering/meter_contract.ts`
- Tier bands: `app/banking/pricing/tier_model.json`
- Implementation: `app/banking/metering/InMemoryBillingMeter.ts`
- Locale formatting helper: `app/banking/metering/format_currency.ts`

## 7. Naming Convention

- Currency codes: uppercase ISO 4217 (`USD`, `IDR`).
- Tier names: lowercase `snake_case`.
- Execution units: lowercase singular (`token`, `request`, `minute`, `task`).
- Field names: `snake_case`.

## 8. Error Handling

- Negative `units_consumed` or `unit_cost_usd`: throws `InvalidMeterReading`.
- Unknown `pipeline_run_id` on `getRunningMeter`: returns a zeroed meter rather than throwing (matches user expectation that a new run starts at zero).
- Currency not in `{USD, IDR}`: throws `UnsupportedCurrencyError`; broader locale support tracked for post-hackathon.
- Projection with no historical data: returns `confidence_band: 'low'`, does not throw.

## 9. Testing Surface

- Reading round trip: record 3 readings, call `getRunningMeter`, assert `total_cost_usd` equals the sum.
- Locale format: convert `4.72 USD` to `id-ID`, assert `formatted: 'Rp 76.464'` (allowing rounding in last unit).
- Tier band load: load from disk, assert 4 tiers present (`free`, `cheap`, `mid`, `premium`).
- Threshold event: set user budget cap at $10, record readings crossing 25%, assert `banking.meter.threshold_crossed` fires exactly once for that threshold.
- Append-only: attempt to mutate a prior reading, assert rejected with a validation error.

## 10. Open Questions

- None at contract draft. Cost-tier boundaries (what USD amount separates Cheap/Mid/Premium) is a Tyche strategic_decision tracked in `tyche.decisions.md`, hardcoded in `tier_model.json`.

## 11. Post-Hackathon Refactor Notes

- Pure mock per Ghaisan Decision 2 (2026-04-22): this contract describes the shape of real-world billing integration but the hackathon implementation is fully stubbed with synthetic readings; no Stripe call, no real money movement. Post-hackathon, wire to Stripe test mode first, then production.
- Add live FX rate service replacing the static USD-to-IDR constant; extend to broader locale coverage (JP-JP to JPY, EU locales to EUR).
- Introduce prepaid credit model for Banking: buyers top up in their local currency, creators earn in USD denomination with per-payout conversion.
- Integrate with Registry trust score as a discount lever: high-trust creators offer lower per-unit pricing tier eligibility.
- Formalize dispute and refund flow events (`banking.meter.dispute_opened`, `banking.meter.refunded`).
