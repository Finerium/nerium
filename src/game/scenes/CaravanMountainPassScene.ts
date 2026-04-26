//
// src/game/scenes/CaravanMountainPassScene.ts
//
// Helios-v2 W3 S6: Caravan Mountain Pass sub-area scene.
//
// Sub-area part 2 (3-of-7 in S6 batch): an outdoor mountain pass scene
// reachable from the Caravan Road main scene. The visual stack is the
// AI-generated caravan_mountain_pass.jpg layered with a Phaser-drawn
// caravan_rope_bridge.png overlay sitting foreground-center above the bg's
// painted bridge for dimensional layering. Player physically traverses by
// walking left-to-right across the bridge plane.
//
// The placement coordinate map authored at
// `_skills_staging/caravan_subarea_placement.md` Section 3 is the contract
// for every `this.add.image(...)` call in this file.
//
// Visual stack (per visual_manifest.contract):
//   Layer 0 (sky_gradient, depth -100): camera-locked dusk gradient bands
//                                       via buildSkyGradient(caravan_road).
//                                       scrollFactor 0.
//   Layer 1 (parallax_bg, depth -50):   caravan_mountain_pass bg painted
//                                       at (0, 0) origin (0, 0), scrollFactor
//                                       0.3 mild parallax.
//   Layer 3 (world_tiles, depth 0..N):  rope_bridge prop overlay + drop
//                                       shadow + player. SceneSorter
//                                       dynamic y-sort.
//   Layer 5 (ambient_fx, depth 500):    LIGHTER warm amber dust drift via
//                                       buildAmbientFx kind 'dust' preset
//                                       (mountain wind dust per inventory
//                                       1.7).
//
// Day-night overlay: ELIGIBLE per S9 9.3 directive 6 (outdoor mountain
// scene). S6 marks eligible; S9 implements the tween.
//
// Entry: spawn player at (220, 580) left-cliff side. Mountain pass uses an
// east-edge exit (not south) because the bg's narrative composition is
// left-to-right journey across the bridge.
// Exit: walking east past x=1370 fade-out + scene.start('CaravanRoad') with
// returnFromSubArea: 'mountain_pass'.
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

interface CaravanMountainPassSceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
  from?: string;
}

const WORLD_W = 1408;
const WORLD_H = 800;

const SCALE_ROPE_BRIDGE = 0.30;

const PLAYER_SCALE = 0.18;

const FADE_IN_MS = 500;
const FADE_OUT_MS = 500;
// East-edge exit: walking past x=1370 triggers fade. Spawn at x=220 means
// the player has 1150 px of bridge crossing before the threshold fires.
const EXIT_X_THRESHOLD = 1370;

export class CaravanMountainPassScene extends Phaser.Scene {
  // Matches CaravanRoadScene's default worldId. See CaravanWayhouseInterior
  // header for rationale.
  private worldId: WorldId = 'medieval_desert';

  private player?: Player;
  private sorter?: SceneSorter;
  private ambientFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private dropShadows: Phaser.GameObjects.Ellipse[] = [];
  private exited = false;
  // Helios-v2 W3 S9 polish bundle handle (cool windswept beacon + night
  // overlay per recipe table for atmospheric mountain feel).
  private scenePolish?: ScenePolishHandle;

  constructor() {
    super({ key: 'CaravanMountainPass' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: CaravanMountainPassSceneData) {
    if (data.worldId) this.worldId = data.worldId;
    this.exited = false;
  }

  create() {
    const width = WORLD_W;
    const height = WORLD_H;

    // Background fallback color so any unfilled pixel reads cool mountain
    // dusk, not the default Phaser gray.
    this.cameras.main.setBackgroundColor('#1c2538');
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
    const bg = this.add.image(0, 0, ASSET_KEYS.backgrounds.caravan_mountain_pass);
    bg.setOrigin(0, 0);
    bg.setDisplaySize(width, height);
    bg.setDepth(DEPTH.PARALLAX_BG);
    bg.setScrollFactor(0.3);

    // Layer 3 setup: dynamic y-sort pool for player + rope bridge prop +
    // drop shadow.
    this.sorter = new SceneSorter();

    this.spawnRopeBridge();
    this.spawnPlayer();

    // Layer 5: lighter warm amber dust drift (mountain wind dust).
    this.ambientFx = buildAmbientFx(this, { kind: 'dust' });

    // Helios-v2 W3 S9 polish: distant cool beacon + night overlay.
    this.scenePolish = applyScenePolish(this);

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

    if (!this.exited && this.player && this.player.x >= EXIT_X_THRESHOLD) {
      this.triggerExit();
    }
  }

  // ---- Rope bridge signature prop (Layer 3) ----

  /**
   * Render the caravan_rope_bridge PNG overlaid foreground-center above the
   * bg's painted bridge at (704, 560). The PNG sits one slice closer to
   * camera than the bg's bridge for dimensional layering. The PNG includes
   * built-in cliff-base shadows so no extra Phaser drop shadow is required;
   * the bridge sits OVER the chasm so a ground ellipse would be unnatural.
   *
   * Lights2D coordinate reservation per placement map Section 4: cool
   * `arcCyan` 0x4ac8ff at each crystal vein on cliff base ((180, 580) +
   * (1230, 590)) intensity 0.3, radius 60, slow pulse 4s.
   */
  private spawnRopeBridge(): void {
    const x = 704;
    const y = 560;
    const sprite = this.add.image(x, y, ASSET_KEYS.props.caravan_road.caravan_rope_bridge);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(SCALE_ROPE_BRIDGE);
    this.sorter?.register(sprite);
  }

  // ---- Player ----

  private spawnPlayer(): void {
    const spawnX = 220;
    const spawnY = 580;
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

  // ---- Exit transition (east edge) ----

  /**
   * Fade out and start the parent CaravanRoadScene. The scene-start payload
   * carries `returnFromSubArea: 'mountain_pass'` and respawn coord at the
   * rope-bridge approach so the player visibly returns to where they
   * entered.
   */
  private triggerExit(): void {
    this.exited = true;
    this.cameras.main.fadeOut(FADE_OUT_MS, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('CaravanRoad', {
        worldId: 'medieval_desert',
        spawn: { x: 1180, y: 460 },
        returnFromSubArea: 'mountain_pass',
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
          console.error('[CaravanMountainPassScene] shadow destroy threw', err);
        }
      }
      this.dropShadows = [];

      this.ambientFx?.stop();
      this.ambientFx?.destroy();
      this.ambientFx = undefined;

      this.sorter?.unregisterAll();
      this.sorter = undefined;

      // Helios-v2 W3 S9: dispose Lights2D + day-night + atmospheric overlay.
      try {
        this.scenePolish?.destroy();
      } catch (err) {
        console.error('[CaravanMountainPassScene] scenePolish destroy threw', err);
      }
      this.scenePolish = undefined;

      const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
      bus?.emit('game.scene.shutdown', { sceneKey: this.scene.key });
    });
  }
}
