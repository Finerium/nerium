//
// src/game/scenes/CaravanForestCrossroadScene.ts
//
// Helios-v2 W3 S6: Caravan Forest Crossroad sub-area scene.
//
// Sub-area part 2 (2-of-7 in S6 batch): an outdoor autumn forest crossroad
// scene reachable from the Caravan Road main scene. The visual stack is the
// AI-generated caravan_forest_crossroad.jpg as the primary scene visual
// (background-only sub-area; the bg paints a wooden directional signpost
// center-frame, mossy boulders right, fallen log right, dirt-path crossroad).
//
// The placement coordinate map authored at
// `_skills_staging/caravan_subarea_placement.md` Section 2 is the contract
// for every `this.add.image(...)` call in this file.
//
// Visual stack (per visual_manifest.contract):
//   Layer 0 (sky_gradient, depth -100): camera-locked dusk gradient bands
//                                       via buildSkyGradient(caravan_road).
//                                       scrollFactor 0.
//   Layer 1 (parallax_bg, depth -50):   caravan_forest_crossroad bg painted
//                                       at (0, 0) origin (0, 0), scrollFactor
//                                       0.3 mild parallax.
//   Layer 3 (world_tiles, depth 0..N):  player only (background-only sub-area
//                                       with bg-baked signpost + boulder +
//                                       log detail). SceneSorter y-sort
//                                       tracks the player.
//   Layer 5 (ambient_fx, depth 500):    autumn-leaf flutter via the
//                                       buildAmbientFx 'leaves' preset
//                                       (DENSEST canopy occlusion feel).
//   Layer 6 (overlay, depth 9000):      autumn_leaves PNG static scattered
//                                       distribution covering full scene.
//
// Day-night overlay: ELIGIBLE per S9 9.3 directive 6 (outdoor forest scene).
// S6 marks eligible; S9 implements the tween.
//
// Entry: spawn player at (704, 720) south-center on dirt path crossroad
// entry from S. Triggered via specific-zone proximity in CaravanRoadScene
// (caravan_rope_bridge area, S6 main-scene patch).
// Exit: walking south past y=770 fade-out + scene.start('CaravanRoad') with
// returnFromSubArea: 'forest_crossroad' so main scene can respawn the
// player at the rope-bridge approach.
//
// Owner: Helios-v2 (W3 S6).
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import type { WorldId } from '../../state/types';
import { Player } from '../objects/Player';
import type { GameEventBus } from '../../state/GameEventBus';
import {
  SceneSorter,
  buildSkyGradient,
  buildAmbientFx,
  DEPTH,
  applyScenePolish,
  type ScenePolishHandle,
} from '../visual';
import { ASSET_KEYS } from '../visual/asset_keys';

interface CaravanForestCrossroadSceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
  from?: string;
}

const WORLD_W = 1408;
const WORLD_H = 800;

const PLAYER_SCALE = 0.18;

const FADE_IN_MS = 500;
const FADE_OUT_MS = 500;
const EXIT_Y_THRESHOLD = 770;

const AUTUMN_LEAVES_DEPTH = 9000;
const AUTUMN_LEAVES_ALPHA = 0.5;

export class CaravanForestCrossroadScene extends Phaser.Scene {
  // Matches CaravanRoadScene's default worldId. See CaravanWayhouseInterior
  // header for rationale.
  private worldId: WorldId = 'medieval_desert';

  private player?: Player;
  private sorter?: SceneSorter;
  private ambientFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private dropShadows: Phaser.GameObjects.Ellipse[] = [];
  private autumnLeavesOverlay?: Phaser.GameObjects.Image;
  private exited = false;
  // Helios-v2 W3 S9 polish bundle handle (Lights2D ambient + autumn-leaves
  // drift; recipe table omits point lights for forest organic feel).
  private scenePolish?: ScenePolishHandle;

