# Game Event Bus (Phaser `game.events`)

**Contract Version:** 0.1.0
**Owner Agent(s):** Thalia-v2 (primary emitter from Phaser scene layer). Secondary emitters: Erato-v2 (React HUD interactions), Nyx (quest lifecycle), Linus (dialogue lifecycle), Euterpe (audio cue echo)
**Consumer Agent(s):** Nyx (subscribes to trigger-yielding events), Linus (subscribes to dialogue advance plus Phaser hook resume), Erato-v2 (subscribes for HUD reactions), Euterpe (subscribes for sfx mapping), Thalia-v2 (subscribes to quest plus dialogue state changes to render scene feedback), Harmonia-RV-A (integration check event name registry conformance)
**Stability:** draft
**Last Updated:** 2026-04-23 (RV Day 0, Pythia-v2 round 2)

## Rename note

This contract was originally specified by Metis-v2 M2 Section 4.10 as `event_bus.contract.md`. A filename collision exists with the P0 `event_bus.contract.md` (Pythia round 1, pipeline orchestration pub/sub for `pipeline.run.*` topics). The P0 contract Section 5 already anticipated parallel namespaces in separate contracts ("Cross-pillar ... may define parallel namespaces in their own contracts"). Pythia-v2 resolved the collision by renaming this contract to `game_event_bus.contract.md` and filing a ferry note for V4: Hephaestus-v2 prompt authoring for Thalia-v2, Euterpe, and Harmonia-RV-A must reference `docs/contracts/game_event_bus.contract.md` rather than the literal M2 Section 4.10 filename. This rename preserves P0 integrity and clarifies the scope boundary between Builder pipeline events (P0 event_bus) and Phaser game scene events (this contract).

## 1. Purpose

Defines the canonical event registry for the Phaser `game.events` EventEmitter and its React bridge. Every cross-boundary event emitted or subscribed inside the RV game loop appears here with a stable topic name, a payload shape, a declared emitter, and a declared consumer set. Downstream agents look up events by topic rather than grepping strings across scenes and components, so refactors are contract diffs rather than code sweeps.

This contract governs the `game.*` namespace. It does not govern the `pipeline.*` namespace (that is `event_bus.contract.md` P0), `marketplace.*`, `banking.*`, `registry.*`, or `protocol.*` (those namespaces may define their own contracts when RV pillars integrate).

Technology lock: Phaser 3 `game.events` (native `EventEmitter3` implementation). No RxJS, no EventEmitter2, no custom pub/sub library. The bridge maps a subset of these events to Zustand store mutations per `zustand_bridge.contract.md`.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 9 modular contract discipline, Section 10 parallel execution mandate)
- `CLAUDE.md` (root)
- `_meta/RV_PLAN.md` (RV.1 game pivot, RV.3 in-game systems integration)
- `docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md` (Section 5.4 Zustand bridge module, Section 7 cross-cutting bridge contract)
- `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` (Section 4.4 Thalia-v2, Section 4.13 Harmonia-RV-A references)
- `docs/contracts/event_bus.contract.md` (P0 pipeline pub/sub, distinct contract, read for scope boundary awareness only)
- `docs/contracts/game_state.contract.md` (events mutate these stores via the bridge)
- `docs/contracts/quest_schema.contract.md` (quest-emitting events map to `Trigger` instances)
- `docs/contracts/dialogue_schema.contract.md` (dialogue-emitting events drive the reducer)
- `docs/contracts/item_schema.contract.md` (inventory-emitting events)
- `docs/contracts/zustand_bridge.contract.md` (subscribe pattern plus cleanup rules)

## 3. Schema Definition

