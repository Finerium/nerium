//
// src/game/scenes/ApolloOasisScene.ts
//
// Helios-v2 W3 S5: Apollo Oasis sub-area scene.
//
// Sub-area part 1 (3-of-3 sub-areas this session): an outdoor oasis sub-area
// reachable from the Apollo Village main scene via the dual-path Trust Shrine
// landmark choice prompt. The visual stack is the AI-generated
// `apollo_oasis.jpg` background layered with a Phaser-drawn
// `apollo_ruined_shrine.png` signature prop overlaid adjacent to the bg's
// painted ruined structure at top-right.
//
// Asset substitution note: the S5 directive references `apollo_oasis_shrine`
// (Prompt 87). The active registry ships `apollo_ruined_shrine.png` for the
// oasis context (asset visual inventory Section 4.2 documents this as the
// crumbled stone shrine with vine overgrowth, matching the spec narrative).
// S5 substitutes `apollo_ruined_shrine` for the Oasis signature prop role;
// future asset ferry may rename if Ghaisan re-renders a dedicated stem.
//
// The placement coordinate map authored at
// `_skills_staging/apollo_subarea_placement.md` Section 3 is the contract for
// every `this.add.image(...)` call in this file.
//
// Visual stack (per visual_manifest.contract):
//   Layer 0 (sky_gradient, depth -100): camera-locked dusk gradient bands
//                                       via buildSkyGradient(medieval_desert).
//                                       scrollFactor 0.
//   Layer 1 (parallax_bg, depth -50):   apollo_oasis bg painted at (0, 0)
//                                       origin (0, 0), scrollFactor 0.3.
//   Layer 3 (world_tiles, depth 0..N):  ruined shrine prop + drop shadow +
//                                       player. SceneSorter dynamic y-sort
//                                       via setDepth(sprite.y) per Oak-Woods
//                                       feet-anchor pattern.
//   Layer 5 (ambient_fx, depth 500):    LIGHTER warm amber dust drift via
//                                       buildAmbientFx kind 'dust' preset
//                                       (oasis cooler tone, water moderation).
//
// Day-night overlay: ELIGIBLE per S9 9.3 directive 7 (outdoor sub-area).
// S5 marks eligible; S9 implements the tween.
//
// Entry: spawn player at (704, 720) south-center on sand near stone path
// entry from S. Triggered via dual-path Trust Shrine landmark choice prompt
// in main ApolloVillageScene.
// Exit: walking south past y=770 fade-out + scene.start('ApolloVillage') with
// returnFromSubArea: 'oasis' so main scene can respawn the player at the
// trust_shrine landmark approach (490, 700).
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
  buildSkyGradient,
  buildAmbientFx,
  DEPTH,
  applyScenePolish,
  type ScenePolishHandle,
} from '../visual';
import { ASSET_KEYS } from '../visual/asset_keys';

interface ApolloOasisSceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
  from?: string;
}

const WORLD_W = 1408;
const WORLD_H = 800;

// Ruined shrine PNG source 510x612 -> displayed scaled per placement map.
const SCALE_RUINED_SHRINE = 0.40;

const PLAYER_SCALE = 0.18;

const FADE_IN_MS = 500;
const FADE_OUT_MS = 500;
const EXIT_Y_THRESHOLD = 770;

export class ApolloOasisScene extends Phaser.Scene {
  private worldId: WorldId = 'medieval_desert';

  private player?: Player;
  private sorter?: SceneSorter;
  private ambientFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private dropShadows: Phaser.GameObjects.Ellipse[] = [];
  private exited = false;
  // Helios-v2 W3 S9 polish bundle handle.
  private scenePolish?: ScenePolishHandle;

  constructor() {
    super({ key: 'ApolloOasis' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: ApolloOasisSceneData) {
    if (data.worldId) this.worldId = data.worldId;
    this.exited = false;
  }

  create() {
    const width = WORLD_W;
    const height = WORLD_H;

    // Background fallback color so any unfilled pixel reads warm desert sand,
    // not the default Phaser gray.
    this.cameras.main.setBackgroundColor('#1a0f05');
    this.physics.world.setBounds(0, 0, width, height);

    // Cinematic fade-in for entry.
    this.cameras.main.fadeIn(FADE_IN_MS, 0, 0, 0);

    // Layer 0: sky gradient bands camera-locked above bg.
    buildSkyGradient(this, {
      world: 'medieval_desert',
      width: this.scale.width,
      height: this.scale.height,
    });

    // Layer 1: AI background painted at (0, 0) covering the full scene.
    const bg = this.add.image(0, 0, ASSET_KEYS.backgrounds.apollo_oasis);
    bg.setOrigin(0, 0);
    bg.setDisplaySize(width, height);
    bg.setDepth(DEPTH.PARALLAX_BG);
    bg.setScrollFactor(0.3);

    // Layer 3 setup: dynamic y-sort pool for player + shrine prop + drop
    // shadows.
    this.sorter = new SceneSorter();

    this.spawnRuinedShrine();
    this.spawnPlayer();

    // Layer 5: lighter warm amber dust drift (oasis cooler tone).
    this.ambientFx = buildAmbientFx(this, { kind: 'dust' });

    // Helios-v2 W3 S9 polish: shrine cool moss-cyan-warm point light + day-
    // night dusk overlay per recipe.
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

  // ---- Ruined shrine signature prop (Layer 3) ----

  /**
   * Render the apollo_ruined_shrine PNG overlaid adjacent to the bg's painted
   * ruined structure at top-right (1080, 280). The shrine is the oasis's
   * narrative anchor: crumbled stone with vine overgrowth, weathered glyphs
   * on standing pillars, semi-decayed.
   *
   * Lights2D coordinate reservation per placement map Section 4: glyphs at
   * (1080, 240) above the rendered prop; S9 will register a cool cyan-warm
   * mix point light (color 0x3a4a3a, intensity 0.3, radius 80, slow alpha
   * pulse 0.6-0.9 cycle 4s, ancient power dormant feel).
   */
  private spawnRuinedShrine(): void {
    const x = 1080;
    const y = 280;
    const sprite = this.add.image(x, y, ASSET_KEYS.props.apollo_village.apollo_ruined_shrine);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(SCALE_RUINED_SHRINE);
    this.sorter?.register(sprite);

    const dropShadow = this.add.ellipse(x, y, 100, 18, 0x000000, 0.30);
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
   * carries `returnFromSubArea: 'oasis'` and respawn coord at the trust_shrine
   * landmark approach so the player visibly returns to where they entered.
   */
  private triggerExit(): void {
    this.exited = true;
    this.cameras.main.fadeOut(FADE_OUT_MS, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('ApolloVillage', {
        worldId: 'medieval_desert',
        spawn: { x: 490, y: 700 },
        returnFromSubArea: 'oasis',
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
          console.error('[ApolloOasisScene] shadow destroy threw', err);
        }
      }
      this.dropShadows = [];

      this.ambientFx?.stop();
      this.ambientFx?.destroy();
      this.ambientFx = undefined;

      this.sorter?.unregisterAll();
      this.sorter = undefined;

      // Helios-v2 W3 S9: dispose Lights2D + day-night overlay + atmospheric.
      try {
        this.scenePolish?.destroy();
      } catch (err) {
        console.error('[ApolloOasisScene] scenePolish destroy threw', err);
      }
      this.scenePolish = undefined;

      const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
      bus?.emit('game.scene.shutdown', { sceneKey: this.scene.key });
    });
  }
}
