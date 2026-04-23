//
// src/state/game_events.ts
//
// Canonical event topic registry for the Phaser game.events bus and its
// Zustand bridge. Owner: Thalia-v2 per
// docs/contracts/game_event_bus.contract.md Section 3.
//
// Any topic addition requires a contract version bump (v0.1.0 to v0.2.0 per
// Pythia-v2 authority). Consumers import the discriminated union and the
// PayloadFor<T> helper only; raw string literals are banned.
//

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
  occurred_at: string; // ISO-8601 UTC
  source: 'phaser' | 'react' | 'store' | 'bridge';
  payload: TPayload;
}
