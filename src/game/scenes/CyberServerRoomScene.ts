//
// src/game/scenes/CyberServerRoomScene.ts
//
// Helios-v2 W3 S6: Cyber Server Room sub-area scene.
//
// Sub-area part 2 (7-of-7 in S6 batch): an interior server room corridor
// scene reachable from the Cyberpunk Shanghai main scene. The visual stack
// is the AI-generated cyber_server_room.jpg layered with two Phaser-drawn
// signature props (cyber_server_rack foreground-left + cyber_data_terminal
// foreground-center) for dimensional layering and Lights2D anchor variety.
//
// The placement coordinate map authored at
// `_skills_staging/cyber_subarea_placement.md` Section 4 is the contract for
// every `this.add.image(...)` call in this file.
//
// Visual stack (per visual_manifest.contract):
//   Layer 0 (sky_gradient, depth -100): SKIP (interior fixed lighting per
//                                       S6 directive 6).
//   Layer 1 (parallax_bg, depth -50):   cyber_server_room bg painted at
//                                       (0, 0) origin (0, 0), scrollFactor
//                                       0 (interior fixed).
//   Layer 3 (world_tiles, depth 0..N):  server_rack + data_terminal props
//                                       + drop shadows + player. SceneSorter
//                                       dynamic y-sort.
//   Layer 5 (ambient_fx, depth 500):    LIGHTER cool dust drift via
//                                       buildAmbientFx kind 'dust' preset
//                                       (server room cyan ambient feel; S9
//                                       may add a cyber_server kind variant
//                                       with cyan-tinted vertical streaks).
//
// Day-night overlay: SKIP per S9 9.3 directive 6 (interior fixed lighting).
//
// Entry: spawn player at (704, 720) south-center on corridor floor. S6
// ships scene registration only; main-scene wire-up is S7 territory:
// dual-path prompt on existing admin_hall_landmark (1260, 760).
// Exit: walking south past y=770 fade-out + scene.start('CyberpunkShanghai')
// with returnFromSubArea: 'server_room'.
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
  applyScenePolish,
  type ScenePolishHandle,
} from '../visual';
import { ASSET_KEYS } from '../visual/asset_keys';

interface CyberServerRoomSceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
  from?: string;
}

const WORLD_W = 1408;
const WORLD_H = 800;

const SCALE_SERVER_RACK = 0.30;
const SCALE_DATA_TERMINAL = 0.26;

const PLAYER_SCALE = 0.18;

const FADE_IN_MS = 500;
const FADE_OUT_MS = 500;
const EXIT_Y_THRESHOLD = 770;

export class CyberServerRoomScene extends Phaser.Scene {
  private worldId: WorldId = 'cyberpunk_shanghai';

  private player?: Player;
  private sorter?: SceneSorter;
  private ambientFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private dropShadows: Phaser.GameObjects.Ellipse[] = [];
  private exited = false;
  // Helios-v2 W3 S9 polish bundle handle (per-rack LED + terminal cyan
  // pulse + smog overlay; day-night SKIP per recipe).
  private scenePolish?: ScenePolishHandle;

  constructor() {
    super({ key: 'CyberServerRoom' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: CyberServerRoomSceneData) {
    if (data.worldId) this.worldId = data.worldId;
    this.exited = false;
  }

  create() {
    const width = WORLD_W;
    const height = WORLD_H;

    // Background fallback color so any unfilled pixel reads cool server
    // ambient cyan, not the default Phaser gray.
    this.cameras.main.setBackgroundColor('#0c2236');
    this.physics.world.setBounds(0, 0, width, height);

    // Cinematic fade-in for entry.
    this.cameras.main.fadeIn(FADE_IN_MS, 0, 0, 0);

    // Layer 1: AI background painted at (0, 0) covering the full scene.
    // Server room interior; scrollFactor 0 (no parallax illusion).
    const bg = this.add.image(0, 0, ASSET_KEYS.backgrounds.cyber_server_room);
    bg.setOrigin(0, 0);
    bg.setDisplaySize(width, height);
    bg.setDepth(DEPTH.PARALLAX_BG);
    bg.setScrollFactor(0);

    // Layer 3 setup: dynamic y-sort pool for player + signature props +
    // drop shadows.
    this.sorter = new SceneSorter();

    this.spawnServerRack();
    this.spawnDataTerminal();
    this.spawnPlayer();

    // Layer 5: lighter cool dust drift (cyan ambient).
    this.ambientFx = buildAmbientFx(this, { kind: 'dust' });

    // Helios-v2 W3 S9 polish: per-rack alternating LEDs + terminal cyan
    // pulse + smog overlay; day-night SKIP (interior fixed).
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

    if (!this.exited && this.player && this.player.y >= EXIT_Y_THRESHOLD) {
      this.triggerExit();
    }
  }

  // ---- Server rack signature prop (Layer 3) ----

  /**
   * Render the cyber_server_rack PNG at foreground-left (260, 540),
   * supplementing the bg's painted wall racks for dimensional layering.
   *
   * Lights2D coordinate reservation per placement map Section 5: per-LED
   * multi-color points (magenta + cyan + orange) cascading at staggered
   * 0.2s phase along (260, 380-540). Cyan dominant pulse rhythm.
   */
  private spawnServerRack(): void {
    const x = 260;
    const y = 540;
    const sprite = this.add.image(x, y, ASSET_KEYS.props.cyberpunk_shanghai.cyber_server_rack);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(SCALE_SERVER_RACK);
    this.sorter?.register(sprite);

    const dropShadow = this.add.ellipse(x, y, 60, 14, 0x000000, 0.30);
    this.dropShadows.push(dropShadow);
    this.sorter?.register({
      y: y - 1,
      setDepth: (v) => dropShadow.setDepth(v),
    });
  }

  // ---- Data terminal signature prop (Layer 3) ----

  /**
   * Render the cyber_data_terminal PNG at foreground-center (704, 580),
   * the primary interactive narrative anchor. The terminal has a holographic
   * data globe baked in.
   *
   * Lights2D coordinate reservation per placement map Section 5: cyan
   * `neonCyan` 0x00f0ff at hologram globe (704, 460), intensity 0.6, pulse
   * 0.5-0.8 cycle 1.5s. Sparkle particle reservation.
   */
  private spawnDataTerminal(): void {
    const x = 704;
    const y = 580;
    const sprite = this.add.image(x, y, ASSET_KEYS.props.cyberpunk_shanghai.cyber_data_terminal);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(SCALE_DATA_TERMINAL);
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
   * Fade out and start the parent CyberpunkShanghaiScene. The scene-start
   * payload carries `returnFromSubArea: 'server_room'` and respawn coord
   * at the admin_hall_landmark approach (1260, 700) so the player visibly
   * returns to where they entered.
   */
  private triggerExit(): void {
    this.exited = true;
    this.cameras.main.fadeOut(FADE_OUT_MS, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('CyberpunkShanghai', {
        worldId: 'cyberpunk_shanghai',
        spawn: { x: 1260, y: 700 },
        returnFromSubArea: 'server_room',
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
          console.error('[CyberServerRoomScene] shadow destroy threw', err);
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
        console.error('[CyberServerRoomScene] scenePolish destroy threw', err);
      }
      this.scenePolish = undefined;

      const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
      bus?.emit('game.scene.shutdown', { sceneKey: this.scene.key });
    });
  }
}
