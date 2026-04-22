// app/registry/trust/trust_types.ts
//
// NERIUM Registry pillar: trust score types.
// Conforms to docs/contracts/trust_score.contract.md v0.1.0.
//
// Score is always a normalized float in [0, 1].
// UI layer (Phoebe) may display as a 0 to 100 percentage per hecate.decisions ADR 0002.

export type TrustBand =
  | 'unverified'   // score <  0.2
  | 'emerging'     // 0.2  <= score < 0.4
  | 'established'  // 0.4  <= score < 0.6
  | 'trusted'      // 0.6  <= score < 0.85
  | 'elite';       // score >= 0.85

export type TrustStability = 'provisional' | 'stable';

export interface TrustInputs {
  usage_count: number;                 // non-negative integer
  usage_count_normalized: number;      // 0.0 to 1.0, log-scale normalized
  positive_review_ratio: number;       // 0.0 to 1.0, neutral 0.5 when no reviews
  successful_execution_rate: number;   // 0.0 to 1.0, neutral 0.5 when no executions
  verifier_attestation_count: number;  // non-negative integer
  verifier_attestation_weight: number; // 0.0 to 1.0, 0 when no verifiers
}

export interface TrustScore {
  identity_id: string;
  score: number;         // 0.0 to 1.0 normalized
  band: TrustBand;       // derived from score via deriveBand
  computed_at: string;   // ISO 8601
  inputs: TrustInputs;
  stability: TrustStability;
}

export interface TrustFormulaWeights {
  usage: number;                  // default 0.20
  reviews: number;                // default 0.30
  successful_execution: number;   // default 0.30
  verifier_attestation: number;   // default 0.20
}

export const DEFAULT_WEIGHTS: TrustFormulaWeights = {
  usage: 0.20,
  reviews: 0.30,
  successful_execution: 0.30,
  verifier_attestation: 0.20,
};

// Provisional stability threshold: stability is `provisional` below this usage count
// or while review_ratio is still at neutral default because no reviews exist.
export const STABILITY_USAGE_THRESHOLD = 10;

// Band cutoffs per contract Section 3.
export const BAND_CUTOFFS: Array<{ min: number; band: TrustBand }> = [
  { min: 0.85, band: 'elite' },
  { min: 0.60, band: 'trusted' },
  { min: 0.40, band: 'established' },
  { min: 0.20, band: 'emerging' },
  { min: 0.00, band: 'unverified' },
];

export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInputError';
  }
}

export class UnknownIdentityError extends Error {
  constructor(identity_id: string) {
    super(`Unknown identity: ${identity_id}`);
    this.name = 'UnknownIdentityError';
  }
}
