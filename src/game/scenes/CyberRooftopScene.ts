//
// src/game/scenes/CyberRooftopScene.ts
//
// Helios-v2 W3 S6: Cyber Rooftop sub-area scene.
//
// Sub-area part 2 (5-of-7 in S6 batch): an outdoor cyberpunk rooftop scene
// reachable from the Cyberpunk Shanghai main scene. The visual stack is the
// AI-generated cyber_rooftop.jpg layered with a Phaser-drawn
// cyber_billboard_closeup.png overlay sitting LEFT-FOREGROUND for variety
// (not duplicating the bg's right-side billboard) so the scene reads as
// "rooftop with two billboard light sources" + adds Lights2D anchor variety.
//
// The placement coordinate map authored at
// `_skills_staging/cyber_subarea_placement.md` Section 2 is the contract for
// every `this.add.image(...)` call in this file.
//
// Visual stack (per visual_manifest.contract):
//   Layer 0 (sky_gradient, depth -100): camera-locked dusk gradient bands
//                                       via buildSkyGradient(cyberpunk_shanghai).
//                                       scrollFactor 0.
//   Layer 1 (parallax_bg, depth -50):   cyber_rooftop bg painted at (0, 0)
//                                       origin (0, 0), scrollFactor 0.3
//                                       mild parallax.
//   Layer 3 (world_tiles, depth 0..N):  billboard prop overlay + drop shadow
//                                       + player. SceneSorter dynamic y-sort.
//   Layer 5 (ambient_fx, depth 500):    rain particle via buildAmbientFx
//                                       kind 'rain' (heavy 60/s preset).
//   Layer 6 (overlay, depth 9000):      smog_wisps PNG static scattered
//                                       overlay covering full scene.
//
// Day-night overlay: ELIGIBLE per S9 9.3 directive 6 (outdoor rooftop scene).
// S6 marks eligible; S9 implements the tween.
//
// Entry: spawn player at (300, 720) south-left near elevator door area. S6
// ships scene registration only; main-scene wire-up is S7 territory.
// Exit: walking south past y=770 fade-out + scene.start('CyberpunkShanghai')
// with returnFromSubArea: 'rooftop'.
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
} from '../visual';
import { ASSET_KEYS } from '../visual/asset_keys';

interface CyberRooftopSceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
  from?: string;
}

const WORLD_W = 1408;
const WORLD_H = 800;

const SCALE_BILLBOARD = 0.25;

const PLAYER_SCALE = 0.18;

const FADE_IN_MS = 500;
const FADE_OUT_MS = 500;
const EXIT_Y_THRESHOLD = 770;

const SMOG_WISPS_DEPTH = 9000;
const SMOG_WISPS_ALPHA = 0.5;

export class CyberRooftopScene extends Phaser.Scene {
  private worldId: WorldId = 'cyberpunk_shanghai';

  private player?: Player;
  private sorter?: SceneSorter;
  private ambientFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private dropShadows: Phaser.GameObjects.Ellipse[] = [];
  private smogWispsOverlay?: Phaser.GameObjects.Image;
  private exited = false;

  constructor() {
    super({ key: 'CyberRooftop' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: CyberRooftopSceneData) {
    if (data.worldId) this.worldId = data.worldId;
    this.exited = false;
  }

  create() {
    const width = WORLD_W;
    const height = WORLD_H;

    // Background fallback color so any unfilled pixel reads cool void rooftop,
    // not the default Phaser gray.
    this.cameras.main.setBackgroundColor('#06060c');
    this.physics.world.setBounds(0, 0, width, height);

    // Cinematic fade-in for entry.
    this.cameras.main.fadeIn(FADE_IN_MS, 0, 0, 0);

    // Layer 0: sky gradient bands camera-locked above bg.
    buildSkyGradient(this, {
      world: 'cyberpunk_shanghai',
      width: this.scale.width,
      height: this.scale.height,
    });

    // Layer 1: AI background painted at (0, 0) covering the full scene.
    const bg = this.add.image(0, 0, ASSET_KEYS.backgrounds.cyber_rooftop);
    bg.setOrigin(0, 0);
    bg.setDisplaySize(width, height);
    bg.setDepth(DEPTH.PARALLAX_BG);
    bg.setScrollFactor(0.3);

    // Layer 3 setup: dynamic y-sort pool for billboard prop + drop shadow +
    // player.
    this.sorter = new SceneSorter();

    this.spawnBillboard();
    this.spawnPlayer();

    // Layer 5: heavy rain particle (60/s default preset).
    this.ambientFx = buildAmbientFx(this, { kind: 'rain' });

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

  // ---- Billboard signature prop (Layer 3) ----

  /**
   * Render the cyber_billboard_closeup PNG at left-foreground (200, 360),
   * supplementing the bg's right-side painted billboard for visual rhythm
   * and Lights2D anchor variety.
   *
   * Lights2D coordinate reservation per placement map Section 5: alternating
   * cyan + magenta `neonCyan`/`neonMagenta` at (200, 240), intensity 0.6,
   * alternating cycle 2s.
   */
  private spawnBillboard(): void {
    const x = 200;
    const y = 360;
    const sprite = this.add.image(x, y, ASSET_KEYS.props.cyberpunk_shanghai.cyber_billboard_closeup);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(SCALE_BILLBOARD);
    this.sorter?.register(sprite);

    const dropShadow = this.add.ellipse(x, y, 80, 14, 0x000000, 0.30);
    this.dropShadows.push(dropShadow);
    this.sorter?.register({
      y: y - 1,
      setDepth: (v) => dropShadow.setDepth(v),
    });
  }

  // ---- Player ----

  private spawnPlayer(): void {
    const spawnX = 300;
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
        spawn: { x: 700, y: 320 },
        returnFromSubArea: 'rooftop',
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
          console.error('[CyberRooftopScene] shadow destroy threw', err);
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