```typescript
// src/state/game_events.ts

export type GameEventTopic =
  // ---- Scene lifecycle ----
  | 'game.scene.ready'
  | 'game.scene.shutdown'
  | 'game.scene.transition_started'
  | 'game.scene.transition_completed'

  // ---- Player ----
  | 'game.player.spawned'
  | 'game.player.moved'
  | 'game.player.damaged'

  // ---- NPC ----
  | 'game.npc.nearby'
  | 'game.npc.far'
  | 'game.npc.interact'
  | 'game.npc.trust_changed'

  // ---- Zone ----
  | 'game.zone.entered'
  | 'game.zone.exited'

  // ---- Pickup ----
  | 'game.pickup.spawned'
  | 'game.pickup.interact'

  // ---- Dialogue ----
  | 'game.dialogue.open'
  | 'game.dialogue.opened'
  | 'game.dialogue.node_entered'
  | 'game.dialogue.choice_selected'
  | 'game.dialogue.challenge_submitted'
  | 'game.dialogue.stream_chunk_received'
  | 'game.dialogue.stream_chunk'
  | 'game.dialogue.stream_complete'
  | 'game.dialogue.advance'
  | 'game.dialogue.closed'

  // ---- Quest ----
  | 'game.quest.started'
  | 'game.quest.step_advanced'
  | 'game.quest.completed'
  | 'game.quest.failed'
  | 'game.quest.trigger_fired'

  // ---- Inventory ----
  | 'game.inventory.awarded'
  | 'game.inventory.consumed'
  | 'game.inventory.rejected'
  | 'game.inventory.opened'

  // ---- Currency and shop ----
  | 'game.currency.changed'
  | 'game.shop.open'
  | 'game.shop.close'
  | 'game.shop.purchase_completed'

  // ---- Cinematic ----
  | 'game.cinematic.start'
  | 'game.cinematic.complete'
  | 'game.cinematic.abort'

  // ---- UI ----
  | 'game.ui.overlay_changed'
  | 'game.ui.interact_prompt'
  | 'game.ui.toast_pushed'
  | 'game.ui.toast_dismissed'

  // ---- Audio ----
  | 'game.audio.ambient_play'
  | 'game.audio.ambient_stop'
  | 'game.audio.sfx_play'
  | 'game.audio.music_play'
  | 'game.audio.music_stop'

  // ---- World ----
  | 'game.world.unlocked'
  | 'game.world.active_changed'

  // ---- System ----
  | 'game.system.paused'
  | 'game.system.resumed'
  | 'game.system.shutdown_requested';

export interface GameEvent<TPayload = unknown> {
  topic: GameEventTopic;
  occurred_at: string;                 // ISO-8601 UTC
  source: 'phaser' | 'react' | 'store' | 'bridge';
  payload: TPayload;
}
```

### 3.1 Payload shapes

