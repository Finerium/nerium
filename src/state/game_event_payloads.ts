//
// src/state/game_event_payloads.ts
//
// Payload interface library for the game event bus. Owner: Thalia-v2 per
// docs/contracts/game_event_bus.contract.md Section 3.1.
//
// Every topic in GameEventTopic binds to one payload type via PayloadFor<T>
// (declared below).
//

import type {
  NpcId,
  QuestId,
  DialogueId,
  NodeId,
  ItemId,
  ToastId,
  OverlayId,
  CurrencyCode,
  SlotId,
  AmbientLoopId,
  WorldId,
} from './types';
import type { GameEventTopic } from './game_events';

// ---- Scene ----
export interface SceneReadyPayload {
  sceneKey: string;
  worldId: WorldId | null;
}
export interface SceneShutdownPayload {
  sceneKey: string;
}
export interface SceneTransitionPayload {
  from: string;
  to: string;
  durationMs: number;
}

// ---- Player ----
export interface PlayerSpawnedPayload {
  x: number;
  y: number;
  sceneKey: string;
}
export interface PlayerMovedPayload {
  x: number;
  y: number;
  dx: number;
  dy: number;
}
export interface PlayerDamagedPayload {
  amount: number;
  source: string;
}

// ---- NPC ----
export interface NpcNearbyPayload {
  npcId: NpcId;
  distancePx: number;
}
export interface NpcFarPayload {
  npcId: NpcId;
}
export interface NpcInteractPayload {
  npcId: NpcId;
  x: number;
  y: number;
}
export interface NpcTrustChangedPayload {
  npcId: NpcId;
  delta: number;
  newValue: number;
}

// ---- Zone ----
export interface ZoneEnteredPayload {
  zoneId: string;
  sceneKey: string;
}
export interface ZoneExitedPayload {
  zoneId: string;
  sceneKey: string;
}

// ---- Pickup ----
export interface PickupSpawnedPayload {
  pickupId: string;
  itemId: ItemId;
  x: number;
  y: number;
}
export interface PickupInteractPayload {
  pickupId: string;
  itemId: ItemId;
}

// ---- Dialogue ----
export interface DialogueOpenPayload {
  dialogueId: DialogueId;
  startNode?: NodeId;
}
export interface DialogueOpenedPayload {
  dialogueId: DialogueId;
  nodeId: NodeId;
}
export interface DialogueNodeEnteredPayload {
  dialogueId: DialogueId;
  nodeId: NodeId;
}
export interface DialogueChoiceSelectedPayload {
  dialogueId: DialogueId;
  nodeId: NodeId;
  choiceIndex: number;
}
export interface DialogueChallengeSubmittedPayload {
  dialogueId: DialogueId;
  nodeId: NodeId;
  slotId: SlotId;
  value: string;
}
export interface DialogueStreamChunkPayload {
  streamKey: string;
  chunk: string;
}
export interface DialogueStreamCompletePayload {
  streamKey: string;
  totalChars: number;
}
export interface DialogueAdvancePayload {
  dialogueId: DialogueId;
  nextNodeId: NodeId;
}
export interface DialogueClosedPayload {
  dialogueId: DialogueId;
  reason: 'natural' | 'interrupted' | 'quest_failed';
}

// ---- Quest ----
export interface QuestStartedPayload {
  questId: QuestId;
}
export interface QuestStepAdvancedPayload {
  questId: QuestId;
  stepId: string;
  stepIndex: number;
}
export interface QuestCompletedPayload {
  questId: QuestId;
}
export interface QuestFailedPayload {
  questId: QuestId;
  reason: string;
}
export interface QuestTriggerFiredPayload {
  triggerType: string;
  questId: QuestId;
  matchedStepId: string | null;
}

