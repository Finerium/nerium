//
// src/state/GameEventBus.ts
//
// Typed wrapper around Phaser.Game.events (EventEmitter3) per
// docs/contracts/game_event_bus.contract.md Section 4.
//
// The bus is implemented on top of game.events so scenes retain native
// access while cross-boundary consumers (bridge, React HUD via bridge) get
// compile-time payload narrowing through PayloadFor<T>.
//

import type * as Phaser from 'phaser';
import type { GameEventTopic } from './game_events';
import type { PayloadFor } from './game_event_payloads';

export interface GameEventBus {
  emit<T extends GameEventTopic>(topic: T, payload: PayloadFor<T>): void;
  on<T extends GameEventTopic>(topic: T, handler: (payload: PayloadFor<T>) => void): () => void;
  once<T extends GameEventTopic>(topic: T, handler: (payload: PayloadFor<T>) => void): () => void;
  off<T extends GameEventTopic>(topic: T, handler: (payload: PayloadFor<T>) => void): void;
}

// Handler cascade tracking per contract Section 8. Threshold: 5 throws per
// topic per 30 seconds triggers auto-remove plus system shutdown request.
const HANDLER_THROW_LIMIT = 5;
const HANDLER_THROW_WINDOW_MS = 30_000;

interface CascadeState {
  count: number;
  firstAt: number;
}

export function attachBusTo(game: Phaser.Game): GameEventBus {
  const emitter = game.events;
  const cascadeByTopic = new Map<string, Map<Function, CascadeState>>();

  function wrapHandler<T extends GameEventTopic>(
    topic: T,
    handler: (payload: PayloadFor<T>) => void,
  ): (payload: PayloadFor<T>) => void {
    return (payload: PayloadFor<T>) => {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[GameEventBus] handler threw for topic ${topic}`, err);
        registerCascade(topic, handler, emitter);
      }
    };
  }

  function registerCascade<T extends GameEventTopic>(
    topic: T,
    handler: (payload: PayloadFor<T>) => void,
    em: Phaser.Events.EventEmitter,
  ) {
    let bucket = cascadeByTopic.get(topic);
    if (!bucket) {
      bucket = new Map();
      cascadeByTopic.set(topic, bucket);
    }
    const now = Date.now();
    const existing = bucket.get(handler);
    if (!existing || now - existing.firstAt > HANDLER_THROW_WINDOW_MS) {
      bucket.set(handler, { count: 1, firstAt: now });
      return;
    }
    existing.count += 1;
    if (existing.count >= HANDLER_THROW_LIMIT) {
      console.warn(
        `[GameEventBus] cascade limit for topic ${topic}; removing handler and requesting shutdown`,
      );
      em.off(topic, handler as unknown as Function);
      bucket.delete(handler);
      em.emit('game.system.shutdown_requested', {
        reason: `handler_cascade:${topic}`,
      });
    }
  }

  return {
    emit<T extends GameEventTopic>(topic: T, payload: PayloadFor<T>): void {
      emitter.emit(topic, payload);
    },
    on<T extends GameEventTopic>(
      topic: T,
      handler: (payload: PayloadFor<T>) => void,
    ): () => void {
      const wrapped = wrapHandler(topic, handler);
      emitter.on(topic, wrapped);
      return () => emitter.off(topic, wrapped);
    },
    once<T extends GameEventTopic>(
      topic: T,
      handler: (payload: PayloadFor<T>) => void,
    ): () => void {
      const wrapped = wrapHandler(topic, handler);
      emitter.once(topic, wrapped);
      return () => emitter.off(topic, wrapped);
    },
    off<T extends GameEventTopic>(
      topic: T,
      handler: (payload: PayloadFor<T>) => void,
    ): void {
      emitter.off(topic, handler as unknown as Function);
    },
  };
}
