# Zustand Bridge (Phaser to React boundary)

**Contract Version:** 0.1.0
**Owner Agent(s):** Thalia-v2 (bridge module implementation owner, Phaser side). React integration: Erato-v2
**Consumer Agent(s):** Nyx (questStore subscriber), Linus (dialogueStore subscriber), Erato-v2 (all React HUD components use narrow selectors), Euterpe (audioStore subscriber), Thalia-v2 (Phaser scenes use `getState()` plus subscribe with SHUTDOWN cleanup), Harmonia-RV-A (integration check bridge conformance)
**Stability:** draft
**Last Updated:** 2026-04-23 (RV Day 0, Pythia-v2 round 2)

## 1. Purpose

Defines the single sanctioned pattern for connecting the Phaser game engine to React HUD state through Zustand stores. The bridge is the only component permitted to cross the Phaser to React boundary. React components never call Phaser scene methods directly. Phaser scenes never touch React component state directly. The rule is absolute because the rendering lifecycles (React reconciler vs Phaser update loop) desynchronize silently when mixed, and because the vertical-slice timeline cannot afford debugging that class of bug.

Stack lock: Zustand with `subscribeWithSelector` middleware. No Redux, no MobX, no Jotai, no Valtio, no custom pub/sub on top. Phaser 3 `game.events` for the event side. React 18 plus 19 Strict Mode compatibility mandatory.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 9 modular contract discipline, Section 10 parallel execution)
- `CLAUDE.md` (root)
- `_meta/RV_PLAN.md` (RV.1 game pivot with Phaser primary)
- `docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md` (Section 5.1 SSR sandwich, 5.2 mount lifecycle, 5.4 bridge module, 5.5 TypeScript strict compat, 7 cross-cutting bridge contract)
- `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` (Section 4.4 Thalia-v2, Section 4.5 Erato-v2)
- `docs/contracts/game_state.contract.md` (store shapes this bridge subscribes to)
- `docs/contracts/game_event_bus.contract.md` (events this bridge wires)
- `docs/contracts/quest_schema.contract.md` (questStore trigger semantics)
- `docs/contracts/dialogue_schema.contract.md` (dialogueStore reducer handoff)

## 3. Schema Definition

```typescript
// src/state/gameBridge.ts

import type Phaser from 'phaser';
import type { GameEventBus } from '@/state/GameEventBus';

export interface GameBridge {
  /** Wired Phaser.Game reference. */
  game: Phaser.Game;
  /** Typed wrapper over `game.events`. */
  bus: GameEventBus;
  /** Returns unsubscribe for every wiring registered by this bridge. */
  teardown: () => void;
}

export interface BridgeWiring {
  /** Map of Phaser-emitted topic to Zustand store action invocation. */
  phaserToStore: PhaserToStoreMapping[];
  /** Map of Zustand selector to Phaser event emission. */
  storeToPhaser: StoreToPhaserMapping<any>[];
}

export interface PhaserToStoreMapping {
  topic: string;                                   // GameEventTopic
  storeAction: string;                              // human-readable label for tooling plus tests
  handler: (payload: unknown) => void;
}

export interface StoreToPhaserMapping<TStore> {
  storeLabel: string;                               // 'quest', 'dialogue', 'inventory', 'ui', 'audio'
  selector: (state: TStore) => unknown;
  topic: string;                                   // GameEventTopic emitted when selected slice changes
  mapToPayload: (next: unknown, previous: unknown) => unknown;
  fireImmediately: boolean;                         // default false per convention
}
```

The `fireImmediately` flag defaults to `false`. Setting `true` is permitted only when the subscriber explicitly needs to reconcile initial state at mount (for example, a newly spawned scene that needs to know the current active quest on boot). The contract requires a code comment at every `fireImmediately: true` site explaining why immediate fire is needed; absence is a review-block condition.

## 4. Interface / API Contract

