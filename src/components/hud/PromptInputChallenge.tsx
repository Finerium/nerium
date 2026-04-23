'use client';

//
// src/components/hud/PromptInputChallenge.tsx
//
// HUD-level prompt input slot. Distinct from `PromptChallengeNode` which
// Linus embeds inside a dialogue node. This HUD variant lives in the
// BottomBar so the player can type a prompt at any time, even outside a
// dialogue exchange, when a slot id is active (e.g., the onboarding quest
// step `lumio_prompt_entry`).
//
// Wiring:
//   1. Reads the active slot id from `useQuestStore.activeQuests[0]` +
//      `promptSubmissions` to decide whether the challenge is live.
//   2. On submit, calls `useQuestStore.fireTrigger({ type: 'prompt_submitted',
//      slot }, value)` and `useQuestStore.recordPromptSubmission(slotId, value)`.
//   3. Emits `game.quest.trigger_requested` and `game.dialogue.challenge_submitted`
//      via `emitBusEvent` so BusBridge / Phaser scenes can react.
//
// The per-slot `minChars` + `maxChars` cap is not provided by the quest
// schema at this layer (PromptChallengeNode handles embedded validation).
// For the HUD-level slot we use permissive defaults and surface a char
// counter as feedback.
//

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { useT } from '../../lib/i18n';
import { useQuestStore } from '../../stores/questStore';
import { emitBusEvent } from '../../lib/hudBus';

export interface PromptInputChallengeProps {
  slotId?: string;
  dialogueId?: string;
  nodeId?: string;
  heading?: string;
  placeholder?: string;
  minChars?: number;
  maxChars?: number;
  onSubmitted?: (slotId: string, value: string) => void;
}

const DEFAULT_MIN = 6;
const DEFAULT_MAX = 800;

export function PromptInputChallenge({
  slotId,
  dialogueId,
  nodeId,
  heading,
  placeholder,
  minChars = DEFAULT_MIN,
  maxChars = DEFAULT_MAX,
  onSubmitted,
}: PromptInputChallengeProps) {
  const fireTrigger = useQuestStore((s) => s.fireTrigger);
  const recordPromptSubmission = useQuestStore((s) => s.recordPromptSubmission);
  const activeQuestId = useQuestStore((s) => s.activeQuests[0]?.id ?? null);
  const t = useT();
  const reducedMotion = useReducedMotion();

  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const length = value.length;
  const tooShort = length < minChars;
  const tooLong = length > maxChars;
  const invalid = tooShort || tooLong;
  const showError = touched && invalid;

  const effectiveSlot = slotId ?? (activeQuestId ? `${activeQuestId}:freeform` : 'freeform');

  useEffect(() => {
    if (reducedMotion) return;
    textareaRef.current?.focus();
  }, [reducedMotion, effectiveSlot]);

  const handleSubmit = useCallback(
    (evt?: React.FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>) => {
      if (evt) evt.preventDefault();
      setTouched(true);
      if (invalid || submitting) return;
      setSubmitting(true);

      recordPromptSubmission(effectiveSlot, value);
      fireTrigger(
        { type: 'prompt_submitted', slot: effectiveSlot },
        value,
      );

      emitBusEvent('game.quest.trigger_requested', {
        trigger: { type: 'prompt_submitted', slot: effectiveSlot },
        value,
      });

      if (dialogueId && nodeId) {
        emitBusEvent('game.dialogue.challenge_submitted', {
          dialogueId,
          nodeId,
          slotId: effectiveSlot,
          value,
        });
      }

      onSubmitted?.(effectiveSlot, value);

      const resetId = window.setTimeout(() => {
        setSubmitting(false);
        setValue('');
        setTouched(false);
      }, 320);

      return () => window.clearTimeout(resetId);
    },
    [
      dialogueId,
      effectiveSlot,
      fireTrigger,
      invalid,
      nodeId,
      onSubmitted,
      recordPromptSubmission,
      submitting,
      value,
    ],
  );

  return (
    <form
      className="flex w-full flex-col gap-2 rounded-md border border-border bg-background/70 p-3 font-mono text-xs text-foreground"
      data-hud-role="prompt-input-challenge"
      data-slot-id={effectiveSlot}
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="flex items-center justify-between">
        <span className="uppercase tracking-wider text-foreground/60">
          {heading ?? t('bottombar.prompt_heading')}
        </span>
        <span className="text-[10px] text-foreground/50" aria-live="polite">
          {t('bottombar.prompt_count', { current: length, max: maxChars })}
        </span>
      </div>
      <motion.textarea
        ref={textareaRef}
        className="min-h-[3.5rem] w-full resize-none rounded-md border border-border bg-background/90 px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        placeholder={placeholder ?? t('bottombar.prompt_placeholder')}
        value={value}
        disabled={submitting}
        minLength={minChars}
        maxLength={maxChars}
        aria-invalid={showError || undefined}
        onBlur={() => setTouched(true)}
        onChange={(evt) => setValue(evt.currentTarget.value)}
        onKeyDown={(evt) => {
          if (evt.key === 'Enter' && (evt.metaKey || evt.ctrlKey)) {
            evt.preventDefault();
            handleSubmit();
          }
        }}
        initial={reducedMotion ? false : { opacity: 0.8, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      />
      <AnimatePresence>
        {showError ? (
          <motion.p
            key={tooShort ? 'too-short' : 'too-long'}
            className="text-[11px] text-critical"
            role="alert"
            initial={reducedMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {tooShort
              ? t('bottombar.prompt_too_short', { min: minChars, current: length })
              : t('bottombar.prompt_too_long', { max: maxChars })}
          </motion.p>
        ) : null}
      </AnimatePresence>
      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={submitting || invalid}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-background transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? t('bottombar.prompt_submitting') : t('bottombar.prompt_submit')}
        </button>
      </div>
    </form>
  );
}

export default PromptInputChallenge;
