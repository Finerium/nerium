'use client';

//
// PredictionWarning.tsx (Erato P2).
//
// Conforms to:
// - docs/contracts/advisor_ui.contract.md v0.1.0 (PredictionWarningProps)
// - docs/contracts/prediction_layer_surface.contract.md v0.1.0 (severity + message)
//
// Renders the gamified warning banner Cassandra emits. Severity drives colour,
// icon, and aria-live politeness. "halt_recommended" uses assertive so screen
// readers interrupt; advisory + review_recommended use polite to avoid
// noise per NarasiGhaisan Section 13 brevity.
//

import { useCallback, type ReactElement } from 'react';

export type PredictionWarningSeverity =
  | 'advisory'
  | 'review_recommended'
  | 'halt_recommended';

export interface PredictionWarningProps {
  warning_id: string;
  gamified_message: string;
  severity: PredictionWarningSeverity;
  onAcknowledge: () => void;
  onRevise: () => void;
}

const SEVERITY_LABEL: Record<PredictionWarningSeverity, string> = {
  advisory: 'Advisory',
  review_recommended: 'Review recommended',
  halt_recommended: 'Halt recommended',
};

const SEVERITY_LIVE: Record<PredictionWarningSeverity, 'polite' | 'assertive'> = {
  advisory: 'polite',
  review_recommended: 'polite',
  halt_recommended: 'assertive',
};

function PredictionIcon({
  severity,
}: {
  severity: PredictionWarningSeverity;
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

export default function PredictionWarning(
  props: PredictionWarningProps,
): ReactElement {
  const { warning_id, gamified_message, severity, onAcknowledge, onRevise } = props;

  const handleAcknowledge = useCallback(() => {
    try {
      onAcknowledge();
    } catch {
      /* surfaced by parent via toast; warning banner stays on-screen */
    }
  }, [onAcknowledge]);

  const handleRevise = useCallback(() => {
    try {
      onRevise();
    } catch {
      /* surfaced by parent via toast; warning banner stays on-screen */
    }
  }, [onRevise]);

  return (
    <section
      className="advisor-warning"
      data-severity={severity}
      data-warning-id={warning_id}
      role="alert"
      aria-live={SEVERITY_LIVE[severity]}
      aria-label={`Prediction warning, ${SEVERITY_LABEL[severity]}`}
    >
      <span className="advisor-warning-icon" aria-hidden="true">
        <PredictionIcon severity={severity} />
      </span>
      <div className="advisor-warning-body">
        <p className="advisor-warning-meta">{SEVERITY_LABEL[severity]}</p>
        <p className="advisor-warning-message">{gamified_message}</p>
        <div className="advisor-warning-actions">
          <button
            type="button"
            className="advisor-warning-btn"
            data-variant="secondary"
            onClick={handleAcknowledge}
            aria-label="Acknowledge warning, continue pipeline as planned"
          >
            Acknowledge
          </button>
          <button
            type="button"
            className="advisor-warning-btn"
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

export type { PredictionWarningProps as Props };
