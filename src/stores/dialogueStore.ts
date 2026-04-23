//
// src/stores/dialogueStore.ts
//
// Zustand store for dialogue runtime state. Owner: Linus.
// Contract: docs/contracts/game_state.contract.md v0.1.0 Section 3.2.
//
// The store is a thin reactive projection over `dialogueRunner` reducer state.
// Side-effectful setters delegate to the pure reducer; React HUD components
// subscribe via `subscribeWithSelector` narrow selectors. Cross-store coupling
// (quest fireTrigger, inventory award) flows through the game event bus per
// game_event_bus.contract.md; this store does not import useQuestStore.
//
// Dialogue registration: `registerDialogues(entries)` populates a module-level
// map consumed by `setChoice` to resolve choice indexes into target node ids.
//

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type { Dialogue, DialogueId, DialogueVars, NodeId } from '../data/dialogues/_schema';
import {
  availableChoices as availableChoicesPure,
  evaluateCondition,
  initialDialogueState,
  reducer as dialogueReducer,
  type ConditionContext,
  type DialogueAction,
  type DialogueReducerState,
} from '../lib/dialogueRunner';
import type { Effect } from '../data/dialogues/_schema';

// -------- Dialogue registry (module-scoped) --------

const registry = new Map<DialogueId, Dialogue>();

export function registerDialogue(d: Dialogue): void {
  registry.set(d.id, d);
}

export function registerDialogues(entries: Dialogue[]): void {
  for (const d of entries) registry.set(d.id, d);
}

export function getDialogue(id: DialogueId): Dialogue | undefined {
  return registry.get(id);
}

export function getDialogueRegistry(): ReadonlyMap<DialogueId, Dialogue> {
  return registry;
}

export function clearDialogueRegistry(): void {
  registry.clear();
}

// -------- Store interface per contract --------

export interface DialogueHistoryEntry {
  dialogueId: DialogueId;
  nodeId: NodeId;
  occurred_at: string;
}

export interface DialogueStore {
  activeDialogueId: DialogueId | null;
  currentNodeId: NodeId | null;
  streaming: boolean;
  streamBuffer: string;
  vars: DialogueVars;
  history: DialogueHistoryEntry[];
  awaitingPhaserEvent: string | null;
  pendingEffects: Effect[];
  lastSubmission: { slotId: string; value: string } | null;
  lastChoiceIndex: number | null;

  openDialogue: (dialogueId: DialogueId, startNode?: NodeId, seedVars?: DialogueVars) => void;
  advanceTo: (nodeId: NodeId) => void;
  setChoice: (choiceIndex: number) => void;
  submitChallenge: (value: string) => void;
  appendStreamChunk: (chunk: string) => void;
  finishStream: () => void;
  resumeFromPhaser: (eventName: string) => void;
  setVar: (name: string, value: unknown) => void;
  closeDialogue: () => void;
  clearPendingEffects: () => void;
  getReducerState: () => DialogueReducerState;
}

function pushHistory(h: DialogueHistoryEntry[], entry: DialogueHistoryEntry): DialogueHistoryEntry[] {
  if (h.length > 0 && h[h.length - 1].dialogueId === entry.dialogueId && h[h.length - 1].nodeId === entry.nodeId) {
    return h;
  }
  return [...h, entry];
}

function dispatchViaReducer(
  currentState: DialogueStore,
  action: DialogueAction,
): Partial<DialogueStore> {
  const prior: DialogueReducerState = {
    activeDialogueId: currentState.activeDialogueId,
    currentNodeId: currentState.currentNodeId,
    streaming: currentState.streaming,
    streamBuffer: currentState.streamBuffer,
    vars: currentState.vars,
    awaitingPhaserEvent: currentState.awaitingPhaserEvent,
    pendingEffects: currentState.pendingEffects,
    closed: false,
    lastChoiceIndex: currentState.lastChoiceIndex,
    lastSubmission: currentState.lastSubmission,
  };
  const next = dialogueReducer(prior, action, registry);
  const historyEntry: DialogueHistoryEntry | null =
    next.activeDialogueId && next.currentNodeId && next.currentNodeId !== currentState.currentNodeId
      ? {
          dialogueId: next.activeDialogueId,
          nodeId: next.currentNodeId,
          occurred_at: new Date().toISOString(),
        }
      : null;
  return {
    activeDialogueId: next.activeDialogueId,
    currentNodeId: next.currentNodeId,
    streaming: next.streaming,
    streamBuffer: next.streamBuffer,
    vars: next.vars,
    awaitingPhaserEvent: next.awaitingPhaserEvent,
    pendingEffects: next.pendingEffects,
    lastChoiceIndex: next.lastChoiceIndex,
    lastSubmission: next.lastSubmission,
    history: historyEntry ? pushHistory(currentState.history, historyEntry) : currentState.history,
  };
}

