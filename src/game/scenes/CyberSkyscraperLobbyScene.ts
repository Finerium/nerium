//
// src/game/scenes/CyberSkyscraperLobbyScene.ts
//
// Helios-v2 W3 S6: Cyber Skyscraper Lobby sub-area scene.
//
// Sub-area part 2 (4-of-7 in S6 batch): an interior corporate lobby scene
// reachable from the Cyberpunk Shanghai main scene. The visual stack is the
// AI-generated cyber_skyscraper_lobby.jpg layered with three Phaser-drawn
// signature props (cyber_reception_desk + cyber_chrome_sculpture +
// cyber_elevator_door) overlaid adjacent to bg-painted equivalents for
// dimensional layering and Lights2D anchor variety.
//
// The placement coordinate map authored at
// `_skills_staging/cyber_subarea_placement.md` Section 1 is the contract for
// every `this.add.image(...)` call in this file.
//
// Visual stack (per visual_manifest.contract):
//   Layer 0 (sky_gradient, depth -100): SKIP (interior fixed lighting per
//                                       S6 directive 6).
//   Layer 1 (parallax_bg, depth -50):   cyber_skyscraper_lobby bg painted
//                                       at (0, 0) origin (0, 0), scrollFactor
//                                       0 (no parallax for interior).
//   Layer 3 (world_tiles, depth 0..N):  reception_desk + elevator_door props
//                                       + drop shadows + player. SceneSorter
//                                       dynamic y-sort.
//   Layer 4 (above_tiles, depth 200):   chrome_sculpture (hangs from ceiling,
//                                       above world tiles below ABOVE_TILES
//                                       canopy band reserved for foliage).
//   Layer 5 (ambient_fx, depth 500):    LIGHTER warm amber dust drift via
//                                       buildAmbientFx kind 'dust' preset
//                                       (interior corporate luxury feel; S9
//                                       may add a cyber_lobby kind variant
//                                       with cyan + magenta tint).
//
// Day-night overlay: SKIP per S9 9.3 directive 6 (interior fixed lighting).
//
// Entry: spawn player at (704, 720) south-center on marble floor. S6 ships
// scene registration only; main-scene wire-up is S7 territory: dual-path
// prompt on existing bank_treasury_landmark (130, 480). For S6 testability
// the scene is reachable via debug-only __nerium_game__.scene.start.
// Exit: walking south past y=770 fade-out + scene.start('CyberpunkShanghai')
// with returnFromSubArea: 'skyscraper_lobby'.
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

interface CyberSkyscraperLobbySceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
  from?: string;
}

const WORLD_W = 1408;
const WORLD_H = 800;

const SCALE_RECEPTION_DESK = 0.32;
const SCALE_CHROME_SCULPTURE = 0.20;
const SCALE_ELEVATOR_DOOR = 0.32;

const PLAYER_SCALE = 0.18;

const FADE_IN_MS = 500;
const FADE_OUT_MS = 500;
const EXIT_Y_THRESHOLD = 770;

// Hanging sculpture sits above world tiles, below the canopy ABOVE_TILES
// band reserved for foliage. Per inventory 6.6 the chrome sculpture is a
// suspended ceiling fixture.
const SCULPTURE_DEPTH = 200;

export class CyberSkyscraperLobbyScene extends Phaser.Scene {
  private worldId: WorldId = 'cyberpunk_shanghai';

  private player?: Player;
  private sorter?: SceneSorter;
  private ambientFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private dropShadows: Phaser.GameObjects.Ellipse[] = [];
  private exited = false;
  // Helios-v2 W3 S9 polish bundle handle (cyan hologram glitch + elevator
  // trim point lights + smog overlay per recipe).
  private scenePolish?: ScenePolishHandle;

