//
// src/game/scenes/CyberpunkShanghaiScene.ts
//
// Helios-v2 W3 CORRECTION: rewritten ground paint + sprite textures +
// neon overhead canopy + horizon haze to reach Hyper Light Drifter /
// Sea of Stars cyberpunk tier.
//
// Cyberpunk Shanghai District. Final destination after Caravan Road.
// Magenta + cyan neon clash over deep void base, rim-light puddle
// reflections, hologram pulse, neon rain + smog ambient FX. Caravan
// vendor NPC relocates here on quest step 7 (B5 Epimetheus build).
//
// Visual stack:
//   Layer 0 sky_gradient: 4-band cyberpunk void
//   Layer 1 parallax_bg:  3 silhouette layers (far buildings, mid towers,
//                         near skyline) with neon window glints + horizon
//                         haze blend
//   Layer 2 ground_tiles: paintCyberpunkShanghaiGround (dark wet pavement
//                         + neon puddle reflections + grid texture)
//   Layer 3 world_tiles:  vending machines + neon sign poles + hologram
//                         pulse + dumpster + caravan_vendor + 4 ambient
//                         NPCs + player. All y-sorted.
//   Layer 4 above_tiles:  paintCyberpunkOverhead cable network + hanging
//                         neon signs
//   Ambient FX:           rain 60/s + neon smog 25/s
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import type { WorldId } from '../../state/types';
import { Player } from '../objects/Player';
import { NPC } from '../objects/NPC';
import type { GameEventBus } from '../../state/GameEventBus';
import {
  SceneSorter,
  buildSkyGradient,
  buildParallaxLayer,
  stairStepSilhouette,
  buildAmbientFx,
  paintCyberpunkShanghaiGround,
  paintCyberpunkOverhead,
  paintHorizonHaze,
  buildCyberpunkShanghaiSprites,
  type CyberpunkShanghaiSpriteKeys,
  CYBERPUNK_SHANGHAI,
  DEPTH,
  dynamicDepthFor,
} from '../visual';

interface CyberpunkShanghaiSceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
}

const TILE_PX = 32;
const SHANGHAI_COLS = 28;
const SHANGHAI_ROWS = 16;
const WORLD_W = SHANGHAI_COLS * TILE_PX;
const WORLD_H = SHANGHAI_ROWS * TILE_PX;

const CHARACTER_SPRITE_SCALE = 3;

export class CyberpunkShanghaiScene extends Phaser.Scene {
  private worldId: WorldId = 'cyberpunk_shanghai';
  private atlasKey = 'atlas_cyberpunk_shanghai';
  private spriteKeys?: CyberpunkShanghaiSpriteKeys;
  private player?: Player;
  private caravanVendorNpc?: NPC;
  private synthVendorNpc?: NPC;
  private cyborgGuardNpc?: NPC;
  private streetRatNpc?: NPC;
  private salarymanNpc?: NPC;
  private unsubscribers: Array<() => void> = [];

  private sorter?: SceneSorter;
  private rainFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private smogFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private holoPulseTween?: Phaser.Tweens.Tween;
  private signFlickerTween?: Phaser.Tweens.Tween;
  private signOverheadTween?: Phaser.Tweens.Tween;

