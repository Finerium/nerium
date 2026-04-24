'use client';
//
// src/state/gameBridge.ts
//
// The single sanctioned Phaser-to-Zustand bridge per
// docs/contracts/zustand_bridge.contract.md.
//
// Owner: Thalia-v2 (this module). Consumers: Erato-v2 (React HUD) and every
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
// Epimetheus W0 B3 fix: the questEffectBus handler is now an exhaustive
// 13-branch switch per quest_schema.contract.md EffectSchema. Effects that
// questStore.applyEffect handles synchronously (unlock_world, add_trust,
// complete_quest, fail_quest, quest-scope set_variable) never reach this
// bus; their cases remain for exhaustiveness and guard against future drift
// where Nyx might opt to emit instead of handle internally.
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
import type { WorldId } from './types';
import type { Trigger } from '../data/quests/_schema';
import { questEffectBus } from '../lib/questRunner';
import { MINI_BUILDER_SCENE_KEY } from '../game/scenes/MiniBuilderCinematicScene';
import { audioEngine } from '../lib/audioEngine';

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

function generateToastId(): string {
  if (typeof globalThis !== 'undefined' && 'crypto' in globalThis && typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `toast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

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

  // ---- Euterpe audio engine wiring ----
  //
  // audioEngine.attachBus subscribes every game.audio.*, quest, dialogue,
  // scene, inventory, cinematic, and world topic declared in cues.json
  // eventRouting. The engine owns Howler instance lifetime; detachBus
  // releases the bus subscriptions without tearing down preloaded Howls so
  // subsequent wireBridge invocations can re-attach cheaply.
  disposers.push(audioEngine.attachBus(bus));

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

  disposers.push(
    bus.on('game.dialogue.node_entered', (payload) => {
      // Typed-bus path for dialogue node entry (belt-and-suspenders with
      // BusBridge window-CustomEvent path for DialogueOverlay emissions that
      // fall back to window dispatch when __NERIUM_GAME_BUS__ is not yet
      // registered). Both paths converge on the same fireTrigger call; the
      // questStore is idempotent on already-matched triggers because step
      // advance gates on the current stepIndex.
      useQuestStore.getState().fireTrigger({
        type: 'dialogue_node_reached',
        dialogueId: payload.dialogueId,
        nodeId: payload.nodeId,
      });
    }),
  );

  // ---- Quest effect bus to Phaser scene manager + cross-store dispatch ----
  //
  // Per quest_schema.contract.md EffectSchema the Effect union has 13
  // branches. questStore.applyEffect routes 5 branches internally
  // (unlock_world, add_trust, complete_quest, fail_quest, quest-scope
  // set_variable) and emits the remaining 8 plus dialogue-scope
  // set_variable onto this bus. The switch below handles every bus-reachable
  // branch; internal-only branches are no-op cases guarded for exhaustiveness
  // so TypeScript's discriminated-union narrowing keeps this bridge pinned
  // to the contract shape.
  disposers.push(
    questEffectBus.on((payload) => {
      const { effect } = payload;
      switch (effect.type) {
        case 'play_cinematic': {
          const sceneManager = game.scene;
          // ApolloVillage is the only lobby in the vertical slice;
          // post-hackathon expansion walks the active scene list and picks
          // the highest-priority lobby-typed scene.
          const lobbyKey = 'ApolloVillage';
          const lobby = sceneManager.getScene(lobbyKey) as Phaser.Scene | null;
          if (!lobby || !sceneManager.isActive(lobbyKey)) {
            console.warn(
              `[gameBridge] play_cinematic ignored: lobby scene ${lobbyKey} not active`,
            );
            break;
          }
          sceneManager.pause(lobbyKey);
          useUIStore.getState().startCinematic(effect.key);
          lobby.scene.launch(MINI_BUILDER_SCENE_KEY, {
            key: effect.key,
            returnToScene: lobbyKey,
          });
          break;
        }
        case 'award_item': {
          useInventoryStore.getState().award(effect.itemId, effect.quantity);
          // Cascade an item_acquired trigger so downstream quest steps
          // listening for the pickup-time trigger advance without an extra
          // user action. lumio_onboarding step 6 depends on this cascade
          // because the award lands from play_cinematic completion rather
          // than from a world-pickup interaction.
          useQuestStore.getState().fireTrigger({
            type: 'item_acquired',
            itemId: effect.itemId,
          });
          break;
        }
        case 'consume_item': {
          useInventoryStore.getState().consume(effect.itemId, effect.quantity);
          break;
        }
        case 'add_currency': {
          useInventoryStore.getState().addCurrency(effect.code, effect.amount);
          break;
        }
        case 'push_toast': {
          useUIStore.getState().pushToast({
            toast_id: generateToastId(),
            kind: effect.kind,
            message: effect.message,
            dismissAfterMs: effect.dismissAfterMs,
          });
          break;
        }
        case 'open_dialogue': {
          useDialogueStore.getState().openDialogue(effect.dialogueId, effect.startNode);
          break;
        }
        case 'stream_apollo_response': {
          // Apollo stream backend is owned by the future Nike worker; the
          // bridge acknowledges the request by marking the dialogue store
          // ready to receive chunks. Until the stream producer is wired,
          // the handshake is no-op but observable so downstream QA can
          // detect the start signal.
          useDialogueStore.getState().appendStreamChunk('');
          break;
        }
        case 'emit_event': {
          // emit_event forwards to the typed bus. Cast the loose string
          // eventName into the topic union; unknown topics are a runtime
          // no-op because the typed bus rejects emissions without a
          // registered payload shape.
          const topic = effect.eventName as Parameters<GameEventBus['emit']>[0];
          bus.emit(topic, (effect.payload ?? {}) as never);
          break;
        }
        case 'set_variable': {
          // quest-scope set_variable is handled inside questStore.applyEffect
          // and never reaches this bus; dialogue-scope lands here for the
          // dialogue runtime projection.
          if (effect.scope === 'dialogue') {
            useDialogueStore.getState().setVar(effect.name, effect.value);
          }
          break;
        }
        case 'unlock_world':
        case 'add_trust':
        case 'complete_quest':
        case 'fail_quest': {
          // Internal quest-store effects. questStore.applyEffect handles
          // these synchronously and they do not reach this bus. Cases
          // retained for exhaustive union narrowing.
          break;
        }
        default: {
          const exhaustive: never = effect;
          void exhaustive;
          console.warn(
            `[gameBridge] questEffectBus: unknown effect type (unreachable)`,
          );
        }
      }
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
        // WorldId in the canonical store widens to string for post-hackathon
        // marketplace expansion; the narrow union still types the payload so
        // consumers get autocompletion on the three shipped worlds.
        added.forEach((worldId) => bus.emit('game.world.unlocked', { worldId: worldId as WorldId }));
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
    useDialogueStore.subscribe(
      (s) => s.currentNodeId,
      (next) => {
        const dialogueId = useDialogueStore.getState().activeDialogueId;
        if (!dialogueId || !next) return;
        // Emit on every node transition so BOTH the quest FSM and any other
        // node-level consumer (audio cue, analytics) see the entry. The
        // bridge back-into-questStore happens via the topic handler above so
        // the quest FSM advances on dialogue_node_reached triggers without
        // DialogueOverlay having to know about quests.
        bus.emit('game.dialogue.node_entered', {
          dialogueId,
          nodeId: next,
        });
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
