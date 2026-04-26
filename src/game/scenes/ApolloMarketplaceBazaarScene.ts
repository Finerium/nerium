//
// src/game/scenes/ApolloMarketplaceBazaarScene.ts
//
// Helios-v2 W3 S5: Apollo Marketplace Bazaar sub-area scene.
//
// Sub-area part 1 (3-of-3 sub-areas this session): an outdoor-feel bazaar
// scene reachable from the Apollo Village main scene via the dual-path
// Marketplace Stall landmark choice prompt. The visual stack is the
// AI-generated `apollo_marketplace_bazaar.jpg` background as the primary
// scene visual (background-only sub-area; the bg already paints two opposing
// market tents with full detail).
//
// The placement coordinate map authored at
// `_skills_staging/apollo_subarea_placement.md` Section 2 is the contract for
// every `this.add.image(...)` call in this file.
//
// Visual stack (per visual_manifest.contract):
//   Layer 0 (sky_gradient, depth -100): camera-locked dusk gradient bands
//                                       via buildSkyGradient(medieval_desert).
//                                       scrollFactor 0 so bands stay above
//                                       horizon regardless of camera scroll.
//   Layer 1 (parallax_bg, depth -50):   apollo_marketplace_bazaar bg painted
//                                       at (0, 0) origin (0, 0), scrollFactor
//                                       0.3 mild parallax disambiguation.
//   Layer 3 (world_tiles, depth 0..N):  player only (background-only sub-area
//                                       with bg-baked tent detail). SceneSorter
//                                       y-sort tracks the player y for any
//                                       future ambient NPC additions.
//   Layer 5 (ambient_fx, depth 500):    DENSEST warm amber dust drift via
//                                       buildAmbientFx kind 'dust' preset
//                                       (warm market dust per S9 9.4).
//
// Day-night overlay: ELIGIBLE per S9 9.3 directive 7 (outdoor-feel from open
// sky banner-strung tents). S5 marks eligible; S9 implements the tween.
//
// Entry: spawn player at (704, 720) south-center on cobble path entry zone.
// Triggered via dual-path Marketplace Stall landmark choice prompt in main
// ApolloVillageScene.
// Exit: walking south past y=770 fade-out + scene.start('ApolloVillage') with
// returnFromSubArea: 'marketplace_bazaar' so main scene can respawn the
// player at the marketplace landmark approach (1080, 700).
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

interface ApolloMarketplaceBazaarSceneData {
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

export class ApolloMarketplaceBazaarScene extends Phaser.Scene {
  private worldId: WorldId = 'medieval_desert';

  private player?: Player;
  private sorter?: SceneSorter;
  private ambientFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private dropShadows: Phaser.GameObjects.Ellipse[] = [];
  private exited = false;
  // Helios-v2 W3 S9 polish bundle handle.
  private scenePolish?: ScenePolishHandle;

  constructor() {
    super({ key: 'ApolloMarketplaceBazaar' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: ApolloMarketplaceBazaarSceneData) {
    if (data.worldId) this.worldId = data.worldId;
    this.exited = false;
  }

  create() {
    const width = WORLD_W;
    const height = WORLD_H;

    // Background fallback color so any unfilled pixel reads warm dusk, not
    // the default Phaser gray.
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
    const bg = this.add.image(0, 0, ASSET_KEYS.backgrounds.apollo_marketplace_bazaar);
    bg.setOrigin(0, 0);
    bg.setDisplaySize(width, height);
    bg.setDepth(DEPTH.PARALLAX_BG);
    bg.setScrollFactor(0.3);

    // Layer 3 setup: dynamic y-sort pool. Bazaar is background-only with
    // bg-baked tent detail; the sorter just tracks the player + future
    // ambient additions.
    this.sorter = new SceneSorter();

    this.spawnPlayer();

    // Layer 5: densest warm amber dust drift (warm market dust per S9 9.4).
    this.ambientFx = buildAmbientFx(this, { kind: 'dust' });

    // Helios-v2 W3 S9 polish: warm hanging string-light point pair + day-night
    // overlay (initial 'day' for bright bazaar feel) per recipe table.
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
   * carries `returnFromSubArea: 'marketplace_bazaar'` and respawn coord at
   * the marketplace landmark approach so the player visibly returns to where
   * they entered.
   */
  private triggerExit(): void {
    this.exited = true;
    this.cameras.main.fadeOut(FADE_OUT_MS, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('ApolloVillage', {
        worldId: 'medieval_desert',
        spawn: { x: 1080, y: 700 },
        returnFromSubArea: 'marketplace_bazaar',
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
          console.error('[ApolloMarketplaceBazaarScene] shadow destroy threw', err);
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
        console.error('[ApolloMarketplaceBazaarScene] scenePolish destroy threw', err);
      }
      this.scenePolish = undefined;

      const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
      bus?.emit('game.scene.shutdown', { sceneKey: this.scene.key });
    });
  }
}