```typescript
// src/state/game_event_payloads.ts

import type { NpcId, QuestId, DialogueId, NodeId, ItemId, ToastId, OverlayId, CurrencyCode, SlotId, AmbientLoopId } from '@/state/types';
import type { WorldId } from '@/builder/worlds/world_aesthetic_types';

export interface SceneReadyPayload { sceneKey: string; worldId: WorldId | null }
export interface SceneShutdownPayload { sceneKey: string }
export interface SceneTransitionPayload { from: string; to: string; durationMs: number }

export interface PlayerSpawnedPayload { x: number; y: number; sceneKey: string }
export interface PlayerMovedPayload { x: number; y: number; dx: number; dy: number }
export interface PlayerDamagedPayload { amount: number; source: string }

export interface NpcNearbyPayload { npcId: NpcId; distancePx: number }
export interface NpcFarPayload { npcId: NpcId }
export interface NpcInteractPayload { npcId: NpcId; x: number; y: number }
export interface NpcTrustChangedPayload { npcId: NpcId; delta: number; newValue: number }

export interface ZoneEnteredPayload { zoneId: string; sceneKey: string }
export interface ZoneExitedPayload { zoneId: string; sceneKey: string }

export interface PickupSpawnedPayload { pickupId: string; itemId: ItemId; x: number; y: number }
export interface PickupInteractPayload { pickupId: string; itemId: ItemId }

export interface DialogueOpenPayload { dialogueId: DialogueId; startNode?: NodeId }
export interface DialogueOpenedPayload { dialogueId: DialogueId; nodeId: NodeId }
export interface DialogueNodeEnteredPayload { dialogueId: DialogueId; nodeId: NodeId }
export interface DialogueChoiceSelectedPayload { dialogueId: DialogueId; nodeId: NodeId; choiceIndex: number }
export interface DialogueChallengeSubmittedPayload { dialogueId: DialogueId; nodeId: NodeId; slotId: SlotId; value: string }
export interface DialogueStreamChunkPayload { streamKey: string; chunk: string }
export interface DialogueStreamCompletePayload { streamKey: string; totalChars: number }
export interface DialogueAdvancePayload { dialogueId: DialogueId; nextNodeId: NodeId }
export interface DialogueClosedPayload { dialogueId: DialogueId; reason: 'natural' | 'interrupted' | 'quest_failed' }

export interface QuestStartedPayload { questId: QuestId }
export interface QuestStepAdvancedPayload { questId: QuestId; stepId: string; stepIndex: number }
export interface QuestCompletedPayload { questId: QuestId }
export interface QuestFailedPayload { questId: QuestId; reason: string }
export interface QuestTriggerFiredPayload { triggerType: string; questId: QuestId; matchedStepId: string | null }

export interface InventoryAwardedPayload { itemId: ItemId; quantity: number; outcome: string; source: string; sourceRef?: string }
export interface InventoryConsumedPayload { itemId: ItemId; quantity: number; slotIndex: number; remainingQuantity: number }
export interface InventoryRejectedPayload { itemId: ItemId; reason: string }
export interface InventoryOpenedPayload { source: 'hotkey' | 'npc' | 'shop' }

export interface CurrencyChangedPayload { code: CurrencyCode; delta: number; newValue: number }
export interface ShopOpenPayload { shopId: string }
export interface ShopPurchaseCompletedPayload { orderId: string; itemId: ItemId; quantity: number; totalUsd: number }

export interface CinematicStartPayload { key: string }
export interface CinematicCompletePayload { key: string; durationMs: number }
export interface CinematicAbortPayload { key: string; reason: string }

export interface OverlayChangedPayload { previous: OverlayId; next: OverlayId }
export interface InteractPromptPayload { visible: boolean; label: string }
export interface ToastPushedPayload { toastId: ToastId; kind: string; message: string }
export interface ToastDismissedPayload { toastId: ToastId; reason: 'timer' | 'user' | 'programmatic' }

export interface AudioAmbientPlayPayload { loopId: AmbientLoopId; fadeInMs: number }
export interface AudioAmbientStopPayload { loopId: AmbientLoopId; fadeOutMs: number }
export interface AudioSfxPlayPayload { sfxKey: string; volumeOverride?: number }
export interface AudioMusicPlayPayload { trackKey: string; loop: boolean; fadeInMs: number }
export interface AudioMusicStopPayload { trackKey: string; fadeOutMs: number }

export interface WorldUnlockedPayload { worldId: WorldId }
export interface WorldActiveChangedPayload { previous: WorldId | null; next: WorldId }

export interface SystemPausedPayload { reason: 'user' | 'overlay' | 'lost_focus' }
export interface SystemResumedPayload {}
export interface SystemShutdownRequestedPayload { reason: string }
```

### 3.2 Topic-to-payload mapping

Every topic in `GameEventTopic` binds to exactly one payload type. The mapping is enforced at compile time via a helper type:

