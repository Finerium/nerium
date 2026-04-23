'use client';
//
// src/state/gameBridge.ts
//
// The single sanctioned Phaser-to-Zustand bridge per
// docs/contracts/zustand_bridge.contract.md.
//
// Owner: Thalia-v2 (this module), consumed by Erato-v2 (React HUD) and every
// scene authored under src/game/scenes/. No other file is permitted to call
// game.events.on/off from outside a scene.
//
// Wiring invariants:
//   1. One PhaserToStore handler per topic, registered via bus.on.
//   2. StoreToPhaser subscriptions use subscribeWithSelector and return
//      unsubscribers pushed onto the shared disposer stack.
//   3. Every disposer runs exactly once in teardown(), ordered LIFO.
//   4. fireImmediately defaults to false. Any true value MUST have a comment
//      on the line above explaining why (contract Section 3 review gate).
//

import type * as Phaser from 'phaser';
import { attachBusTo, type GameEventBus } from './GameEventBus';
import {
  useQuestStore,
  useDialogueStore,
  useInventoryStore,
  useUIStore,
  useAudioStore,
} from './stores';
import type { Trigger, WorldId } from './types';
import { questEffectBus } from '../lib/questRunner';
import { MINI_BUILDER_SCENE_KEY } from '../game/scenes/MiniBuilderCinematicScene';

export interface GameBridge {
  game: Phaser.Game;
  bus: GameEventBus;
  teardown: () => void;
}

export class BridgeAlreadyWiredError extends Error {
  constructor() {
    super('[gameBridge] wireBridge called twice; call teardown() first');
    this.name = 'BridgeAlreadyWiredError';
  }
}

const WIRED = new WeakSet<Phaser.Game>();

/**
 * Wire one Phaser.Game instance to the five Zustand stores. Returns the
 * bridge handle plus a single-call teardown function.
 *
 * The PhaserCanvas Client Component calls wireBridge once on mount and runs
 * teardown exactly once on unmount (alongside game.destroy(true)).
 */
