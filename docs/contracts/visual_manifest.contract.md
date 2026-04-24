# Visual Manifest

**Contract Version:** 0.1.0
**Owner Agent(s):** Helios-v2 (scene manifest authority, NPC variant registry, ambient FX config, 5-layer depth schema)
**Consumer Agent(s):** Boreas (UIScene coordination for chat overlay depth), Marshall (treasurer NPC sprite reuse pattern), Nemea-RV-v2 (Playwright scene E2E uses manifest for deterministic load), Talos-v2 (skill transplant reads manifest format), Frontend `/play` route (scene boot loads per manifest)
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the scene manifest JSON format that declares every Phaser 3 scene's assets, 5-layer depth stack, tilemap references, NPC populated set, ambient FX particle emitter config, day-night cycle params, and audio loops. Helios-v2 authors four manifests at NP Wave 3: `apollo_village_manifest.json`, `caravan_road_manifest.json`, `cyberpunk_shanghai_manifest.json`, `steampunk_stub_manifest.json`.

Manifests are schema-validated at BootScene preload; invalid manifest halts boot with clear error. Adaptation from Oak-Woods `assets.json` pattern per M1 Section G.40. Top-down 3/4 JRPG locked; 5-layer depth (sky_gradient -100, parallax_bg -50, ground_tiles -10, world_tiles 0 collision, above_tiles 100 roof/canopy overhang).

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 7 visual + 3-world preference)
- `CLAUDE.md` (root, asset hierarchy CC0 primary + Opus procedural)
- `docs/phase_np/RV_NP_RESEARCH.md` (Sections G.39-G.45)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.21 Helios-v2)
- `docs/contracts/game_state.contract.md` v0.2.0 (currentScene + player state)
- `docs/contracts/quest_schema.contract.md` v0.2.0 (scene_transition trigger)
- `docs/contracts/game_event_bus.contract.md` v0.2.0 (NP event topics)
- `docs/contracts/chat_ui.contract.md` (UIScene depth coordination)

## 3. Schema Definition

### 3.1 Manifest root shape (zod)

```typescript
// src/data/scenes/_schema.ts

import { z } from 'zod';

const LayerRefSchema = z.object({
  key: z.string(),                                       // Tiled layer name or Phaser image key
  kind: z.enum(['sky_gradient', 'parallax_bg', 'ground_tiles', 'world_tiles', 'above_tiles']),
  depth: z.number(),
  scroll_factor: z.object({ x: z.number(), y: z.number() }).optional(),
  alpha: z.number().min(0).max(1).default(1),
  tint: z.string().optional(),                           // hex color
});

const AtlasRefSchema = z.object({
  key: z.string(),
  image_url: z.string(),                                 // /assets/... or R2 URL
  atlas_url: z.string(),                                 // /assets/.../atlas.json
  frame_width: z.number().optional(),                    // for spritesheets
  frame_height: z.number().optional(),
  spacing: z.number().optional(),
  frame_count: z.number().optional(),
});

const NpcVariantSchema = z.object({
  variant_id: z.string(),                                // 'villager', 'merchant', ...
  atlas_key: z.string(),
  anim_prefix: z.string(),                               // 'villager-' -> villager-walk-down, etc.
  flavor_dialogue_pool: z.array(z.string()).min(1).max(15),
  interactable: z.boolean().default(false),
  dialogue_id: z.string().optional(),                    // when interactable
});

const NpcInstanceSchema = z.object({
  instance_id: z.string(),
  variant_id: z.string(),
  x: z.number(),
  y: z.number(),
  wander: z.object({
    enabled: z.boolean(),
    radius_px: z.number().default(128),
    wait_min_ms: z.number().default(2000),
    wait_max_ms: z.number().default(8000),
    speed_px_s: z.number().default(48),
  }).optional(),
});

const AmbientFxSchema = z.object({
  kind: z.enum(['dust', 'leaves', 'rain', 'neon_smog', 'steam', 'gear_spark', 'none']),
  particle_count: z.number().min(0).max(200).default(60),
  alpha_min: z.number().default(0.1),
  alpha_max: z.number().default(0.4),
  drift_speed_px_s: z.number().default(10),
  color_hex: z.string().optional(),
});

const LightingSchema = z.object({
  ambient_color: z.string().default('#ffffff'),
  ambient_alpha: z.number().default(1.0),
  day_night_cycle_s: z.number().default(300),            // 5-min default
  point_lights: z.array(z.object({
    x: z.number(),
    y: z.number(),
    radius: z.number(),
    color: z.string(),
    intensity: z.number().default(1.0),
  })).default([]),
});

const AudioSchema = z.object({
  ambient_loop: z.string().optional(),                   // Howler key
  music_track: z.string().optional(),
  sfx_pool: z.array(z.string()).default([]),
});

export const SceneManifestSchema = z.object({
  scene_key: z.string(),                                 // 'ApolloVillageScene'
  world_id: z.enum(['medieval_desert', 'cyberpunk_shanghai', 'steampunk_victorian', 'caravan_transit']),
  palette: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    ink: z.string(),
  }),
  layers: z.array(LayerRefSchema).min(1),
  atlases: z.array(AtlasRefSchema).default([]),
  tilemap: z.object({
    key: z.string(),
    json_url: z.string(),
    tileset_image_urls: z.record(z.string(), z.string()),
  }),
  npc_variants: z.array(NpcVariantSchema).default([]),
  npc_instances: z.array(NpcInstanceSchema).default([]),
  ambient_fx: AmbientFxSchema.default({ kind: 'none' }),
  lighting: LightingSchema.default({}),
  audio: AudioSchema.default({}),
  quest_hooks: z.array(z.object({
    trigger_type: z.enum(['zone_enter', 'zone_exit', 'npc_interact', 'scene_ready']),
    trigger_params: z.record(z.string(), z.unknown()),
    quest_step_match: z.string(),
  })).default([]),
  version: z.literal(1).default(1),
});

export type SceneManifest = z.infer<typeof SceneManifestSchema>;
```