```typescript
export type PayloadFor<T extends GameEventTopic> =
  T extends 'game.scene.ready' ? SceneReadyPayload :
  T extends 'game.scene.shutdown' ? SceneShutdownPayload :
  T extends 'game.scene.transition_started' | 'game.scene.transition_completed' ? SceneTransitionPayload :
  T extends 'game.player.spawned' ? PlayerSpawnedPayload :
  T extends 'game.player.moved' ? PlayerMovedPayload :
  T extends 'game.player.damaged' ? PlayerDamagedPayload :
  T extends 'game.npc.nearby' ? NpcNearbyPayload :
  T extends 'game.npc.far' ? NpcFarPayload :
  T extends 'game.npc.interact' ? NpcInteractPayload :
  T extends 'game.npc.trust_changed' ? NpcTrustChangedPayload :
  T extends 'game.zone.entered' ? ZoneEnteredPayload :
  T extends 'game.zone.exited' ? ZoneExitedPayload :
  T extends 'game.pickup.spawned' ? PickupSpawnedPayload :
  T extends 'game.pickup.interact' ? PickupInteractPayload :
  T extends 'game.dialogue.open' ? DialogueOpenPayload :
  T extends 'game.dialogue.opened' ? DialogueOpenedPayload :
  T extends 'game.dialogue.node_entered' ? DialogueNodeEnteredPayload :
  T extends 'game.dialogue.choice_selected' ? DialogueChoiceSelectedPayload :
  T extends 'game.dialogue.challenge_submitted' ? DialogueChallengeSubmittedPayload :
  T extends 'game.dialogue.stream_chunk' | 'game.dialogue.stream_chunk_received' ? DialogueStreamChunkPayload :
  T extends 'game.dialogue.stream_complete' ? DialogueStreamCompletePayload :
  T extends 'game.dialogue.advance' ? DialogueAdvancePayload :
  T extends 'game.dialogue.closed' ? DialogueClosedPayload :
  T extends 'game.quest.started' ? QuestStartedPayload :
  T extends 'game.quest.step_advanced' ? QuestStepAdvancedPayload :
  T extends 'game.quest.completed' ? QuestCompletedPayload :
  T extends 'game.quest.failed' ? QuestFailedPayload :
  T extends 'game.quest.trigger_fired' ? QuestTriggerFiredPayload :
  T extends 'game.inventory.awarded' ? InventoryAwardedPayload :
  T extends 'game.inventory.consumed' ? InventoryConsumedPayload :
  T extends 'game.inventory.rejected' ? InventoryRejectedPayload :
  T extends 'game.inventory.opened' ? InventoryOpenedPayload :
  T extends 'game.currency.changed' ? CurrencyChangedPayload :
  T extends 'game.shop.open' ? ShopOpenPayload :
  T extends 'game.shop.close' ? { shopId: string } :
  T extends 'game.shop.purchase_completed' ? ShopPurchaseCompletedPayload :
  T extends 'game.cinematic.start' ? CinematicStartPayload :
  T extends 'game.cinematic.complete' ? CinematicCompletePayload :
  T extends 'game.cinematic.abort' ? CinematicAbortPayload :
  T extends 'game.ui.overlay_changed' ? OverlayChangedPayload :
  T extends 'game.ui.interact_prompt' ? InteractPromptPayload :
  T extends 'game.ui.toast_pushed' ? ToastPushedPayload :
  T extends 'game.ui.toast_dismissed' ? ToastDismissedPayload :
  T extends 'game.audio.ambient_play' ? AudioAmbientPlayPayload :
  T extends 'game.audio.ambient_stop' ? AudioAmbientStopPayload :
  T extends 'game.audio.sfx_play' ? AudioSfxPlayPayload :
  T extends 'game.audio.music_play' ? AudioMusicPlayPayload :
  T extends 'game.audio.music_stop' ? AudioMusicStopPayload :
  T extends 'game.world.unlocked' ? WorldUnlockedPayload :
  T extends 'game.world.active_changed' ? WorldActiveChangedPayload :
  T extends 'game.system.paused' ? SystemPausedPayload :
  T extends 'game.system.resumed' ? SystemResumedPayload :
  T extends 'game.system.shutdown_requested' ? SystemShutdownRequestedPayload :
  never;
```

