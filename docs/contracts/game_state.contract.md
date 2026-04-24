# Game State (Zustand Stores)

**Contract Version:** 0.2.0
**Owner Agent(s):** Pythia-v3 (cross-agent authority for store shape, NP round 3 amendment). Per-store authorities: Nyx (questStore), Linus (dialogueStore), Erato-v2 (uiStore plus inventoryStore surface, DEPRECATED on `/play` per NP Gate 5 pivot), Euterpe (audioStore), Boreas (chatStore, NP W3), Helios-v2 (useGameStore, NP W3 top-level authoritative store)
**Consumer Agent(s):** Nyx (reads plus writes questStore), Linus (reads plus writes dialogueStore), Erato-v2 (reads stores on non-`/play` routes only), Thalia-v2 / Helios-v2 (reads via `getState()` inside scenes, writes via bridge), Hesperus (DEPRECATED on `/play`), Euterpe (reads plus writes audioStore), Boreas (owns chatStore, reads useGameStore.chatMode for focus arbitration), Harmonia-RV-A (integration check across stores), Harmonia-v3 (NP round 3 integration check), Epimetheus (Wave 0 bridge consolidates duplicate singleton per Section 4.2)
**Stability:** stable for NP
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3 amendment)
**Changelog v0.2.0:** Added `useGameStore` (6th store, Helios-v2 authority) covering player position + facing + currentScene + chatMode top-level fields. Added `useChatStore` (7th store, Boreas authority) for Minecraft chat UIScene per `chat_ui.contract.md`. Documented Epimetheus W0 bridge re-export consolidation at Section 4.6. DEPRECATED Erato-v2 React HUD stores on `/play` route (components + stores preserved for non-`/play` routes).

## 1. Purpose

Defines the canonical shape of the five Zustand stores that hold all client-side game state in the NERIUM RV vertical slice. Cross-agent authority means no agent introduces a sixth store or adds a slice to an existing store without a contract amendment. Shape stability is the guarantee that Thalia-v2 scene events, Nyx quest effects, Linus dialogue transitions, Erato-v2 HUD selectors, and Euterpe audio cues compose cleanly without state leak or shape drift.

Zustand is the only state manager. No Redux, no MobX, no Jotai, no Valtio. `subscribeWithSelector` middleware is required on every store so React HUD narrow selectors and `zustand_bridge.contract.md` Phaser subscriptions both work without memoization gymnastics.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 9 modular contract discipline)
- `CLAUDE.md` (root)
- `_meta/RV_PLAN.md` (RV.1 game pivot, RV.9 existing code reuse policy)
- `docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md` (Section 3 game mechanics, Section 5.4 Zustand bridge module, Section 7 cross-cutting bridge contract)
- `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` (Sections 4.2 Nyx, 4.3 Linus, 4.5 Erato-v2, 4.7 Euterpe)
- `docs/contracts/quest_schema.contract.md` (questStore consumes Quest, Step, Trigger, Condition, Effect types)
- `docs/contracts/dialogue_schema.contract.md` (dialogueStore consumes Dialogue, Node, Choice, Challenge types)
- `docs/contracts/item_schema.contract.md` (inventoryStore consumes Item plus InventorySlot types)
- `docs/contracts/game_event_bus.contract.md` (events that trigger store mutations)
- `docs/contracts/zustand_bridge.contract.md` (subscription plus cleanup pattern)

## 3. Schema Definition

```typescript
// src/state/types.ts

import type { Quest, QuestId, Step, Trigger, Effect } from '@/data/quests/quest_types';
import type { Dialogue, DialogueId, NodeId, DialogueVars } from '@/data/dialogues/dialogue_types';
import type { Item, ItemId, InventorySlot } from '@/data/items/item_types';
import type { WorldId } from '@/builder/worlds/world_aesthetic_types';

export type NpcId = string;
export type SlotId = string;
export type AmbientLoopId = string;
export type ToastId = string;
export type CurrencyCode = 'USD' | 'IDR';

// In-game currency is a symbolic reward metaphor. It is NOT the same model as
// billing_meter.contract.md (which governs Builder pipeline specialist execution
// cost). See Section 5 of that P0 contract for scope boundary.

// npcTrust here is in-game friendship or reputation with named characters
// (Apollo, Lumio, Daedalus). It is NOT the Registry-level trust_score.contract.md
// marketplace agent rating. See that P0 contract Section 3 for scope boundary.
```

### 3.1 questStore (Nyx authority)