export function wireBridge(game: Phaser.Game): GameBridge {
  if (WIRED.has(game)) throw new BridgeAlreadyWiredError();
  WIRED.add(game);

  const bus = attachBusTo(game);
  const disposers: Array<() => void> = [];

  // ---- Phaser to Store wiring ----

  disposers.push(
    bus.on('game.npc.interact', (payload) => {
      const trigger: Trigger = { type: 'npc_interact', npcId: payload.npcId };
      useQuestStore.getState().fireTrigger(trigger);
    }),
  );

  disposers.push(
    bus.on('game.npc.nearby', (payload) => {
      useUIStore.getState().setInteractPrompt(true, `Press E to talk to ${payload.npcId}`);
    }),
  );

  disposers.push(
    bus.on('game.npc.far', () => {
      useUIStore.getState().setInteractPrompt(false);
    }),
  );

  disposers.push(
    bus.on('game.zone.entered', (payload) => {
      useQuestStore.getState().fireTrigger({ type: 'zone_enter', zoneId: payload.zoneId });
    }),
  );

  disposers.push(
    bus.on('game.cinematic.complete', (payload) => {
      useQuestStore.getState().fireTrigger({ type: 'cinematic_complete', key: payload.key });
      useUIStore.getState().endCinematic();
    }),
  );

  disposers.push(
    bus.on('game.scene.ready', () => {
      // Hook for Euterpe to start ambient loops once the scene is up.
      // Left intentionally subscribed even when Euterpe not yet wired so the
      // topic emission stays observable in devtools.
    }),
  );

  disposers.push(
    bus.on('game.pickup.interact', (payload) => {
      useInventoryStore.getState().award(payload.itemId, 1);
    }),
  );

  // ---- Quest effect bus to Phaser scene manager ----
  //
  // The quest `play_cinematic` effect flows through questEffectBus (see
  // src/lib/questRunner.ts Section 10) rather than directly mutating a
  // store. The bridge forwards it into the Phaser scene manager by
  // launching MiniBuilderCinematicScene against whichever "lobby" scene is
  // currently active. This is the sole launch site for the cinematic so
  // the scope of scene orchestration stays inside the bridge layer per
  // zustand_bridge.contract.md Section 4.
  disposers.push(
    questEffectBus.on((payload) => {
      if (payload.effect.type !== 'play_cinematic') return;
      const key = payload.effect.key;
      const sceneManager = game.scene;
      // Identify the lobby scene currently running so the cinematic can
      // resume it after completion. ApolloVillage is the only lobby in
      // the vertical slice; post-hackathon expansion can walk the active
      // scene list and pick the highest-priority lobby-typed scene.
      const lobbyKey = 'ApolloVillage';
      const lobby = sceneManager.getScene(lobbyKey) as Phaser.Scene | null;
      if (!lobby || !sceneManager.isActive(lobbyKey)) {
        console.warn(
          `[gameBridge] play_cinematic ignored: lobby scene ${lobbyKey} not active`,
        );
        return;
      }
      // Pause the lobby so its input and update ticks stall while the
      // cinematic overlays the canvas.
      sceneManager.pause(lobbyKey);
      // ui.cinematicPlaying flips via startCinematic; the
      // subscribeWithSelector below then emits game.cinematic.start on
      // behalf of React so HUD dim logic reads from Zustand, not Phaser.
      useUIStore.getState().startCinematic(key);
      // ScenePlugin.launch (distinct from SceneManager.start) runs the
      // target scene alongside the caller without shutting the caller
      // down. Routing through the lobby scene's ScenePlugin keeps the
      // parent relationship explicit for a clean resume on completion.
      lobby.scene.launch(MINI_BUILDER_SCENE_KEY, {
        key,
        returnToScene: lobbyKey,
      });
    }),
  );

  // ---- Store to Phaser wiring ----

  disposers.push(
    useQuestStore.subscribe(
      (s) => s.activeQuests,
      (next, prev) => {
        const startedIds = next.filter((q) => !prev.some((p) => p.id === q.id));
        startedIds.forEach((q) => bus.emit('game.quest.started', { questId: q.id }));
      },
      { fireImmediately: false },
    ),
  );

  disposers.push(
    useQuestStore.subscribe(
      (s) => s.completedQuests,
      (next, prev) => {
        const completedIds = next.filter((q) => !prev.some((p) => p.id === q.id));
        completedIds.forEach((q) => bus.emit('game.quest.completed', { questId: q.id }));
      },
      { fireImmediately: false },
    ),
  );

  disposers.push(
    useQuestStore.subscribe(
      (s) => s.unlockedWorlds,
      (next, prev) => {
        const added = next.filter((w) => !prev.includes(w));
        added.forEach((worldId: WorldId) => bus.emit('game.world.unlocked', { worldId }));
      },
      { fireImmediately: false },
    ),
  );

  disposers.push(
    useUIStore.subscribe(
      (s) => s.cinematicPlaying,
      (next) => {
        const key = useUIStore.getState().cinematicKey ?? 'unknown';
        if (next) {
          bus.emit('game.cinematic.start', { key });
        } else {
          bus.emit('game.cinematic.abort', { key, reason: 'ui_state_change' });
        }
      },
      { fireImmediately: false },
    ),
  );

  disposers.push(
    useUIStore.subscribe(
      (s) => s.overlay,
      (next, prev) => {
        bus.emit('game.ui.overlay_changed', { previous: prev, next });
      },
      { fireImmediately: false },
    ),
  );

  disposers.push(
    useDialogueStore.subscribe(
      (s) => s.activeDialogueId,
      (next) => {
        if (next) {
          bus.emit('game.dialogue.opened', {
            dialogueId: next,
            nodeId: useDialogueStore.getState().currentNodeId ?? 'start',
          });
        } else {
          bus.emit('game.dialogue.closed', {
            dialogueId: '',
            reason: 'natural',
          });
        }
      },
      { fireImmediately: false },
    ),
  );

  disposers.push(
    useAudioStore.subscribe(
      (s) => s.currentAmbient,
      (next, prev) => {
        if (prev && prev !== next) {
          bus.emit('game.audio.ambient_stop', { loopId: prev, fadeOutMs: 600 });
        }
        if (next && next !== prev) {
          bus.emit('game.audio.ambient_play', { loopId: next, fadeInMs: 800 });
        }
      },
      { fireImmediately: false },
    ),
  );

  // ---- Registry handoff so scenes can retrieve the bus ----

  game.registry.set('gameEventBus', bus);

  return {
    game,
    bus,
    teardown: () => {
      for (let i = disposers.length - 1; i >= 0; i--) {
        try {
          disposers[i]();
        } catch (err) {
          console.error('[gameBridge] disposer threw during teardown', err);
        }
      }
      disposers.length = 0;
      game.registry.remove('gameEventBus');
      WIRED.delete(game);
    },
  };
}
