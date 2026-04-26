//
// src/game/scenes/CaravanRoadScene.ts
//
// Helios-v2 W3 S3: Caravan Road main scene full revamp.
//
// VISUAL AUTHORITY SWAP: prior session shipped a procedural SVG / pixel-rect
// composition (paintCaravanRoadGround + paintCaravanCanopy + paintHorizonHaze
// + buildCaravanRoadSprites + buildCactus + buildPalmTree + buildRock +
// stairStepSilhouette + buildParallaxLayer). S3 transitions the scene to
// consume the AI-generated PNG asset bundle shipped at
// `_Reference/ai_generated_assets/` (96 active assets, V6 SHA c74547f).
// The placement coordinate map authored at
// `_skills_staging/caravan_road_placement.md` is the contract for every
// `this.add.image(...)` call in this file.
//
// Visual stack (5-layer per visual_manifest.contract):
//   Layer 0 (sky_gradient, depth -100): camera-locked dusk gradient bands
//                                       via buildSkyGradient(caravan_road).
//                                       scrollFactor 0 so bands stay above
//                                       horizon regardless of camera scroll.
//   Layer 1 (parallax_bg, depth -50):   caravan_road_bg.jpg painted at
//                                       (0, 0) origin (0, 0), scrollFactor
//                                       0.3 mild parallax disambiguation.
//   Layer 2 (ground_tiles, depth -10):  reserved (the AI bg's painted dirt
//                                       road + grass + cobble is a single
//                                       image; no extra paint passes).
//   Layer 3 (world_tiles, depth 0..N):  7 ambient prop PNGs + 1 wayhouse
//                                       filler + 1 caravan vendor NPC +
//                                       player + drop shadows. All go
//                                       through SceneSorter for dynamic
//                                       y-sort via setDepth(sprite.y) per
//                                       Oak-Woods feet-anchor pattern.
//   Layer 4 (above_tiles, depth 100):   reserved (no overhead canopy in S3).
//   Layer 5 (ambient_fx, depth 500):    autumn-leaf flutter via the
//                                       buildAmbientFx 'leaves' preset.
//   Layer 6 (overlay, depth 9000):      autumn_leaves PNG static scattered
//                                       distribution covering full scene.
//
// Drop shadows: each NPC + tall ambient prop is shadow-anchored at
// (sprite.x, sprite.y) via Phaser.GameObjects.Ellipse (alpha 0.30-0.32,
// fill 0x000000). Shadows register with SceneSorter at offset y - 1 so they
// always render one slice below their owning sprite.
//
// NPC idle breathing: caravan_vendor NPC sprite gets a scale tween 1.0 to
// 1.02 over 800ms loop ease Sine.easeInOut per S3 directive item 3.
//
// PRESERVED FROM RV (NON-REGRESSION):
//   - Player spawn + camera follow + setBounds
//   - Caravan arrival zone for quest step 5-7 advance
//   - game.scene.ready, game.player.spawned, game.zone.entered emissions
//   - Cinematic 500ms fade-in via cameras.main.fadeIn(500)
//   - SHUTDOWN cleanup (tweens, emitter, sorter, listeners)
//   - window.__NERIUM_TEST__ Playwright hook
//
// CUTOVER (S3 boundary):
//   - groundPaint.ts symbols removed: paintCaravanRoadGround,
//     paintCaravanCanopy, paintHorizonHaze
//   - spriteTextures.ts symbols removed: buildCaravanRoadSprites,
//     CaravanRoadSpriteKeys
//   - decoration.ts symbols removed: buildCactus, buildPalmTree, buildRock
//   - parallaxLayer.ts symbols removed: buildParallaxLayer,
//     stairStepSilhouette
//   - All procedural pixel composition replaced by AI-asset PNG render.
//
// Owner: Helios-v2 (W3 S3 revamp), Thalia-v2 (RV scaffold).
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import type { WorldId } from '../../state/types';
import { Player } from '../objects/Player';
import { NPC } from '../objects/NPC';
import type { GameEventBus } from '../../state/GameEventBus';
import {
  SceneSorter,
  buildSkyGradient,
  buildAmbientFx,
  DEPTH,
  enableSceneAmbient,
  addPointLight,
  buildDayNightOverlay,
  type PointLightHandle,
  type DayNightHandle,
} from '../visual';
import { ASSET_KEYS } from '../visual/asset_keys';