```typescript
export interface QuestStore {
  activeQuests: Quest[];
  completedQuests: Quest[];
  failedQuests: Quest[];
  stepIndex: Record<QuestId, number>;
  promptSubmissions: Record<SlotId, string>;
  npcTrust: Record<NpcId, number>;
  unlockedWorlds: WorldId[];
  startQuest: (questId: QuestId) => void;
  fireTrigger: (trigger: Trigger) => void;
  applyEffect: (effect: Effect, context: { questId: QuestId; stepId: string }) => void;
  completeQuest: (questId: QuestId) => void;
  failQuest: (questId: QuestId, reason: string) => void;
  addTrust: (npcId: NpcId, delta: number) => void;
  unlockWorld: (worldId: WorldId) => void;
  recordPromptSubmission: (slotId: SlotId, value: string) => void;
  resetForNewSession: () => void;
}
```

### 3.2 dialogueStore (Linus authority)

```typescript
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
```

### 3.3 inventoryStore (Erato-v2 HUD surface, Nyx writes via effects)

```typescript
export interface InventoryStore {
  slots: InventorySlot[];
  lastAwarded: ItemId | null;
  currency: Record<CurrencyCode, number>;
  award: (itemId: ItemId, quantity?: number) => void;
  consume: (itemId: ItemId, quantity?: number) => void;
  hasItem: (itemId: ItemId, minQuantity?: number) => boolean;
  addCurrency: (code: CurrencyCode, amount: number) => void;
  deductCurrency: (code: CurrencyCode, amount: number) => boolean;  // returns false if insufficient
  clearLastAwarded: () => void;
}
```

### 3.4 uiStore (Erato-v2 authority)

```typescript
export interface Toast {
  toast_id: ToastId;
  kind: 'inventory' | 'quest' | 'currency' | 'info' | 'warning';
  message: string;
  dismissAfterMs: number;
}

export type OverlayId = 'dialogue' | 'shop' | 'inventory' | 'quest_log' | 'cinematic' | null;

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
```

### 3.5 useGameStore (Helios-v2 authority, NP v0.2.0)

Top-level authoritative store for player + scene + chat mode coordination. Distinct from the domain-scoped stores (quest/dialogue/inventory/ui/audio/chat) to provide a single source of truth for cross-system state that Phaser scenes + focus arbitration + Playwright test hooks all read.

```typescript
export type ChatMode = 'movement' | 'chat' | 'dialogue';

export type SceneKey =
  | 'BootScene'
  | 'PreloadScene'
  | 'ApolloVillageScene'
  | 'CaravanRoadScene'
  | 'CyberpunkShanghaiScene'
  | 'SteampunkStubScene'
  | 'UIScene';

export type Facing = 'up' | 'down' | 'left' | 'right';

export interface PlayerState {
  x: number;
  y: number;
  facing: Facing;
  speed_px_s: number;                                 // default 96
}

export interface GameStore {
  player: PlayerState;
  currentScene: SceneKey;
  chatMode: ChatMode;
  isPaused: boolean;
  debug: boolean;
  setPlayer: (update: Partial<PlayerState>) => void;
  setCurrentScene: (scene: SceneKey) => void;
  setChatMode: (mode: ChatMode) => void;
  setPaused: (paused: boolean) => void;
  toggleDebug: () => void;
}
```

Accessed from Phaser scenes via `useGameStore.getState()` and updated via `setPlayer` on scene shutdown:

```typescript
this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
  useGameStore.getState().setPlayer({
    x: this.player.x,
    y: this.player.y,
    facing: this.player.facing,
  });
  useGameStore.getState().setCurrentScene(nextSceneKey);
});
```

### 3.6 chatStore (Boreas authority, NP v0.2.0)

Chat UIScene state. Separate from `dialogueStore` (which governs in-world NPC dialogue trees). `chatStore` is the Minecraft chat surface driving MA session streams + slash commands per `chat_ui.contract.md`.

```typescript
export interface ChatMessage {
  id: string;                                          // uuid v7
  role: 'user' | 'assistant' | 'system' | 'command';
  content: string;
  timestamp: string;
  session_id?: string;
  streaming?: boolean;
  cost_usd?: number;
}

export interface ChatStore {
  messages: ChatMessage[];
  input: string;
  history: string[];                                   // last 100 user inputs
  history_index: number;
  streaming_buffer: Record<string, string>;            // session_id → accumulated delta
  active_session_id: string | null;
  appendMessage: (msg: ChatMessage) => void;
  appendDelta: (session_id: string, delta: string) => void;
  finishStream: (session_id: string) => void;
  setInput: (s: string) => void;
  pushHistory: (s: string) => void;
  recallHistory: (direction: -1 | 1) => string;
  clearMessages: () => void;
  setActiveSession: (session_id: string | null) => void;
}
```

