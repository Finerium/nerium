//
// src/lib/hudBus.ts
//
// React HUD side emit helper for the shared game event bus. Mirrors Linus's
// `dialogueBridge.ts` pattern so the HUD and the dialogue runtime route
// through the same window escape hatch.
//
// Ordering of bus resolution:
//   1. If `window.__NERIUM_GAME_BUS__` is set by the BusBridge component
//      (after wireBridge handoff via registry), emit through it directly.
//   2. Otherwise fall back to a `__NERIUM_GAME_EVENT__` CustomEvent on
//      window so BusBridge (or any test harness using the
//      `__NERIUM_TEST_*` namespace per gotcha 5) can subscribe.
//
// Scope: this helper is for React HUD components that need to notify the
// rest of the app (Phaser scenes, quest store, other HUD subscribers) of a
// UI-originated event. Inside a Phaser scene, emit via `game.events.emit`
// per `zustand_bridge.contract.md`. The two paths converge at gameBridge.
//

export type HudBusTopic =
  | 'game.npc.interact'
  | 'game.shop.open'
  | 'game.shop.close'
  | 'game.inventory.opened'
  | 'game.ui.overlay_changed'
  | 'game.dialogue.challenge_submitted'
  | 'game.quest.trigger_requested'
  | 'nerium.ui.model_changed'
  | 'nerium.ui.language_changed';

export interface HudBusEvent<TPayload = unknown> {
  topic: HudBusTopic | string;
  occurred_at: string;
  source: 'hud';
  payload: TPayload;
}

type BusLike = {
  emit?: (topic: string, payload: unknown) => void;
};

function resolveBus(): BusLike | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { __NERIUM_GAME_BUS__?: BusLike };
  return w.__NERIUM_GAME_BUS__ ?? null;
}

export function emitBusEvent<T>(topic: HudBusTopic | string, payload: T): void {
  const bus = resolveBus();
  if (bus && typeof bus.emit === 'function') {
    bus.emit(topic, payload);
    return;
  }
  if (typeof window === 'undefined') return;
  const event: HudBusEvent<T> = {
    topic,
    occurred_at: new Date().toISOString(),
    source: 'hud',
    payload,
  };
  window.dispatchEvent(new CustomEvent('__NERIUM_GAME_EVENT__', { detail: event }));
}
