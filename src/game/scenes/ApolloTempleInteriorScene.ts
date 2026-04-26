//
// src/game/scenes/ApolloTempleInteriorScene.ts
//
// Helios-v2 W3 S5: Apollo Temple Interior sub-area scene.
//
// Sub-area part 1 (3-of-3 sub-areas this session): an interior temple sanctum
// scene reachable from the Apollo Village main scene. The visual stack is the
// AI-generated `apollo_temple_interior.jpg` background layered with a
// Phaser-drawn `apollo_temple_altar.png` signature prop overlaid onto the
// bg's painted altar pedestal so dynamic Lights2D point coordinates can lock
// to the rendered prop's golden orb (S9 enable, NOT S5).
//
// The placement coordinate map authored at
// `_skills_staging/apollo_subarea_placement.md` Section 1 is the contract for
// every `this.add.image(...)` call in this file.
//
// Visual stack (per visual_manifest.contract):
//   Layer 0 (sky_gradient, depth -100): SKIP (interior fixed lighting per
//                                       S9 9.3 directive 7)
//   Layer 1 (parallax_bg, depth -50):   apollo_temple_interior bg painted at
//                                       (0, 0) origin (0, 0), scrollFactor 0
//                                       (no parallax for interior).
//   Layer 3 (world_tiles, depth 0..N):  altar prop + drop shadow + player.
//                                       SceneSorter dynamic y-sort via
//                                       setDepth(sprite.y) per Oak-Woods
//                                       feet-anchor pattern.
//   Layer 5 (ambient_fx, depth 500):    LIGHTER warm amber dust drift via
//                                       buildAmbientFx kind 'dust' preset,
//                                       interior sun-shaft mote feel.
//
// Drop shadow: altar prop gets a Phaser-drawn ellipse anchored at base
// (sprite.x, sprite.y) registered with the sorter so it tracks the prop's
// y-coordinate minus 1.
//
// Entry: spawn player at (704, 720) south-center floor zone.
// Exit: walking south past y=770 fade-out + scene.start('ApolloVillage') with
// returnFromSubArea: 'temple_interior' so main scene can respawn the player.
//
// Day-night overlay: SKIP (interior fixed lighting per S9 9.3).
//
// Owner: Helios-v2 (W3 S5).
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

interface ApolloTempleInteriorSceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
  from?: string;
}

// World dimensions match the AI bg native ratio scaled to the parent world
// frame so player + altar sprite scales line up with main Apollo Village.
const WORLD_W = 1408;
const WORLD_H = 800;

// Altar PNG source 440x575 -> displayed scaled per placement map.
const SCALE_ALTAR = 0.45;

// Player scale matches the parent Apollo Village main scene so the player
// reads at the same relative size whether they are inside the temple or
// outside the village.
const PLAYER_SCALE = 0.18;

// Cinematic fade duration for entry from main scene.
const FADE_IN_MS = 500;
const FADE_OUT_MS = 500;

// Exit zone: south edge crossing line. When player.y >= EXIT_Y_THRESHOLD the
// scene fades out and starts ApolloVillageScene. The buffer between spawn
// (y=720) and threshold (y=770) prevents the fade-in motion from immediately
// re-triggering exit.
const EXIT_Y_THRESHOLD = 770;

export class ApolloTempleInteriorScene extends Phaser.Scene {
  private worldId: WorldId = 'medieval_desert';

  private player?: Player;
  private sorter?: SceneSorter;
  private ambientFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private dropShadows: Phaser.GameObjects.Ellipse[] = [];
  private exited = false;
  // Helios-v2 W3 S9 polish bundle handle (Lights2D ambient + altar orb point
  // light divine pulse via SCENE_POLISH_RECIPES table; SHUTDOWN destroys it).
  private scenePolish?: ScenePolishHandle;