export const useDialogueStore = create<DialogueStore>()(
  subscribeWithSelector((set, get) => ({
    activeDialogueId: null,
    currentNodeId: null,
    streaming: false,
    streamBuffer: '',
    vars: {},
    history: [],
    awaitingPhaserEvent: null,
    pendingEffects: [],
    lastSubmission: null,
    lastChoiceIndex: null,

    openDialogue: (dialogueId, startNode, seedVars) => {
      const patch = dispatchViaReducer(get(), {
        type: 'OPEN',
        dialogueId,
        startNode,
        seedVars,
      });
      set(patch);
    },

    advanceTo: (nodeId) => {
      const patch = dispatchViaReducer(get(), { type: 'ADVANCE_TO', nodeId });
      set(patch);
    },

    setChoice: (choiceIndex) => {
      const patch = dispatchViaReducer(get(), { type: 'SELECT_CHOICE', index: choiceIndex });
      set(patch);
    },

    submitChallenge: (value) => {
      const patch = dispatchViaReducer(get(), { type: 'SUBMIT_CHALLENGE', value });
      set(patch);
    },

    appendStreamChunk: (chunk) => {
      set((s) => ({
        streaming: true,
        streamBuffer: s.streamBuffer + chunk,
      }));
    },

    finishStream: () => {
      const patch = dispatchViaReducer(get(), { type: 'STREAM_COMPLETE' });
      set(patch);
    },

    resumeFromPhaser: (eventName) => {
      const patch = dispatchViaReducer(get(), { type: 'PHASER_RESUMED', event: eventName });
      set(patch);
    },

    setVar: (name, value) => {
      set((s) => ({ vars: { ...s.vars, [name]: value } }));
    },

    closeDialogue: () => {
      set({
        ...initialDialogueState(),
        history: get().history,
        activeDialogueId: null,
        currentNodeId: null,
        streaming: false,
        streamBuffer: '',
        vars: {},
        awaitingPhaserEvent: null,
        pendingEffects: [],
        lastSubmission: null,
        lastChoiceIndex: null,
      });
    },

    clearPendingEffects: () => {
      set({ pendingEffects: [] });
    },

    getReducerState: () => {
      const s = get();
      return {
        activeDialogueId: s.activeDialogueId,
        currentNodeId: s.currentNodeId,
        streaming: s.streaming,
        streamBuffer: s.streamBuffer,
        vars: s.vars,
        awaitingPhaserEvent: s.awaitingPhaserEvent,
        pendingEffects: s.pendingEffects,
        closed: false,
        lastChoiceIndex: s.lastChoiceIndex,
        lastSubmission: s.lastSubmission,
      };
    },
  })),
);

// -------- Selector helpers --------

export function selectCurrentNode(
  s: Pick<DialogueStore, 'activeDialogueId' | 'currentNodeId'>,
): Dialogue['nodes'][string] | null {
  if (!s.activeDialogueId || !s.currentNodeId) return null;
  const d = registry.get(s.activeDialogueId);
  if (!d) return null;
  return d.nodes[s.currentNodeId] ?? null;
}

export function selectAvailableChoices(
  s: Pick<DialogueStore, 'activeDialogueId' | 'currentNodeId' | 'vars'>,
  trust: Record<string, number>,
  questStepIndex: Record<string, number>,
  hasItem: (id: string, min?: number) => boolean,
) {
  const node = selectCurrentNode(s);
  if (!node) return [];
  const ctx: ConditionContext = {
    vars: s.vars,
    trust,
    questStepIndex,
    hasItem,
  };
  return availableChoicesPure(node, ctx);
}

export { evaluateCondition };
