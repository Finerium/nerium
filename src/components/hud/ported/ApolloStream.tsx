'use client';

//
// ApolloStream.tsx (ported reference skeleton)
//
// Ported from: app/advisor/ui/AdvisorChat.tsx (Erato P2)
// Ported by: Talos-translator (2026-04-23)
// Target: Erato-v2 BottomBar DialogueOverlay in-game NPC dialog surface
//
// Conforms to:
// - docs/contracts/advisor_interaction.contract.md v0.1.0 (AdvisorSession + AdvisorTurn)
// - docs/contracts/advisor_ui.contract.md v0.1.0 (message pattern)
// - docs/contracts/prediction_layer_surface.contract.md v0.1.0 (severity rendering)
//
// This skeleton trims AdvisorChat.tsx to the turn-rendering core needed by
// an in-game NPC dialogue overlay. Dashboard chrome (pill groups, locale
// switch, world switch, model strategy selector, long-wait affordance,
// toast) is removed from the surface; those concerns move to dedicated HUD
// elements (TopBar, SideBar, corner overlays) authored by Erato-v2 fresh.
//
// What is preserved:
//   - AdvisorSession + AdvisorTurn type imports from V3 Apollo (KEEP)
//   - Brevity discipline (3 sentences max, 2 question marks max)
//     rendered as data-brevity-overflow marker
//   - attached_components pattern: prediction_warning embed, pipeline_viz
//     reference badge, blueprint_reveal reference badge
//   - Severity inference from keyword heuristic (ADR-0002 from Erato decisions)
//   - Framer Motion staggered turn appearance with ease-in curve
//   - ARIA: transcript aria-live polite, turn aria-label
//
// What changes vs V3:
//   - Component surface is presentation-only. Parent owns session state
//     and injects via props; Erato-v2 replaces this with Zustand selectors.
//   - Zero window event dispatching; warning actions surface as callbacks only.
//   - No Locale/World/ModelStrategy UI; these live elsewhere in HUD.
//   - Class names under `hud-apollo-*` namespace; Erato-v2 authors final CSS.
//
// Erato-v2 integration:
//   - Wrap this as the transcript surface inside BottomBar DialogueOverlay.
//   - Replace props-based session with useAdvisorStore narrow selector.
//   - Wire onAcknowledgeWarning + onReviseWarning to store dispatch actions.
//   - Compose pipelineVizSlot with HeliosPipelineViz via Zustand bridge.
//