interface CaravanRoadSceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
  /**
   * Set when the player is returning from a Caravan sub-area scene
   * (Helios-v2 W3 S6). Lets create() respawn the player at the matching
   * sub-area approach instead of the default west-edge spawn coord.
   */
  returnFromSubArea?: 'wayhouse_interior' | 'forest_crossroad' | 'mountain_pass';
}

/**
 * Helios-v2 W3 S6 sub-area entry binding. CaravanRoad has 3 sub-area
 * destinations reachable via E-key proximity on existing main-scene props.
 * Mirrors the ApolloVillage S5 dual-path pattern but without the UI choice
 * prompt: caravan sub-areas are NOT NERIUM-pillar landmarks, so E-key
 * proximity triggers a direct fade transition without a prompt overlay
 * (S6 directive 4 + 5 ambient discoverable secondary entry).
 */
interface SubAreaEntryBinding {
  name: string; // sub-area identifier
  x: number; // anchor coord (main-scene prop center)
  y: number;
  radius: number; // proximity trigger radius (px)
  sceneKey:
    | 'CaravanWayhouseInterior'
    | 'CaravanForestCrossroad'
    | 'CaravanMountainPass';
}

const SUB_AREA_INTERACT_COOLDOWN_MS = 500;

// World dimensions match the caravan_road_bg.jpg native 1408 x 792 with a
// tiny vertical headroom strip (8 px) absorbed by the sky gradient. The
// 32 px tile reference is preserved for compatibility with NPC interact
// radii + Caravan + arrival zone authored against 32 px scale in RV.
const WORLD_W = 1408;
const WORLD_H = 800;
const TILE_PX = 32;

// NPC + player scale per placement map (S2 parity).
const NPC_SCALE_NAMED = 0.18;
const PLAYER_SCALE = 0.18;

// Ambient prop scales per placement map.
const SCALE_WOODEN_WAGON = 0.32;
const SCALE_LANTERN_POST = 0.30;
const SCALE_CAMPFIRE_RING = 0.20;
const SCALE_WOODEN_BARREL = 0.18;
const SCALE_FALLEN_LOG = 0.28;
const SCALE_ROADSIDE_SIGNPOST = 0.20;
const SCALE_CARAVAN_ROPE_BRIDGE = 0.22;
const SCALE_CARAVAN_WAYHOUSE_FILLER = 0.34;

// Idle breathing tween standard (per S3 directive item 3, S2 parity).
const BREATHING_DURATION_MS = 800;
const BREATHING_AMPLITUDE = 1.02;

// autumn_leaves overlay depth + alpha (per directive 4).
const AUTUMN_LEAVES_DEPTH = 9000;
const AUTUMN_LEAVES_ALPHA = 0.5;

// Cinematic fade-in (preserved from RV).
const FADE_IN_MS = 500;

export class CaravanRoadScene extends Phaser.Scene {
  private worldId: WorldId = 'medieval_desert';

  // Active dynamic objects.
  private player?: Player;
  private caravanVendorNpc?: NPC;
  private arrivalZone?: Phaser.GameObjects.Zone;
  private arrivalEmitted = false;
  private unsubscribers: Array<() => void> = [];

  // Visual revamp state.
  private sorter?: SceneSorter;
  private ambientFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private idleBreathingTweens: Phaser.Tweens.Tween[] = [];
  private dropShadows: Phaser.GameObjects.Ellipse[] = [];
  private autumnLeavesOverlay?: Phaser.GameObjects.Image;

  // Helios-v2 W3 S9 Lights2D + day-night state.
  private pointLights: PointLightHandle[] = [];
  private dayNight?: DayNightHandle;

  // Helios-v2 W3 S6 sub-area entry state.
  private subAreaBindings: SubAreaEntryBinding[] = [];
  private eKey?: Phaser.Input.Keyboard.Key;
  private lastSubAreaEmitAt: Record<string, number> = {};
  private subAreaTransitioning = false;
  // Honor incoming S6 sub-area return spawn override.
  private spawnOverride?: { x: number; y: number };