// ---- Inventory ----
export interface InventoryAwardedPayload {
  itemId: ItemId;
  quantity: number;
  outcome: string;
  source: string;
  sourceRef?: string;
}
export interface InventoryConsumedPayload {
  itemId: ItemId;
  quantity: number;
  slotIndex: number;
  remainingQuantity: number;
}
export interface InventoryRejectedPayload {
  itemId: ItemId;
  reason: string;
}
export interface InventoryOpenedPayload {
  source: 'hotkey' | 'npc' | 'shop';
}

// ---- Currency plus shop ----
export interface CurrencyChangedPayload {
  code: CurrencyCode;
  delta: number;
  newValue: number;
}
export interface ShopOpenPayload {
  shopId: string;
}
export interface ShopClosePayload {
  shopId: string;
}
export interface ShopPurchaseCompletedPayload {
  orderId: string;
  itemId: ItemId;
  quantity: number;
  totalUsd: number;
}

// ---- Cinematic ----
export interface CinematicStartPayload {
  key: string;
}
export interface CinematicCompletePayload {
  key: string;
  durationMs: number;
}
export interface CinematicAbortPayload {
  key: string;
  reason: string;
}

// ---- UI ----
export interface OverlayChangedPayload {
  previous: OverlayId;
  next: OverlayId;
}
export interface InteractPromptPayload {
  visible: boolean;
  label: string;
}
export interface ToastPushedPayload {
  toastId: ToastId;
  kind: string;
  message: string;
}
export interface ToastDismissedPayload {
  toastId: ToastId;
  reason: 'timer' | 'user' | 'programmatic';
}

// ---- Audio ----
export interface AudioAmbientPlayPayload {
  loopId: AmbientLoopId;
  fadeInMs: number;
}
export interface AudioAmbientStopPayload {
  loopId: AmbientLoopId;
  fadeOutMs: number;
}
export interface AudioSfxPlayPayload {
  sfxKey: string;
  volumeOverride?: number;
}
export interface AudioMusicPlayPayload {
  trackKey: string;
  loop: boolean;
  fadeInMs: number;
}
export interface AudioMusicStopPayload {
  trackKey: string;
  fadeOutMs: number;
}

// ---- World ----
export interface WorldUnlockedPayload {
  worldId: WorldId;
}
export interface WorldActiveChangedPayload {
  previous: WorldId | null;
  next: WorldId;
}

// ---- System ----
export interface SystemPausedPayload {
  reason: 'user' | 'overlay' | 'lost_focus';
}
export interface SystemResumedPayload {
  // intentionally empty
  [key: string]: never;
}
export interface SystemShutdownRequestedPayload {
  reason: string;
}

