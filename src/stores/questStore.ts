/**
 * Quest state store.
 *
 * Contract: docs/contracts/game_state.contract.md v0.1.0 Section 3.1
 * Cross-ref: docs/contracts/quest_schema.contract.md v0.1.0 (Quest data)
 *
 * Zustand + subscribeWithSelector. HUD components select narrow slices via
 * `useQuestStore((s) => s.activeQuests)`. Phaser scenes read via
 * `useQuestStore.getState()` and subscribe per zustand_bridge.contract.md.
 *
 * fireTrigger semantics: advance stepIndex BEFORE applying effects. This
 * flipped order (versus contract Section 4 prose) is intentional and scoped
 * to support cascading-trigger quests where step N's effects emit a trigger
 * satisfied by step N+1 (e.g., award_item on step 5 cascades item_acquired
 * into step 6 of lumio_onboarding). Depth guard at MAX_TRIGGER_DEPTH prevents
 * infinite loops. See docs/nyx.decisions.md ADR-002.
 */
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  MAX_TRIGGER_DEPTH,
  questEffectBus,
  transition,
  loadAllQuestsSync,
  type EvaluationContext,
} from '../lib/questRunner';
import type {
  Effect,
  Quest,
  Trigger,
  QuestId,
  SlotId,
  NpcId,
  WorldId,
} from '../data/quests/_schema';

export interface QuestStore {
  catalog: Quest[];
  activeQuests: Quest[];
  completedQuests: Quest[];
  failedQuests: Quest[];
  stepIndex: Record<QuestId, number>;
  completedStepsByQuest: Record<QuestId, string[]>;
  promptSubmissions: Record<SlotId, string>;
  npcTrust: Record<NpcId, number>;
  unlockedWorlds: WorldId[];
  variables: Record<string, unknown>;
  _triggerDepth: number;
  startQuest: (questId: QuestId) => void;
  fireTrigger: (trigger: Trigger, promptValue?: string) => void;
  applyEffect: (
    effect: Effect,
    context: { questId: QuestId; stepId: string },
  ) => void;
  completeQuest: (questId: QuestId) => void;
  failQuest: (questId: QuestId, reason: string) => void;
  addTrust: (npcId: NpcId, delta: number) => void;
  unlockWorld: (worldId: WorldId) => void;
  recordPromptSubmission: (slotId: SlotId, value: string) => void;
  resetForNewSession: () => void;
  resetQuest: (questId: QuestId) => void;
  autostartFromCatalog: () => void;
}

function buildInitialState(): Omit<
  QuestStore,
  | 'startQuest'
  | 'fireTrigger'
  | 'applyEffect'
  | 'completeQuest'
  | 'failQuest'
  | 'addTrust'
  | 'unlockWorld'
  | 'recordPromptSubmission'
  | 'resetForNewSession'
  | 'resetQuest'
  | 'autostartFromCatalog'
> {
  return {
    catalog: loadAllQuestsSync(),
    activeQuests: [],
    completedQuests: [],
    failedQuests: [],
    stepIndex: {},
    completedStepsByQuest: {},
    promptSubmissions: {},
    npcTrust: {},
    unlockedWorlds: [],
    variables: {},
    _triggerDepth: 0,
  };
}

function buildEvaluationContext(
  state: QuestStore,
  questId: QuestId,
  stepId: string,
  promptValue: string | undefined,
): EvaluationContext {
  return {
    questId,
    stepId,
    promptValue,
    inventorySnapshot: { slots: [] },
    trustSnapshot: state.npcTrust,
    variables: state.variables,
    unlockedWorlds: state.unlockedWorlds,
    completedSteps: state.completedStepsByQuest,
  };
}