  constructor() {
    super({ key: 'CaravanRoad' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: CaravanRoadSceneData) {
    if (data.worldId) this.worldId = data.worldId;
    if (data.spawn) {
      this.spawnOverride = { x: data.spawn.x, y: data.spawn.y };
    } else {
      this.spawnOverride = undefined;
    }
    this.subAreaTransitioning = false;
  }

  create() {
    const width = WORLD_W;
    const height = WORLD_H;

    // Background fallback color so any unfilled pixel reads cool dusk, not
    // the default Phaser gray.
    this.cameras.main.setBackgroundColor('#1c1b2c');
    this.physics.world.setBounds(0, 0, width, height);

    // Cinematic fade-in (preserved from RV)
    this.cameras.main.fadeIn(FADE_IN_MS, 0, 0, 0);

    // Layer 0: sky gradient bands camera-locked above bg.
    buildSkyGradient(this, {
      world: 'caravan_road',
      width: this.scale.width,
      height: this.scale.height,
    });

    // Layer 1: AI background painted at (0, 0) covering the full scene.
    // setOrigin(0, 0) so x,y references the top-left corner.
    const bg = this.add.image(0, 0, ASSET_KEYS.backgrounds.caravan_road_bg);
    bg.setOrigin(0, 0);
    bg.setDisplaySize(width, height);
    bg.setDepth(DEPTH.PARALLAX_BG);
    bg.setScrollFactor(0.3);

    // Layer 3 setup: register the per-frame y-sort pool for every dynamic
    // sprite (player + NPC + ambient props + wayhouse filler + drop shadows).
    // Sorter.tick() runs in update() to recompute setDepth.
    this.sorter = new SceneSorter();

    // Spawn order: ambient props + wayhouse filler first (background props),
    // then NPC + player on top so creation order does not shadow y-sort.
    this.spawnAmbientProps();
    this.spawnWayhouseFiller();
    this.spawnPlayer();
    this.spawnCaravanVendor();
    this.spawnArrivalZone();

    // Layer 5: ambient FX particle emitter (autumn leaves flutter).
    this.ambientFx = buildAmbientFx(this, { kind: 'leaves' });

    // Layer 6: autumn_leaves PNG static overlay covering full scene.
    // Per directive 4: S3 ships baseline overlay; S9 polishes drift tween.
    this.spawnAutumnLeavesOverlay(width, height);

    // Helios-v2 W3 S9: enable Lights2D ambient (caravan cool 0x2a3045) +
    // place 3 hero point lights per placement map Lights2D coord MARKS:
    //   - lantern_post_lamp (920, 480) flameAmber 0xff8844 r=80 i=0.4
    //   - campfire_ring_flame (660, 560) flameOrange 0xff5020 r=100 i=0.6
    //   - wayhouse_lit_window (520, 380) flameAmber 0xff8844 r=60 i=0.4
    enableSceneAmbient(this);
    this.pointLights.push(
      addPointLight(this, {
        x: 920,
        y: 480,
        radius: 100,
        color: 0xff8844,
        intensity: 0.4,
        tween: { target: 0.7, duration: 200, ease: 'Sine.easeInOut', holdJitterMs: 80 },
      }),
    );
    this.pointLights.push(
      addPointLight(this, {
        x: 660,
        y: 560,
        radius: 140,
        color: 0xff5020,
        intensity: 0.6,
        tween: { target: 0.95, duration: 240, ease: 'Sine.easeInOut', holdJitterMs: 80 },
      }),
    );
    this.pointLights.push(
      addPointLight(this, {
        x: 520,
        y: 380,
        radius: 80,
        color: 0xff8844,
        intensity: 0.4,
        tween: { target: 0.6, duration: 1800, ease: 'Sine.easeInOut' },
      }),
    );

    // Helios-v2 W3 S9 9.3: day-night overlay; caravan road transition reads
    // best at dusk autumn warm.
    this.dayNight = buildDayNightOverlay(this, 'dusk');

    // Helios-v2 W3 S6: register the 3 sub-area entry bindings + bind E-key.
    this.registerSubAreaBindings();
    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.eKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    }

    this.configureCamera(width, height);
    this.registerSceneCleanup();

    const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
    if (bus) {
      bus.emit('game.scene.ready', {
        sceneKey: this.scene.key,
        worldId: this.worldId,
      });
      bus.emit('game.player.spawned', {
        x: this.player?.x ?? 0,
        y: this.player?.y ?? 0,
        sceneKey: this.scene.key,
      });
    } else {
      this.game.events.emit('game.scene.ready', {
        sceneKey: this.scene.key,
        worldId: this.worldId,
      });
    }

    // Expose scene handle to Playwright smoke tests per gotcha 5.
    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>;
      const existing = (w.__NERIUM_TEST__ ?? {}) as Record<string, unknown>;
      w.__NERIUM_TEST__ = {
        ...existing,
        ready: true,
        activeSceneKey: this.scene.key,
        worldId: this.worldId,
      };
    }
  }

