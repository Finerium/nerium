/**
 * QuestTracker HUD element.
 *
 * Contract: docs/contracts/game_state.contract.md v0.1.0 (reads questStore via
 * narrow selectors). Rendered in React HUD layer, never inside Phaser canvas
 * (strategic hard stop per Nyx agent prompt Section "Strategic Decision Hard
 * Stops"). See translator_notes.md gotcha 4 on the Framer Motion boundary.
 *
 * Intentional narrow selectors. The component subscribes to only the slices
 * it renders, so unrelated questStore mutations (prompt submissions, trust
 * changes) do not re-render this component.
 */
'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { useQuestStore } from '../../stores/questStore';
import type { Quest } from '../../data/quests/_schema';

interface QuestTrackerView {
  quest: Quest | null;
  stepIndex: number;
}

export function QuestTracker() {
  const activeQuest = useQuestStore((s) => s.activeQuests[0] ?? null);
  const stepIndex = useQuestStore((s) =>
    activeQuest ? (s.stepIndex[activeQuest.id] ?? 0) : 0,
  );

  const view: QuestTrackerView = useMemo(
    () => ({ quest: activeQuest, stepIndex }),
    [activeQuest, stepIndex],
  );

  if (!view.quest) {
    return (
      <aside
        aria-label="Quest tracker"
        className="quest-tracker quest-tracker-empty"
        data-state="empty"
      >
        <p className="quest-tracker-title">No quest active</p>
      </aside>
    );
  }

  const totalSteps = view.quest.steps.length;
  const clampedIndex = Math.min(view.stepIndex, totalSteps - 1);
  const currentStep = view.quest.steps[clampedIndex];
  const isComplete = view.stepIndex >= totalSteps;
  const progressLabel = isComplete
    ? `${totalSteps} of ${totalSteps} complete`
    : `Step ${clampedIndex + 1} of ${totalSteps}`;
  const stepTitle = currentStep?.title ?? currentStep?.id ?? '';
  const hint = currentStep?.hintText ?? '';

  return (
    <aside
      aria-label="Quest tracker"
      aria-live="polite"
      className="quest-tracker"
      data-state={isComplete ? 'complete' : 'active'}
      data-quest-id={view.quest.id}
    >
      <header className="quest-tracker-header">
        <p className="quest-tracker-eyebrow">Quest</p>
        <p className="quest-tracker-title">{view.quest.title}</p>
      </header>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={`${view.quest.id}:${clampedIndex}`}
          className="quest-tracker-step"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          <p className="quest-tracker-progress">{progressLabel}</p>
          {stepTitle ? (
            <p className="quest-tracker-step-title">{stepTitle}</p>
          ) : null}
          {hint ? <p className="quest-tracker-hint">{hint}</p> : null}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}
