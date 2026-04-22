'use client';

//
// AdvisorChat.tsx (Erato P2).
//
// Conforms to:
// - docs/contracts/advisor_ui.contract.md v0.1.0 (AdvisorChatProps)
// - docs/contracts/advisor_interaction.contract.md v0.1.0 (AdvisorSession + AdvisorTurn)
// - docs/contracts/prediction_layer_surface.contract.md v0.1.0 (severity rendering)
//
// Root chat surface for the Advisor tier. Pure presentation: props-in,
// callbacks-out. Parent (Apollo mount layer or Lumio demo runner) owns session
// state and injects callbacks that dispatch through the event bus. No direct
// Apollo import for state; only type imports and brevity helpers.
//
// Behavioural notes:
// 1. Brevity discipline is enforced at the data layer in apollo.ts
//    (enforceAdvisorBrevity). Erato adds a defensive visual indicator via
//    data-brevity-overflow when an advisor turn content would still exceed
//    NarasiGhaisan Section 13 limits; marker does not truncate content.
// 2. Welcome state renders when session.turns is empty (contract Section 8).
// 3. Long-wait affordance renders when isAwaitingAdvisorTurn persists >15s
//    (contract Section 8). Cancel is visual-only for P2 because the contract
//    does not expose an onCancel callback; dismiss clears the local
//    affordance only. See erato.decisions.md ADR-0005.
// 4. Attached prediction_warning components reuse the enclosing turn's
//    content as gamified_message (Apollo renderPredictionMap writes the
//    gamified message into turn.content). Severity is heuristic-derived from
//    content keywords because contract does not carry severity through
//    attached_components. ADR-0002 documents the heuristic.
// 5. pipelineVizSlot renders as a persistent area below the transcript; turns
//    with attached pipeline_viz add a small reference badge pointing to the
//    slot.
//

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import {
  countQuestionMarks,
  countSentences,
  type AdvisorSession,
  type AdvisorTurn,
  type AttachedComponent,
  type Locale,
  type ModelStrategy,
  type WorldAesthetic,
} from '../apollo';

import ModelStrategySelector from './ModelStrategySelector';
import PredictionWarning, {
  type PredictionWarningSeverity,
} from './PredictionWarning';

import './styles.css';

export interface AdvisorChatProps {
  session: AdvisorSession;
  onUserTurnSubmit: (content: string) => Promise<void>;
  onLocaleToggle: (next: Locale) => Promise<void>;
  onStrategyChange: (next: ModelStrategy) => Promise<void>;
  onWorldAestheticChange: (next: WorldAesthetic) => Promise<void>;
  pipelineVizSlot?: ReactNode;
  multiVendorPanelSlot?: ReactNode;
  isAwaitingAdvisorTurn: boolean;
}

const BREVITY_MAX_SENTENCES = 3;
const BREVITY_MAX_QUESTIONS = 2;
const LONG_WAIT_MS = 15_000;
const TOAST_MS = 3_200;

const LOCALE_PILLS: ReadonlyArray<{ value: Locale; label: string; description: string }> = [
  { value: 'en-US', label: 'EN', description: 'English (US)' },
  { value: 'id-ID', label: 'ID', description: 'Bahasa Indonesia' },
];

const WORLD_PILLS: ReadonlyArray<{
  value: WorldAesthetic;
  label: string;
  description: string;
}> = [
  { value: 'cyberpunk_shanghai', label: 'Cyber', description: 'Cyberpunk Shanghai' },
  { value: 'medieval_desert', label: 'Desert', description: 'Medieval Desert' },
  { value: 'steampunk_victorian', label: 'Steam', description: 'Steampunk Victorian' },
];

const WELCOME_COPY: Record<Locale, { title: string; prompt: string }> = {
  'en-US': {
    title: 'What do you want to build?',
    prompt: 'Describe the app you have in mind in one sentence. Examples, constraints, or pillars optional.',
  },
  'id-ID': {
    title: 'Lu mau bikin apa?',
    prompt: 'Describe aplikasi lu dalam satu kalimat. Contoh, constraint, atau pillar opsional.',
  },
};