import { useEffect, useMemo, useRef, type ReactElement, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import {
  countQuestionMarks,
  countSentences,
  type AdvisorSession,
  type AdvisorTurn,
  type AttachedComponent,
} from '../../../../app/advisor/apollo';

import CassandraPrediction, {
  type CassandraPredictionSeverity,
} from './CassandraPrediction';

export interface ApolloStreamProps {
  readonly session: AdvisorSession;
  readonly isAwaitingAdvisorTurn: boolean;
  readonly pipelineVizSlot?: ReactNode;
  readonly blueprintRevealSlot?: ReactNode;
  readonly onAcknowledgeWarning?: (warning_id: string) => void;
  readonly onReviseWarning?: (warning_id: string) => void;
}

const BREVITY_MAX_SENTENCES = 3;
const BREVITY_MAX_QUESTIONS = 2;

function inferSeverityFromMessage(
  content: string,
): CassandraPredictionSeverity {
  const lower = content.toLowerCase();
  if (
    lower.includes('halt') ||
    lower.includes('stop') ||
    lower.includes('critical') ||
    lower.includes('berhenti')
  ) {
    return 'halt_recommended';
  }
  if (
    lower.includes('review') ||
    lower.includes('revisi') ||
    lower.includes('check') ||
    lower.includes('risk')
  ) {
    return 'review_recommended';
  }
  return 'advisory';
}

function formatTurnTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

interface TurnViewModel {
  readonly turn: AdvisorTurn;
  readonly brevityOverflow: boolean;
  readonly sentenceCount: number;
  readonly questionCount: number;
  readonly predictionWarning:
    | (AttachedComponent & { kind: 'prediction_warning' })
    | null;
  readonly pipelineViz:
    | (AttachedComponent & { kind: 'pipeline_viz' })
    | null;
  readonly blueprintReveal:
    | (AttachedComponent & { kind: 'blueprint_reveal' })
    | null;
}

function buildTurnViewModels(
  turns: ReadonlyArray<AdvisorTurn>,
): ReadonlyArray<TurnViewModel> {
  return turns.map((turn) => {
    const sentenceCount = countSentences(turn.content);
    const questionCount = countQuestionMarks(turn.content);
    const brevityOverflow =
      turn.role === 'advisor' &&
      (sentenceCount > BREVITY_MAX_SENTENCES ||
        questionCount > BREVITY_MAX_QUESTIONS);
    const attached = turn.attached_components ?? [];
    const predictionWarning =
      attached.find(
        (a): a is AttachedComponent & { kind: 'prediction_warning' } =>
          a.kind === 'prediction_warning',
      ) ?? null;
    const pipelineViz =
      attached.find(
        (a): a is AttachedComponent & { kind: 'pipeline_viz' } =>
          a.kind === 'pipeline_viz',
      ) ?? null;
    const blueprintReveal =
      attached.find(
        (a): a is AttachedComponent & { kind: 'blueprint_reveal' } =>
          a.kind === 'blueprint_reveal',
      ) ?? null;
    return {
      turn,
      brevityOverflow,
      sentenceCount,
      questionCount,
      predictionWarning,
      pipelineViz,
      blueprintReveal,
    };
  });
}

export default function ApolloStream(
  props: ApolloStreamProps,
): ReactElement {
  const {
    session,
    isAwaitingAdvisorTurn,
    pipelineVizSlot,
    blueprintRevealSlot,
    onAcknowledgeWarning,
    onReviseWarning,
  } = props;

  const transcriptRef = useRef<HTMLDivElement>(null);
  const turnViewModels = useMemo(
    () => buildTurnViewModels(session.turns),
    [session.turns],
  );

  useEffect(() => {
    const node = transcriptRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [session.turns.length, isAwaitingAdvisorTurn]);

  return (
    <section
      className="hud-apollo-stream"
      data-hud-role="apollo-stream"
      data-locale={session.locale}
      aria-label="Advisor dialogue stream"
    >
      <div
        ref={transcriptRef}
        className="hud-apollo-transcript"
        aria-live="polite"
        aria-relevant="additions"
      >
        {turnViewModels.length === 0 ? (
          <div className="hud-apollo-welcome" role="status">
            <p className="hud-apollo-welcome-prompt">
              {session.locale === 'id-ID'
                ? 'Ngobrol sama Advisor, ketik prompt lu.'
                : 'Talk to the Advisor, type your prompt.'}
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {turnViewModels.map((vm) => (
              <motion.article
                key={vm.turn.turn_id}
                className="hud-apollo-bubble"
                data-role={vm.turn.role}
                data-brevity-overflow={vm.brevityOverflow ? 'true' : undefined}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                aria-label={`${vm.turn.role} turn at ${formatTurnTimestamp(vm.turn.rendered_at)}`}
              >
                <span className="hud-apollo-bubble-role">{vm.turn.role}</span>
                {vm.predictionWarning !== null ? (
                  <CassandraPrediction
                    warning_id={vm.predictionWarning.warning_id}
                    gamified_message={vm.turn.content}
                    severity={inferSeverityFromMessage(vm.turn.content)}
                    onAcknowledge={() =>
                      onAcknowledgeWarning?.(vm.predictionWarning!.warning_id)
                    }
                    onRevise={() =>
                      onReviseWarning?.(vm.predictionWarning!.warning_id)
                    }
                  />
                ) : (
                  <span>{vm.turn.content}</span>
                )}
                {(vm.pipelineViz !== null || vm.blueprintReveal !== null) && (
                  <div className="hud-apollo-attached">
                    {vm.pipelineViz !== null && (
                      <div
                        className="hud-apollo-attached-pipeline"
                        role="note"
                        aria-label="Pipeline visualization reference"
                      >
                        Pipeline viz active (run {vm.pipelineViz.pipeline_run_id}).
                      </div>
                    )}
                    {vm.blueprintReveal !== null && (
                      <div
                        className="hud-apollo-attached-blueprint"
                        role="note"
                        aria-label="Blueprint moment reveal"
                      >
                        Blueprint moment {vm.blueprintReveal.moment_id} ready.
                      </div>
                    )}
                  </div>
                )}
                <time
                  className="hud-apollo-bubble-time"
                  dateTime={vm.turn.rendered_at}
                >
                  {formatTurnTimestamp(vm.turn.rendered_at)}
                </time>
              </motion.article>
            ))}
          </AnimatePresence>
        )}
      </div>

      {pipelineVizSlot !== undefined && (
        <div
          className="hud-apollo-viz-slot"
          role="region"
          aria-label="Builder pipeline visualization"
        >
          {pipelineVizSlot}
        </div>
      )}

      {blueprintRevealSlot !== undefined && (
        <div
          className="hud-apollo-blueprint-slot"
          role="region"
          aria-label="Blueprint moment reveal"
        >
          {blueprintRevealSlot}
        </div>
      )}
    </section>
  );
}

export type { ApolloStreamProps as Props };
