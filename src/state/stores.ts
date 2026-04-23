//
// src/state/stores.ts
//
// Zustand store instances per docs/contracts/game_state.contract.md.
//
// Thalia-v2 Session A authors the MINIMUM VIABLE shape for each of the five
// stores so the bridge module (gameBridge.ts) can subscribe and scenes can
// read via getState(). Full action body implementation is downstream:
//
//   - questStore: Nyx
//   - dialogueStore: Linus
//   - inventoryStore, uiStore: Erato-v2
//   - audioStore: Euterpe
//
// Each store respects subscribeWithSelector middleware per contract Section 4.
// Actions that this session does not populate with full logic are marked with
// a STUB comment and a console.warn fallback so integration test surfaces
// catch missing implementations rather than silently failing.
//

'use client';

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  Quest,
  QuestId,
  Trigger,
  Effect,
  DialogueId,
  NodeId,
  DialogueVars,
  ItemId,
  InventorySlot,
  CurrencyCode,
  OverlayId,
  Toast,
  ToastId,
  NpcId,
  WorldId,
} from './types';

// ---- questStore (Nyx authority) ----

export interface QuestStore {
  activeQuests: Quest[];
  completedQuests: Quest[];
  failedQuests: Quest[];
  stepIndex: Record<QuestId, number>;
  promptSubmissions: Record<string, string>;
  npcTrust: Record<NpcId, number>;
  unlockedWorlds: WorldId[];
  startQuest: (questId: QuestId) => void;
  fireTrigger: (trigger: Trigger) => void;
  applyEffect: (effect: Effect, context: { questId: QuestId; stepId: string }) => void;
  completeQuest: (questId: QuestId) => void;
  failQuest: (questId: QuestId, reason: string) => void;
  addTrust: (npcId: NpcId, delta: number) => void;
  unlockWorld: (worldId: WorldId) => void;
  recordPromptSubmission: (slotId: string, value: string) => void;
  resetForNewSession: () => void;
}

export const useQuestStore = create<QuestStore>()(
  subscribeWithSelector((set, get) => ({
    activeQuests: [],
    completedQuests: [],
    failedQuests: [],
    stepIndex: {},
    promptSubmissions: {},
    npcTrust: {},
    unlockedWorlds: [],
    startQuest: (questId) => {
      const state = get();
      if (state.activeQuests.some((q) => q.id === questId)) {
        console.warn(`[questStore] quest ${questId} already active, skipping startQuest`);
        return;
      }
      // STUB until Nyx authors quest data loader and full FSM.
      set((s) => ({
        activeQuests: [...s.activeQuests, { id: questId, title: questId }],
        stepIndex: { ...s.stepIndex, [questId]: 0 },
      }));
    },
    fireTrigger: (trigger) => {
      // STUB until Nyx authors trigger matcher.
      console.info(`[questStore] fireTrigger (stub)`, trigger);
    },
    applyEffect: (effect, context) => {
      // STUB until Nyx authors effect dispatcher.
      console.info(`[questStore] applyEffect (stub)`, effect, context);
    },
    completeQuest: (questId) => {
      set((s) => {
        const quest = s.activeQuests.find((q) => q.id === questId);
        if (!quest) {
          console.warn(`[questStore] completeQuest for unknown ${questId}`);
          return s;
        }
        return {
          ...s,
          activeQuests: s.activeQuests.filter((q) => q.id !== questId),
          completedQuests: [...s.completedQuests, quest],
        };
      });
    },
    failQuest: (questId, reason) => {
      set((s) => {
        const quest = s.activeQuests.find((q) => q.id === questId);
        if (!quest) {
          console.warn(`[questStore] failQuest for unknown ${questId} (${reason})`);
          return s;
        }
        return {
          ...s,
          activeQuests: s.activeQuests.filter((q) => q.id !== questId),
          failedQuests: [...s.failedQuests, quest],
        };
      });
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
      set((s) => {
        if (s.unlockedWorlds.includes(worldId)) return s;
        return { ...s, unlockedWorlds: [...s.unlockedWorlds, worldId] };
      });
    },
    recordPromptSubmission: (slotId, value) => {
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
        promptSubmissions: {},
        npcTrust: {},
        unlockedWorlds: [],
      });
    },
  })),
);

