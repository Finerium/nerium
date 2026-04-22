'use client';

//
// ModelStrategySelector.tsx (Erato P2).
//
// Conforms to:
// - docs/contracts/advisor_ui.contract.md v0.1.0 (ModelStrategySelectorProps)
// - docs/contracts/advisor_interaction.contract.md v0.1.0 (ModelStrategy enum)
//
// Dropdown over the four strategies (opus_all, collaborative, multi_vendor,
// auto). Labels and honest_claim_annotation values mirror
// app/advisor/apollo.config.json model_strategy.modes; hardcoded here so the
// UI renders without a runtime JSON fetch and so Erato stays decoupled from
// Apollo config IO per contract Section 4 ("Props are typed via interfaces
// above; no any leakage"). Apollo config remains authoritative for semantic
// changes; if modes gain honest_claim_annotation fields post-hackathon, sync
// values here.
//
// Honest-claim discipline (CLAUDE.md): multi_vendor and auto ship with an
// explicit user-visible annotation per Erato prompt hard_constraint.
//

import {
  useCallback,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import type { ModelStrategy } from '../apollo';

export interface ModelStrategySelectorProps {
  current: ModelStrategy;
  onChange: (next: ModelStrategy) => Promise<void>;
  disabled?: boolean;
  multiVendorPanel?: ReactNode;
}

interface ModeRenderSpec {
  value: ModelStrategy;
  label: string;
  description: string;
  honestClaimAnnotation: string | null;
}

const MODES: ReadonlyArray<ModeRenderSpec> = [
  {
    value: 'opus_all',
    label: 'Opus all the way',
    description: 'Premium tier, Opus across every agent.',
    honestClaimAnnotation: null,
  },
  {
    value: 'collaborative',
    label: 'Collaborative Anthropic',
    description: 'Opus for strategic agents, Sonnet for execution workers.',
    honestClaimAnnotation: null,
  },
  {
    value: 'multi_vendor',
    label: 'Multi-vendor',
    description: 'User picks per-task vendor (Claude, Gemini, Higgsfield, others).',
    honestClaimAnnotation:
      'Demo execution Anthropic only, multi-vendor unlock post-hackathon.',
  },
  {
    value: 'auto',
    label: 'Auto',
    description: 'Orchestrator researches and decides per-task model.',
    honestClaimAnnotation:
      'Auto routing ships post-hackathon; current demo uses collaborative Anthropic.',
  },
];

const MODES_BY_VALUE: Record<ModelStrategy, ModeRenderSpec> = MODES.reduce(
  (acc, mode) => {
    acc[mode.value] = mode;
    return acc;
  },
  {} as Record<ModelStrategy, ModeRenderSpec>,
);

export default function ModelStrategySelector(
  props: ModelStrategySelectorProps,
): ReactElement {
  const { current, onChange, disabled, multiVendorPanel } = props;

  const handleChange = useCallback(
    async (event: ChangeEvent<HTMLSelectElement>) => {
      const next = event.target.value as ModelStrategy;
      if (next === current) return;
      try {
        await onChange(next);
      } catch {
        /* parent surfaces error via toast; selector keeps prior value on re-render */
      }
    },
    [current, onChange],
  );

  const currentMode = MODES_BY_VALUE[current];
  const showMultiVendorPanel =
    current === 'multi_vendor' && multiVendorPanel !== undefined;

  return (
    <div className="advisor-strategy">
      <label className="advisor-strategy-label" htmlFor="advisor-strategy-select">
        Model strategy
      </label>
      <select
        id="advisor-strategy-select"
        className="advisor-strategy-select"
        value={current}
        onChange={handleChange}
        disabled={disabled}
        aria-label="Select model strategy for the Builder pipeline"
        aria-describedby={
          currentMode?.honestClaimAnnotation
            ? 'advisor-strategy-annotation'
            : 'advisor-strategy-description'
        }
      >
        {MODES.map((mode) => (
          <option key={mode.value} value={mode.value}>
            {mode.label}
          </option>
        ))}
      </select>
      <span
        id="advisor-strategy-description"
        className="advisor-strategy-note"
        aria-live="polite"
      >
        {currentMode?.description}
      </span>
      {currentMode?.honestClaimAnnotation ? (
        <span
          id="advisor-strategy-annotation"
          className="advisor-strategy-note"
          role="note"
          aria-live="polite"
        >
          {currentMode.honestClaimAnnotation}
        </span>
      ) : null}
      {showMultiVendorPanel ? (
        <div
          className="advisor-strategy-multivendor-panel"
          role="region"
          aria-label="Multi-vendor configuration panel"
        >
          {multiVendorPanel}
        </div>
      ) : null}
    </div>
  );
}

export { MODES as MODEL_STRATEGY_MODES };
