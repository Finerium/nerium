---
name: zustand-bridge
description: >
  Wire the Phaser-to-React and React-to-Phaser communication layer for NERIUM
  via Zustand with subscribeWithSelector. Covers the single useGameStore shape,
  the lib/gameBridge.ts module, scene SHUTDOWN cleanup, narrow React HUD
  selectors, and the BusBridge top-level forwarding component. Trigger: "zustand
  store", "bridge", "HUD state", "react phaser bridge", "game bridge",
  "subscribeWithSelector", "narrow selector", "store slice".
---

<!-- SKILL ORIGIN: fresh authoring by Talos based on M1 Section 5.4 (Zustand bridge module) plus Section 7 cross-cutting decision on bridge contract. -->
<!-- LICENSE: original_mit (governed by NERIUM repo LICENSE) -->
<!-- TRANSPLANTED BY: Talos on 2026-04-23 -->
<!-- ADAPTATION: NERIUM uses one Zustand store per domain (game, quest, dialogue, inventory, ui, audio) all using subscribeWithSelector. The game event bus (Phaser game.events) is the ONLY inter-layer channel. Contracts: zustand_bridge.contract.md, game_state.contract.md, game_event_bus.contract.md. -->

# Zustand Bridge (NERIUM RV)

One bridge pattern that keeps Phaser rendering the world, React rendering the HUD, and Zustand holding the shared truth between them.

---

## When to Invoke This Skill

- creating a new Zustand store under `src/stores/`
- wiring a new Phaser scene event into React-visible state
- adding a new React HUD component that reads game state
- diagnosing a store update that does not re-render the HUD
- writing a scene `SHUTDOWN` cleanup for subscriptions
- authoring the `BusBridge` forwarding React component

---

## NERIUM Locks

Per M1 Section 5.4 and Section 7 cross-cutting decisions:

1. **Zustand only.** No Redux, no Jotai, no MobX. Tech stack locked.
2. **subscribeWithSelector always.** Every store uses the middleware; narrow selectors are how React HUD components avoid wasted renders.
3. **Phaser emits, Zustand stores, React renders.** This is the ordering. Reversing the flow (React calling Phaser directly, or a scene importing a React component) is forbidden.
4. **Bridge module is `src/lib/gameBridge.ts`.** The single file wires `game.events` to store actions and vice versa. No other file should call `game.events.on/off` from outside a scene.
5. **Narrow selectors for HUD.** `useGameStore((s) => s.hp)` not `useGameStore((s) => s)`. Use `useShallow` when selecting multiple fields.
6. **Cleanup on SHUTDOWN.** Every scene subscription registers in `create()` and unregisters in the `Phaser.Scenes.Events.SHUTDOWN` handler.

---

## Canonical Store Shape

Per Pythia-v2 `game_state.contract.md`. Multiple stores, each focused:

```
src/stores/
|-- gameStore.ts          # currentQuest, hp, player pos, world id
|-- questStore.ts         # activeQuests, completedQuests, stepIndex, fireTrigger
|-- dialogueStore.ts      # activeId, nodeId, vars, streaming
|-- inventoryStore.ts     # slots, lastAwarded, award()
|-- uiStore.ts            # shopOpen, dialogueVisible, language, modelChoice
|-- audioStore.ts         # master, sfx, music, ambient, muted
```

### gameStore template

```typescript
// src/stores/gameStore.ts
'use client';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type NpcId = string;
export type WorldId = 'apollo_village' | 'cyberpunk_shanghai' | 'steampunk_victorian';

export interface GameState {
  currentQuest: string | null;
  prompt: string | null;
  hp: number;
  world: WorldId;
  setPrompt: (text: string | null) => void;
  onNpcInteract: (id: NpcId) => void;
  setQuest: (q: string | null) => void;
  setWorld: (w: WorldId) => void;
}

export const useGameStore = create<GameState>()(
  subscribeWithSelector((set) => ({
    currentQuest: null,
    prompt: null,
    hp: 100,
    world: 'apollo_village',
    setPrompt: (prompt) => set({ prompt }),
    setQuest: (currentQuest) => set({ currentQuest }),
    setWorld: (world) => set({ world }),
    onNpcInteract: (id) => set({ prompt: `Talking to ${id}` }),
  })),
);
```

---

## Bridge Module