```typescript
// src/state/gameBridge.ts

import { attachBusTo } from '@/state/GameEventBus';
import { useQuestStore, useDialogueStore, useInventoryStore, useUIStore, useAudioStore } from '@/state/stores';

export function wireBridge(game: Phaser.Game): GameBridge {
  const bus = attachBusTo(game);
  const disposers: Array<() => void> = [];

  // --- Phaser to Store wiring ---

  disposers.push(bus.on('game.npc.interact', (payload) => {
    useQuestStore.getState().fireTrigger({ type: 'npc_interact', npcId: payload.npcId });
  }));

  disposers.push(bus.on('game.cinematic.complete', (payload) => {
    useQuestStore.getState().fireTrigger({ type: 'cinematic_complete', key: payload.key });
    useUIStore.getState().endCinematic();
  }));

  disposers.push(bus.on('game.zone.entered', (payload) => {
    useQuestStore.getState().fireTrigger({ type: 'zone_enter', zoneId: payload.zoneId });
  }));

  disposers.push(bus.on('game.npc.nearby', (payload) => {
    useUIStore.getState().setInteractPrompt(true, `Press E to talk to ${payload.npcId}`);
  }));

  disposers.push(bus.on('game.npc.far', () => {
    useUIStore.getState().setInteractPrompt(false);
  }));

  // --- Store to Phaser wiring ---

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
      (s) => s.unlockedWorlds,
      (next, prev) => {
        const added = next.filter((w) => !prev.includes(w));
        added.forEach((worldId) => bus.emit('game.world.unlocked', { worldId }));
      },
      { fireImmediately: false },
    ),
  );

  disposers.push(
    useUIStore.subscribe(
      (s) => s.cinematicPlaying,
      (next) => {
        bus.emit(next ? 'game.cinematic.start' : 'game.cinematic.abort', {
          key: useUIStore.getState().cinematicKey ?? 'unknown',
          reason: 'ui_state_change',
        } as never);
      },
      { fireImmediately: false },
    ),
  );

  // --- Registry handoff so scenes can retrieve the bus ---

  game.registry.set('gameEventBus', bus);

  return {
    game,
    bus,
    teardown: () => {
      disposers.forEach((fn) => fn());
      game.registry.remove('gameEventBus');
    },
  };
}
```

- Each subscription returned by `store.subscribe(selector, cb, options)` is pushed to `disposers`. Every `bus.on` returns an unsubscribe that also joins `disposers`. `teardown` calls every disposer exactly once.
- Phaser scenes pull the bus via `this.game.registry.get('gameEventBus')` when they need to emit or subscribe from inside scene code. Scenes also use `useQuestStore.getState()` for synchronous reads and `useQuestStore.subscribe(selector, cb)` for reactive reads, with cleanup bound to `Phaser.Scenes.Events.SHUTDOWN`:

```typescript
export class WorldScene extends Phaser.Scene {
  private unsubscribers: Array<() => void> = [];

  create() {
    const unsub = useQuestStore.subscribe(
      (s) => s.activeQuests,
      (next) => {
        this.updateQuestMarkers(next);
      },
      { fireImmediately: true },   // we want current state on scene create
    );
    this.unsubscribers.push(unsub);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribers.forEach((fn) => fn());
      this.unsubscribers = [];
    });
  }
}
```

- React HUD components use narrow selectors:

```typescript
const activeQuests = useQuestStore((s) => s.activeQuests);
// multi-field selection uses useShallow
import { useShallow } from 'zustand/react/shallow';
const { overlay, interactPromptVisible } = useUIStore(
  useShallow((s) => ({ overlay: s.overlay, interactPromptVisible: s.interactPromptVisible })),
);
```

- React components never `import Phaser from 'phaser'` at module top level. The Phaser import lives only inside the dynamically imported `PhaserCanvas.tsx` per `next/dynamic({ ssr: false })` per M1 Section 5.1.

## 5. Event Signatures

This contract does not define new event topics; every topic lives in `game_event_bus.contract.md`. The bridge is strictly the wire layer. New topic additions go through a contract bump on the bus contract, not this one.

## 6. File Path Convention

- Bridge implementation: `src/state/gameBridge.ts` (client-side, `"use client"` at top)
- Bridge wiring map (optional factoring, when the wiring list grows past 30): `src/state/gameBridge.wiring.ts`
- SSR safety: bridge module is imported only from `PhaserCanvas.tsx`, never from Server Components or shared layout files.
- Tests: `src/state/__tests__/gameBridge.test.ts`
- Storybook mock: `src/state/__mocks__/gameBridge.mock.ts` (for React HUD Storybook that does not spin up Phaser)

