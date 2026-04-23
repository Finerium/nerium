'use client';

//
// src/components/game/DialogueOverlay.tsx
//
// React HUD dialog surface for NERIUM RV. Owner: Linus.
// Contract: docs/contracts/dialogue_schema.contract.md v0.1.0 Section 4 plus
// game_state.contract.md v0.1.0 Section 3.2 plus game_event_bus.contract.md v0.1.0.
//
// Renders the currently active dialogue by subscribing to `useDialogueStore`
// with narrow selectors. Uses the pure `dialogueRunner` for condition filtering
// and `{name}` interpolation. The ~40-line reducer core runs inside
// `dialogueStore` and is exercised here through explicit actions only.
//
// Responsibilities:
//   1. Subscribe narrow slices of the dialogue store (no prop drilling).
//   2. Drive a typewriter effect via rAF, honoring `prefers-reduced-motion`.
//   3. Render conditional choices through `availableChoices` filtering.
//   4. Render `PromptChallengeNode` when a node carries a prompt challenge.
//   5. Emit bridge events on node enter, choice select, and pending effects.
//   6. Stay rendered inside React HUD boundary only. NEVER inside Phaser.
//

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';

import type { Choice, Dialogue, DialogueId, Line, Node as DNode, NodeId } from '../../data/dialogues/_schema';
import { availableChoices, type ConditionContext, interpolate } from '../../lib/dialogueRunner';
import { emitDialogueEvent } from '../../lib/dialogueBridge';
import { getDialogue, useDialogueStore } from '../../stores/dialogueStore';
import PromptChallengeNode from './PromptChallengeNode';

export interface DialogueOverlayProps {
  trust?: Record<string, number>;
  questStepIndex?: Record<string, number>;
  hasItem?: (itemId: string, minQuantity?: number) => boolean;
  onEffectDispatch?: (effects: ReadonlyArray<unknown>) => void;
  defaultMsPerChar?: number;
}

const DEFAULT_MS_PER_CHAR = 26;
const LINE_GAP_MS = 220;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (evt: MediaQueryListEvent) => setReduced(evt.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);
  return reduced;
}

function useStableRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

interface TypewriterState {
  lineIndex: number;
  charIndex: number;
  pausedUntil: number | null;
  completed: boolean;
}

function initialTypewriter(): TypewriterState {
  return { lineIndex: 0, charIndex: 0, pausedUntil: null, completed: false };
}

