//
// src/game/scenes/CyberUndergroundAlleyScene.ts
//
// Helios-v2 W3 S6: Cyber Underground Alley sub-area scene.
//
// Sub-area part 2 (6-of-7 in S6 batch): a narrow back-alley scene reachable
// from the Cyberpunk Shanghai main scene. The visual stack is the
// AI-generated cyber_underground_alley.jpg layered with a Phaser-drawn
// cyber_industrial_pipe.png foreground-left overlay, supplementing the bg's
// painted wall pipes with a pipe-junction silhouette + Lights2D anchor for
// sodium-amber leak (intermittent flicker per directive 5).
//
// The placement coordinate map authored at
// `_skills_staging/cyber_subarea_placement.md` Section 3 is the contract for
// every `this.add.image(...)` call in this file.
//
// Visual stack (per visual_manifest.contract):
//   Layer 0 (sky_gradient, depth -100): SKIP (alley fixed lighting per S6
//                                       directive 6).
//   Layer 1 (parallax_bg, depth -50):   cyber_underground_alley bg painted
//                                       at (0, 0) origin (0, 0), scrollFactor
//                                       0 (interior fixed).
//   Layer 3 (world_tiles, depth 0..N):  industrial_pipe prop overlay + drop
//                                       shadow + player. SceneSorter dynamic
//                                       y-sort.
//   Layer 5 (ambient_fx, depth 500):    neon smog drift via buildAmbientFx
//                                       kind 'neon_smog' (cyan + magenta +
//                                       violet tint).
//   Layer 6 (overlay, depth 9000):      smog_wisps PNG static scattered
//                                       overlay covering full scene.
//
// Day-night overlay: SKIP per S9 9.3 directive 6 (alley interior fixed).
//
// Entry: spawn player at (704, 720) south-center on alley pavement. S6
// ships scene registration only; main-scene wire-up is S7 territory.
// Exit: walking south past y=770 fade-out + scene.start('CyberpunkShanghai')
// with returnFromSubArea: 'underground_alley'.
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
  buildAmbientFx,
  DEPTH,
} from '../visual';
import { ASSET_KEYS } from '../visual/asset_keys';

interface CyberUndergroundAlleySceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
  from?: string;
}

const WORLD_W = 1408;
const WORLD_H = 800;

const SCALE_INDUSTRIAL_PIPE = 0.22;

const PLAYER_SCALE = 0.18;

const FADE_IN_MS = 500;
const FADE_OUT_MS = 500;
const EXIT_Y_THRESHOLD = 770;

const SMOG_WISPS_DEPTH = 9000;
const SMOG_WISPS_ALPHA = 0.5;

export class CyberUndergroundAlleyScene extends Phaser.Scene {
  private worldId: WorldId = 'cyberpunk_shanghai';

  private player?: Player;
  private sorter?: SceneSorter;
  private ambientFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private dropShadows: Phaser.GameObjects.Ellipse[] = [];
  private smogWispsOverlay?: Phaser.GameObjects.Image;
  private exited = false;

  constructor() {
    super({ key: 'CyberUndergroundAlley' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: CyberUndergroundAlleySceneData) {
    if (data.worldId) this.worldId = data.worldId;
    this.exited = false;
  }

  create() {
    const width = WORLD_W;
    const height = WORLD_H;

    // Background fallback color so any unfilled pixel reads dark alley,
    // not the default Phaser gray.
    this.cameras.main.setBackgroundColor('#06060c');
    this.physics.world.setBounds(0, 0, width, height);

    // Cinematic fade-in for entry.
    this.cameras.main.fadeIn(FADE_IN_MS, 0, 0, 0);

    // Layer 1: AI background painted at (0, 0) covering the full scene.
    // Alley fixed lighting; scrollFactor 0 (no parallax illusion).
    const bg = this.add.image(0, 0, ASSET_KEYS.backgrounds.cyber_underground_alley);
    bg.setOrigin(0, 0);
    bg.setDisplaySize(width, height);
    bg.setDepth(DEPTH.PARALLAX_BG);
    bg.setScrollFactor(0);

    // Layer 3 setup: dynamic y-sort pool for player + signature pipe + drop
    // shadow.
    this.sorter = new SceneSorter();

    this.spawnIndustrialPipe();
    this.spawnPlayer();

    // Layer 5: neon smog drift (cyan + magenta + violet tint per inventory
    // 1.10 alley dense urban feel).
    this.ambientFx = buildAmbientFx(this, { kind: 'neon_smog' });

    // Layer 6: smog_wisps PNG static overlay covering full scene.
    this.spawnSmogWispsOverlay(width, height);

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

  // ---- Industrial pipe signature prop (Layer 3) ----

  /**
   * Render the cyber_industrial_pipe PNG at foreground-left (200, 600),
   * supplementing the bg's painted wall pipes with a junction silhouette
   * for visual depth + Lights2D anchor for sodium-amber leak.
   *
   * Lights2D coordinate reservation per placement map Section 5: warm
   * `flameAmber` 0xff9b48 sodium leak at (200, 540), intensity 0.4, radius
   * 60, intermittent flicker 200ms cycle. Steam puff particle reservation.
   */
  private spawnIndustrialPipe(): void {
    const x = 200;
    const y = 600;
    const sprite = this.add.image(x, y, ASSET_KEYS.props.cyberpunk_shanghai.cyber_industrial_pipe);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(SCALE_INDUSTRIAL_PIPE);
    this.sorter?.register(sprite);

    const dropShadow = this.add.ellipse(x, y, 90, 14, 0x000000, 0.30);
    this.dropShadows.push(dropShadow);
    this.sorter?.register({
      y: y - 1,
      setDepth: (v) => dropShadow.setDepth(v),
    });
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

  // ---- Atmospheric overlay (Layer 6 smog_wisps) ----

  private spawnSmogWispsOverlay(worldWidth: number, worldHeight: number): void {
    const overlay = this.add.image(0, 0, ASSET_KEYS.overlays.smog_wisps);
    overlay.setOrigin(0, 0);
    overlay.setDisplaySize(worldWidth, worldHeight);
    overlay.setAlpha(SMOG_WISPS_ALPHA);
    overlay.setDepth(SMOG_WISPS_DEPTH);
    overlay.setScrollFactor(0.6);
    this.smogWispsOverlay = overlay;
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

  private triggerExit(): void {
    this.exited = true;
    this.cameras.main.fadeOut(FADE_OUT_MS, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('CyberpunkShanghai', {
        worldId: 'cyberpunk_shanghai',
        spawn: { x: 704, y: 700 },
        returnFromSubArea: 'underground_alley',
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
          console.error('[CyberUndergroundAlleyScene] shadow destroy threw', err);
        }
      }
      this.dropShadows = [];

      this.smogWispsOverlay?.destroy();
      this.smogWispsOverlay = undefined;

      this.ambientFx?.stop();
      this.ambientFx?.destroy();
      this.ambientFx = undefined;

      this.sorter?.unregisterAll();
      this.sorter = undefined;

      const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
      bus?.emit('game.scene.shutdown', { sceneKey: this.scene.key });
    });
  }
}