### 3.2 Phaser config constant

```typescript
// src/game/config.ts

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'nerium-phaser-root',
  backgroundColor: '#0d0b12',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 480,
    height: 270,
  },
  dom: { createContainer: true },                        // REQUIRED for chat_ui.contract.md
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
  scene: [BootScene, PreloadScene, ApolloVillageScene, CaravanRoadScene, CyberpunkShanghaiScene, SteampunkStubScene, UIScene],
};
```

`Scale.RESIZE` with internal 480x270 resolution scaled via integer multiples. `pixelArt: true` preserves crispness.

### 3.3 Depth band constants

```typescript
// src/game/depth.ts

export const DEPTH = {
  SKY_GRADIENT: -100,
  PARALLAX_BG: -50,
  GROUND_TILES: -10,
  WORLD_TILES: 0,                                        // collision baseline
  DYNAMIC_ENTITY_OFFSET: 1,                              // computed as sprite.y + offset in update()
  ABOVE_TILES: 100,
  AMBIENT_FX: 500,
  UI_OVERLAY: 9000,
  DAY_NIGHT_OVERLAY: 9500,
  UI_SCENE: 10000,                                       // chat + HUD
} as const;
```

### 3.4 NPC wander FSM

Per `RV_NP_RESEARCH.md` Section G.45. NPC group not added to inter-NPC collider; only world tile collider. Wander behavior fires state `idle → pick_destination → walk → arrive → idle`.

## 4. Interface / API Contract

### 4.1 Manifest loading at preload

```typescript
// src/game/scenes/PreloadScene.ts

preload() {
  const manifestKey = this.scene.settings.data.manifest_key;
  const manifest = SceneManifestSchema.parse(this.cache.json.get(manifestKey));

  // Load tilemap
  this.load.tilemapTiledJSON(manifest.tilemap.key, manifest.tilemap.json_url);
  for (const [key, url] of Object.entries(manifest.tilemap.tileset_image_urls)) {
    this.load.image(key, url);
  }
  // Load atlases
  for (const atlas of manifest.atlases) {
    if (atlas.atlas_url) {
      this.load.atlas(atlas.key, atlas.image_url, atlas.atlas_url);
    } else if (atlas.frame_width) {
      this.load.spritesheet(atlas.key, atlas.image_url, {
        frameWidth: atlas.frame_width, frameHeight: atlas.frame_height, spacing: atlas.spacing,
      });
    }
  }
  // Load audio
  if (manifest.audio.ambient_loop) {
    this.load.audio(manifest.audio.ambient_loop, [`/audio/${manifest.audio.ambient_loop}.mp3`]);
  }
}
```

### 4.2 Scene create applies manifest

