//
// schema.ts
//
// Conforms to: docs/contracts/prediction_layer_surface.contract.md v0.1.0 Section 3
// Owner Agent(s) per contract: Cassandra
//
// Canonical data types for the Prediction Layer surface. Every consumer (Apollo,
// Erato, Helios) imports confidence-map and warning shapes from this file.
//
// Additive evolution only: new optional fields allowed, breaking shape changes
// require a contract version bump per event_bus.contract.md Section 5.
//

// ---------- Confidence bands ----------

export type ConfidenceBand = 'high' | 'medium' | 'low' | 'critical';

export const CONFIDENCE_BAND_THRESHOLDS = {
  high: 0.8,
  medium: 0.6,
  low: 0.4,
} as const;

// ---------- Per-specialist confidence ----------

export interface SpecialistConfidence {
  readonly specialist_id: string;
  readonly role: string;
  readonly step_index: number;
  readonly confidence_score: number; // 0.0 to 1.0 inclusive
  readonly band: ConfidenceBand;
  readonly simulation_pass_count: number;
  readonly variance: number; // stddev across passes
  readonly computed_at: string; // ISO-8601 UTC
}

// ---------- Confidence map (emitted per scan) ----------

export type ScanKind = 'pre_execution' | 're_simulation' | 'final';

export interface ConfidenceMap {
  readonly pipeline_run_id: string;
  readonly scan_id: string;
  readonly scan_kind: ScanKind;
  readonly per_specialist: ReadonlyArray<SpecialistConfidence>;
  readonly overall_pipeline_confidence: number; // 0.0 to 1.0 aggregate
  readonly generated_at: string;
}

// ---------- Early warning ----------

export type WarningSeverity = 'advisory' | 'review_recommended' | 'halt_recommended';

export interface EarlyWarning {
  readonly warning_id: string;
  readonly pipeline_run_id: string;
  readonly triggered_by_specialist_id: string;
  readonly triggered_step_index: number;
  readonly gamified_message: string;
  readonly underlying_reason: string;
  readonly severity: WarningSeverity;
  readonly confidence_threshold_violated: number;
  readonly issued_at: string;
}

// ---------- Topology input (read-only view over Athena topology) ----------
//
// Cassandra reads Athena's pipeline_topology.lumio.json but never mutates it.
// This view type captures only the fields relevant to confidence estimation.
// Kept separate from Athena's authoritative topology type so Cassandra does
// not create a reverse dependency into builder executor internals.

export interface TopologyStepView {
  readonly step_index: number;
  readonly specialist_id: string;
  readonly role: string;
  readonly preferred_lane: string;
  readonly preferred_model: string;
  readonly acceptable_substitute_model?: string;
  readonly budget_tokens: number;
  readonly budget_wallclock_seconds: number;
  readonly input_artifact_refs: ReadonlyArray<string>;
  readonly output_artifact_paths: ReadonlyArray<string>;
  readonly handoff_to_step_indices: ReadonlyArray<number>;
}

export interface PipelineTopology {
  readonly pipeline_id: string;
  readonly default_strategy: string;
  readonly specialist_steps: ReadonlyArray<TopologyStepView>;
}

// ---------- Specialist output view (for re-simulation grounding) ----------
//
// Mirrors the subset of BuilderSpecialistExecutor.SpecialistOutput that
// Cassandra consumes. Importing the full type would tightly couple prediction
// to executor; this shallow view keeps the boundary clean.

export type SpecialistOutputStatus = 'success' | 'halt' | 'error';

export interface SpecialistOutputView {
  readonly specialist_id: string;
  readonly pipeline_run_id: string;
  readonly step_index: number;
  readonly status: SpecialistOutputStatus;
  readonly artifact_paths: ReadonlyArray<string>;
  readonly tokens_consumed: { readonly input: number; readonly output: number };
  readonly cost_usd: number;
  readonly wallclock_ms: number;
  readonly halt_reason?: string;
  readonly error_message?: string;
}

// ---------- Derivation utility: score to band ----------
//
// Pure, contract-driven. Tested in confidence_formula tests. Exported so Erato
// can reuse identical thresholds for UI tinting without drift.

export function scoreToBand(score: number): ConfidenceBand {
  if (score >= CONFIDENCE_BAND_THRESHOLDS.high) return 'high';
  if (score >= CONFIDENCE_BAND_THRESHOLDS.medium) return 'medium';
  if (score >= CONFIDENCE_BAND_THRESHOLDS.low) return 'low';
  return 'critical';
}
