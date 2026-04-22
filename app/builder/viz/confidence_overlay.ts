//
// confidence_overlay.ts
//
// Conforms to: docs/contracts/pipeline_visualizer.contract.md v0.1.0
// Companion contract: docs/contracts/prediction_layer_surface.contract.md
//
// Confidence ring overlay helpers. Maps a Cassandra-emitted confidence
// scalar (0.0 to 1.0) to visual ring color plus band label. Pure module,
// no React import, reusable by AgentNode, Blueprint Moment (Urania reuse),
// and Nemea regression snapshots.
//
// Color tokens follow Cyberpunk Shanghai palette anchored in
// NarasiGhaisan.md Section 7. Green/amber/red hues are saturated enough to
// read over dark canvas, tuned for OKLCH perceptual consistency.
//

import {
  CONFIDENCE_GREEN_MIN,
  CONFIDENCE_AMBER_MIN,
  type ConfidenceBand,
} from './types';

export interface ConfidenceVisual {
  readonly band: ConfidenceBand;
  readonly stroke: string;
  readonly glow: string;
  readonly opacity: number;
  readonly tooltip: string;
}

const GREEN_STROKE = '#22f59a';
const GREEN_GLOW = 'rgba(34, 245, 154, 0.55)';
const AMBER_STROKE = '#ffb300';
const AMBER_GLOW = 'rgba(255, 179, 0, 0.55)';
const RED_STROKE = '#ff3d5a';
const RED_GLOW = 'rgba(255, 61, 90, 0.55)';
const UNKNOWN_STROKE = '#6a7687';
const UNKNOWN_GLOW = 'rgba(106, 118, 135, 0.35)';

export function bandForConfidence(confidence: number | undefined): ConfidenceBand {
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
    return 'unknown';
  }
  if (confidence < 0 || confidence > 1) {
    // Out-of-range input signals upstream schema drift. Degrade gracefully.
    return 'unknown';
  }
  if (confidence >= CONFIDENCE_GREEN_MIN) return 'green';
  if (confidence >= CONFIDENCE_AMBER_MIN) return 'amber';
  return 'red';
}

export function confidenceVisual(confidence: number | undefined): ConfidenceVisual {
  const band = bandForConfidence(confidence);
  switch (band) {
    case 'green':
      return {
        band,
        stroke: GREEN_STROKE,
        glow: GREEN_GLOW,
        opacity: 0.9,
        tooltip: `High confidence (${formatPercent(confidence)})`,
      };
    case 'amber':
      return {
        band,
        stroke: AMBER_STROKE,
        glow: AMBER_GLOW,
        opacity: 0.85,
        tooltip: `Medium confidence (${formatPercent(confidence)})`,
      };
    case 'red':
      return {
        band,
        stroke: RED_STROKE,
        glow: RED_GLOW,
        opacity: 0.95,
        tooltip: `Low confidence (${formatPercent(confidence)})`,
      };
    case 'unknown':
    default:
      return {
        band: 'unknown',
        stroke: UNKNOWN_STROKE,
        glow: UNKNOWN_GLOW,
        opacity: 0.4,
        tooltip: 'Confidence pending',
      };
  }
}

function formatPercent(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  const clamped = Math.max(0, Math.min(1, value));
  return `${Math.round(clamped * 100)} percent`;
}

// Used by PipelineCanvas to toggle overlay fade within 300ms per contract
// Section 9 testing surface.
export const CONFIDENCE_OVERLAY_FADE_MS = 300;