```typescript
// src/lib/gameBridge.ts
'use client';
import type Phaser from 'phaser';
import { useGameStore, type NpcId } from '@/stores/gameStore';
import { useQuestStore } from '@/stores/questStore';
import { useDialogueStore } from '@/stores/dialogueStore';

export function wireBridge(game: Phaser.Game): () => void {
  const gameStore = useGameStore;
  const questStore = useQuestStore;
  const dialogueStore = useDialogueStore;

  // Phaser -> Zustand
  const onNpcInteract = ({ npcId }: { npcId: NpcId }) => {
    gameStore.getState().onNpcInteract(npcId);
    questStore.getState().fireTrigger({ type: 'npc_interact', npcId });
  };
  const onCinematicComplete = ({ key }: { key: string }) => {
    questStore.getState().fireTrigger({ type: 'cinematic_complete', key });
  };
  const onSceneReady = ({ sceneKey }: { sceneKey: string }) => {
    // audio cue, quest autostart, etc.
  };

  game.events.on('npc:interact', onNpcInteract);
  game.events.on('cinematic:complete', onCinematicComplete);
  game.events.on('scene:ready', onSceneReady);

  // Zustand -> Phaser
  const unsubQuest = gameStore.subscribe(
    (s) => s.currentQuest,
    (quest, prev) => game.events.emit('quest:changed', { quest, prev }),
    { fireImmediately: false },
  );
  const unsubWorld = gameStore.subscribe(
    (s) => s.world,
    (world) => game.events.emit('world:changed', { world }),
  );

  // Registry is read by scenes that prefer getState access
  game.registry.set('store', gameStore);

  return () => {
    unsubQuest();
    unsubWorld();
    game.events.off('npc:interact', onNpcInteract);
    game.events.off('cinematic:complete', onCinematicComplete);
    game.events.off('scene:ready', onSceneReady);
  };
}
```

`wireBridge` is called once from `PhaserCanvas.tsx` inside the `useEffect` Strict Mode guard; its returned cleanup fires on unmount alongside `game.destroy(true)`.

---

## Inside a Phaser Scene

```typescript
// src/game/scenes/ApolloVillageScene.ts
import Phaser from 'phaser';
import { useGameStore } from '@/stores/gameStore';

export class ApolloVillageScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ApolloVillage' });
  }

  create() {
    // Pull with getState for a one-off read
    const world = useGameStore.getState().world;

    // Subscribe for reactive changes, store the unsub, clean up on SHUTDOWN
    const unsubPrompt = useGameStore.subscribe(
      (s) => s.prompt,
      (prompt) => {
        // react to prompt changes in world-space UI
      },
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubPrompt();
    });

    this.game.events.emit('scene:ready', { sceneKey: this.scene.key });
  }
}
```

Never import React or a React component inside a scene file.

---

## React HUD Narrow Selectors

```tsx
// src/components/hud/TopBar.tsx
'use client';
import { useGameStore } from '@/stores/gameStore';

export function TopBar() {
  const currentQuest = useGameStore((s) => s.currentQuest);
  const world = useGameStore((s) => s.world);
  return (
    <header className="top-bar">
      <span>Quest: {currentQuest ?? 'none'}</span>
      <span>World: {world}</span>
    </header>
  );
}
```

Rules:
- Always pick the narrowest slice you need. `(s) => s` is banned; it causes a render on every change to any field.
- When you need multiple fields, prefer `useShallow`:

```tsx
import { useShallow } from 'zustand/react/shallow';
const { hp, world } = useGameStore(useShallow((s) => ({ hp: s.hp, world: s.world })));
```

---

## BusBridge Forwarding Component

```tsx
// src/components/BusBridge.tsx
'use client';
import { useEffect } from 'react';
import { useUI } from '@/stores/uiStore';

/**
 * Top-level translator. Listens on window for custom events that originate in
 * a scene and flips purely React-side UI state (shop open, dialogue visible,
 * etc). Mount once in GameShell.
 */
export function BusBridge(): null {
  const setShopOpen = useUI((s) => s.setShopOpen);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      setShopOpen(true);
    };
    window.addEventListener('shop:open', handler);
    return () => window.removeEventListener('shop:open', handler);
  }, [setShopOpen]);
  return null;
}
```

Most bridging runs via `game.events`, which is easier to type. `window` CustomEvents are a last-resort fallback for UI-only flips.

---

## Anti-Patterns

| Anti-Pattern | Why it breaks | What to do instead |
|---|---|---|
| Store has React imports | Bundles React into game chunk | Stores are pure TS, no JSX |
| Scene imports a React component | Breaks SSR split, creates cycle | Emit an event instead |
| `useGameStore((s) => s)` in HUD | Re-renders on every change | Narrow selector or useShallow |
| No SHUTDOWN cleanup | Subscriptions leak across scenes | `this.events.once(SHUTDOWN, unsub)` |
| Calling `setState` from a subscriber of the same field | Infinite loop | Guard with comparison or use `fireImmediately: false` |
| Two stores mutating each other | Order becomes undefined | Put shared state in one store or drive both via bridge events |

---

## Related Skills

- `phaser-scene-authoring`: emitter side of every bridge event.
- `quest-json-schema`: `fireTrigger` is the quest store's bridge entrypoint.
- `dialogue-tree-authoring`: dialogue store subscription shape.