// ---- dialogueStore (Linus authority) ----

export interface DialogueStore {
  activeDialogueId: DialogueId | null;
  currentNodeId: NodeId | null;
  streaming: boolean;
  streamBuffer: string;
  vars: DialogueVars;
  history: Array<{ dialogueId: DialogueId; nodeId: NodeId; occurred_at: string }>;
  openDialogue: (dialogueId: DialogueId, startNode?: NodeId) => void;
  advanceTo: (nodeId: NodeId) => void;
  setChoice: (choiceIndex: number) => void;
  appendStreamChunk: (chunk: string) => void;
  finishStream: () => void;
  setVar: (name: string, value: unknown) => void;
  closeDialogue: () => void;
}

export const useDialogueStore = create<DialogueStore>()(
  subscribeWithSelector((set) => ({
    activeDialogueId: null,
    currentNodeId: null,
    streaming: false,
    streamBuffer: '',
    vars: {},
    history: [],
    openDialogue: (dialogueId, startNode) =>
      set((s) => ({
        ...s,
        activeDialogueId: dialogueId,
        currentNodeId: startNode ?? null,
      })),
    advanceTo: (nodeId) =>
      set((s) => ({
        ...s,
        currentNodeId: nodeId,
        history: s.activeDialogueId
          ? [
              ...s.history,
              {
                dialogueId: s.activeDialogueId,
                nodeId,
                occurred_at: new Date().toISOString(),
              },
            ]
          : s.history,
      })),
    setChoice: (choiceIndex) => {
      // STUB until Linus authors choice resolver.
      console.info(`[dialogueStore] setChoice (stub)`, choiceIndex);
    },
    appendStreamChunk: (chunk) =>
      set((s) => ({ streaming: true, streamBuffer: s.streamBuffer + chunk })),
    finishStream: () => set({ streaming: false }),
    setVar: (name, value) => set((s) => ({ vars: { ...s.vars, [name]: value } })),
    closeDialogue: () =>
      set({
        activeDialogueId: null,
        currentNodeId: null,
        streaming: false,
        streamBuffer: '',
      }),
  })),
);

// ---- inventoryStore (Erato-v2 surface, Nyx writes via effects) ----

export interface InventoryStore {
  slots: InventorySlot[];
  lastAwarded: ItemId | null;
  currency: Record<CurrencyCode, number>;
  award: (itemId: ItemId, quantity?: number) => void;
  consume: (itemId: ItemId, quantity?: number) => void;
  hasItem: (itemId: ItemId, minQuantity?: number) => boolean;
  addCurrency: (code: CurrencyCode, amount: number) => void;
  deductCurrency: (code: CurrencyCode, amount: number) => boolean;
  clearLastAwarded: () => void;
}

