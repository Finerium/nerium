---
name: phaser-scene-authoring
description: >
  Author Phaser 3 scenes for NERIUM's top-down 2D RPG vertical slice.
  Covers scene lifecycle, tilemap loading, Arcade physics 8-direction player
  controller, NPC interaction zones, scene transitions, the Phaser-to-Zustand
  bridge pattern, Strict Mode double-mount guard, and Turbopack phaser3spectorjs
  alias. Trigger: "phaser scene", "game scene", "apollo village", "mini builder
  cinematic", "npc interact", "tilemap", "player controller", "scene transition",
  "phaser next.js".
---

<!-- SKILL ORIGIN: https://github.com/chongdashu/phaserjs-oakwoods (phaser-gamedev skill, body reference) -->
<!-- LICENSE: MIT (see _skills_staging/phaserjs-oakwoods/LICENSE) -->
<!-- TRANSPLANTED BY: Talos on 2026-04-23 -->
<!-- ADAPTATION: renamed to phaser-scene-authoring, re-framed for NERIUM's Phaser 3 + Next.js 15 + Zustand bridge architecture (top-down 32x32 tilemap, React HUD boundary, Strict Mode guard). Reference files (arcade-physics, tilemaps, performance, spritesheets-nineslice) copied verbatim from upstream. -->

# Phaser Scene Authoring (NERIUM RV)

Author Phaser 3 scenes that render the 2D top-down world layer of NERIUM while staying inside the React HUD render boundary.

---

## NERIUM Architecture Invariants

Before authoring any scene, the following are locked by V4 and Metis-v2. Do not re-litigate in a scene file. Refer the user to V4 if you believe the decision should change.

1. **Phaser 3 only.** Phaser 4 beta is rejected. Pinned to `^3.90.0` in `package.json`.
2. **Scene is the world, not the UI.** The Phaser canvas renders the tilemap, player, NPCs, zones, cinematics, particles, and world-space labels. Everything else (HUD, dialog, shop, prompt input, currency, inventory toast, agent structure editor) lives in React under `src/components/hud/`.
3. **Bridge via Zustand.** Scenes emit on `game.events`; a top-level React `BusBridge` component forwards to Zustand actions. Scenes consume Zustand via `useGameStore.getState()` or `.subscribe()`, never by importing React components.
4. **Dynamic import with `ssr: false`.** Phaser touches `window` synchronously; it must only load inside a Client Component dynamically imported from a Client wrapper. Server Components never import anything that reaches Phaser.
5. **Turbopack alias for `phaser3spectorjs`.** Configured in `next.config.ts`. If a new error mentions that module, do not install it; inspect the alias first.
6. **Strict Mode guard.** `PhaserCanvas` uses `gameRef.current` guard in `useEffect` so the React 18/19 double-mount does not create two game instances. Do not disable `reactStrictMode` globally.

---

## NERIUM Scene Roster (vertical slice)

Per M2 Section 4.4 (Thalia-v2 owner) and M1 Section 3.6.

```
scenes/
|-- BootScene.ts             // initial config, load asset-pack JSON
|-- PreloadScene.ts          // consume boot-asset-pack + preload-asset-pack JSON
|-- ApolloVillageScene.ts    // main lobby, Apollo NPC zone, caravan gated on quest state
|-- MiniBuilderCinematicScene.ts   // scripted tween sequence over pre-generated tiles
```

Caravan unlock, Cyberpunk Shanghai, Steampunk Victorian scenes are W2-W3 expansion; do not build them in the first Thalia-v2 session.

---

## Scene Lifecycle Essentials

```typescript
class ApolloVillageScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ApolloVillage' });
  }

  init(data: { spawn?: { x: number; y: number } }) {
    // receive spawn point from caller or default later in create()
  }

  preload() {
    // only textures unique to this scene; shared atlas is in PreloadScene
  }

  create() {
    // tilemap, player, NPC zones, camera
    this.game.events.emit('scene:ready', this.scene.key);
  }

  update(_time: number, delta: number) {
    // frame-rate independent motion: use delta / 1000 for seconds
  }

  // Critical: clean up subscriptions on shutdown
  // See the zustand-bridge skill for the cleanup pattern
}
```

### Frame-rate Independence

```typescript
// CORRECT: scales with frame rate
this.player.x += this.speed * (delta / 1000);

// WRONG: varies with frame rate
this.player.x += this.speed;
```

---

## Top-Down 8-Direction Player Controller (Apollo Village)

Arcade physics without gravity. Cursor keys for movement, `E` for interact.

```typescript
class Player extends Phaser.Physics.Arcade.Sprite {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private speed = 160;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player-apollo-village');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);

    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('Keyboard plugin unavailable');
    this.cursors = keyboard.createCursorKeys();
  }

  update() {
    const vx = (this.cursors.left?.isDown ? -1 : 0) + (this.cursors.right?.isDown ? 1 : 0);
    const vy = (this.cursors.up?.isDown ? -1 : 0) + (this.cursors.down?.isDown ? 1 : 0);
    this.setVelocity(vx * this.speed, vy * this.speed);
  }
}
```