  constructor() {
    super({ key: 'CyberSkyscraperLobby' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: CyberSkyscraperLobbySceneData) {
    if (data.worldId) this.worldId = data.worldId;
    this.exited = false;
  }

  create() {
    const width = WORLD_W;
    const height = WORLD_H;

    // Background fallback color so any unfilled pixel reads deep void corp,
    // not the default Phaser gray.
    this.cameras.main.setBackgroundColor('#06060c');
    this.physics.world.setBounds(0, 0, width, height);

    // Cinematic fade-in for entry.
    this.cameras.main.fadeIn(FADE_IN_MS, 0, 0, 0);

    // Layer 1: AI background painted at (0, 0) covering the full scene.
    // Interior scene uses scrollFactor 0 (no parallax illusion).
    const bg = this.add.image(0, 0, ASSET_KEYS.backgrounds.cyber_skyscraper_lobby);
    bg.setOrigin(0, 0);
    bg.setDisplaySize(width, height);
    bg.setDepth(DEPTH.PARALLAX_BG);
    bg.setScrollFactor(0);

    // Layer 3 setup: dynamic y-sort pool for player + signature props +
    // drop shadows.
    this.sorter = new SceneSorter();

    this.spawnReceptionDesk();
    this.spawnChromeSculpture();
    this.spawnElevatorDoor();
    this.spawnPlayer();

    // Layer 5: lighter dust ambient (interior corporate luxury feel).
    this.ambientFx = buildAmbientFx(this, { kind: 'dust' });

    // Helios-v2 W3 S9 polish: cyan hologram glitch + elevator trim point
    // lights + smog overlay; day-night SKIP (interior fixed).
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

  // ---- Reception desk signature prop (Layer 3) ----

  /**
   * Render the cyber_reception_desk PNG centered on the bg's painted desk
   * area at (704, 480). The desk has a holographic receptionist baked in.
   *
   * Lights2D coordinate reservation per placement map Section 5: cyan
   * `neonCyan` 0x00f0ff at hologram receptionist (704, 360), intensity
   * 0.5, glitch tween alpha 0.7-1.0 cycle 1s + 50ms dropouts.
   */
  private spawnReceptionDesk(): void {
    const x = 704;
    const y = 480;
    const sprite = this.add.image(x, y, ASSET_KEYS.props.cyberpunk_shanghai.cyber_reception_desk);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(SCALE_RECEPTION_DESK);
    this.sorter?.register(sprite);

    const dropShadow = this.add.ellipse(x, y, 110, 18, 0x000000, 0.32);
    this.dropShadows.push(dropShadow);
    this.sorter?.register({
      y: y - 1,
      setDepth: (v) => dropShadow.setDepth(v),
    });
  }

  // ---- Chrome sculpture signature prop (Layer 4 above tiles) ----

  /**
   * Render the cyber_chrome_sculpture PNG hanging from ceiling at (240, 280).
   * Set static depth 200 so the player walks beneath the sculpture; it does
   * not participate in the dynamic y-sort because it is a ceiling fixture.
   *
   * Lights2D coordinate reservation per placement map Section 5: cyan
   * `neonCyan` at (240, 200) intensity 0.5, slow rotation tween cycle 8s.
   */
  private spawnChromeSculpture(): void {
    const sprite = this.add.image(
      240,
      280,
      ASSET_KEYS.props.cyberpunk_shanghai.cyber_chrome_sculpture,
    );
    sprite.setOrigin(0.5, 0.5);
    sprite.setScale(SCALE_CHROME_SCULPTURE);
    sprite.setDepth(SCULPTURE_DEPTH);
  }

  // ---- Elevator door signature prop (Layer 3) ----

  /**
   * Render the cyber_elevator_door PNG on the right side at (1180, 480),
   * supplementing the bg's painted right elevator. Adds dimensional layering
   * and a Lights2D anchor for cyan trim glow.
   *
   * Lights2D coordinate reservation per placement map Section 5: faint cyan
   * trim at (1180, 400), intensity 0.3.
   */
  private spawnElevatorDoor(): void {
    const x = 1180;
    const y = 480;
    const sprite = this.add.image(x, y, ASSET_KEYS.props.cyberpunk_shanghai.cyber_elevator_door);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(SCALE_ELEVATOR_DOOR);
    this.sorter?.register(sprite);

    const dropShadow = this.add.ellipse(x, y, 60, 14, 0x000000, 0.30);
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
   * payload carries `returnFromSubArea: 'skyscraper_lobby'` and respawn
   * coord at the bank_treasury_landmark approach (130, 530) so the player
   * visibly returns to where they entered (per S5 sub-area precedent).
   */
  private triggerExit(): void {
    this.exited = true;
    this.cameras.main.fadeOut(FADE_OUT_MS, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('CyberpunkShanghai', {
        worldId: 'cyberpunk_shanghai',
        spawn: { x: 130, y: 530 },
        returnFromSubArea: 'skyscraper_lobby',
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
          console.error('[CyberSkyscraperLobbyScene] shadow destroy threw', err);
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
        console.error('[CyberSkyscraperLobbyScene] scenePolish destroy threw', err);
      }
      this.scenePolish = undefined;

      const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
      bus?.emit('game.scene.shutdown', { sceneKey: this.scene.key });
    });
  }
}
