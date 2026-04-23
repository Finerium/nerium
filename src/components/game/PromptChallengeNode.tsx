'use client';

//
// src/components/game/PromptChallengeNode.tsx
//
// Embedded prompt-input challenge renderer. Owner: Linus.
// Contract: docs/contracts/dialogue_schema.contract.md v0.1.0 + game_event_bus.contract.md v0.1.0.
//
// Rendered by DialogueOverlay when the current node has a `challenge` of
// kind `prompt_input`. On submit it:
//   1. Dispatches the dialogue store's `submitChallenge(value)` action, which
//      advances through the reducer per node.onSubmit (next, stream, effects).
//   2. Emits `game.dialogue.challenge_submitted` via the bridge. Nyx consumes
//      this per contract and calls `useQuestStore.fireTrigger({ type: 'prompt_submitted', slot })`
//      and `useQuestStore.recordPromptSubmission(slotId, value)`. Linus never
//      imports useQuestStore directly; coupling is by bridge event only.
//
// Disabled while the dialogue is streaming (Apollo response in flight).
// Honors `minChars` plus `maxChars` guards before emitting.
//

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import type { PromptChallenge, DialogueId, NodeId } from '../../data/dialogues/_schema';
import { emitDialogueEvent } from '../../lib/dialogueBridge';
import { useDialogueStore } from '../../stores/dialogueStore';

export interface PromptChallengeNodeProps {
  challenge: PromptChallenge;
  dialogueId: DialogueId;
  nodeId: NodeId;
  disabled?: boolean;
  onSubmitted?: (slotId: string, value: string) => void;
}

export function PromptChallengeNode({
  challenge,
  dialogueId,
  nodeId,
  disabled,
  onSubmitted,
}: PromptChallengeNodeProps) {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const submitChallenge = useDialogueStore((s) => s.submitChallenge);
  const streaming = useDialogueStore((s) => s.streaming);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fieldId = useId();
  const helperId = `${fieldId}-helper`;
  const errorId = `${fieldId}-error`;

  const isDisabled = Boolean(disabled) || streaming;
  const length = value.length;
  const tooShort = length < challenge.minChars;
  const tooLong = length > challenge.maxChars;
  const invalid = tooShort || tooLong;
  const showError = touched && invalid;

  useEffect(() => {
    if (isDisabled) return;
    if (challenge.multiline) {
      textareaRef.current?.focus();
    } else {
      inputRef.current?.focus();
    }
  }, [isDisabled, challenge.multiline, nodeId]);

  const handleSubmit = useCallback(
    (evt?: React.FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>) => {
      if (evt) evt.preventDefault();
      setTouched(true);
      if (invalid || isDisabled) return;
      submitChallenge(value);
      emitDialogueEvent('game.dialogue.challenge_submitted', {
        dialogueId,
        nodeId,
        slotId: challenge.slotId,
        value,
      });
      emitDialogueEvent('game.quest.trigger_requested', {
        trigger: { type: 'prompt_submitted', slot: challenge.slotId },
        value,
      });
      onSubmitted?.(challenge.slotId, value);
    },
    [challenge.slotId, dialogueId, invalid, isDisabled, nodeId, onSubmitted, submitChallenge, value],
  );

  return (
    <form
      className="dialogue-challenge"
      data-challenge-kind="prompt_input"
      data-slot-id={challenge.slotId}
      onSubmit={handleSubmit}
      noValidate
    >
      {challenge.label ? (
        <label htmlFor={fieldId} className="dialogue-challenge-label">
          {challenge.label}
        </label>
      ) : null}
      {challenge.multiline ? (
        <textarea
          id={fieldId}
          ref={textareaRef}
          className="dialogue-challenge-input"
          placeholder={challenge.placeholder}
          value={value}
          minLength={challenge.minChars}
          maxLength={challenge.maxChars}
          disabled={isDisabled}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? errorId : helperId}
          onBlur={() => setTouched(true)}
          onChange={(e) => setValue(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
      ) : (
        <input
          id={fieldId}
          ref={inputRef}
          type="text"
          className="dialogue-challenge-input"
          placeholder={challenge.placeholder}
          value={value}
          minLength={challenge.minChars}
          maxLength={challenge.maxChars}
          disabled={isDisabled}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? errorId : helperId}
          onBlur={() => setTouched(true)}
          onChange={(e) => setValue(e.currentTarget.value)}
        />
      )}
      <div className="dialogue-challenge-meta">
        <span id={helperId} className="dialogue-challenge-helper">
          {challenge.helperText ?? `${challenge.minChars} characters minimum.`}
        </span>
        <span
          className="dialogue-challenge-count"
          aria-live="polite"
        >
          {length} / {challenge.maxChars}
        </span>
      </div>
      {showError ? (
        <p id={errorId} className="dialogue-challenge-error" role="alert">
          {tooShort
            ? `Need at least ${challenge.minChars} characters. You have ${length}.`
            : `Too long. Maximum ${challenge.maxChars} characters.`}
        </p>
      ) : null}
      <div className="dialogue-challenge-actions">
        <button
          type="submit"
          className="dialogue-challenge-submit"
          disabled={isDisabled || invalid}
        >
          {isDisabled ? 'Sending' : 'Submit'}
        </button>
      </div>
    </form>
  );
}

export default PromptChallengeNode;