export const useInventoryStore = create<InventoryStore>()(
  subscribeWithSelector((set, get) => ({
    slots: [],
    lastAwarded: null,
    currency: { USD: 0, IDR: 0 },
    award: (itemId, quantity = 1) => {
      if (quantity <= 0) {
        console.warn(`[inventoryStore] award with non-positive quantity`, itemId, quantity);
        return;
      }
      set((s) => {
        const existing = s.slots.find((slot) => slot.itemId === itemId);
        if (existing) {
          return {
            ...s,
            slots: s.slots.map((slot) =>
              slot.itemId === itemId ? { ...slot, quantity: slot.quantity + quantity } : slot,
            ),
            lastAwarded: itemId,
          };
        }
        return {
          ...s,
          slots: [...s.slots, { itemId, quantity }],
          lastAwarded: itemId,
        };
      });
    },
    consume: (itemId, quantity = 1) => {
      if (quantity <= 0) {
        console.warn(`[inventoryStore] consume with non-positive quantity`, itemId, quantity);
        return;
      }
      set((s) => ({
        ...s,
        slots: s.slots
          .map((slot) =>
            slot.itemId === itemId ? { ...slot, quantity: slot.quantity - quantity } : slot,
          )
          .filter((slot) => slot.quantity > 0),
      }));
    },
    hasItem: (itemId, minQuantity = 1) => {
      const slot = get().slots.find((s) => s.itemId === itemId);
      return !!slot && slot.quantity >= minQuantity;
    },
    addCurrency: (code, amount) => {
      if (amount <= 0) {
        console.warn(`[inventoryStore] addCurrency non-positive`, code, amount);
        return;
      }
      set((s) => ({
        ...s,
        currency: { ...s.currency, [code]: (s.currency[code] ?? 0) + amount },
      }));
    },
    deductCurrency: (code, amount) => {
      if (amount <= 0) {
        console.warn(`[inventoryStore] deductCurrency non-positive`, code, amount);
        return false;
      }
      const current = get().currency[code] ?? 0;
      if (current < amount) return false;
      set((s) => ({
        ...s,
        currency: { ...s.currency, [code]: current - amount },
      }));
      return true;
    },
    clearLastAwarded: () => set({ lastAwarded: null }),
  })),
);

// ---- uiStore (Erato-v2 authority) ----

export interface UIStore {
  interactPromptVisible: boolean;
  interactPromptLabel: string;
  overlay: OverlayId;
  shopOpen: boolean;
  inventoryPanelOpen: boolean;
  questLogOpen: boolean;
  cinematicPlaying: boolean;
  cinematicKey: string | null;
  toastQueue: Toast[];
  setInteractPrompt: (visible: boolean, label?: string) => void;
  setOverlay: (id: OverlayId) => void;
  toggleShop: () => void;
  toggleInventoryPanel: () => void;
  toggleQuestLog: () => void;
  startCinematic: (key: string) => void;
  endCinematic: () => void;
  pushToast: (toast: Toast) => void;
  dequeueToast: (toastId: ToastId) => void;
}

export const useUIStore = create<UIStore>()(
  subscribeWithSelector((set) => ({
    interactPromptVisible: false,
    interactPromptLabel: '',
    overlay: null,
    shopOpen: false,
    inventoryPanelOpen: false,
    questLogOpen: false,
    cinematicPlaying: false,
    cinematicKey: null,
    toastQueue: [],
    setInteractPrompt: (visible, label = '') => set({ interactPromptVisible: visible, interactPromptLabel: label }),
    setOverlay: (id) => set({ overlay: id }),
    toggleShop: () => set((s) => ({ shopOpen: !s.shopOpen })),
    toggleInventoryPanel: () => set((s) => ({ inventoryPanelOpen: !s.inventoryPanelOpen })),
    toggleQuestLog: () => set((s) => ({ questLogOpen: !s.questLogOpen })),
    startCinematic: (key) => set({ cinematicPlaying: true, cinematicKey: key }),
    endCinematic: () => set({ cinematicPlaying: false, cinematicKey: null }),
    pushToast: (toast) => set((s) => ({ toastQueue: [...s.toastQueue, toast] })),
    dequeueToast: (toastId) =>
      set((s) => ({ toastQueue: s.toastQueue.filter((t) => t.toast_id !== toastId) })),
  })),
);

// ---- audioStore (Euterpe authority) ----
//
// Canonical instance lives in src/stores/audioStore.ts (Euterpe RV W3).
// Re-exported here so existing bridge consumers (src/state/gameBridge.ts)
// continue to import from `./stores` without knowing the split. Both sides
// of the bridge (Phaser emitters plus Howler wrapper in src/lib/audioEngine.ts)
// observe the same store singleton.
export { useAudioStore, type AudioStore } from '../stores/audioStore';