  update(time: number, delta: number) {
    this.player?.update(time, delta);
    if (this.player && this.caravanVendorNpc) {
      this.caravanVendorNpc.updateProximity(this.player);
    }

    // Per-frame y-sort across all registered dynamic sprites + drop shadows.
    this.sorter?.tick();

    // Helios-v2 W3 S6: E-key sub-area entry trigger polling.
    this.checkSubAreaInteraction(time);
  }

  // ---- Ambient props (Layer 3, 7 placements per directive) ----

  /**
   * Place 7 ambient prop PNGs across the scene per placement map.
   * Each registers into the sorter for dynamic y-sort. Drop shadows added
   * for props that lack built-in PNG ground shadow.
   *
   * Lights2D coordinate reservations are MARKED in placement map for S9
   * enable; S3 just places sprites + drop shadows.
   */
  private spawnAmbientProps(): void {
    // Wooden wagon (PRIMARY caravan landmark, right cobblestone zone).
    // Anchor for caravan_vendor NPC at (1100, 620).
    this.placeAmbientProp(
      ASSET_KEYS.props.caravan_road.wooden_wagon,
      1180,
      600,
      SCALE_WOODEN_WAGON,
      { sw: 130, sh: 18, alpha: 0.32 },
    );

    // Lantern post (vertical accent flanking right cobblestone path entry).
    // Lights2D coord MARKED for S9: warm amber flameAmber point light.
    this.placeAmbientProp(
      ASSET_KEYS.props.caravan_road.lantern_post,
      920,
      560,
      SCALE_LANTERN_POST,
      { sw: 24, sh: 10, alpha: 0.30 },
    );

    // Campfire ring (cold) at bottom-mid dirt path.
    // Lights2D coord MARKED for S9: warm amber flameOrange + flame particle.
    this.placeAmbientProp(
      ASSET_KEYS.props.caravan_road.campfire_ring,
      660,
      580,
      SCALE_CAMPFIRE_RING,
      { sw: 110, sh: 18, alpha: 0.30 },
    );

    // Wooden barrel (bottom-far-right margin cluster).
    this.placeAmbientProp(
      ASSET_KEYS.props.caravan_road.wooden_barrel,
      1330,
      700,
      SCALE_WOODEN_BARREL,
      { sw: 50, sh: 12, alpha: 0.30 },
    );

    // Fallen log (far-left grass area; horizontal silhouette).
    // Built-in PNG leaf pile shadow at base; no extra Phaser shadow.
    this.placeAmbientProp(
      ASSET_KEYS.props.caravan_road.fallen_log,
      220,
      620,
      SCALE_FALLEN_LOG,
      null,
    );

    // Roadside signpost (far-left grass area top, near player spawn).
    this.placeAmbientProp(
      ASSET_KEYS.props.caravan_road.roadside_signpost,
      90,
      540,
      SCALE_ROADSIDE_SIGNPOST,
      { sw: 22, sh: 8, alpha: 0.30 },
    );

    // Caravan rope bridge (far-right grass top; small-scale scenic accent).
    // Built-in PNG cliff base shadow; no extra Phaser shadow.
    this.placeAmbientProp(
      ASSET_KEYS.props.caravan_road.caravan_rope_bridge,
      1280,
      380,
      SCALE_CARAVAN_ROPE_BRIDGE,
      null,
    );
  }