function inferSeverityFromMessage(content: string): PredictionWarningSeverity {
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

function dispatchWarningAction(
  warning_id: string,
  action: 'acknowledge' | 'revise',
): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent('nerium:prediction-warning-action', {
        detail: { warning_id, action },
      }),
    );
  } catch {
    /* older browsers without CustomEvent constructor; silent fallback */
  }
}

interface TurnViewModel {
  turn: AdvisorTurn;
  brevityOverflow: boolean;
  sentenceCount: number;
  questionCount: number;
  predictionWarning: AttachedComponent & { kind: 'prediction_warning' } | null;
  pipelineViz: AttachedComponent & { kind: 'pipeline_viz' } | null;
  blueprintReveal: AttachedComponent & { kind: 'blueprint_reveal' } | null;
}

function buildTurnViewModels(turns: ReadonlyArray<AdvisorTurn>): TurnViewModel[] {
  return turns.map((turn) => {
    const sentenceCount = countSentences(turn.content);
    const questionCount = countQuestionMarks(turn.content);
    const brevityOverflow =
      turn.role === 'advisor' &&
      (sentenceCount > BREVITY_MAX_SENTENCES ||
        questionCount > BREVITY_MAX_QUESTIONS);
    const attached = turn.attached_components ?? [];
    const predictionWarning =
      (attached.find(
        (a): a is AttachedComponent & { kind: 'prediction_warning' } =>
          a.kind === 'prediction_warning',
      ) ?? null);
    const pipelineViz =
      (attached.find(
        (a): a is AttachedComponent & { kind: 'pipeline_viz' } =>
          a.kind === 'pipeline_viz',
      ) ?? null);
    const blueprintReveal =
      (attached.find(
        (a): a is AttachedComponent & { kind: 'blueprint_reveal' } =>
          a.kind === 'blueprint_reveal',
      ) ?? null);
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

export default function AdvisorChat(props: AdvisorChatProps): ReactElement {
  const {
    session,
    onUserTurnSubmit,
    onLocaleToggle,
    onStrategyChange,
    onWorldAestheticChange,
    pipelineVizSlot,
    multiVendorPanelSlot,
    isAwaitingAdvisorTurn,
  } = props;

  const [inputDraft, setInputDraft] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showLongWait, setShowLongWait] = useState<boolean>(false);
  const [longWaitDismissed, setLongWaitDismissed] = useState<boolean>(false);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const welcomeCopy = WELCOME_COPY[session.locale] ?? WELCOME_COPY['en-US'];
  const turnViewModels = useMemo(
    () => buildTurnViewModels(session.turns),
    [session.turns],
  );

  // Auto-scroll transcript on new turn or long-wait appearance.
  useEffect(() => {
    const node = transcriptRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [session.turns.length, showLongWait]);

  // Long-wait affordance: after 15s of isAwaitingAdvisorTurn reveal a
  // progress indicator plus a cancel button (visual dismiss only per
  // ADR-0005).
  useEffect(() => {
    if (!isAwaitingAdvisorTurn) {
      setShowLongWait(false);
      setLongWaitDismissed(false);
      return;
    }
    setLongWaitDismissed(false);
    const timer = setTimeout(() => setShowLongWait(true), LONG_WAIT_MS);
    return () => clearTimeout(timer);
  }, [isAwaitingAdvisorTurn]);

  // Toast auto-dismiss.
  useEffect(() => {
    if (toastMessage === null) return;
    const timer = setTimeout(() => setToastMessage(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const surfaceCallbackError = useCallback((err: unknown) => {
    const message =
      err instanceof Error && err.message.length > 0
        ? err.message.slice(0, 140)
        : 'Something went wrong; please retry.';
    setToastMessage(message);
    if (typeof console !== 'undefined') {
      console.error('[advisor] callback failed', err);
    }
  }, []);

  const handleSubmit = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (trimmed.length === 0 || isSubmitting) return;
      setIsSubmitting(true);
      try {
        await onUserTurnSubmit(trimmed);
        setInputDraft('');
      } catch (err) {
        surfaceCallbackError(err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, onUserTurnSubmit, surfaceCallbackError],
  );

  const handleFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void handleSubmit(inputDraft);
    },
    [handleSubmit, inputDraft],
  );

  const handleInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void handleSubmit(inputDraft);
      }
    },
    [handleSubmit, inputDraft],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setInputDraft(event.target.value);
    },
    [],
  );

  const handleLocaleClick = useCallback(
    (next: Locale) => {
      if (next === session.locale) return;
      (async () => {
        try {
          await onLocaleToggle(next);
        } catch (err) {
          surfaceCallbackError(err);
        }
      })();
    },
    [onLocaleToggle, session.locale, surfaceCallbackError],
  );

  const handleWorldClick = useCallback(
    (next: WorldAesthetic) => {
      if (next === session.active_world_aesthetic) return;
      (async () => {
        try {
          await onWorldAestheticChange(next);
        } catch (err) {
          surfaceCallbackError(err);
        }
      })();
    },
    [onWorldAestheticChange, session.active_world_aesthetic, surfaceCallbackError],
  );

  const handleStrategyChange = useCallback(
    async (next: ModelStrategy) => {
      try {
        await onStrategyChange(next);
      } catch (err) {
        surfaceCallbackError(err);
        throw err;
      }
    },
    [onStrategyChange, surfaceCallbackError],
  );

  const handleCancelLongWait = useCallback(() => {
    setLongWaitDismissed(true);
    dispatchWarningAction('long-wait-cancel', 'acknowledge');
  }, []);

  const handleWarningAcknowledge = useCallback((warning_id: string) => {
    dispatchWarningAction(warning_id, 'acknowledge');
  }, []);

  const handleWarningRevise = useCallback((warning_id: string) => {
    dispatchWarningAction(warning_id, 'revise');
  }, []);

  const inputPlaceholder =
    session.locale === 'id-ID'
      ? 'Ngobrol sama Advisor, Enter buat kirim'
      : 'Talk to the Advisor, Enter to send';

  const isComposerDisabled = isSubmitting;

  return (
    <section
      className="advisor-root"
      data-world={session.active_world_aesthetic}
      data-locale={session.locale}
      aria-label="NERIUM Advisor chat"
    >
      <header className="advisor-header">
        <div className="advisor-brand" aria-label="Advisor session header">
          <span className="advisor-brand-dot" aria-hidden="true" />
          <span>NERIUM Advisor</span>
        </div>
        <div className="advisor-header-controls">
          <div
            className="advisor-pill-group"
            role="group"
            aria-label="Interface locale"
          >
            {LOCALE_PILLS.map((pill) => (
              <button
                key={pill.value}
                type="button"
                className="advisor-pill"
                aria-pressed={session.locale === pill.value}
                aria-label={`Switch locale to ${pill.description}`}
                onClick={() => handleLocaleClick(pill.value)}
              >
                {pill.label}
              </button>
            ))}
          </div>
          <div
            className="advisor-pill-group"
            role="group"
            aria-label="World aesthetic"
          >
            {WORLD_PILLS.map((pill) => (
              <button
                key={pill.value}
                type="button"
                className="advisor-pill"
                aria-pressed={session.active_world_aesthetic === pill.value}
                aria-label={`Switch world to ${pill.description}`}
                onClick={() => handleWorldClick(pill.value)}
              >
                {pill.label}
              </button>
            ))}
          </div>
          <ModelStrategySelector
            current={session.active_model_strategy}
            onChange={handleStrategyChange}
            disabled={isSubmitting}
            multiVendorPanel={multiVendorPanelSlot}
          />
        </div>
      </header>

      <div
        ref={transcriptRef}
        className="advisor-transcript"
        aria-live="polite"
        aria-relevant="additions"
      >
        {turnViewModels.length === 0 ? (
          <div className="advisor-welcome" role="status">
            <h2 className="advisor-welcome-title">{welcomeCopy.title}</h2>
            <p className="advisor-welcome-prompt">{welcomeCopy.prompt}</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {turnViewModels.map((vm) => (
              <motion.article
                key={vm.turn.turn_id}
                className="advisor-bubble"
                data-role={vm.turn.role}
                data-brevity-overflow={vm.brevityOverflow ? 'true' : undefined}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                aria-label={`${vm.turn.role} turn at ${formatTurnTimestamp(vm.turn.rendered_at)}`}
              >
                <span className="advisor-bubble-role">{vm.turn.role}</span>
                {vm.predictionWarning !== null ? (
                  <PredictionWarning
                    warning_id={vm.predictionWarning.warning_id}
                    gamified_message={vm.turn.content}
                    severity={inferSeverityFromMessage(vm.turn.content)}
                    onAcknowledge={() =>
                      handleWarningAcknowledge(vm.predictionWarning!.warning_id)
                    }
                    onRevise={() =>
                      handleWarningRevise(vm.predictionWarning!.warning_id)
                    }
                  />
                ) : (
                  <span>{vm.turn.content}</span>
                )}
                {(vm.pipelineViz !== null || vm.blueprintReveal !== null) && (
                  <div className="advisor-attached">
                    {vm.pipelineViz !== null && (
                      <div
                        className="advisor-attached-pipeline"
                        role="note"
                        aria-label="Pipeline visualization reference"
                      >
                        Pipeline viz active (run {vm.pipelineViz.pipeline_run_id}). See panel below.
                      </div>
                    )}
                    {vm.blueprintReveal !== null && (
                      <div
                        className="advisor-attached-blueprint"
                        role="note"
                        aria-label="Blueprint moment reveal"
                      >
                        Blueprint moment {vm.blueprintReveal.moment_id} ready to open.
                      </div>
                    )}
                  </div>
                )}
                <time
                  className="advisor-bubble-time"
                  dateTime={vm.turn.rendered_at}
                >
                  {formatTurnTimestamp(vm.turn.rendered_at)}
                </time>
              </motion.article>
            ))}
            {isAwaitingAdvisorTurn && showLongWait && !longWaitDismissed && (
              <motion.div
                key="advisor-awaiting"
                className="advisor-awaiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                role="status"
                aria-live="polite"
              >
                <span className="advisor-awaiting-dot" aria-hidden="true" />
                <span>Advisor sedang mikir, 15s+</span>
                <button
                  type="button"
                  className="advisor-cancel"
                  onClick={handleCancelLongWait}
                  aria-label="Dismiss long-wait indicator"
                >
                  Dismiss
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {pipelineVizSlot !== undefined && (
        <div
          className="advisor-viz-slot"
          role="region"
          aria-label="Builder pipeline visualization"
        >
          {pipelineVizSlot}
        </div>
      )}

      <form
        className="advisor-composer"
        onSubmit={handleFormSubmit}
        aria-label="Send a message to the Advisor"
      >
        <textarea
          ref={inputRef}
          className="advisor-input-field"
          value={inputDraft}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          placeholder={inputPlaceholder}
          aria-label="Message the Advisor, press Enter to send or Shift Enter for a new line"
          rows={2}
          disabled={isComposerDisabled}
        />
        <button
          type="submit"
          className="advisor-submit"
          disabled={isComposerDisabled || inputDraft.trim().length === 0}
          aria-label="Send message"
        >
          Send
        </button>
      </form>

      {toastMessage !== null && (
        <div className="advisor-toast" role="alert" aria-live="assertive">
          {toastMessage}
        </div>
      )}
    </section>
  );
}

export type { AdvisorChatProps as Props };