  constructor() {
    super({ key: 'CaravanForestCrossroad' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: CaravanForestCrossroadSceneData) {
    if (data.worldId) this.worldId = data.worldId;
    this.exited = false;
  }

  create() {
    const width = WORLD_W;
    const height = WORLD_H;

    // Background fallback color so any unfilled pixel reads cool dusk forest,
    // not the default Phaser gray.
    this.cameras.main.setBackgroundColor('#1c1b2c');
    this.physics.world.setBounds(0, 0, width, height);

    // Cinematic fade-in for entry.
    this.cameras.main.fadeIn(FADE_IN_MS, 0, 0, 0);

    // Layer 0: sky gradient bands camera-locked above bg.
    buildSkyGradient(this, {
      world: 'caravan_road',
      width: this.scale.width,
      height: this.scale.height,
    });

    // Layer 1: AI background painted at (0, 0) covering the full scene.
    const bg = this.add.image(0, 0, ASSET_KEYS.backgrounds.caravan_forest_crossroad);
    bg.setOrigin(0, 0);
    bg.setDisplaySize(width, height);
    bg.setDepth(DEPTH.PARALLAX_BG);
    bg.setScrollFactor(0.3);

    // Layer 3 setup: dynamic y-sort pool. Forest is background-only with
    // bg-baked signpost + boulder + log detail; the sorter just tracks the
    // player + future ambient additions.
    this.sorter = new SceneSorter();

    this.spawnPlayer();

    // Layer 5: autumn leaf flutter (densest canopy occlusion feel per
    // inventory 1.6).
    this.ambientFx = buildAmbientFx(this, { kind: 'leaves' });

    // Helios-v2 W3 S9 polish: outdoor sub-area dusk overlay + leaves drift.
    // Recipe table omits point lights; canopy organic feel preserved.
    this.scenePolish = applyScenePolish(this);

    // Layer 6: autumn_leaves PNG static scattered overlay covering full
    // scene (S3 CaravanRoad pattern).
    this.spawnAutumnLeavesOverlay(width, height);

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

    this.sorter?.tick();

    if (!this.exited && this.player && this.player.y >= EXIT_Y_THRESHOLD) {
      this.triggerExit();
    }
  }

  // ---- Player ----

  private spawnPlayer(): void {
    const spawnX = 704;
    const spawnY = 720;
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

  // ---- Atmospheric overlay (Layer 6 autumn_leaves) ----

  /**
   * Autumn-leaf static scattered distribution overlay covering full scene
   * per S3 CaravanRoad pattern. depth 9000 (above world, below UIScene
   * 10000). Alpha 0.5. S9 may add a drift tween for breeze-like motion.
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

  // ---- Drop shadow helper ----

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

  // ---- Exit transition (south edge) ----

  /**
   * Fade out and start the parent CaravanRoadScene. The scene-start payload
   * carries `returnFromSubArea: 'forest_crossroad'` and respawn coord at
   * the rope-bridge approach so the player visibly returns to where they
   * entered.
   */
  private triggerExit(): void {
    this.exited = true;
    this.cameras.main.fadeOut(FADE_OUT_MS, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('CaravanRoad', {
        worldId: 'medieval_desert',
        spawn: { x: 1180, y: 480 },
        returnFromSubArea: 'forest_crossroad',
      });
    });
  }

  // ---- Camera + cleanup ----

  private configureCamera(worldWidth: number, worldHeight: number) {
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
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
      for (const s of this.dropShadows) {
        try {
          s.destroy();
        } catch (err) {
          console.error('[CaravanForestCrossroadScene] shadow destroy threw', err);
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

      // Helios-v2 W3 S9: dispose Lights2D + day-night + atmospheric overlay.
      try {
        this.scenePolish?.destroy();
      } catch (err) {
        console.error('[CaravanForestCrossroadScene] scenePolish destroy threw', err);
      }
      this.scenePolish = undefined;

      const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
      bus?.emit('game.scene.shutdown', { sceneKey: this.scene.key });
    });
  }
}