- `physics.arcade.gravity: { x: 0, y: 0 }` in `next.config` game config.
- Hitbox default works for 32x32 sprites; override via `body.setSize` if needed.

---

## NPC Interaction Zone Pattern

Emit `npc:nearby` and `npc:interact` events. React HUD owns the "Press E" indicator and the dialogue overlay.

```typescript
class NPC extends Phaser.Physics.Arcade.Sprite {
  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, public npcId: string) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setImmovable(true);

    const zone = scene.add.zone(x, y, 48, 48);
    scene.physics.add.existing(zone);
    scene.physics.add.overlap(zone, scene.children.getByName('player') as Phaser.GameObjects.GameObject, () => {
      scene.game.events.emit('npc:nearby', { npcId });
    });

    const keyboard = scene.input.keyboard;
    if (!keyboard) return;
    keyboard.on('keydown-E', () => {
      scene.game.events.emit('npc:interact', { npcId });
    });
  }
}
```

Rules:
- Overlap zone larger than sprite so the interact prompt appears before contact.
- Never render dialogue text directly on the canvas. Emit `npc:interact`, let React handle the overlay.
- Deregister `keydown-E` listeners on scene shutdown to prevent leaks across scenes.

---

## Scene Transitions

```typescript
this.scene.start('MiniBuilderCinematic', { questId: 'lumio_onboarding' });
this.scene.launch('UI');        // run in parallel (rarely needed; React HUD replaces UIScene)
this.scene.pause('ApolloVillage');
this.scene.stop('ApolloVillage');
```

NERIUM does not use parallel UIScene because the HUD is React. `scene.launch` is reserved for pure-Phaser overlays like the mini Builder cinematic.

---

## Asset Pack Manifest Pattern

Two Phaser asset packs keep the load deterministic.

```
public/assets/packs/boot-asset-pack.json   // logo, loading-bar frame
public/assets/packs/preload-asset-pack.json // tilesets, player, NPCs, audio cues
```

BootScene loads `boot-asset-pack.json` via `this.load.pack('boot', '/assets/packs/boot-asset-pack.json')`. PreloadScene reads `preload-asset-pack.json` and shows a progress UI. This pattern is inherited from `chongdashu/phaserjs-oakwoods` and `phaserjs/template-nextjs`.

Talos ships `public/assets/assets.json` with sprite/tile metadata; PreloadScene can read it from `this.registry` after BootScene stores it.

---

## Reference Files (read on demand)

The upstream `phaser-gamedev` skill ships four deep references, reused verbatim. Load only when the task lands in the relevant domain.

| When working on... | Read first |
|---|---|
| Loading spritesheets or nine-slice UI panels | [spritesheets-nineslice.md](references/spritesheets-nineslice.md) |
| Tiled tilemaps, collision layers | [tilemaps.md](references/tilemaps.md) |
| Physics tuning, groups, pooling | [arcade-physics.md](references/arcade-physics.md) |
| Performance tuning, object pooling | [performance.md](references/performance.md) |

NERIUM note: the references describe an infinite-ground platformer. Apollo Village is a top-down overworld. Ignore gravity-and-jump-arc sections; keep the Arcade physics setup, tilemap loading, and pooling patterns.

---

## Anti-Patterns (NERIUM-specific)

| Anti-Pattern | Problem | Solution |
|---|---|---|
| Importing Phaser in a Server Component | "window is not defined" at build | Dynamic import with `ssr: false` from a Client wrapper |
| Rendering HUD inside Phaser | Loses Tailwind tokens, next-intl, a11y | React HUD; Phaser emits events only |
| Disabling `reactStrictMode` globally | Masks real double-mount bugs | Use `gameRef.current` guard in useEffect |
| Installing `phaser3spectorjs` | Runtime dep you never needed | Alias it in next.config.ts instead |
| Direct Zustand import inside Phaser scene | Creates import cycle risk | Pull via `useGameStore.getState()`, subscribe with SHUTDOWN cleanup |
| Loading in `create()` | Assets not ready at scene start | Load in `preload()` or the shared PreloadScene |
| Frame counting | Speed varies with FPS | `delta / 1000` |

---

## Closing

Phaser gives you scenes, sprites, physics, input. Architecture is yours. Scene structure, event names, and asset pack layouts must match the contracts under `docs/contracts/event_bus.contract.md` (check the NERIUM repo for the canonical filename; the RV phase renamed it to `game_event_bus.contract.md`) and `docs/contracts/game_state.contract.md`.

Before authoring: which scene key, which assets, which Zustand actions fire from which events.
