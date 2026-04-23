//
// src/lib/dialogueBridge.ts
//
// Thin outbound bridge from the dialogue runtime to the game event bus.
// Owner: Linus. Contract: docs/contracts/game_event_bus.contract.md v0.1.0.
//
// Rationale: in the W2 parallel build, Thalia-v2's `src/stores/gameBridge.ts`
// may not yet be shipped. This helper provides a stable emission point that
// routes through Thalia's `gameEvents` emitter when available, and falls back
// to a namespaced `__NERIUM_GAME_EVENT__` window CustomEvent when not.
// Per translator_notes gotcha 5, any window-level escape uses the `__NERIUM_*`
// namespace so test hooks never mix with production dispatch.
//
// When Thalia ships the bridge, this file remains the import point; only
// the implementation swaps.
//

export type BridgeTopic =
  | 'game.dialogue.opened'
  | 'game.dialogue.node_entered'
  | 'game.dialogue.choice_selected'
  | 'game.dialogue.challenge_submitted'
  | 'game.dialogue.stream_chunk'
  | 'game.dialogue.stream_complete'
  | 'game.dialogue.closed'
  | 'game.dialogue.effect_pending'
  | 'game.quest.trigger_requested';

export interface BridgeEvent<TPayload = unknown> {
  topic: BridgeTopic;
  occurred_at: string;
  source: 'dialogue';
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

export function emitDialogueEvent<T>(topic: BridgeTopic, payload: T): void {
  const bus = resolveBus();
  if (bus && typeof bus.emit === 'function') {
    bus.emit(topic, payload);
    return;
  }
  if (typeof window === 'undefined') return;
  const event: BridgeEvent<T> = {
    topic,
    occurred_at: new Date().toISOString(),
    source: 'dialogue',
    payload,
  };
  window.dispatchEvent(new CustomEvent('__NERIUM_GAME_EVENT__', { detail: event }));
}