## 4. Interface / API Contract

```typescript
// src/state/GameEventBus.ts

import type Phaser from 'phaser';

export interface GameEventBus {
  emit<T extends GameEventTopic>(topic: T, payload: PayloadFor<T>): void;
  on<T extends GameEventTopic>(topic: T, handler: (payload: PayloadFor<T>) => void): () => void;
  once<T extends GameEventTopic>(topic: T, handler: (payload: PayloadFor<T>) => void): () => void;
  off<T extends GameEventTopic>(topic: T, handler: (payload: PayloadFor<T>) => void): void;
}

export function attachBusTo(game: Phaser.Game): GameEventBus;
```

- The bus is implemented on top of `Phaser.Game.events` (`EventEmitter3`). `attachBusTo(game)` returns a typed wrapper so TypeScript narrows payload per topic.
- `on` returns an unsubscribe function as a convenience; callers also use `off` when they need to unsubscribe a named handler.
- Emit is synchronous. Subscribers that need async behavior (fetch, setTimeout) handle it internally; the bus does not queue.
- Unknown topics: compile error. Runtime emission of a string that passes `as GameEventTopic` assertion (escape hatch) logs a warn and is delivered regardless.

## 5. Event Signatures

Summary registry (emitter authority, primary consumers). Full payload in Section 3.

| Topic | Emitter | Primary consumers |
|---|---|---|
| `game.scene.ready` | Thalia-v2 | Euterpe (ambient cue), Nyx (autostart quest check), Erato-v2 |
| `game.scene.shutdown` | Thalia-v2 | Nyx, Linus, Euterpe (cleanup) |
| `game.player.*` | Thalia-v2 | Nyx (movement triggers), Erato-v2 (HUD HP) |
| `game.npc.interact` | Thalia-v2 | Nyx (`fireTrigger`), Linus (may open dialogue via Nyx effect) |
| `game.npc.nearby` plus `far` | Thalia-v2 | Erato-v2 (interact prompt), Nyx |
| `game.dialogue.open` | Nyx (via effect) | Linus (DialogueRunner reducer OPEN) |
| `game.dialogue.node_entered` plus `choice_selected` plus `challenge_submitted` | Linus | Nyx (`fireTrigger`), Euterpe (sfx) |
| `game.dialogue.stream_chunk` plus `stream_complete` | Apollo streaming backend (React side) | Linus reducer |
| `game.quest.*` | Nyx | Erato-v2 (QuestTracker), Euterpe (quest jingle), Thalia-v2 (world unlock trigger) |
| `game.inventory.*` | Erato-v2 inventory actions plus Nyx effects | Erato-v2 InventoryToast, Euterpe (pickup sfx) |
| `game.currency.*`, `game.shop.*` | Erato-v2 (shop interactions) plus Nyx effects | Erato-v2 CurrencyHUD, Euterpe |
| `game.cinematic.*` | Thalia-v2 (Phaser tweens) | Linus (resume awaiting node), Erato-v2 (overlay), Euterpe (music sting) |
| `game.ui.*` | Erato-v2 | Thalia-v2 (pause input), Euterpe |
| `game.audio.*` | Euterpe | internal (Howler wrapper consumes) |
| `game.world.*` | Nyx (unlock effect) | Thalia-v2 (spawn portal sprite), Erato-v2 |
| `game.system.*` | Bridge plus Erato-v2 | all subscribers |

## 6. File Path Convention

- Topic enum plus payload types: `src/state/game_events.ts` plus `src/state/game_event_payloads.ts`
- Bus implementation: `src/state/GameEventBus.ts`
- Bridge (wires bus to Zustand): `src/state/gameBridge.ts` (see `zustand_bridge.contract.md`)
- Per-scene emitter helpers: `src/scenes/<SceneName>/emitters.ts`
- Per-component handlers: `src/components/hud/<Component>/handlers.ts`

