//
// confidence_formula.ts
//
// Conforms to: docs/contracts/prediction_layer_surface.contract.md v0.1.0 Section 4
//
// Pure aggregation logic for N simulation passes to a single confidence score
// plus band derivation. Kept deterministic, side-effect free, and dependency
// free so it is trivially unit-testable and reusable by Erato for inline
// re-derivation if ever needed (though the canonical computation is here).
//
// Aggregation method chosen for hackathon demo: arithmetic mean with
// population variance, clamped to [0, 1]. Rationale in ADR-001 of
// docs/cassandra.decisions.md. Median and weighted-mean variants are left as
// post-hackathon refactor notes there.
//

import type {
  ConfidenceBand,
  SpecialistConfidence,
} from './schema';
import { CONFIDENCE_BAND_THRESHOLDS, scoreToBand } from './schema';

// ---------- Numeric primitives ----------

export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export function mean(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function populationVariance(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  let acc = 0;
  for (const v of values) {
    const d = v - m;
    acc += d * d;
  }
  return acc / values.length;
}

export function stddev(values: ReadonlyArray<number>): number {
  return Math.sqrt(populationVariance(values));
}

// ---------- Aggregation primitive ----------

export interface AggregationResult {
  readonly mean_score: number;
  readonly variance: number; // stddev (not variance-squared) for UI use
  readonly sample_count: number;
}

export function aggregate(samples: ReadonlyArray<number>): AggregationResult {
  const clamped: number[] = [];
  for (const s of samples) clamped.push(clamp01(s));
  return {
    mean_score: mean(clamped),
    variance: stddev(clamped),
    sample_count: clamped.length,
  };
}

// ---------- Specialist confidence construction ----------

export interface BuildSpecialistConfidenceInput {
  readonly specialist_id: string;
  readonly role: string;
  readonly step_index: number;
  readonly samples: ReadonlyArray<number>;
  readonly computed_at?: string; // default new Date().toISOString()
}

export function buildSpecialistConfidence(
  input: BuildSpecialistConfidenceInput,
): SpecialistConfidence {
  const agg = aggregate(input.samples);
  return {
    specialist_id: input.specialist_id,
    role: input.role,
    step_index: input.step_index,
    confidence_score: clamp01(agg.mean_score),
    band: scoreToBand(agg.mean_score),
    simulation_pass_count: agg.sample_count,
    variance: agg.variance,
    computed_at: input.computed_at ?? new Date().toISOString(),
  };
}

// ---------- Overall pipeline confidence ----------
//
// Strategy: weighted harmonic-leaning aggregate so a single low-confidence
// specialist pulls the overall score down, reflecting real pipeline risk
// where one weak link breaks the chain. Formula documented in ADR-001.
//
// overall = weighted_mean - penalty_for_worst_band
// where penalty = 0.0 if no critical, 0.05 if any low, 0.10 if any critical.
//
// Rationale: straight arithmetic mean understates risk (one 0.3 among
// nine 0.9s gives 0.84, comfortably "high", obscuring the one broken link).
// True harmonic mean overcorrects and makes the surface feel panicky. The
// small band penalty captures "one broken link matters" without overreaction.

const BAND_PENALTY: Record<ConfidenceBand, number> = {
  high: 0,
  medium: 0,
  low: 0.05,
  critical: 0.1,
};

export function overallPipelineConfidence(
  per_specialist: ReadonlyArray<SpecialistConfidence>,
): number {
  if (per_specialist.length === 0) return 0;
  const scores: number[] = [];
  let worst_penalty = 0;
  for (const s of per_specialist) {
    scores.push(s.confidence_score);
    const p = BAND_PENALTY[s.band];
    if (p > worst_penalty) worst_penalty = p;
  }
  const base = mean(scores);
  return clamp01(base - worst_penalty);
}

// ---------- Early-warning threshold helpers ----------

export const DEFAULT_WARNING_THRESHOLD = 0.6;

export interface ThresholdEvaluation {
  readonly crossed: boolean;
  readonly severity: 'advisory' | 'review_recommended' | 'halt_recommended';
}

export function evaluateThreshold(
  confidence_score: number,
  threshold: number = DEFAULT_WARNING_THRESHOLD,
): ThresholdEvaluation {
  if (confidence_score >= threshold) {
    return { crossed: false, severity: 'advisory' };
  }
  if (confidence_score >= CONFIDENCE_BAND_THRESHOLDS.low) {
    return { crossed: true, severity: 'review_recommended' };
  }
  return { crossed: true, severity: 'halt_recommended' };
}
