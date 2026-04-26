//
// src/game/scenes/CaravanWayhouseInteriorScene.ts
//
// Helios-v2 W3 S6: Caravan Wayhouse Interior sub-area scene.
//
// Sub-area part 2 (1-of-7 in S6 batch): an interior tavern scene reachable
// from the Caravan Road main scene via E-key proximity on the existing
// caravan_wayhouse_filler ambient prop. The visual stack is the
// AI-generated caravan_wayhouse_interior.jpg background layered with
// Phaser-drawn caravan_fireplace.png and caravan_tavern_table.png signature
// props overlaid adjacent to the bg's painted hearth and dining cluster so
// dynamic Lights2D point coordinates can lock to the rendered prop flames
// (S9 enable, NOT S6).
//
// The placement coordinate map authored at
// `_skills_staging/caravan_subarea_placement.md` Section 1 is the contract
// for every `this.add.image(...)` call in this file.
//
// Visual stack (per visual_manifest.contract):
//   Layer 0 (sky_gradient, depth -100): SKIP (interior fixed lighting per
//                                       S6 directive 6).
//   Layer 1 (parallax_bg, depth -50):   caravan_wayhouse_interior bg
//                                       painted at (0, 0) origin (0, 0),
//                                       scrollFactor 0 (no parallax for
//                                       interior).
//   Layer 3 (world_tiles, depth 0..N):  fireplace + tavern_table props +
//                                       drop shadows + player. SceneSorter
//                                       dynamic y-sort via setDepth(sprite.y)
//                                       per Oak-Woods feet-anchor pattern.
//   Layer 5 (ambient_fx, depth 500):    LIGHTER warm amber dust drift via
//                                       buildAmbientFx kind 'dust' preset
//                                       (interior cozy mote feel).
//
// Day-night overlay: SKIP (interior fixed lighting per S6 directive 6).
//
// Entry: spawn player at (704, 720) south-center floor zone. Triggered when
// CaravanRoadScene fires the wayhouse-entry handler on E-key proximity to
// caravan_wayhouse_filler ambient prop (S6 main-scene patch).
// Exit: walking south past y=770 fade-out + scene.start('CaravanRoad') with
// returnFromSubArea: 'wayhouse_interior' so main scene can respawn the
// player at the wayhouse approach.
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

interface CaravanWayhouseInteriorSceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
  from?: string;
}

const WORLD_W = 1408;
const WORLD_H = 800;

const SCALE_FIREPLACE = 0.40;
const SCALE_TAVERN_TABLE = 0.32;

const PLAYER_SCALE = 0.18;

const FADE_IN_MS = 500;
const FADE_OUT_MS = 500;
const EXIT_Y_THRESHOLD = 770;

export class CaravanWayhouseInteriorScene extends Phaser.Scene {
  // Matches CaravanRoadScene's default worldId. WorldId is the JRPG-narrative
  // world (medieval_desert / cyberpunk_shanghai / steampunk_victorian); the
  // caravan_road palette is a transition-aesthetic that lives within the
  // medieval_desert world for narrative purposes.
  private worldId: WorldId = 'medieval_desert';

  private player?: Player;
  private sorter?: SceneSorter;
  private ambientFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private dropShadows: Phaser.GameObjects.Ellipse[] = [];
  private exited = false;
  // Helios-v2 W3 S9 polish bundle handle.
  private scenePolish?: ScenePolishHandle;