// ---- Topic-to-payload mapping (compile-time enforcement) ----
export type PayloadFor<T extends GameEventTopic> = T extends 'game.scene.ready'
  ? SceneReadyPayload
  : T extends 'game.scene.shutdown'
    ? SceneShutdownPayload
    : T extends 'game.scene.transition_started' | 'game.scene.transition_completed'
      ? SceneTransitionPayload
      : T extends 'game.player.spawned'
        ? PlayerSpawnedPayload
        : T extends 'game.player.moved'
          ? PlayerMovedPayload
          : T extends 'game.player.damaged'
            ? PlayerDamagedPayload
            : T extends 'game.npc.nearby'
              ? NpcNearbyPayload
              : T extends 'game.npc.far'
                ? NpcFarPayload
                : T extends 'game.npc.interact'
                  ? NpcInteractPayload
                  : T extends 'game.npc.trust_changed'
                    ? NpcTrustChangedPayload
                    : T extends 'game.zone.entered'
                      ? ZoneEnteredPayload
                      : T extends 'game.zone.exited'
                        ? ZoneExitedPayload
                        : T extends 'game.pickup.spawned'
                          ? PickupSpawnedPayload
                          : T extends 'game.pickup.interact'
                            ? PickupInteractPayload
                            : T extends 'game.dialogue.open'
                              ? DialogueOpenPayload
                              : T extends 'game.dialogue.opened'
                                ? DialogueOpenedPayload
                                : T extends 'game.dialogue.node_entered'
                                  ? DialogueNodeEnteredPayload
                                  : T extends 'game.dialogue.choice_selected'
                                    ? DialogueChoiceSelectedPayload
                                    : T extends 'game.dialogue.challenge_submitted'
                                      ? DialogueChallengeSubmittedPayload
                                      : T extends
                                            | 'game.dialogue.stream_chunk'
                                            | 'game.dialogue.stream_chunk_received'
                                        ? DialogueStreamChunkPayload
                                        : T extends 'game.dialogue.stream_complete'
                                          ? DialogueStreamCompletePayload
                                          : T extends 'game.dialogue.advance'
                                            ? DialogueAdvancePayload
                                            : T extends 'game.dialogue.closed'
                                              ? DialogueClosedPayload
                                              : T extends 'game.quest.started'
                                                ? QuestStartedPayload
                                                : T extends 'game.quest.step_advanced'
                                                  ? QuestStepAdvancedPayload
                                                  : T extends 'game.quest.completed'
                                                    ? QuestCompletedPayload
                                                    : T extends 'game.quest.failed'
                                                      ? QuestFailedPayload
                                                      : T extends 'game.quest.trigger_fired'
                                                        ? QuestTriggerFiredPayload
                                                        : T extends 'game.inventory.awarded'
                                                          ? InventoryAwardedPayload
                                                          : T extends 'game.inventory.consumed'
                                                            ? InventoryConsumedPayload
                                                            : T extends 'game.inventory.rejected'
                                                              ? InventoryRejectedPayload
                                                              : T extends 'game.inventory.opened'
                                                                ? InventoryOpenedPayload
                                                                : T extends 'game.currency.changed'
                                                                  ? CurrencyChangedPayload
                                                                  : T extends 'game.shop.open'
                                                                    ? ShopOpenPayload
                                                                    : T extends 'game.shop.close'
                                                                      ? ShopClosePayload
                                                                      : T extends 'game.shop.purchase_completed'
                                                                        ? ShopPurchaseCompletedPayload
                                                                        : T extends 'game.cinematic.start'
                                                                          ? CinematicStartPayload
                                                                          : T extends 'game.cinematic.complete'
                                                                            ? CinematicCompletePayload
                                                                            : T extends 'game.cinematic.abort'
                                                                              ? CinematicAbortPayload
                                                                              : T extends 'game.ui.overlay_changed'
                                                                                ? OverlayChangedPayload
                                                                                : T extends 'game.ui.interact_prompt'
                                                                                  ? InteractPromptPayload
                                                                                  : T extends 'game.ui.toast_pushed'
                                                                                    ? ToastPushedPayload
                                                                                    : T extends 'game.ui.toast_dismissed'
                                                                                      ? ToastDismissedPayload
                                                                                      : T extends 'game.audio.ambient_play'
                                                                                        ? AudioAmbientPlayPayload
                                                                                        : T extends 'game.audio.ambient_stop'
                                                                                          ? AudioAmbientStopPayload
                                                                                          : T extends 'game.audio.sfx_play'
                                                                                            ? AudioSfxPlayPayload
                                                                                            : T extends 'game.audio.music_play'
                                                                                              ? AudioMusicPlayPayload
                                                                                              : T extends 'game.audio.music_stop'
                                                                                                ? AudioMusicStopPayload
                                                                                                : T extends 'game.world.unlocked'
                                                                                                  ? WorldUnlockedPayload
                                                                                                  : T extends 'game.world.active_changed'
                                                                                                    ? WorldActiveChangedPayload
                                                                                                    : T extends 'game.system.paused'
                                                                                                      ? SystemPausedPayload
                                                                                                      : T extends 'game.system.resumed'
                                                                                                        ? SystemResumedPayload
                                                                                                        : T extends 'game.system.shutdown_requested'
                                                                                                          ? SystemShutdownRequestedPayload
                                                                                                          : never;