```typescript
// src/game/scenes/ApolloVillageScene.ts

create() {
  this.manifest = SceneManifestSchema.parse(this.cache.json.get('apollo_village_manifest'));

  // Layer stack
  for (const layer of this.manifest.layers) {
    this.buildLayer(layer);                              // creates image, tilemap layer, or gradient
  }
  // NPCs
  for (const inst of this.manifest.npc_instances) {
    const variant = this.manifest.npc_variants.find(v => v.variant_id === inst.variant_id);
    this.spawnNpc(inst, variant);
  }
  // Ambient FX
  this.ambientFx = new AmbientFX(this, this.manifest.ambient_fx);
  // Lighting
  this.lighting = new Lighting(this, this.manifest.lighting);
  // Audio
  if (this.manifest.audio.ambient_loop) {
    useAudioStore.getState().playAmbient(this.manifest.audio.ambient_loop);
  }
  // Quest hooks
  for (const hook of this.manifest.quest_hooks) {
    this.wireQuestHook(hook);
  }
  // Dynamic y-sort in update()
  this.events.on('update', this.ySortDynamicEntities, this);
  // Emit scene ready
  game_event_bus.emit('game.scene.ready', { sceneKey: this.scene.key, worldId: this.manifest.world_id });
}

ySortDynamicEntities() {
  this.dynamicEntities.forEach(e => e.setDepth(e.y + DEPTH.DYNAMIC_ENTITY_OFFSET));
}
```

### 4.3 Scene transition

```typescript
async transitionTo(nextSceneKey: string, payload: Record<string, unknown> = {}) {
  this.cameras.main.fadeOut(500);
  await new Promise(r => this.cameras.main.once('camerafadeoutcomplete', r));
  game_event_bus.emit('game.scene.transition_started', { from: this.scene.key, to: nextSceneKey, durationMs: 500 });
  this.scene.start(nextSceneKey, payload);
  game_event_bus.emit('game.scene.transition_completed', { from: this.scene.key, to: nextSceneKey, durationMs: 500 });
}
```

Triggered by quest effect `scene_transition` per `quest_schema.contract.md` v0.2.0 amendment.

### 4.4 window.__NERIUM__ test hook

```typescript
// Emitted every frame in scene update() for deterministic Playwright assertions
update() {
  window.__NERIUM__ = {
    ready: true,
    scene: this.scene.key,
    playerX: this.player.x,
    playerY: this.player.y,
    facing: this.player.facing,
    chatMode: useGameStore.getState().chatMode,
    activeQuests: useQuestStore.getState().activeQuests.map(q => q.id),
    npcCount: this.npcGroup.getChildren().length,
  };
}
```

Per `RV_NP_RESEARCH.md` Section G.40 Oak-Woods pattern. Enables Nemea-RV-v2 Playwright regression.

### 4.5 Deterministic test mode

Seed `Phaser.Math.RandomDataGenerator` via env var `VITE_TEST_SEED=<int>` during test runs. NPC wander destinations + ambient FX particle spawn use seeded RNG in test mode. Production random.

## 5. Event Signatures

Emitted via `game_event_bus.contract.md` v0.2.0 (amended for NP):

| Topic | Payload | Source |
|---|---|---|
| `game.scene.ready` | `{sceneKey, worldId}` | Scene create |
| `game.scene.transition_started` | `{from, to, durationMs}` | transitionTo() start |
| `game.scene.transition_completed` | `{from, to, durationMs}` | transitionTo() end |
| `game.npc.interact` | `{npcId, variantId, x, y}` | NPC pointer down |
| `game.zone.enter` | `{zoneId, sceneKey}` | Zone body overlap |
| `game.zone.exit` | `{zoneId, sceneKey}` | Zone body overlap end |
| `game.player.facing_changed` | `{from, to}` | Player dir change |

Log events:

| Event | Fields |
|---|---|
| `scene.manifest.loaded` | `sceneKey`, `worldId`, `npc_count`, `atlas_count` |
| `scene.transition.started` | `from`, `to`, `durationMs` |
| `scene.ambient.fx_kind_changed` | `sceneKey`, `kind` |
| `scene.lighting.day_night_tick` | `sceneKey`, `alpha`, `cycle_progress_s` |

## 6. File Path Convention

- Manifest JSON: `src/data/scenes/<scene_key>_manifest.json` (e.g., `apollo_village_manifest.json`).
- Schema: `src/data/scenes/_schema.ts`.
- Scene classes: `src/game/scenes/<SceneName>.ts`.
- NPC object: `src/game/objects/NPC.ts` (shared wander FSM + variant sprite pool).
- Ambient FX: `src/game/objects/AmbientFX.ts`.
- Lighting: `src/game/objects/Lighting.ts`.
- Day-night overlay: `src/game/objects/DayNightOverlay.ts`.
- Y-sort helper: `src/game/util/ySort.ts`.
- Depth constants: `src/game/depth.ts`.
- Game config: `src/game/config.ts`.
- Variants pool: `src/data/npcs/variants.json`.
- Tests: `tests/game/test_manifest_load.spec.ts`, `test_scene_transition.spec.ts`, `test_y_sort.spec.ts`, `test_ambient_npc_wander.spec.ts`, `test_manifest_schema.spec.ts`.

