//
// src/state/stores.ts
//
// Canonical store-access surface for bridge consumers. Every store has a
// single source-of-truth module under `src/stores/`; this file re-exports
// those singletons so legacy import paths (`from '../state/stores'`) resolve
// to the same instance the HUD components import from `../stores/<name>`.
//
// Post-Epimetheus W0 Harmonia-RV-A consolidation: the inline duplicate
// `create<QuestStore>` and `create<DialogueStore>` stubs that previously
// lived here (Thalia-v2 Session A scaffolding) are removed. The canonical
// implementations live at:
//
//   - questStore:     src/stores/questStore.ts     (Nyx authority)
//   - dialogueStore:  src/stores/dialogueStore.ts  (Linus authority)
//   - inventoryStore: src/state/stores.ts          (Erato-v2 authority; below)
//   - uiStore:        src/state/stores.ts          (Erato-v2 authority; below)
//   - audioStore:     src/stores/audioStore.ts     (Euterpe authority)
//
// Inventory and UI stores still live inline in this file because their
// surface was authored here by Erato-v2 during RV. Audio, quest, and
// dialogue re-export from `src/stores/<name>.ts` with the same mechanism the
// audio store already used; all five stores are now accessed through a
// single canonical singleton per store contract per game_state.contract.md
// Section 4.
//

'use client';

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  ItemId,
  InventorySlot,
  CurrencyCode,
  OverlayId,
  Toast,
  ToastId,
} from './types';

// ---- questStore (Nyx authority, canonical at src/stores/questStore.ts) ----
export { useQuestStore, type QuestStore } from '../stores/questStore';

// ---- dialogueStore (Linus authority, canonical at src/stores/dialogueStore.ts) ----
export { useDialogueStore, type DialogueStore } from '../stores/dialogueStore';

// ---- inventoryStore (Erato-v2 authority) ----

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

// ---- audioStore (Euterpe authority, canonical at src/stores/audioStore.ts) ----
//
// Re-exported here so bridge consumers (src/state/gameBridge.ts) observe the
// same singleton the audio engine does (src/lib/audioEngine.ts). Pattern
// predates the Harmonia consolidation and is kept as-is.
export { useAudioStore, type AudioStore } from '../stores/audioStore';

// ---- chatStore (Boreas authority, canonical at src/stores/chatStore.ts) ----
//
// NP W3 Session 1. Powers the Minecraft chat-style UIScene that replaces the
// deprecated React HUD on `/play`. Re-exported here so future bridge
// subscribers observe the same singleton the UIScene + focus arbitration
// hook + Playwright tests already share. See chat_ui.contract.md +
// game_state.contract.md v0.2.0 Section 3.6.
export { useChatStore, newChatMessageId, type ChatStore, type ChatMode, type ChatMessage, type ChatRole } from '../stores/chatStore';
