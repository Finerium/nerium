//
// src/state/types.ts
//
// Shared primitive and alias types across the five Zustand game stores.
// Per docs/contracts/game_state.contract.md Section 3 and 6.
//
// Thalia-v2 authors the minimum set needed for Session A bridge wiring. Nyx,
// Linus, Erato-v2, and Euterpe may extend via domain-specific imports; all
// expansion goes through Pythia-v2 contract amendment.
//

// ---- World identifier (from existing builder world aesthetic surface) ----
export type WorldId = 'medieval_desert' | 'cyberpunk_shanghai' | 'steampunk_victorian';

// ---- String-aliased identity types (remain string for flexibility) ----
export type NpcId = string;
export type QuestId = string;
export type DialogueId = string;
export type NodeId = string;
export type ItemId = string;
export type SlotId = string;
export type AmbientLoopId = string;
export type ToastId = string;

// ---- Finite enumerations ----
export type CurrencyCode = 'USD' | 'IDR';

export type OverlayId = 'dialogue' | 'shop' | 'inventory' | 'quest_log' | 'cinematic' | null;

// ---- Minimum shared entity shapes (Nyx plus Linus plus Erato-v2 own full schema) ----

export interface Quest {
  id: QuestId;
  title: string;
  giver?: string;
  world?: WorldId;
}

export interface Trigger {
  type: string;
  [key: string]: unknown;
}

export interface Effect {
  type: string;
  [key: string]: unknown;
}

export interface Dialogue {
  id: DialogueId;
}

export type DialogueVars = Record<string, unknown>;

export interface Item {
  id: ItemId;
}

export interface InventorySlot {
  itemId: ItemId | null;
  quantity: number;
}

export interface Toast {
  toast_id: ToastId;
  kind: 'inventory' | 'quest' | 'currency' | 'info' | 'warning';
  message: string;
  dismissAfterMs: number;
}
