# Prediction Layer Surface

**Contract Version:** 0.1.0
**Owner Agent(s):** Cassandra (simulation engine, emits confidence maps and warnings)
**Consumer Agent(s):** Apollo (renders prediction map to user via Erato), Erato (warning banner UI), Helios (overlays per-agent confidence on pipeline viz)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the schema Cassandra emits for the 6-step Monte Carlo-inspired continuous re-simulation engine (Pre-Execution Scan, User Review, Pipeline Mulai, Re-Simulation, Repeat, Early Warning) per BuilderImprovement_PredictionLayer.pdf, so upstream subscribers can render confidence maps and gamified warnings consistently without coupling to simulation internals.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 4 token-cost awareness explaining Sonnet exception)
- `CLAUDE.md` (root)
- `docs/contracts/simulation_event.contract.md` (complementary event stream)
- `docs/contracts/event_bus.contract.md` (bus the warnings ride on)

## 3. Schema Definition

```typescript
// app/builder/prediction/schema.ts

export type ConfidenceBand = 'high' | 'medium' | 'low' | 'critical';

export interface SpecialistConfidence {
  specialist_id: string;
  role: string;
  step_index: number;
  confidence_score: number;         // 0.0 to 1.0 inclusive
  band: ConfidenceBand;             // derived: >=0.8 high, 0.6-0.79 medium, 0.4-0.59 low, <0.4 critical
  simulation_pass_count: number;    // default 100 per scan per Metis lock
  variance: number;                 // stddev across passes
  computed_at: string;              // ISO-8601 UTC
}

export interface ConfidenceMap {
  pipeline_run_id: string;
  scan_id: string;
  scan_kind: 'pre_execution' | 're_simulation' | 'final';
  per_specialist: SpecialistConfidence[];
  overall_pipeline_confidence: number;  // aggregate 0.0 to 1.0
  generated_at: string;
}

export interface EarlyWarning {
  warning_id: string;
  pipeline_run_id: string;
  triggered_by_specialist_id: string;
  triggered_step_index: number;
  gamified_message: string;         // e.g., "Blueprint scan alert, Floor 7 berisiko, revisi?"
  underlying_reason: string;        // plain-language technical cause
  severity: 'advisory' | 'review_recommended' | 'halt_recommended';
  confidence_threshold_violated: number; // the 0.0 to 1.0 floor crossed
  issued_at: string;
}
```

## 4. Interface / API Contract

```typescript
export interface PredictionEngine {
  runPreExecutionScan(pipeline_run_id: string, topology: PipelineTopology, passes?: number): Promise<ConfidenceMap>;
  reSimulate(pipeline_run_id: string, completed_specialist_id: string, actual_output: SpecialistOutput, passes?: number): Promise<ConfidenceMap>;
  emitEarlyWarning(warning: EarlyWarning): Promise<void>;
  getWarningHistory(pipeline_run_id: string): Promise<EarlyWarning[]>;
}
```

- `passes` parameter defaults to 100 per Metis Monte Carlo convention lock; callable up to 500 per high-stakes scan. Budget impact documented in `cassandra.decisions.md`.
- Confidence score computation averaging logic lives in `confidence_formula.ts`, not exposed in the public interface.
- `emitEarlyWarning` publishes `pipeline.prediction.warning` event on the bus and returns once published.

## 5. Event Signatures

- `pipeline.prediction.emitted` payload: `{ confidence_map: ConfidenceMap }`
- `pipeline.prediction.warning` payload: `{ warning: EarlyWarning }`
- Warnings that meet `severity: 'halt_recommended'` additionally trigger an `advisor.turn.appended` event via Apollo (not emitted by Cassandra directly).

## 6. File Path Convention

- Schema: `app/builder/prediction/schema.ts`
- Engine implementation: `app/builder/prediction/cassandra.ts`
- Prompt template: `app/builder/prediction/prompt_template.ts`
- Formula: `app/builder/prediction/confidence_formula.ts`

## 7. Naming Convention

- `ConfidenceBand` string values: lowercase single word.
- Specialist IDs: lowercase Greek name or specialist slug (e.g., `athena`, `lumio_copywriter_01`).
- Warning IDs: `warn_{pipeline_run_id}_{sequence}`.
- Scan IDs: `scan_{pipeline_run_id}_{kind}_{sequence}`.

## 8. Error Handling

- Simulation pass failure (network error, rate limit): retry failed pass up to 2 times, otherwise drop the pass from aggregation and proceed with surviving passes (annotate `simulation_pass_count` with actual count).
- If more than 50% of passes fail: emit a `pipeline.prediction.warning` with `severity: 'advisory'` and `underlying_reason: 'simulation_degraded'`, skip re-simulation for affected step.
- Confidence score out of `[0, 1]`: clamp to range, log warning, do not throw.
- Missing specialist in topology: throw `UnknownSpecialistError` to caller (Apollo).

## 9. Testing Surface

- Pre-execution scan round trip: supply a 10-specialist topology, invoke with `passes: 20` for test speed, assert returned `ConfidenceMap` has exactly 10 entries and `overall_pipeline_confidence` is in `[0, 1]`.
- Band derivation: construct confidence scores at `0.95, 0.7, 0.5, 0.3`, assert bands `high, medium, low, critical`.
- Early warning on threshold cross: re-simulate with an actual output known to drop downstream confidence below 0.6, assert a `pipeline.prediction.warning` is emitted with correct `severity`.
- Graceful degradation: mock 60% of simulation passes to fail, assert engine returns map with adjusted `simulation_pass_count` and emits advisory warning.

## 10. Open Questions

- None at contract draft. Stochastic vs deterministic sampling choice deferred to Cassandra strategic_decision_hard_stop; does not affect schema.

## 11. Post-Hackathon Refactor Notes

- If Sonnet 4.6 per-pass quality proves insufficient for production accuracy, migrate simulation to Opus 4.7 at reduced pass count (e.g., 20 passes Opus vs 100 passes Sonnet) with calibration against ground-truth outcome data.
- Add user-facing controls to adjust simulation pass count and confidence threshold (currently implicit; production users of NERIUM Builder Cheap/Mid/Premium tiers should configure their own risk tolerance).
- Integrate with Registry trust scores: specialist with low Registry trust score receives lower prior confidence in simulation, improving calibration.
- Persist confidence maps and warnings to SQLite for post-run analysis and demo replay deterministic playback.