### 3.7 audioStore (Euterpe authority)

```typescript
export interface AudioStore {
  masterVolume: number;               // 0.0 to 1.0
  musicVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  muted: boolean;
  currentAmbient: AmbientLoopId | null;
  musicFadeInMs: number;
  musicFadeOutMs: number;
  setMasterVolume: (v: number) => void;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  setAmbientVolume: (v: number) => void;
  toggleMute: () => void;
  playAmbient: (loopId: AmbientLoopId) => void;
  stopAmbient: () => void;
  playOneShot: (sfxKey: string) => void;
}
```

## 4. Interface / API Contract

```typescript
// src/stores/questStore.ts          (Nyx authority, canonical)
// src/stores/dialogueStore.ts       (Linus authority, canonical)
// src/stores/inventoryStore.ts      (Erato-v2 authority, used non-/play routes only per NP pivot)
// src/stores/uiStore.ts             (Erato-v2 authority, used non-/play routes only per NP pivot)
// src/stores/audioStore.ts          (Euterpe authority)
// src/stores/gameStore.ts           (Helios-v2 authority, NP v0.2.0 NEW)
// src/stores/chatStore.ts           (Boreas authority, NP v0.2.0 NEW)

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export const useQuestStore = create<QuestStore>()(subscribeWithSelector((set, get) => ({ /* ... */ })));
export const useDialogueStore = create<DialogueStore>()(subscribeWithSelector((set, get) => ({ /* ... */ })));
export const useInventoryStore = create<InventoryStore>()(subscribeWithSelector((set, get) => ({ /* ... */ })));
export const useUIStore = create<UIStore>()(subscribeWithSelector((set, get) => ({ /* ... */ })));
export const useAudioStore = create<AudioStore>()(subscribeWithSelector((set, get) => ({ /* ... */ })));
export const useGameStore = create<GameStore>()(subscribeWithSelector((set, get) => ({ /* ... */ })));  // NP v0.2.0
export const useChatStore = create<ChatStore>()(subscribeWithSelector((set, get) => ({ /* ... */ })));  // NP v0.2.0
```

- Every store uses `subscribeWithSelector` middleware. No exceptions.
- React HUD components select narrow slices via `useQuestStore((s) => s.activeQuests)` or `useUIStore(useShallow((s) => ({ interactPromptVisible: s.interactPromptVisible, overlay: s.overlay })))`. Multi-field selection uses `useShallow`.
- Phaser scenes read via `useQuestStore.getState()` and subscribe via `useQuestStore.subscribe(selector, callback, { fireImmediately: false })` per `zustand_bridge.contract.md`. Cleanup on `Phaser.Scenes.Events.SHUTDOWN` is mandatory.
- Mutating actions accept plain serializable arguments only (primitives, plain objects, arrays). No class instances, no functions, no DOM nodes, no Phaser.GameObject references passed into store state.
- Derived state (e.g., "is Apollo an ally?", "current quest progress percent") is computed in selectors or components, not cached in the store.

### 4.6 Epimetheus W0 bridge consolidation (v0.2.0 amendment)

Harmonia-RV-A identified duplicate divergent `useQuestStore` + `useDialogueStore` singletons in `src/state/stores.ts` (inline `create<QuestStore>()(...)` blocks) alongside the canonical `src/stores/questStore.ts` + `src/stores/dialogueStore.ts` files. Bridge subscribers and Phaser scenes resolved inconsistent state depending on import path.

**Resolution (Epimetheus W0):** Replace the inline `create` blocks in `src/state/stores.ts` with re-export shims:

```typescript
// src/state/stores.ts (post-consolidation)

export { useQuestStore } from '../stores/questStore';
export { useDialogueStore } from '../stores/dialogueStore';
export { useInventoryStore } from '../stores/inventoryStore';
export { useUIStore } from '../stores/uiStore';
export { useAudioStore } from '../stores/audioStore';
export { useGameStore } from '../stores/gameStore';             // NP v0.2.0
export { useChatStore } from '../stores/chatStore';             // NP v0.2.0
```

Every downstream import site (grep `useQuestStore|useDialogueStore|useInventoryStore|useUIStore|useAudioStore|useGameStore|useChatStore` across `src/`) MUST resolve to the canonical `src/stores/*.ts` singleton post-Epimetheus. Zustand bridge + Phaser scenes + React HUD all subscribe to the same instance.

Mirror pattern from existing audio re-export. Verified via Nemea-RV-v2 re-run expected 23/23 green.