  constructor() {
    super({ key: 'CyberpunkShanghai' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: CyberpunkShanghaiSceneData) {
    if (data.worldId) this.worldId = data.worldId;
    this.atlasKey = `atlas_${this.worldId}`;
  }

  create() {
    const width = WORLD_W;
    const height = WORLD_H;

    this.cameras.main.setBackgroundColor('#06060c');
    this.physics.world.setBounds(0, 0, width, height);

    this.cameras.main.fadeIn(500, 0, 0, 0);

    // Build character sprite textures FIRST
    this.spriteKeys = buildCyberpunkShanghaiSprites(this);

    // Layer 0: void gradient anchored to camera viewport (scrollFactor 0)
    buildSkyGradient(this, {
      world: 'cyberpunk_shanghai',
      width: this.scale.width,
      height: this.scale.height,
    });

    // Layer 1a: far building silhouette stack. baseY at world height * 0.5
    // (far buildings sit higher in the frame for depth feel).
    const farRects = stairStepSilhouette(
      0,
      width,
      Math.round(height * 0.5),
      24,
      36,
      72,
      CYBERPUNK_SHANGHAI.buildingFar,
      0xfa3,
    );
    buildParallaxLayer(this, { rects: farRects, scrollFactor: 0.2, alpha: 0.95 });

    // Layer 1b: mid towers
    const midRects = stairStepSilhouette(
      0,
      width,
      Math.round(height * 0.55),
      32,
      48,
      80,
      CYBERPUNK_SHANGHAI.buildingMid,
      0xb4d,
    );
    const midContainer = buildParallaxLayer(this, {
      rects: midRects,
      scrollFactor: 0.4,
      alpha: 0.95,
    });

    this.spawnNeonGlints(midContainer, width, height);

    // Layer 1c: near skyline
    const nearRects = stairStepSilhouette(
      0,
      width,
      Math.round(height * 0.58),
      28,
      32,
      60,
      CYBERPUNK_SHANGHAI.buildingNear,
      0xc8e,
    );
    buildParallaxLayer(this, { rects: nearRects, scrollFactor: 0.6, alpha: 0.92 });

    // Smog haze on horizon (cool magenta tint for cyberpunk feel)
    paintHorizonHaze(this, width, height, CYBERPUNK_SHANGHAI.smogPurple, 0.45);
    paintHorizonHaze(this, width, height, CYBERPUNK_SHANGHAI.neonViolet, 0.22);

    // Layer 2: pavement + neon puddle reflections
    paintCyberpunkShanghaiGround(this, width, height);

    // Layer 3: decoration props + NPCs + player
    this.sorter = new SceneSorter();
    this.spawnDecoration();
    this.spawnPlayer();
    this.spawnNpcs();

    if (this.player) this.sorter.register(this.player);
    if (this.caravanVendorNpc) this.sorter.register(this.caravanVendorNpc);
    if (this.synthVendorNpc) this.sorter.register(this.synthVendorNpc);
    if (this.cyborgGuardNpc) this.sorter.register(this.cyborgGuardNpc);
    if (this.streetRatNpc) this.sorter.register(this.streetRatNpc);
    if (this.salarymanNpc) this.sorter.register(this.salarymanNpc);

    // Layer 4: cable + hanging signs
    paintCyberpunkOverhead(this, width);
    this.spawnOverheadSignFlicker(width);

    // Ambient FX: rain (front) + smog (behind)
    this.smogFx = buildAmbientFx(this, { kind: 'neon_smog' });
    this.rainFx = buildAmbientFx(this, { kind: 'rain' });

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
    if (this.player && this.caravanVendorNpc) this.caravanVendorNpc.updateProximity(this.player);
    if (this.player && this.synthVendorNpc) this.synthVendorNpc.updateProximity(this.player);
    if (this.player && this.cyborgGuardNpc) this.cyborgGuardNpc.updateProximity(this.player);
    if (this.player && this.streetRatNpc) this.streetRatNpc.updateProximity(this.player);
    if (this.player && this.salarymanNpc) this.salarymanNpc.updateProximity(this.player);
    this.sorter?.tick();
  }

  // ---- helpers ----

  private spawnNeonGlints(
    container: Phaser.GameObjects.Container,
    width: number,
    height: number,
  ): void {
    const positions: Array<[number, number, number]> = [];
    for (let i = 0; i < 80; i++) {
      const x = (i * 47) % width;
      const y = Math.round(height * 0.25) + ((i * 17) % Math.round(height * 0.3));
      const colorRoll = i % 4;
      const color =
        colorRoll === 0
          ? CYBERPUNK_SHANGHAI.neonCyan
          : colorRoll === 1
            ? CYBERPUNK_SHANGHAI.neonMagenta
            : colorRoll === 2
              ? CYBERPUNK_SHANGHAI.neonAmber
              : CYBERPUNK_SHANGHAI.neonViolet;
      positions.push([x, y, color]);
    }
    const dots: Phaser.GameObjects.Rectangle[] = [];
    for (const [x, y, color] of positions) {
      const dot = this.add.rectangle(x, y, 2, 2, color);
      dot.setOrigin(0, 0);
      dot.setAlpha(0.85);
      container.add(dot);
      dots.push(dot);
      // Glow halo
      const halo = this.add.rectangle(x - 1, y - 1, 4, 4, color);
      halo.setOrigin(0, 0);
      halo.setAlpha(0.22);
      container.add(halo);
      dots.push(halo);
    }
    this.signFlickerTween = this.tweens.add({
      targets: dots,
      alpha: { from: 0.5, to: 1.0 },
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: this.tweens.stagger(70, { start: 0, ease: 'Linear' }),
    });
  }

  private spawnOverheadSignFlicker(width: number): void {
    // Flicker the hanging sign pixels at top of screen for "alive" cyberpunk feel
    const signs: Phaser.GameObjects.Rectangle[] = [];
    for (let x = 32; x < width; x += 88) {
      const accent = this.add.rectangle(x - 12, 26, 26, 4, CYBERPUNK_SHANGHAI.neonAmber);
      accent.setOrigin(0, 0);
      accent.setAlpha(0.85);
      accent.setDepth(DEPTH.ABOVE_TILES + 2);
      signs.push(accent);
    }
    if (signs.length) {
      this.signOverheadTween = this.tweens.add({
        targets: signs,
        alpha: { from: 0.4, to: 1.0 },
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        duration: 700,
        delay: this.tweens.stagger(160, { start: 0 }),
      });
    }
  }

  private spawnDecoration(): void {
    const setDepthForProp = (c: Phaser.GameObjects.Container) => {
      c.setDepth(dynamicDepthFor(c.y));
    };

    // Vending machine cluster
    const buildVendingMachine = (x: number, y: number, color: number) => {
      const c = this.add.container(x, y);
      const band = (rx: number, ry: number, w: number, h: number, col: number) => {
        const r = this.add.rectangle(rx, ry, w, h, col);
        r.setOrigin(0, 0);
        c.add(r);
      };
      // Frame
      band(-12, -36, 24, 36, CYBERPUNK_SHANGHAI.chromeBlack);
      band(-12, -36, 24, 1, CYBERPUNK_SHANGHAI.chromeSteel);
      band(-12, -1, 24, 1, CYBERPUNK_SHANGHAI.chromeSteel);
      // Neon panel display
      band(-10, -34, 20, 18, color);
      band(-10, -34, 20, 1, CYBERPUNK_SHANGHAI.holoCyan);
      band(-10, -16, 20, 1, CYBERPUNK_SHANGHAI.chromeRust);
      // Item dispense slot
      band(-8, -14, 16, 8, CYBERPUNK_SHANGHAI.chromeSteel);
      band(-6, -12, 12, 4, CYBERPUNK_SHANGHAI.neonAmber);
      // Coin slot
      band(-4, -6, 8, 1, CYBERPUNK_SHANGHAI.chromeRust);
      // Base
      band(-12, 0, 24, 2, CYBERPUNK_SHANGHAI.chromeRust);
      return c;
    };

    setDepthForProp(buildVendingMachine(4 * TILE_PX, 9 * TILE_PX, CYBERPUNK_SHANGHAI.neonMagenta));
    setDepthForProp(buildVendingMachine(5 * TILE_PX, 9 * TILE_PX, CYBERPUNK_SHANGHAI.neonCyan));
    setDepthForProp(buildVendingMachine(6 * TILE_PX, 9 * TILE_PX, CYBERPUNK_SHANGHAI.neonViolet));
    setDepthForProp(buildVendingMachine(23 * TILE_PX, 11 * TILE_PX, CYBERPUNK_SHANGHAI.neonViolet));
    setDepthForProp(buildVendingMachine(24 * TILE_PX, 11 * TILE_PX, CYBERPUNK_SHANGHAI.neonMagenta));

    // Neon sign poles
    const buildSignPole = (x: number, y: number, signColor: number) => {
      const c = this.add.container(x, y);
      const band = (rx: number, ry: number, w: number, h: number, col: number) => {
        const r = this.add.rectangle(rx, ry, w, h, col);
        r.setOrigin(0, 0);
        c.add(r);
      };
      band(-1, -64, 2, 64, CYBERPUNK_SHANGHAI.chromeSteel);
      band(-12, -68, 24, 8, CYBERPUNK_SHANGHAI.chromeBlack);
      band(-10, -66, 20, 4, signColor);
      // glyph dots inside sign
      band(-8, -65, 1, 1, 0xffffff);
      band(-5, -65, 1, 1, 0xffffff);
      band(-2, -65, 1, 1, 0xffffff);
      band(2, -65, 1, 1, 0xffffff);
      band(5, -65, 1, 1, 0xffffff);
      band(8, -65, 1, 1, 0xffffff);
      band(-3, 0, 6, 2, CYBERPUNK_SHANGHAI.chromeBlack);
      // Halo
      const halo = this.add.rectangle(-13, -69, 26, 10, signColor);
      halo.setOrigin(0, 0);
      halo.setAlpha(0.22);
      c.add(halo);
      return c;
    };

    setDepthForProp(buildSignPole(8 * TILE_PX, 8 * TILE_PX, CYBERPUNK_SHANGHAI.neonCyan));
    setDepthForProp(buildSignPole(14 * TILE_PX, 6 * TILE_PX, CYBERPUNK_SHANGHAI.neonMagenta));
    setDepthForProp(buildSignPole(20 * TILE_PX, 8 * TILE_PX, CYBERPUNK_SHANGHAI.neonViolet));
    setDepthForProp(buildSignPole(11 * TILE_PX, 14 * TILE_PX, CYBERPUNK_SHANGHAI.neonAmber));
    setDepthForProp(buildSignPole(17 * TILE_PX, 14 * TILE_PX, CYBERPUNK_SHANGHAI.neonCyan));

    // Hologram pulse columns
    const buildHologram = (x: number, y: number, color: number) => {
      const c = this.add.container(x, y);
      for (let i = 0; i < 6; i++) {
        const r = this.add.rectangle(-8 + i * 0.5, -8 - i * 8, 16 - i, 4, color);
        r.setOrigin(0, 0);
        r.setAlpha(0.5);
        c.add(r);
      }
      // Base disc
      const disc = this.add.rectangle(-10, -2, 20, 2, color);
      disc.setOrigin(0, 0);
      disc.setAlpha(0.7);
      c.add(disc);
      return c;
    };

    const holo1 = buildHologram(11 * TILE_PX, 8 * TILE_PX, CYBERPUNK_SHANGHAI.holoCyan);
    setDepthForProp(holo1);
    const holo2 = buildHologram(17 * TILE_PX, 9 * TILE_PX, CYBERPUNK_SHANGHAI.holoMagenta);
    setDepthForProp(holo2);
    const holo3 = buildHologram(15 * TILE_PX, 12 * TILE_PX, CYBERPUNK_SHANGHAI.neonViolet);
    setDepthForProp(holo3);

    // Pulse the holograms
    this.holoPulseTween = this.tweens.add({
      targets: [...holo1.getAll(), ...holo2.getAll(), ...holo3.getAll()],
      alpha: { from: 0.3, to: 0.85 },
      yoyo: true,
      repeat: -1,
      duration: 1400,
      ease: 'Sine.easeInOut',
      delay: this.tweens.stagger(100, { start: 0 }),
    });

    // Dumpsters (ambient props)
    const buildDumpster = (x: number, y: number) => {
      const c = this.add.container(x, y);
      const band = (rx: number, ry: number, w: number, h: number, col: number) => {
        const r = this.add.rectangle(rx, ry, w, h, col);
        r.setOrigin(0, 0);
        c.add(r);
      };
      band(-22, -16, 44, 16, CYBERPUNK_SHANGHAI.chromeBlack);
      band(-22, -16, 44, 2, CYBERPUNK_SHANGHAI.chromeSteel);
      band(-22, -10, 44, 1, CYBERPUNK_SHANGHAI.chromeRust);
      band(-22, 0, 44, 2, CYBERPUNK_SHANGHAI.voidDeep);
      // Trash spilled
      band(20, -4, 6, 4, CYBERPUNK_SHANGHAI.neonAmber);
      band(-26, -2, 6, 2, CYBERPUNK_SHANGHAI.neonViolet);
      band(-30, -1, 4, 1, CYBERPUNK_SHANGHAI.neonCyan);
      // Graffiti tag
      band(-18, -12, 6, 2, CYBERPUNK_SHANGHAI.neonMagenta);
      return c;
    };

    setDepthForProp(buildDumpster(25 * TILE_PX, 7 * TILE_PX));
    setDepthForProp(buildDumpster(3 * TILE_PX, 14 * TILE_PX));
    setDepthForProp(buildDumpster(13 * TILE_PX, 4 * TILE_PX));
  }

  private spawnPlayer(): void {
    const spawnX = 2 * TILE_PX;
    const spawnY = Math.round(SHANGHAI_ROWS * 0.6) * TILE_PX;
    this.player = new Player(this, spawnX, spawnY, {
      textureKey: this.spriteKeys?.player ?? this.atlasKey,
      speed: 130,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
      hitboxSize: 18,
    });
  }

  private spawnNpcs(): void {
    if (!this.spriteKeys) return;
    // Caravan vendor relocated here per quest step 7
    this.caravanVendorNpc = new NPC(this, 6 * TILE_PX, 10 * TILE_PX, {
      npcId: 'caravan_vendor',
      displayName: 'Caravan Vendor',
      textureKey: this.spriteKeys.caravanVendor,
      interactRadius: 48,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
    });

    // Ambient cyberpunk NPCs
    this.synthVendorNpc = new NPC(this, 13 * TILE_PX, 9 * TILE_PX, {
      npcId: 'synth_vendor',
      displayName: 'Synth Vendor',
      textureKey: this.spriteKeys.synthVendor,
      interactRadius: 40,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
    });
    this.cyborgGuardNpc = new NPC(this, 21 * TILE_PX, 7 * TILE_PX, {
      npcId: 'cyborg_guard',
      displayName: 'Cyborg Guard',
      textureKey: this.spriteKeys.cyborgGuard,
      interactRadius: 40,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
    });
    this.streetRatNpc = new NPC(this, 9 * TILE_PX, 13 * TILE_PX, {
      npcId: 'street_rat',
      displayName: 'Street Rat',
      textureKey: this.spriteKeys.streetRat,
      interactRadius: 40,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
    });
    this.salarymanNpc = new NPC(this, 18 * TILE_PX, 13 * TILE_PX, {
      npcId: 'salaryman',
      displayName: 'Salaryman',
      textureKey: this.spriteKeys.salaryman,
      interactRadius: 40,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
    });
  }

  private configureCamera(worldWidth: number, worldHeight: number) {
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    const zoom = Math.max(2, Math.min(4, this.scale.width / worldWidth));
    this.cameras.main.setZoom(zoom);
    if (this.player) {
      this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    }
    this.scale.on(Phaser.Scale.Events.RESIZE, (size: Phaser.Structs.Size) => {
      const nextZoom = Math.max(2, Math.min(4, size.width / worldWidth));
      this.cameras.main.setZoom(nextZoom);
    });
  }

  private registerSceneCleanup() {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.holoPulseTween?.stop();
      this.holoPulseTween = undefined;
      this.signFlickerTween?.stop();
      this.signFlickerTween = undefined;
      this.signOverheadTween?.stop();
      this.signOverheadTween = undefined;
      this.rainFx?.stop();
      this.rainFx?.destroy();
      this.rainFx = undefined;
      this.smogFx?.stop();
      this.smogFx?.destroy();
      this.smogFx = undefined;
      this.sorter?.unregisterAll();
      this.sorter = undefined;
      for (const unsub of this.unsubscribers) {
        try {
          unsub();
        } catch (err) {
          console.error('[CyberpunkShanghaiScene] subscription cleanup threw', err);
        }
      }
      this.unsubscribers = [];
      const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
      bus?.emit('game.scene.shutdown', { sceneKey: this.scene.key });
    });
  }
}