  private placeAmbientProp(
    textureKey: string,
    x: number,
    y: number,
    scale: number,
    shadow: { sw: number; sh: number; alpha: number } | null,
  ): void {
    const sprite = this.add.image(x, y, textureKey);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(scale);
    this.sorter?.register(sprite);

    if (shadow) {
      const dropShadow = this.add.ellipse(
        x,
        y,
        shadow.sw,
        shadow.sh,
        0x000000,
        shadow.alpha,
      );
      this.dropShadows.push(dropShadow);
      this.sorter?.register({
        y: y - 1,
        setDepth: (v) => dropShadow.setDepth(v),
      });
    }
  }

  // ---- Wayhouse filler (Layer 3 structural anchor) ----

  /**
   * Caravan wayhouse filler at mid-left. Sits adjacent to bg's painted
   * maple tree (south-west of tree). Lights2D coord MARKED for S9:
   * warm amber point at lit window position (520, 380).
   */
  private spawnWayhouseFiller(): void {
    const x = 440;
    const y = 480;
    const sprite = this.add.image(
      x,
      y,
      ASSET_KEYS.props.caravan_road.caravan_wayhouse_filler,
    );
    sprite.setOrigin(0.5, 1);
    sprite.setScale(SCALE_CARAVAN_WAYHOUSE_FILLER);
    this.sorter?.register(sprite);

    const dropShadow = this.add.ellipse(x, y, 150, 18, 0x000000, 0.32);
    this.dropShadows.push(dropShadow);
    this.sorter?.register({
      y: y - 1,
      setDepth: (v) => dropShadow.setDepth(v),
    });
  }

  // ---- Player + Caravan Vendor NPC ----

  private spawnPlayer(): void {
    // Helios-v2 W3 S6 sub-area roundtrip: if the player is returning from a
    // sub-area scene the spawn coord is the matching sub-area approach,
    // otherwise the default west-edge journey-start.
    const spawnX = this.spawnOverride?.x ?? 96;
    const spawnY = this.spawnOverride?.y ?? 480;
    this.player = new Player(this, spawnX, spawnY, {
      textureKey: ASSET_KEYS.characters.player_spritesheet,
      frame: 0,
      speed: 130,
      spriteScale: PLAYER_SCALE,
      groundAnchor: true,
      hitboxSize: 28,
    });
    this.sorter?.register(this.player);
    this.attachDropShadow(this.player, 36, 8, 0.30);
  }

  private spawnCaravanVendor(): void {
    // Caravan Vendor NPC stands beside the wagon at (1180, 600).
    // Inventory 2.6: warm-palette character at 64-96px reads as "wandering
    // merchant at his caravan".
    const vendorX = 1100;
    const vendorY = 620;
    this.caravanVendorNpc = new NPC(this, vendorX, vendorY, {
      npcId: 'caravan_vendor',
      displayName: 'Caravan Vendor',
      textureKey: ASSET_KEYS.characters.caravan_vendor,
      interactRadius: 48,
      spriteScale: NPC_SCALE_NAMED,
      groundAnchor: true,
    });
    this.sorter?.register(this.caravanVendorNpc);
    this.attachDropShadow(this.caravanVendorNpc, 32, 7, 0.30);
    this.startBreathingTween(this.caravanVendorNpc);
  }

  // ---- Arrival zone (quest step 5-7 trigger preserved from RV) ----

  private spawnArrivalZone(): void {
    // East edge of world on dirt path at player y altitude.
    const zoneX = 1344;
    const zoneY = 480;
    const zoneWidth = 3 * TILE_PX;
    const zoneHeight = 4 * TILE_PX;
    const zone = this.add.zone(zoneX, zoneY, zoneWidth, zoneHeight);
    this.physics.add.existing(zone, true);
    this.arrivalZone = zone;
    if (this.player) {
      this.physics.add.overlap(this.player, zone, () => {
        if (this.arrivalEmitted) return;
        this.arrivalEmitted = true;
        const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
        const payload = {
          zoneId: 'caravan_road_arrival_zone',
          sceneKey: this.scene.key,
        };
        if (bus) {
          bus.emit('game.zone.entered', payload);
        } else {
          this.game.events.emit('game.zone.entered', payload);
        }
      });
    }
  }