export function DialogueOverlay({
  trust = {},
  questStepIndex = {},
  hasItem = () => false,
  onEffectDispatch,
  defaultMsPerChar = DEFAULT_MS_PER_CHAR,
}: DialogueOverlayProps) {
  const activeDialogueId = useDialogueStore((s) => s.activeDialogueId);
  const currentNodeId = useDialogueStore((s) => s.currentNodeId);
  const streaming = useDialogueStore((s) => s.streaming);
  const streamBuffer = useDialogueStore((s) => s.streamBuffer);
  const vars = useDialogueStore((s) => s.vars);
  const pendingEffects = useDialogueStore((s) => s.pendingEffects);
  const setChoice = useDialogueStore((s) => s.setChoice);
  const closeDialogue = useDialogueStore((s) => s.closeDialogue);
  const clearPendingEffects = useDialogueStore((s) => s.clearPendingEffects);
  const advanceTo = useDialogueStore((s) => s.advanceTo);

  const dialogue: Dialogue | null = activeDialogueId ? getDialogue(activeDialogueId) ?? null : null;
  const node: DNode | null = dialogue && currentNodeId ? dialogue.nodes[currentNodeId] ?? null : null;

  const reducedMotion = usePrefersReducedMotion();
  const [typewriter, setTypewriter] = useState<TypewriterState>(initialTypewriter);
  const typewriterRef = useStableRef(typewriter);

  const conditionContext: ConditionContext = useMemo(
    () => ({ vars, trust, questStepIndex, hasItem }),
    [vars, trust, questStepIndex, hasItem],
  );

  const visibleChoices: Choice[] = useMemo(
    () => (node ? availableChoices(node, conditionContext) : []),
    [node, conditionContext],
  );

  useEffect(() => {
    if (!activeDialogueId || !currentNodeId) return;
    setTypewriter(initialTypewriter());
    emitDialogueEvent('game.dialogue.node_entered', {
      dialogueId: activeDialogueId,
      nodeId: currentNodeId,
    });
  }, [activeDialogueId, currentNodeId]);

  useEffect(() => {
    if (!node || !node.lines || node.lines.length === 0) {
      setTypewriter({ lineIndex: 0, charIndex: 0, pausedUntil: null, completed: true });
      return;
    }
    if (reducedMotion) {
      const last = node.lines.length - 1;
      setTypewriter({
        lineIndex: last,
        charIndex: node.lines[last].text.length,
        pausedUntil: null,
        completed: true,
      });
      return;
    }
    let rafId = 0;
    let lastStamp = 0;
    const step = (now: number) => {
      if (!lastStamp) lastStamp = now;
      const tw = typewriterRef.current;
      if (tw.completed) return;
      if (tw.pausedUntil && now < tw.pausedUntil) {
        rafId = requestAnimationFrame(step);
        return;
      }
      const line = node.lines[tw.lineIndex];
      if (!line) {
        setTypewriter((prev) => ({ ...prev, completed: true }));
        return;
      }
      const msPerChar = line.typewriterMsPerChar ?? defaultMsPerChar;
      const elapsed = now - lastStamp;
      if (elapsed >= msPerChar) {
        lastStamp = now;
        if (tw.charIndex < line.text.length) {
          setTypewriter({ ...tw, charIndex: tw.charIndex + 1, pausedUntil: null });
        } else if (tw.lineIndex < node.lines.length - 1) {
          setTypewriter({
            lineIndex: tw.lineIndex + 1,
            charIndex: 0,
            pausedUntil: now + LINE_GAP_MS,
            completed: false,
          });
        } else {
          setTypewriter({ ...tw, completed: true });
          return;
        }
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [node, reducedMotion, defaultMsPerChar, typewriterRef]);

  useEffect(() => {
    if (!pendingEffects || pendingEffects.length === 0) return;
    for (const effect of pendingEffects) {
      emitDialogueEvent('game.dialogue.effect_pending', { effect });
    }
    onEffectDispatch?.(pendingEffects);
    clearPendingEffects();
  }, [pendingEffects, clearPendingEffects, onEffectDispatch]);

  const handleChoice = useCallback(
    (choice: Choice) => {
      if (!node || !activeDialogueId || !currentNodeId) return;
      const originalIndex = node.choices!.indexOf(choice);
      if (originalIndex < 0) return;
      emitDialogueEvent('game.dialogue.choice_selected', {
        dialogueId: activeDialogueId,
        nodeId: currentNodeId,
        choiceIndex: originalIndex,
      });
      setChoice(originalIndex);
    },
    [activeDialogueId, currentNodeId, node, setChoice],
  );

  const handleAdvance = useCallback(() => {
    if (!node || !node.next) return;
    advanceTo(node.next);
  }, [node, advanceTo]);

  const handleClose = useCallback(() => {
    if (!activeDialogueId || !currentNodeId) {
      closeDialogue();
      return;
    }
    emitDialogueEvent('game.dialogue.closed', {
      dialogueId: activeDialogueId,
      reason: 'user',
    });
    closeDialogue();
  }, [activeDialogueId, currentNodeId, closeDialogue]);

  if (!dialogue || !node) return null;

  const linesToRender: Line[] = node.lines ?? [];
  const lastVisibleLineIndex = Math.min(typewriter.lineIndex, linesToRender.length - 1);
  const displayed: Array<{ text: string; speaker?: string }> = [];
  for (let i = 0; i <= lastVisibleLineIndex; i += 1) {
    const line = linesToRender[i];
    if (!line) continue;
    const full = interpolate(line.text, vars);
    const text = i === lastVisibleLineIndex && !reducedMotion && !typewriter.completed
      ? full.slice(0, typewriter.charIndex)
      : full;
    displayed.push({ text, speaker: line.speaker });
  }

  const speakerName = displayed[displayed.length - 1]?.speaker ?? dialogue.speaker;
  const typewriterDone = typewriter.completed || reducedMotion || linesToRender.length === 0;
  const hasChallenge = Boolean(node.challenge);
  const hasChoices = !hasChallenge && typewriterDone && visibleChoices.length > 0;
  const canLinearAdvance = !hasChallenge && !hasChoices && typewriterDone && Boolean(node.next);
  const isTerminal = Boolean(node.end) && typewriterDone && !hasChallenge && visibleChoices.length === 0;

  return (
    <section
      className="dialogue-overlay"
      role="dialog"
      aria-modal="false"
      aria-live="polite"
      data-dialogue-id={dialogue.id}
      data-node-id={currentNodeId ?? undefined}
      data-streaming={streaming ? 'true' : undefined}
    >
      <header className="dialogue-overlay-header">
        <span className="dialogue-overlay-speaker">{speakerName}</span>
        <button
          type="button"
          className="dialogue-overlay-close"
          aria-label="Close dialogue"
          onClick={handleClose}
        >
          Close
        </button>
      </header>
      <div className="dialogue-overlay-lines">
        {displayed.map((line, idx) => (
          <p key={`${dialogue.id}-${currentNodeId}-${idx}`} className="dialogue-overlay-line">
            {line.text}
            {idx === displayed.length - 1 && !typewriterDone ? (
              <span className="dialogue-overlay-caret" aria-hidden="true">
                |
              </span>
            ) : null}
          </p>
        ))}
      </div>
      {hasChallenge && node.challenge?.kind === 'prompt_input' && activeDialogueId && currentNodeId ? (
        <PromptChallengeNode
          challenge={node.challenge}
          dialogueId={activeDialogueId}
          nodeId={currentNodeId}
          disabled={!typewriterDone}
        />
      ) : null}
      {streaming ? (
        <div className="dialogue-overlay-stream" aria-live="polite">
          <span className="dialogue-overlay-stream-label">Apollo</span>
          <p className="dialogue-overlay-stream-buffer">{streamBuffer}</p>
        </div>
      ) : null}
      {hasChoices ? (
        <ul className="dialogue-overlay-choices" role="list">
          {visibleChoices.map((choice, idx) => (
            <li key={`${currentNodeId}-choice-${idx}`} className="dialogue-overlay-choice-item">
              <button
                type="button"
                className="dialogue-overlay-choice"
                onClick={() => handleChoice(choice)}
              >
                {choice.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {canLinearAdvance ? (
        <div className="dialogue-overlay-advance">
          <button type="button" className="dialogue-overlay-continue" onClick={handleAdvance}>
            Continue
          </button>
        </div>
      ) : null}
      {isTerminal ? (
        <div className="dialogue-overlay-terminal">
          <button type="button" className="dialogue-overlay-finish" onClick={handleClose}>
            Close
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default DialogueOverlay;