  constructor() {
    super({ key: 'ApolloTempleInterior' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: ApolloTempleInteriorSceneData) {
    if (data.worldId) this.worldId = data.worldId;
    this.exited = false;
  }

  create() {
    const width = WORLD_W;
    const height = WORLD_H;

    // Background fallback color so any unfilled pixel reads warm interior,
    // not the default Phaser gray.
    this.cameras.main.setBackgroundColor('#1a0f05');
    this.physics.world.setBounds(0, 0, width, height);

    // Cinematic fade-in for entry.
    this.cameras.main.fadeIn(FADE_IN_MS, 0, 0, 0);

    // Layer 1: AI background painted at (0, 0) covering the full scene.
    // setOrigin(0, 0) so x,y references the top-left corner. Interior scene
    // uses scrollFactor 0 (no parallax illusion since the bg is fixed
    // ceiling + floor + columns).
    const bg = this.add.image(0, 0, ASSET_KEYS.backgrounds.apollo_temple_interior);
    bg.setOrigin(0, 0);
    bg.setDisplaySize(width, height);
    bg.setDepth(DEPTH.PARALLAX_BG);
    bg.setScrollFactor(0);

    // Layer 3 setup: dynamic y-sort pool for player + altar prop + drop
    // shadow. Sorter.tick() runs in update() to recompute setDepth.
    this.sorter = new SceneSorter();

    this.spawnAltar();
    this.spawnPlayer();

    // Layer 5: lighter warm amber dust drift (interior sun-shaft mote feel).
    // The default `dust` preset emits at 30/s; interior reads naturally at
    // this density because the bg's painted sun shaft already concentrates
    // visual attention at the altar.
    this.ambientFx = buildAmbientFx(this, { kind: 'dust' });

    // Helios-v2 W3 S9 polish: altar sun-orb divine breathing point light
    // (warm amber 0xffb14a intensity 0.9..1.0 over 2s) per S9 9.2.
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

    // Per-frame y-sort across all registered dynamic sprites + drop shadows.
    this.sorter?.tick();

    // South-edge exit zone: if player walks past the threshold, fade out and
    // return to ApolloVillageScene. The exited flag prevents double-fire on
    // a single south-edge crossing.
    if (!this.exited && this.player && this.player.y >= EXIT_Y_THRESHOLD) {
      this.triggerExit();
    }
  }

  // ---- Altar signature prop (Layer 3) ----

  /**
   * Render the apollo_temple_altar PNG overlaid onto the bg's painted altar
   * pedestal at (704, 280). The altar is the temple's narrative focal point:
   * stone block with sun-glyph engraving, golden orb floating above tethered
   * by ropes, casting circular warm light pool on top surface.
   *
   * Lights2D coordinate reservation per placement map Section 4: the orb
   * sits at (704, 80) above the rendered prop; S9 will register a warm amber
   * point light (color 0xffb14a, intensity 1.0, radius 300, divine breathing
   * pulse 0.9-1.0 over 2s ease Sine.easeInOut).
   */
  private spawnAltar(): void {
    const x = 704;
    const y = 280;
    const sprite = this.add.image(x, y, ASSET_KEYS.props.apollo_village.apollo_temple_altar);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(SCALE_ALTAR);
    this.sorter?.register(sprite);

    const dropShadow = this.add.ellipse(x, y, 80, 16, 0x000000, 0.32);
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
   * Fade out and start the parent ApolloVillageScene. The scene-start payload
   * carries `returnFromSubArea: 'temple_interior'` so the main scene can
   * respawn the player at a sensible coord (the temple landmark approach).
   */
  private triggerExit(): void {
    this.exited = true;
    this.cameras.main.fadeOut(FADE_OUT_MS, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      // Default respawn coord at center-south of main Apollo Village; the
      // temple does not yet have a dedicated main-scene landmark per S5
      // directive 5, so the player returns to the central courtyard.
      this.scene.start('ApolloVillage', {
        worldId: 'medieval_desert',
        spawn: { x: 704, y: 700 },
        returnFromSubArea: 'temple_interior',
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
          console.error('[ApolloTempleInteriorScene] shadow destroy threw', err);
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
        console.error('[ApolloTempleInteriorScene] scenePolish destroy threw', err);
      }
      this.scenePolish = undefined;

      const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
      bus?.emit('game.scene.shutdown', { sceneKey: this.scene.key });
    });
  }
}