  // ---- Sub-area entry bindings (Helios-v2 W3 S6) ----

  /**
   * Register the 3 Caravan sub-area entry bindings. Each binding is a
   * proximity zone anchored on an existing main-scene ambient prop:
   *   - wayhouse_interior: anchored on caravan_wayhouse_filler (440, 480)
   *   - forest_crossroad: anchored on caravan_rope_bridge (1280, 380)
   *   - mountain_pass: anchored east-edge of caravan_rope_bridge (debug-only
   *     for S6, S7 may add a dedicated mountain_pass discovery prompt)
   *
   * Per directive 4 + 5 the entries are NOT NERIUM-pillar landmarks; they
   * trigger a direct fade transition to the sub-area scene without the
   * UI choice prompt overlay used by S5 dual-path landmarks.
   */
  private registerSubAreaBindings(): void {
    this.subAreaBindings = [
      {
        name: 'wayhouse_interior',
        x: 440,
        y: 480,
        radius: 96,
        sceneKey: 'CaravanWayhouseInterior',
      },
      {
        name: 'forest_crossroad',
        x: 1280,
        y: 380,
        radius: 96,
        sceneKey: 'CaravanForestCrossroad',
      },
    ];
    // Mountain Pass entry is debug-only for S6 (no proximity binding).
    // S7 may add a dual-path or dedicated discovery zone.
  }

  /**
   * Per-frame E-key sub-area entry trigger polling. Mirrors the landmark
   * E-key polling pattern from ApolloVillageScene S2 + S5 but emits a
   * direct fade transition instead of a UI event topic. The
   * subAreaTransitioning flag prevents double-fire while the fade is in
   * progress.
   */
  private checkSubAreaInteraction(time: number): void {
    if (!this.player || !this.eKey || this.subAreaTransitioning) return;
    if (!Phaser.Input.Keyboard.JustDown(this.eKey)) return;
    for (const sa of this.subAreaBindings) {
      const dx = this.player.x - sa.x;
      const dy = this.player.y - sa.y;
      const dist = Math.hypot(dx, dy);
      if (dist > sa.radius) continue;
      const last = this.lastSubAreaEmitAt[sa.name] ?? 0;
      if (time - last < SUB_AREA_INTERACT_COOLDOWN_MS) continue;
      this.lastSubAreaEmitAt[sa.name] = time;
      this.triggerSubAreaEntry(sa);
      break;
    }
  }

