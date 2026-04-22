// app/registry/trust/trust_formula.ts
//
// NERIUM Registry pillar: trust score formula.
// Conforms to docs/contracts/trust_score.contract.md v0.1.0.
//
// Pure function `calculate` composes four signals into a single [0, 1] score:
//   score = w_usage * usage_count_normalized
//         + w_reviews * positive_review_ratio
//         + w_success * successful_execution_rate
//         + w_attest  * verifier_attestation_weight
//
// Default weights {0.20, 0.30, 0.30, 0.20} sum to 1.0. Caller-provided weights
// are normalized if they do not sum to 1.0. Signals out of [0, 1] are clamped
// with a warning rather than throwing, so callers receive a best-effort score.

import type {
  TrustScore,
  TrustInputs,
  TrustBand,
  TrustFormulaWeights,
  TrustStability,
} from './trust_types';
import {
  BAND_CUTOFFS,
  DEFAULT_WEIGHTS,
  InvalidInputError,
  STABILITY_USAGE_THRESHOLD,
  UnknownIdentityError,
} from './trust_types';

export interface TrustScoreCalculator {
  calculate(
    identity_id: string,
    inputs: TrustInputs,
    weights?: TrustFormulaWeights,
  ): TrustScore;
  deriveBand(score: number): TrustBand;
  getLatest(identity_id: string): Promise<TrustScore | null>;
  recompute(identity_id: string): Promise<TrustScore>;
  persist(score: TrustScore): Promise<void>;
}

export function deriveBand(score: number): TrustBand {
  const clamped = clamp01(score);
  for (const cutoff of BAND_CUTOFFS) {
    if (clamped >= cutoff.min) return cutoff.band;
  }
  return 'unverified';
}

export function calculate(
  identity_id: string,
  inputs: TrustInputs,
  weights: TrustFormulaWeights = DEFAULT_WEIGHTS,
): TrustScore {
  if (inputs.usage_count < 0) {
    throw new InvalidInputError('usage_count must be non-negative');
  }
  if (inputs.verifier_attestation_count < 0) {
    throw new InvalidInputError('verifier_attestation_count must be non-negative');
  }

  warnIfOutOfRange(identity_id, inputs);

  const normalizedWeights = normalizeWeights(weights);

  const signals = {
    usage: clamp01(inputs.usage_count_normalized),
    reviews: clamp01(inputs.positive_review_ratio),
    success: clamp01(inputs.successful_execution_rate),
    attestation: clamp01(inputs.verifier_attestation_weight),
  };

  const score =
    normalizedWeights.usage * signals.usage +
    normalizedWeights.reviews * signals.reviews +
    normalizedWeights.successful_execution * signals.success +
    normalizedWeights.verifier_attestation * signals.attestation;

  return {
    identity_id,
    score: round6(clamp01(score)),
    band: deriveBand(score),
    computed_at: new Date().toISOString(),
    inputs,
    stability: deriveStability(inputs),
  };
}

// Log-scale normalization for usage counts: maps raw count to [0, 1] using
// log1p so early usage climbs fast and later usage saturates.
// Reference ceiling `cap` chosen per ADR 0003 (see hecate.decisions.md).
export function normalizeUsage(usage_count: number, cap = 10_000): number {
  if (usage_count <= 0) return 0;
  const capped = Math.min(usage_count, cap);
  return clamp01(Math.log1p(capped) / Math.log1p(cap));
}

function normalizeWeights(weights: TrustFormulaWeights): TrustFormulaWeights {
  const entries = Object.entries(weights) as Array<[keyof TrustFormulaWeights, number]>;
  const hasNegative = entries.some(([, v]) => v < 0);
  const total = entries.reduce((s, [, v]) => s + Math.max(v, 0), 0);
  if (hasNegative || total <= 0) {
    console.warn(
      '[trust_formula] weights negative or sum<=0, falling back to DEFAULT_WEIGHTS',
      { offered: weights },
    );
    return DEFAULT_WEIGHTS;
  }
  if (Math.abs(total - 1) < 1e-9) return weights;
  return {
    usage: Math.max(weights.usage, 0) / total,
    reviews: Math.max(weights.reviews, 0) / total,
    successful_execution: Math.max(weights.successful_execution, 0) / total,
    verifier_attestation: Math.max(weights.verifier_attestation, 0) / total,
  };
}

function warnIfOutOfRange(identity_id: string, inputs: TrustInputs): void {
  const offenders: string[] = [];
  if (!inRange01(inputs.usage_count_normalized)) offenders.push('usage_count_normalized');
  if (!inRange01(inputs.positive_review_ratio)) offenders.push('positive_review_ratio');
  if (!inRange01(inputs.successful_execution_rate)) offenders.push('successful_execution_rate');
  if (!inRange01(inputs.verifier_attestation_weight)) offenders.push('verifier_attestation_weight');
  if (offenders.length > 0) {
    console.warn(
      '[trust_formula] inputs out of [0,1] clamped per trust_score.contract.md Section 8',
      { identity_id, offenders },
    );
  }
}

function inRange01(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function deriveStability(inputs: TrustInputs): TrustStability {
  const underused = inputs.usage_count < STABILITY_USAGE_THRESHOLD;
  const noReviews = inputs.positive_review_ratio === 0.5;
  return underused || noReviews ? 'provisional' : 'stable';
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

// Display helper: UI layer renders 0 to 100 percentage per hecate.decisions ADR 0002.
export function toDisplayPercent(score: number): number {
  return Math.round(clamp01(score) * 100);
}

export { InvalidInputError, UnknownIdentityError };