## 7. Naming Convention

- Scene keys: `PascalCaseScene` (`ApolloVillageScene`, `CyberpunkShanghaiScene`).
- World IDs: `snake_case` (`medieval_desert`, `cyberpunk_shanghai`).
- Manifest filename: `<scene_key_lower>_manifest.json`.
- Atlas keys: `snake_case` (`villager_atlas`, `tile_set_desert`).
- Layer kinds: per Section 3.1 enum.
- Depth band constants: `UPPER_SNAKE_CASE`.
- NPC variant ids: `snake_case` (`villager`, `cyborg_guard`, `caravan_vendor`).
- Ambient FX kind: `snake_case` (`neon_smog`, `gear_spark`).

## 8. Error Handling

- Manifest schema validation failure: throw `ManifestValidationError` at PreloadScene, halt boot with zod path + fail fast. Do NOT silently fall back to default scene.
- Asset URL 404: Phaser `load.error` fires; log ERROR, boot halts unless `manifest.audio.ambient_loop` (soft fail, scene continues silent).
- NPC instance references unknown variant_id: log WARN, skip that instance.
- Tilemap JSON missing expected layer name: log WARN, skip layer.
- Zone quest hook with invalid trigger_type: log ERROR + skip; do not halt scene.
- Day-night cycle with invalid `cycle_s`: clamp to [60, 3600]. Log WARN.
- Scene transition to nonexistent scene key: throw immediately (programmer error, not runtime).
- Y-sort on entity without `y` property: skip that entity, log WARN (should not happen with proper NPC/Player classes).
- `dom: createContainer` missing from game config: chat UI fails to mount; detect + throw `DomContainerMissingError` at UIScene create.
- Hot reload during dev: scene teardown on Vite HMR should not leak listeners; `scene.events.off(...)` in `shutdown()` handler.

## 9. Testing Surface

- Manifest parse: valid manifest fixtures pass `SceneManifestSchema.parse`.
- Invalid manifest: missing `scene_key` fails with clear zod path.
- Boot happy path: BootScene → PreloadScene → ApolloVillageScene, window.__NERIUM__.ready becomes true within 3 s.
- Scene transition: `transitionTo('CyberpunkShanghaiScene')`, window.__NERIUM__.scene updates after fade.
- NPC spawn: manifest has 5 instances, scene has 5 NPC game objects.
- NPC wander: seeded RNG with VITE_TEST_SEED=42, NPC destinations deterministic across runs.
- Y-sort correctness: player at y=200 in front of NPC at y=150; reverse positions, NPC in front.
- Depth bands: above_tiles depth 100 renders above player at y=200+1.
- Ambient FX: manifest ambient_fx.kind='dust', 60 dust particles emitted.
- Day-night cycle: overlay alpha tweens from 0 to 0.5 over 300 s (time-scaled in test).
- Quest hook: zone_enter fires `fireTrigger({type: 'zone_enter', zoneId, ...})`.
- Scene shutdown: `scene.start('Other')` triggers `game.scene.shutdown` emit + cleans up listeners.
- Dom container missing: remove from config, mount fails with DomContainerMissingError.
- Asset 404: unreachable tileset URL, boot halts with clear error.

## 10. Open Questions

- Manifest authoring workflow: Helios-v2 hand-writes JSON or Tiled export helper? Recommend Helios-v2 hand-authored JSON for scene+NPC+FX layers, Tiled for tilemap layer only.
- Dynamic manifest fetch (user-generated scenes post-hackathon): out of scope at submission; static imports only.
- Per-world palette drift: enforcement via linting? Recommend visual QA pass by Nemea-RV-v2 for palette cohesion check.

## 11. Post-Hackathon Refactor Notes

- User-authored scene manifests (Marketplace `scene_pack` category).
- Dynamic manifest hot-swap at runtime (live scene editor).
- Manifest versioning v2 with WebGL shader layer addition.
- Animated tilemap layer via Tiled animation.
- Weather system (rain + snow + storm) driven by manifest + weather_api.
- Per-region palette variation within scene (color-graded sub-areas).
- Multi-player scene support (shared manifest + per-client entity positions over WebSocket).
- Procedural manifest generation from text prompt (Builder pillar feeds manifest JSON to scene).
- Scene preview thumbnail auto-generated for Marketplace listing.
- Accessibility: high-contrast mode manifest variants.