  /**
   * Fade out and start the bound sub-area scene. The scene-start payload
   * carries `from: 'CaravanRoad'` so the sub-area scene can route exit
   * back here.
   */
  private triggerSubAreaEntry(sa: SubAreaEntryBinding): void {
    this.subAreaTransitioning = true;
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(sa.sceneKey, {
        worldId: 'medieval_desert',
        from: 'CaravanRoad',
      });
    });
  }

  // ---- Atmospheric overlay (Layer 6 autumn_leaves) ----

  /**
   * Autumn-leaf static scattered distribution overlay covering full scene.
   * Per directive 4 (NOT cut V6 unlike Apollo's dust_motes):
   * - depth 9000 (above world, below UIScene 10000)
   * - alpha 0.5 (S9 polishes alpha tween 0.4 to 0.6 over 3s)
   * - displaySize matches world dimensions
   * - origin (0, 0) so coordinates reference top-left corner
   *
   * S9 wire-up: position drift tween left-to-right slow + alpha tween.
   */
  private spawnAutumnLeavesOverlay(worldWidth: number, worldHeight: number): void {
    const overlay = this.add.image(0, 0, ASSET_KEYS.overlays.autumn_leaves);
    overlay.setOrigin(0, 0);
    overlay.setDisplaySize(worldWidth, worldHeight);
    overlay.setAlpha(AUTUMN_LEAVES_ALPHA);
    overlay.setDepth(AUTUMN_LEAVES_DEPTH);
    overlay.setScrollFactor(0.6);
    this.autumnLeavesOverlay = overlay;
  }

  // ---- Drop shadow + breathing tween helpers (S2 parity) ----

  /**
   * Attach a drop shadow ellipse to a moving sprite (player, NPC). The
   * shadow is registered as a YSortable tracking the sprite's y-coordinate
   * minus 1 so it renders one slice below.
   */
  private attachDropShadow(
    sprite: Phaser.Physics.Arcade.Sprite,
    sw: number,
    sh: number,
    alpha: number,
  ): void {
    const shadow = this.add.ellipse(sprite.x, sprite.y, sw, sh, 0x000000, alpha);
    this.dropShadows.push(shadow);
    const wrapper: { y: number; setDepth: (v: number) => unknown } = {
      get y(): number {
        return sprite.y - 1;
      },
      setDepth(this: { y: number; setDepth: (v: number) => unknown }, v: number) {
        shadow.setDepth(v);
        return v;
      },
    } as unknown as { y: number; setDepth: (v: number) => unknown };
    this.sorter?.register(wrapper);

    sprite.on('preupdate', () => {
      shadow.setPosition(sprite.x, sprite.y);
    });
  }

  /**
   * Apply the standard idle breathing tween to a static NPC sprite. Uses
   * sprite's authored scale as the base so the breathing amplitude is
   * proportional to size.
   */
  private startBreathingTween(npc: NPC): void {
    const baseScaleX = npc.scaleX;
    const baseScaleY = npc.scaleY;
    const tween = this.tweens.add({
      targets: npc,
      scaleX: { from: baseScaleX, to: baseScaleX * BREATHING_AMPLITUDE },
      scaleY: { from: baseScaleY, to: baseScaleY * BREATHING_AMPLITUDE },
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      duration: BREATHING_DURATION_MS,
      delay: Math.floor(Math.random() * BREATHING_DURATION_MS),
    });
    this.idleBreathingTweens.push(tween);
  }

  // ---- Camera + cleanup ----

  private configureCamera(worldWidth: number, worldHeight: number) {
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    // S2 parity: camera viewport reveals more of the scene. Lower clamp keeps
    // the AI bg detail readable without over-magnification.
    const zoom = Math.max(1.0, Math.min(1.5, this.scale.width / worldWidth));
    this.cameras.main.setZoom(zoom);
    if (this.player) {
      this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    }

    this.scale.on(Phaser.Scale.Events.RESIZE, (size: Phaser.Structs.Size) => {
      const nextZoom = Math.max(1.0, Math.min(1.5, size.width / worldWidth));
      this.cameras.main.setZoom(nextZoom);
    });
  }

  private registerSceneCleanup() {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const t of this.idleBreathingTweens) {
        try {
          t.stop();
        } catch (err) {
          console.error('[CaravanRoadScene] tween stop threw', err);
        }
      }
      this.idleBreathingTweens = [];

      for (const s of this.dropShadows) {
        try {
          s.destroy();
        } catch (err) {
          console.error('[CaravanRoadScene] shadow destroy threw', err);
        }
      }
      this.dropShadows = [];

      this.autumnLeavesOverlay?.destroy();
      this.autumnLeavesOverlay = undefined;

      this.ambientFx?.stop();
      this.ambientFx?.destroy();
      this.ambientFx = undefined;

      this.sorter?.unregisterAll();
      this.sorter = undefined;

      // Helios-v2 W3 S9: tear down Lights2D point lights + day-night overlay.
      for (const h of this.pointLights) {
        try {
          h.destroy();
        } catch (err) {
          console.error('[CaravanRoadScene] point light destroy threw', err);
        }
      }
      this.pointLights = [];
      try {
        this.dayNight?.destroy();
      } catch (err) {
        console.error('[CaravanRoadScene] day-night destroy threw', err);
      }
      this.dayNight = undefined;

      // Helios-v2 W3 S6: clear sub-area binding state so a fresh scene
      // start (e.g. via fade transition return) starts with no leaked
      // cooldown timers.
      this.subAreaBindings = [];
      this.lastSubAreaEmitAt = {};

      for (const unsub of this.unsubscribers) {
        try {
          unsub();
        } catch (err) {
          console.error('[CaravanRoadScene] subscription cleanup threw', err);
        }
      }
      this.unsubscribers = [];

      const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
      bus?.emit('game.scene.shutdown', { sceneKey: this.scene.key });
    });
  }
}