## 5. Event Signatures

This contract defines state shape, not events. Events that cause store mutations are defined in `game_event_bus.contract.md`. The mapping convention for every event handled is documented in that sibling contract. Store-internal state changes never leak back to the event bus automatically; callers that need downstream notification explicitly emit a bridge event.

## 6. File Path Convention

- Shared types: `src/state/types.ts`
- Store instances: `src/state/stores.ts`
- Per-store implementation modules (optional, for size): `src/state/questStore.ts`, `src/state/dialogueStore.ts`, `src/state/inventoryStore.ts`, `src/state/uiStore.ts`, `src/state/audioStore.ts`
- Selector helpers: `src/state/selectors.ts`
- React provider wrapper (if needed for SSR hydration safety): `src/state/GameStateProvider.tsx`

## 7. Naming Convention

- Hook names: `useQuestStore`, `useDialogueStore`, `useInventoryStore`, `useUIStore`, `useAudioStore`. `camelCase` with `use` prefix, store suffix.
- Action names: verb-first camelCase (`startQuest`, `fireTrigger`, `setOverlay`, `playAmbient`).
- State field names: `camelCase`.
- Record key types: `NpcId`, `SlotId`, `QuestId`, `DialogueId`, `NodeId`, `ItemId`, `AmbientLoopId`, `ToastId`, all aliased as `string` for flexibility, narrowed to literal unions only where a finite enum truly exists (e.g., `CurrencyCode`, `OverlayId`).
- Volume fields: numeric `0.0 to 1.0`.

## 8. Error Handling

- Action called with invalid argument (e.g., `award` with negative quantity): logs a `console.warn` with the action name and argument, then no-ops. Does not throw. Rationale: hot paths must not crash the game loop.
- `startQuest` called for a `questId` already in `activeQuests`: no-op, logs warn.
- `completeQuest` called for a `questId` not in `activeQuests`: no-op, logs warn.
- `fireTrigger` with an unknown trigger type: no-op, logs warn. Unknown triggers cannot match any quest step by definition.
- `openDialogue` called while another dialogue is active: closes the prior dialogue (emits `dialogue.closed` via the bridge) before opening the new one.
- `deductCurrency` with amount exceeding current balance: returns `false`, does not mutate. Caller decides whether to show insufficient-funds toast.
- Volume setters clamp to `[0, 1]` silently.

## 9. Testing Surface

- Store creation: each of the five stores instantiates without throwing and exposes every action listed in its interface.
- `useQuestStore.getState().startQuest(...)` transitions the store as expected; `completedQuests` stays empty until `completeQuest` is called.
- `fireTrigger` with a matching step advances `stepIndex`; with a non-matching trigger type, `stepIndex` unchanged.
- `useInventoryStore` award plus consume round trip: award x3, consume x1, `hasItem` with `minQuantity: 2` returns true.
- `useInventoryStore.deductCurrency({code: 'USD', amount: 100})` against balance 50 returns false, leaves balance at 50.
- `useUIStore.setOverlay('dialogue')` sets `overlay` and exposes the prior overlay via a transition callback (no stacking).
- `useAudioStore.setMasterVolume(-0.5)` clamps to 0.0.
- `subscribeWithSelector` narrow subscription fires only when selected slice changes, not on unrelated slice changes (regression against memoization bugs).
- Cross-store invariant: `useQuestStore.getState().unlockedWorlds` update does not spuriously retrigger `useAudioStore` subscribers.

## 10. Open Questions

- None blocking v0.1.0. Persistence across sessions (localStorage, IndexedDB) is deferred to post-hackathon; vertical slice assumes fresh state every `/play` mount.

## 11. Post-Hackathon Refactor Notes

- Add Zustand `persist` middleware wrapping appropriate stores (questStore, inventoryStore, audioStore settings) with partialize selectors to exclude transient fields (`streaming`, `streamBuffer`).
- Consider splitting `uiStore.toastQueue` into its own `toastStore` if toast throughput exceeds ~5 per minute during normal play (reduces unrelated re-renders).
- Add Devtools middleware (`zustand/middleware/devtools`) in development builds; name each store for Redux Devtools integration.
- Introduce optimistic concurrency token on `questStore` for future multiplayer merge semantics.
- Consider Immer middleware if deeply nested state mutations become painful, though current schema is shallow enough to avoid it.
- Migrate `inventoryStore.currency` to a dedicated `walletStore` once the Banking pillar fully integrates with in-game purchases (post-hackathon).
- Add selector-caching helpers for cross-store derivations (e.g., `useIsAllyOfApollo`) once derivations multiply.
