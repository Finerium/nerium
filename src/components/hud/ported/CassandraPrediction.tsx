'use client';

//
// CassandraPrediction.tsx (ported reference skeleton)
//
// Ported from: app/advisor/ui/PredictionWarning.tsx (Erato P2)
// Ported by: Talos-translator (2026-04-23)
// Target: Erato-v2 HUD warning banner overlay (in-game)
//
// Conforms to:
// - docs/contracts/prediction_layer_surface.contract.md v0.1.0 (severity + message)
// - docs/contracts/advisor_ui.contract.md v0.1.0 (PredictionWarningProps)
//
// This skeleton preserves the self-contained SVG icon rendering, severity
// vocabulary (advisory, review_recommended, halt_recommended), and ARIA
// severity-live mapping (assertive on halt, polite otherwise) from V3. The
// surface is rewritten for in-game HUD overlay context:
//
//   - Component name changed from PredictionWarning to CassandraPrediction
//     to signal the agent-origin provenance in HUD registry
//   - Prop callbacks preserved (onAcknowledge, onRevise) but parent is
//     expected to wire these to Zustand store actions, NOT window CustomEvents
//   - ARIA live severity mapping preserved
//   - ClassName moved from `.advisor-warning` dashboard namespace to
//     `.hud-prediction` game-HUD namespace (Erato-v2 authors final CSS)
//
// Erato-v2 integration notes:
//   - Wrap this in a motion.div for HUD appearance transitions (Framer Motion)
//   - Subscribe to a warningStore selector for visibility state
//   - Bind onAcknowledge/onRevise to store actions, not window dispatch
//   - halt_recommended triggers Phaser scene pause (dispatch via gameBridge)
//

import { useCallback, type ReactElement } from 'react';

export type CassandraPredictionSeverity =
  | 'advisory'
  | 'review_recommended'
  | 'halt_recommended';

export interface CassandraPredictionProps {
  readonly warning_id: string;
  readonly gamified_message: string;
  readonly severity: CassandraPredictionSeverity;
  readonly onAcknowledge: () => void;
  readonly onRevise: () => void;
}

const SEVERITY_LABEL: Record<CassandraPredictionSeverity, string> = {
  advisory: 'Advisory',
  review_recommended: 'Review recommended',
  halt_recommended: 'Halt recommended',
};

const SEVERITY_LIVE: Record<CassandraPredictionSeverity, 'polite' | 'assertive'> = {
  advisory: 'polite',
  review_recommended: 'polite',
  halt_recommended: 'assertive',
};

function PredictionIcon({
  severity,
}: {
  readonly severity: CassandraPredictionSeverity;
}): ReactElement {
  if (severity === 'halt_recommended') {
    return (
      <svg
        viewBox="0 0 20 20"
        width="14"
        height="14"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M10 2 L18 18 L2 18 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M10 8 L10 12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="10" cy="14.5" r="0.9" fill="currentColor" />
      </svg>
    );
  }
  if (severity === 'review_recommended') {
    return (
      <svg
        viewBox="0 0 20 20"
        width="14"
        height="14"
        aria-hidden="true"
        focusable="false"
      >
        <rect
          x="3"
          y="3"
          width="14"
          height="14"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M7 10 L9 12 L13 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="10"
        cy="10"
        r="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M10 6 L10 11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="10" cy="13.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

export default function CassandraPrediction(
  props: CassandraPredictionProps,
): ReactElement {
  const { warning_id, gamified_message, severity, onAcknowledge, onRevise } = props;

  const handleAcknowledge = useCallback(() => {
    try {
      onAcknowledge();
    } catch {
      /* parent (store dispatch) surfaces via toast; banner stays on-screen */
    }
  }, [onAcknowledge]);

  const handleRevise = useCallback(() => {
    try {
      onRevise();
    } catch {
      /* same pattern */
    }
  }, [onRevise]);

  return (
    <section
      className="hud-prediction"
      data-hud-role="prediction-warning"
      data-severity={severity}
      data-warning-id={warning_id}
      role="alert"
      aria-live={SEVERITY_LIVE[severity]}
      aria-label={`Prediction warning, ${SEVERITY_LABEL[severity]}`}
    >
      <span className="hud-prediction-icon" aria-hidden="true">
        <PredictionIcon severity={severity} />
      </span>
      <div className="hud-prediction-body">
        <p className="hud-prediction-meta">{SEVERITY_LABEL[severity]}</p>
        <p className="hud-prediction-message">{gamified_message}</p>
        <div className="hud-prediction-actions">
          <button
            type="button"
            className="hud-prediction-btn"
            data-variant="secondary"
            onClick={handleAcknowledge}
            aria-label="Acknowledge warning, continue pipeline as planned"
          >
            Acknowledge
          </button>
          <button
            type="button"
            className="hud-prediction-btn"
            data-variant="primary"
            onClick={handleRevise}
            aria-label="Revise blueprint before the flagged specialist runs"
          >
            Revise
          </button>
        </div>
      </div>
    </section>
  );
}

export type { CassandraPredictionProps as Props };