## 7. Naming Convention

- Hook names follow `game_state.contract.md`: `useQuestStore`, `useDialogueStore`, `useInventoryStore`, `useUIStore`, `useAudioStore`.
- Bridge API: `wireBridge`, `GameBridge`, `BridgeWiring`, `PhaserToStoreMapping`, `StoreToPhaserMapping`.
- Internal disposer array: `disposers`. Internal bus local: `bus`. Store instance labels in mapping descriptors: lowercase single word (`'quest'`, `'dialogue'`, `'inventory'`, `'ui'`, `'audio'`).
- Registry key: `'gameEventBus'`. The `game.registry` entry is read-only after bridge wiring; scenes must not overwrite.

## 8. Error Handling

- `wireBridge` called twice on the same `Phaser.Game` instance: throws `BridgeAlreadyWiredError`. Callers must call `teardown` before rewiring.
- Subscription handler throws: the bus cascade rule in `game_event_bus.contract.md` Section 8 applies. The bridge does not add a second catch layer.
- Zustand subscription handler throws: logged via `console.error` with the `storeLabel` plus topic, swallowed so other subscribers continue.
- `teardown` called twice: second call is idempotent no-op.
- Scene shutdown without `teardown` (game destroyed): bridge disposers run on game `destroy` via a hook registered during `wireBridge`; double-cleanup is safe.
- React Strict Mode double mount: `PhaserCanvas.tsx` guards via `gameRef.current` check per M1 Section 5.2. Bridge is only wired on the surviving mount; the rejected mount's cleanup destroys the throwaway `Phaser.Game` instance which itself tears down that game's bus.
- `fireImmediately: true` used without justification comment: enforced via lint rule that greps for the flag and requires a comment within 3 lines above or on the same line. Pre-commit hook rejects violations.

## 9. Testing Surface

- `wireBridge(game)` subscribes to every declared Phaser topic and every declared store selector; unit test asserts disposer count matches declared mapping count.
- Emit `game.npc.interact` with `npcId: 'apollo'` and assert `useQuestStore.getState().fireTrigger` was called with the correct trigger.
- Mutate `useQuestStore.setState({ activeQuests: [...] })` and assert `game.quest.started` emitted with the new quest id.
- `teardown()` removes every subscription: reassert emit with no response.
- Double `wireBridge` throws `BridgeAlreadyWiredError`.
- Subscription handler that throws does not cascade to another handler on the same topic.
- `fireImmediately: true` usage without justification comment: lint unit test fails against a tampered fixture, passes against real bridge source.
- Scene `create` subscribes, scene `SHUTDOWN` cleanup removes, assert no dangling subscriptions after scene switch.
- React HUD narrow selector renders only when selected slice changes: mount `<QuestTracker />`, mutate an unrelated store field, assert component did not rerender.
- Strict Mode double mount: simulate React effect double invocation, assert only one Phaser game instance persists and bridge is wired once.

## 10. Open Questions

- None blocking v0.1.0. Post-hackathon may introduce selective throttling on the `game.player.moved` to store path if HUD selectors prove to rerender at unwanted frequency; current narrow selectors avoid this.

## 11. Post-Hackathon Refactor Notes

- Add a debug overlay React component subscribing to `*` on the bus and every store subscription with counters (events emitted per second, rerenders per component) for performance tuning.
- Consider splitting the bridge into per-domain wirings (questBridge, dialogueBridge, inventoryBridge, uiBridge, audioBridge) if `gameBridge.ts` exceeds 400 lines.
- Introduce middleware pattern on the bus to tap events for Ananke orchestration log during live play (post-hackathon analytics).
- Add batched emit for high-frequency events (`game.player.moved`) so multiple moves within one frame collapse into a single bus delivery.
- Evaluate migrating the scene-level subscribe plus SHUTDOWN cleanup into a helper hook (`useSceneSubscription`) that Phaser scenes use via a small TypeScript mixin.
- Add a TypeScript eslint rule enforcing "no `phaser` import in files under `src/components/` top level" so regressions of the SSR boundary are caught before CI.
- Post-hackathon consider React 19 `use` compatibility pattern for reading Zustand inside Server Components at hydration boundary (edge case, not in vertical slice).