  constructor() {
    super({ key: 'CaravanWayhouseInterior' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: CaravanWayhouseInteriorSceneData) {
    if (data.worldId) this.worldId = data.worldId;
    this.exited = false;
  }

  create() {
    const width = WORLD_W;
    const height = WORLD_H;

    // Background fallback color so any unfilled pixel reads warm tavern dim,
    // not the default Phaser gray.
    this.cameras.main.setBackgroundColor('#1a0f05');
    this.physics.world.setBounds(0, 0, width, height);

    // Cinematic fade-in for entry.
    this.cameras.main.fadeIn(FADE_IN_MS, 0, 0, 0);

    // Layer 1: AI background painted at (0, 0) covering the full scene.
    // Interior scene uses scrollFactor 0 (no parallax illusion since the
    // bg is fixed wood floor + hearth + tables).
    const bg = this.add.image(0, 0, ASSET_KEYS.backgrounds.caravan_wayhouse_interior);
    bg.setOrigin(0, 0);
    bg.setDisplaySize(width, height);
    bg.setDepth(DEPTH.PARALLAX_BG);
    bg.setScrollFactor(0);

    // Layer 3 setup: dynamic y-sort pool for player + signature props +
    // drop shadows. Sorter.tick() runs in update() to recompute setDepth.
    this.sorter = new SceneSorter();

    this.spawnFireplace();
    this.spawnTavernTable();
    this.spawnPlayer();

    // Layer 5: lighter warm amber dust drift (interior cozy mote feel).
    this.ambientFx = buildAmbientFx(this, { kind: 'dust' });

    // Helios-v2 W3 S9 polish: hearth fire warm flicker + tavern candle warm
    // small. Day-night SKIP per recipe (interior fixed).
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

    this.sorter?.tick();

    if (!this.exited && this.player && this.player.y >= EXIT_Y_THRESHOLD) {
      this.triggerExit();
    }
  }

  // ---- Fireplace signature prop (Layer 3) ----

  /**
   * Render the caravan_fireplace PNG overlaid adjacent to the bg's painted
   * hearth at (940, 320). The fireplace is the wayhouse's narrative focal
   * point: stone hearth with active fire pit, chimney, andiron grate.
   *
   * Lights2D coordinate reservation per placement map Section 4: flame at
   * (940, 240) above the rendered prop; S9 will register a warm `flameOrange`
   * point light (color 0xff7a3a, intensity 0.7, radius 200, flicker 100ms
   * cycle, ember particle reservation).
   */
  private spawnFireplace(): void {
    const x = 940;
    const y = 320;
    const sprite = this.add.image(x, y, ASSET_KEYS.props.caravan_road.caravan_fireplace);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(SCALE_FIREPLACE);
    this.sorter?.register(sprite);

    const dropShadow = this.add.ellipse(x, y, 110, 18, 0x000000, 0.32);
    this.dropShadows.push(dropShadow);
    this.sorter?.register({
      y: y - 1,
      setDepth: (v) => dropShadow.setDepth(v),
    });
  }

  // ---- Tavern table signature prop (Layer 3) ----

  /**
   * Render the caravan_tavern_table PNG at foreground-center southeast of the
   * hearth (760, 720). The table balances the bg's leftward dining cluster
   * weight and provides a Lights2D anchor for a candle warm point.
   *
   * Lights2D coordinate reservation per placement map Section 4: candle at
   * (760, 700) on the rendered prop; S9 will register a `lampWarm` point
   * (intensity 0.4, radius 60, flicker 100ms cycle).
   */
  private spawnTavernTable(): void {
    const x = 760;
    const y = 720;
    const sprite = this.add.image(x, y, ASSET_KEYS.props.caravan_road.caravan_tavern_table);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(SCALE_TAVERN_TABLE);
    this.sorter?.register(sprite);

    const dropShadow = this.add.ellipse(x, y, 130, 20, 0x000000, 0.30);
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
   * Fade out and start the parent CaravanRoadScene. The scene-start payload
   * carries `returnFromSubArea: 'wayhouse_interior'` and respawn coord at
   * the wayhouse approach so the player visibly returns to where they
   * entered.
   */
  private triggerExit(): void {
    this.exited = true;
    this.cameras.main.fadeOut(FADE_OUT_MS, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('CaravanRoad', {
        worldId: 'medieval_desert',
        spawn: { x: 440, y: 530 },
        returnFromSubArea: 'wayhouse_interior',
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
          console.error('[CaravanWayhouseInteriorScene] shadow destroy threw', err);
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
        console.error('[CaravanWayhouseInteriorScene] scenePolish destroy threw', err);
      }
      this.scenePolish = undefined;

      const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
      bus?.emit('game.scene.shutdown', { sceneKey: this.scene.key });
    });
  }
}