## 7. Naming Convention

- Topic strings: `game.{subject}.{action}`, lowercase with dot separation. Subject is a singular noun when possible (`quest`, `dialogue`, `inventory`), plural only when the topic is inherently aggregate. Action is present-tense verb or past-tense participle for state transitions (`interact` vs `opened`).
- Payload interface names: `{TopicSubject}{Action}Payload` in `PascalCase` (e.g., `DialogueOpenedPayload`, `QuestStepAdvancedPayload`).
- Payload field names: `camelCase` for TypeScript surface, `snake_case` reserved only when the field serializes to JSON wire format shared with an external system.
- `GameEventTopic` discriminated union values are the sole source of truth. Any new topic addition requires a contract version bump (v0.1.0 to v0.2.0).

## 8. Error Handling

- Handler exception: caught by the bus, logged via `console.error` with topic name plus handler source, does not propagate to emitter.
- Handler throws more than 5 times within 30 seconds for the same topic: bus auto-removes the handler and emits `game.system.shutdown_requested` with `reason: 'handler_cascade:{topic}'`.
- Emission of a topic whose payload fails type narrowing at runtime (possible only via `as` cast): logs warn once per topic per minute, still delivers to subscribers so debugging is visible.
- Missing subscriber for a topic (emit with zero listeners): no-op, optional dev-mode warn when `DEBUG_GAME_BUS` env flag set.
- Subscription after `game.scene.shutdown` but before new scene start: accepted but logged as a lifecycle anomaly.
- Event emitted during Phaser `destroy()`: drop silently; the bus is torn down and cannot deliver.

## 9. Testing Surface

- Round-trip: emit `game.npc.interact` with payload `{ npcId: 'apollo', x: 100, y: 200 }`, subscriber receives identical payload.
- Unsubscribe: subscribe, unsubscribe via returned function, emit, handler not called.
- Multiple subscribers on same topic: all called in registration order.
- Handler throws: subsequent subscribers still receive the event, error logged.
- Type compile-time check: attempting `bus.emit('game.npc.interact', { foo: 1 })` fails TypeScript compilation (property shape mismatch).
- Topic not in the enum: compile error.
- Scene shutdown emits `game.scene.shutdown` once, subscriber cleanup fires before next scene start.
- Cascade handler: register a handler that throws, emit 6 times within 30 seconds, assert handler auto-removed and `game.system.shutdown_requested` emitted.

## 10. Open Questions

- None blocking v0.1.0. If Thalia-v2 discovers scene-internal events that do not cross the React boundary and do not need registry entry, those may stay as raw Phaser emits on `scene.events` without being in this contract. This contract governs the `game.*` namespace on `game.events` only.

## 11. Post-Hackathon Refactor Notes

- Add topic versioning (`game.dialogue.opened.v2`) for schema evolution without breaking handlers.
- Emit an audit tap that mirrors every `game.*` event into a ring buffer (last 200 events) for in-game debug overlay.
- Add priority handling for high-frequency topics (`game.player.moved` at 60 fps) via a separate high-throughput bus to avoid handler starvation on critical lifecycle events.
- Introduce `game.marketplace.*`, `game.banking.*`, `game.registry.*`, `game.protocol.*` namespaces when cross-pillar integration reaches in-game surfaces.
- Reserve `game.meta.*` for NERIUM meta-narrative events (recursive-automation callouts, easter eggs referencing the build-itself story).
- Emit a post-session replay dump of all `game.quest.*` and `game.inventory.*` events for the `/leaderboard` flex surface (anonymized player story).
- Post-hackathon add an optional Redis or server-side relay so multiplayer agents can subscribe across clients.
- Provide a small devtools panel (React component) subscribing to `*` to inspect live event flow during polish.