export const useQuestStore = create<QuestStore>()(
  subscribeWithSelector((set, get) => ({
    ...buildInitialState(),

    startQuest: (questId) => {
      const state = get();
      if (state.activeQuests.some((q) => q.id === questId)) {
        console.warn(`[questStore] startQuest: quest ${questId} already active`);
        return;
      }
      if (state.completedQuests.some((q) => q.id === questId)) {
        console.warn(
          `[questStore] startQuest: quest ${questId} already completed`,
        );
        return;
      }
      const quest = state.catalog.find((q) => q.id === questId);
      if (!quest) {
        console.warn(
          `[questStore] startQuest: quest ${questId} not found in catalog`,
        );
        return;
      }
      set((s) => ({
        activeQuests: [...s.activeQuests, quest],
        stepIndex: { ...s.stepIndex, [questId]: 0 },
        completedStepsByQuest: {
          ...s.completedStepsByQuest,
          [questId]: [],
        },
      }));
    },

    fireTrigger: (trigger, promptValue) => {
      const initialState = get();
      if (initialState._triggerDepth >= MAX_TRIGGER_DEPTH) {
        console.error(
          `[questStore] fireTrigger depth reached ${MAX_TRIGGER_DEPTH}, halting to prevent infinite loop`,
        );
        return;
      }
      set({ _triggerDepth: initialState._triggerDepth + 1 });
      try {
        const activeSnapshot = [...get().activeQuests];
        for (const quest of activeSnapshot) {
          const stepIdx = get().stepIndex[quest.id] ?? 0;
          if (stepIdx < 0 || stepIdx >= quest.steps.length) continue;
          const step = quest.steps[stepIdx]!;
          const ctx = buildEvaluationContext(
            get(),
            quest.id,
            step.id,
            trigger.type === 'prompt_submitted' ? promptValue : undefined,
          );
          if (trigger.type === 'prompt_submitted') {
            get().recordPromptSubmission(trigger.slot, promptValue ?? '');
          }
          const result = transition(quest, stepIdx, trigger, ctx);
          if (!result.matched) continue;
          set((s) => ({
            stepIndex: {
              ...s.stepIndex,
              [quest.id]: result.nextStepIndex,
            },
            completedStepsByQuest: {
              ...s.completedStepsByQuest,
              [quest.id]: [
                ...(s.completedStepsByQuest[quest.id] ?? []),
                step.id,
              ],
            },
          }));
          for (const effect of result.effectsToApply) {
            get().applyEffect(effect, {
              questId: quest.id,
              stepId: step.id,
            });
          }
        }
      } finally {
        set((s) => ({
          _triggerDepth: Math.max(0, s._triggerDepth - 1),
        }));
      }
    },

    applyEffect: (effect, context) => {
      switch (effect.type) {
        case 'unlock_world': {
          get().unlockWorld(effect.worldId);
          break;
        }
        case 'add_trust': {
          get().addTrust(effect.npcId, effect.amount);
          break;
        }
        case 'complete_quest': {
          get().completeQuest(effect.questId);
          break;
        }
        case 'fail_quest': {
          get().failQuest(effect.questId, effect.reason);
          break;
        }
        case 'set_variable': {
          if (effect.scope === 'quest') {
            set((s) => ({
              variables: { ...s.variables, [effect.name]: effect.value },
            }));
          } else {
            questEffectBus.emit({ effect, context });
          }
          break;
        }
        case 'award_item':
        case 'consume_item':
        case 'add_currency':
        case 'push_toast':
        case 'open_dialogue':
        case 'stream_apollo_response':
        case 'play_cinematic':
        case 'emit_event': {
          questEffectBus.emit({ effect, context });
          break;
        }
        default: {
          const exhaustive: never = effect;
          void exhaustive;
          console.warn(
            `[questStore] applyEffect: unknown effect type (unreachable)`,
          );
        }
      }
    },

    completeQuest: (questId) => {
      const state = get();
      const quest = state.activeQuests.find((q) => q.id === questId);
      if (!quest) {
        console.warn(
          `[questStore] completeQuest: quest ${questId} not active`,
        );
        return;
      }
      set((s) => ({
        activeQuests: s.activeQuests.filter((q) => q.id !== questId),
        completedQuests: s.completedQuests.some((q) => q.id === questId)
          ? s.completedQuests
          : [...s.completedQuests, quest],
      }));
    },

    failQuest: (questId, reason) => {
      const state = get();
      const quest = state.activeQuests.find((q) => q.id === questId);
      if (!quest) {
        console.warn(`[questStore] failQuest: quest ${questId} not active`);
        return;
      }
      set((s) => ({
        activeQuests: s.activeQuests.filter((q) => q.id !== questId),
        failedQuests: s.failedQuests.some((q) => q.id === questId)
          ? s.failedQuests
          : [...s.failedQuests, quest],
      }));
      console.info(
        `[questStore] failQuest: quest ${questId} failed, reason=${reason}`,
      );
    },

    addTrust: (npcId, delta) => {
      set((s) => ({
        npcTrust: {
          ...s.npcTrust,
          [npcId]: (s.npcTrust[npcId] ?? 0) + delta,
        },
      }));
    },

    unlockWorld: (worldId) => {
      set((s) =>
        s.unlockedWorlds.includes(worldId)
          ? s
          : { unlockedWorlds: [...s.unlockedWorlds, worldId] },
      );
    },

    recordPromptSubmission: (slotId, value) => {
      if (typeof value !== 'string') {
        console.warn(
          `[questStore] recordPromptSubmission: non-string value for slot ${slotId}`,
        );
        return;
      }
      set((s) => ({
        promptSubmissions: { ...s.promptSubmissions, [slotId]: value },
      }));
    },

    resetForNewSession: () => {
      set({
        activeQuests: [],
        completedQuests: [],
        failedQuests: [],
        stepIndex: {},
        completedStepsByQuest: {},
        promptSubmissions: {},
        npcTrust: {},
        unlockedWorlds: [],
        variables: {},
        _triggerDepth: 0,
      });
    },

    resetQuest: (questId) => {
      set((s) => {
        const stepIndexCopy = { ...s.stepIndex };
        const completedStepsCopy = { ...s.completedStepsByQuest };
        delete stepIndexCopy[questId];
        delete completedStepsCopy[questId];
        return {
          activeQuests: s.activeQuests.filter((q) => q.id !== questId),
          completedQuests: s.completedQuests.filter((q) => q.id !== questId),
          failedQuests: s.failedQuests.filter((q) => q.id !== questId),
          stepIndex: stepIndexCopy,
          completedStepsByQuest: completedStepsCopy,
        };
      });
    },

    autostartFromCatalog: () => {
      const state = get();
      for (const quest of state.catalog) {
        if (!quest.autostart) continue;
        if (state.activeQuests.some((q) => q.id === quest.id)) continue;
        if (state.completedQuests.some((q) => q.id === quest.id)) continue;
        get().startQuest(quest.id);
      }
    },
  })),
);
