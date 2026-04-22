# Trust Score

**Contract Version:** 0.1.0
**Owner Agent(s):** Hecate (formula owner)
**Consumer Agent(s):** Phoebe (trust badge render), Demeter (search ranking signal), Coeus (surface in result list), Artemis (filter option), Ananke (trust drift monitoring)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the trust score calculation formula combining usage count, positive review ratio, successful-execution rate, and verifier attestation (where available) into a single normalized score per identity, plus the update contract so consumers consistently read and interpret scores.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 6 Registry shallow-by-design)
- `CLAUDE.md` (root)
- `docs/contracts/agent_identity.contract.md` (identity being scored)
- `docs/contracts/search_ranking.contract.md` (consumer of trust signal)

## 3. Schema Definition

```typescript
// app/registry/trust/trust_types.ts

export type TrustBand = 'unverified' | 'emerging' | 'established' | 'trusted' | 'elite';

export interface TrustScore {
  identity_id: string;
  score: number;                     // 0.0 to 1.0 normalized
  band: TrustBand;                   // derived: <0.2 unverified, 0.2-0.4 emerging, 0.4-0.6 established, 0.6-0.85 trusted, >=0.85 elite
  computed_at: string;
  inputs: {
    usage_count: number;
    usage_count_normalized: number;  // 0.0 to 1.0 via log-scale normalization
    positive_review_ratio: number;   // 0.0 to 1.0; neutral 0.5 when no reviews
    successful_execution_rate: number; // 0.0 to 1.0; neutral 0.5 when no executions
    verifier_attestation_count: number;
    verifier_attestation_weight: number; // 0.0 to 1.0; 0 when no verifiers
  };
  stability: 'provisional' | 'stable'; // provisional when inputs underpopulated
}

export interface TrustFormulaWeights {
  usage: number;                     // default 0.20
  reviews: number;                   // default 0.30
  successful_execution: number;      // default 0.30
  verifier_attestation: number;      // default 0.20
}
```

## 4. Interface / API Contract

```typescript
export interface TrustScoreCalculator {
  calculate(identity_id: string, inputs: TrustScore['inputs'], weights?: TrustFormulaWeights): TrustScore;
  deriveBand(score: number): TrustBand;
  getLatest(identity_id: string): Promise<TrustScore | null>;
  recompute(identity_id: string): Promise<TrustScore>;
  persist(score: TrustScore): Promise<void>;
}
```

- `calculate` is a pure function suitable for testing without persistence.
- `recompute` reads current audit data from `agent_identity.contract.md` and re-derives inputs before calling `calculate`.
- Score stability is `provisional` when `usage_count < 10` or `positive_review_ratio` is at neutral default because no reviews exist; becomes `stable` after thresholds are met.

## 5. Event Signatures

- `registry.trust.recomputed` payload: `{ identity_id, previous_score: number, next_score: number, band: TrustBand }`
- `registry.trust.band_changed` payload: `{ identity_id, previous_band: TrustBand, next_band: TrustBand }`

## 6. File Path Convention

- Types: `app/registry/trust/trust_types.ts`
- Formula: `app/registry/trust/trust_formula.ts`
- Persistence: `app/registry/trust/trust_store.ts`
- Weights JSON: `app/registry/trust/formula_weights.json`

## 7. Naming Convention

- Band values: lowercase single word.
- Score is always `number` in `[0, 1]`.
- Weights sum target 1.0 but normalization applied if not; weight keys `snake_case`.

## 8. Error Handling

- Inputs out of `[0, 1]`: clamp with warning.
- `usage_count` negative: throws `InvalidInputError`.
- Missing identity on `recompute`: throws `UnknownIdentityError`.
- Weights negative or all zero: falls back to defaults with warning.

## 9. Testing Surface

- Formula determinism: given fixed inputs and weights, `calculate` returns the same score on repeated calls.
- Band derivation: score 0.15, 0.35, 0.55, 0.75, 0.9, assert bands `unverified, emerging, established, trusted, elite`.
- Provisional stability: inputs with `usage_count: 2`, assert `stability: 'provisional'`.
- Recompute round trip: persist initial score, change underlying audit data, call `recompute`, assert new score differs and event emitted.
- Clamp: inputs with values out of range, assert clamped without throwing.

## 10. Open Questions

- None at contract draft. Visual presentation (numeric vs star vs band label) is a Phoebe strategic_decision, not a score-calc concern.

## 11. Post-Hackathon Refactor Notes

- Add recency decay: prior positive behavior decays over time unless reinforced.
- Introduce adversarial-robustness audit: detect review brigading and weighted-sybil patterns.
- Integrate with Protocol pillar: cross-vendor reputation portability.
- Add verifier scoring: not all verifiers equal; higher-rated verifiers carry more weight.
- Publish public Trust Score API under OAuth scope so external platforms can surface scores in their own UIs.
