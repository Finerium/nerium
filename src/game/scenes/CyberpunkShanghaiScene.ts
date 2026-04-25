//
// src/game/scenes/CyberpunkShanghaiScene.ts
//
// Helios-v2 W3 S4: Cyberpunk Shanghai District scene (NEW). The final
// destination after the Caravan Road transition. Magenta + cyan neon clash
// over a deep void base, rim-light puddle reflections, hologram pulse,
// neon rain + smog ambient FX. Caravan vendor NPC relocates to this scene
// per agent prompt scene matrix Session 3 (B5 Epimetheus quest step 7).
//
// Visual stack:
//   Layer 0 sky_gradient: 4-band cyberpunk void (deep -> mid -> upper ->
//     smog purple) via buildSkyGradient('cyberpunk_shanghai').
//   Layer 1 parallax_bg: 3 silhouette layers (far buildings, mid towers,
//     near skyline) with neon window glints (cyan + magenta + amber) +
//     antenna blink pixels.
//   Layer 2 ground_tiles: rust-tinted pavement floor + neon puddle
//     reflections (cyan + magenta horizontal strips at random rows
//     simulating rim-light on wet pavement).
//   Layer 3 world_tiles: vending machine clusters + neon sign poles +
//     hologram pulse columns + dumpster prop + caravan_vendor NPC
//     (relocated from Apollo on quest step 7) + 4 ambient NPCs
//     (synth-vendor, cyborg-guard, street-rat, salaryman) + player. All
//     y-sorted via SceneSorter.
//   Layer 4 above_tiles: hanging neon sign + cable strip at top of scene.
//   Ambient FX: buildAmbientFx('rain') 60/s + buildAmbientFx('neon_smog')
//     25/s overlapped (rain in front, smog behind).
//
// Caravan vendor relocation: per agent prompt Session 3 + B5 Epimetheus
// build, on quest step 7 the caravan_vendor NPC moves from
// ApolloVillageScene to CyberpunkShanghaiScene. The vendor is spawned
// in this scene with the same npcId 'caravan_vendor' and same
// displayName 'Caravan Vendor' so the quest dialogue triggers continue
// to fire identically. The Apollo-scene caravan_vendor stays present
// for backward play (player who never completes step 7 still sees it);
// the cyber-scene caravan_vendor exists in parallel.
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
  CYBERPUNK_SHANGHAI,
  DEPTH,
  dynamicDepthFor,
} from '../visual';

interface CyberpunkShanghaiSceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
}

const FRAME_FLOOR_PRIMARY = 'floor_primary';
const FRAME_FLOOR_SECONDARY = 'floor_secondary';
const FRAME_AGENT_IDLE = 'agent_idle';
const FRAME_AGENT_ACTIVE = 'agent_active';

const TILE_PX = 32;
const SHANGHAI_COLS = 28;
const SHANGHAI_ROWS = 16;
const WORLD_W = SHANGHAI_COLS * TILE_PX;
const WORLD_H = SHANGHAI_ROWS * TILE_PX;

export class CyberpunkShanghaiScene extends Phaser.Scene {
  private worldId: WorldId = 'cyberpunk_shanghai';
  private atlasKey = 'atlas_cyberpunk_shanghai';
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

    // Cinematic fade-in
    this.cameras.main.fadeIn(500, 0, 0, 0);

    // Layer 0: void gradient
    buildSkyGradient(this, { world: 'cyberpunk_shanghai', width, height });

    // Layer 1a: far building silhouette stack
    const farRects = stairStepSilhouette(
      0,
      width,
      Math.round(height * 0.4),
      24,
      36,
      80,
      CYBERPUNK_SHANGHAI.buildingFar,
      0xfa3,
    );
    buildParallaxLayer(this, { rects: farRects, scrollFactor: 0.2, alpha: 0.95 });

    // Layer 1b: mid towers
    const midRects = stairStepSilhouette(
      0,
      width,
      Math.round(height * 0.5),
      32,
      48,
      96,
      CYBERPUNK_SHANGHAI.buildingMid,
      0xb4d,
    );
    const midContainer = buildParallaxLayer(this, {
      rects: midRects,
      scrollFactor: 0.4,
      alpha: 0.95,
    });

    // Add neon window glints scattered across mid layer
    this.spawnNeonGlints(midContainer, width, height);

    // Layer 1c: near skyline
    const nearRects = stairStepSilhouette(
      0,
      width,
      Math.round(height * 0.55),
      28,
      32,
      72,
      CYBERPUNK_SHANGHAI.buildingNear,
      0xc8e,
    );
    buildParallaxLayer(this, { rects: nearRects, scrollFactor: 0.6, alpha: 0.92 });

    // Layer 2: pavement + neon puddle reflections
    this.layoutPavement(width, height);

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

    // Layer 4: hanging neon sign + cable strip
    this.layoutOverhead(width);

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
    // Scatter cyan + magenta + amber 2x2 pixels across the mid building
    // band, then tween a stagger flicker so windows blink alive.
    const positions: Array<[number, number, number]> = [];
    for (let i = 0; i < 60; i++) {
      const x = (i * 47) % width;
      const y = Math.round(height * 0.2) + ((i * 17) % Math.round(height * 0.3));
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
    }
    this.signFlickerTween = this.tweens.add({
      targets: dots,
      alpha: { from: 0.5, to: 1.0 },
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: this.tweens.stagger(80, { start: 0, ease: 'Linear' }),
    });
  }

  private layoutPavement(width: number, height: number): void {
    // Pavement floor: re-use medieval atlas's floor frames with cyberpunk
    // tint applied per tile (no separate cyberpunk floor sprite needed for
    // S4 ship; tint pass keeps asset budget zero per CC0 strategy).
    for (let row = 0; row < SHANGHAI_ROWS; row++) {
      for (let col = 0; col < SHANGHAI_COLS; col++) {
        const slot = (row + col) % 4 === 0 ? FRAME_FLOOR_SECONDARY : FRAME_FLOOR_PRIMARY;
        const t = this.add.image(
          col * TILE_PX + TILE_PX / 2,
          row * TILE_PX + TILE_PX / 2,
          this.atlasKey,
          slot,
        );
        t.setOrigin(0.5, 0.5);
        t.setDepth(DEPTH.GROUND_TILES);
        t.setTint(CYBERPUNK_SHANGHAI.pavement);
      }
    }
    // Wet spots: tinted strips of cyan + magenta reflection scattered
    for (let i = 0; i < 14; i++) {
      const x = (i * 73) % width;
      const y = Math.round(height * 0.55) + ((i * 41) % Math.round(height * 0.4));
      const color = i % 2 === 0
        ? CYBERPUNK_SHANGHAI.pavementReflectCyan
        : CYBERPUNK_SHANGHAI.pavementReflectMagenta;
      const wet = this.add.rectangle(x, y, 36 + ((i * 7) % 12), 4, color);
      wet.setOrigin(0, 0);
      wet.setAlpha(0.5);
      wet.setDepth(DEPTH.GROUND_TILES + 1);
    }
  }

  private spawnDecoration(): void {
    const setDepthForProp = (c: Phaser.GameObjects.Container) => {
      c.setDepth(dynamicDepthFor(c.y));
    };

    // Vending machine cluster (3 colored boxes with flicker glow)
    const buildVendingMachine = (x: number, y: number, color: number) => {
      const c = this.add.container(x, y);
      const band = (rx: number, ry: number, w: number, h: number, col: number) => {
        const r = this.add.rectangle(rx, ry, w, h, col);
        r.setOrigin(0, 0);
        c.add(r);
      };
      band(-12, -36, 24, 36, CYBERPUNK_SHANGHAI.chromeBlack);
      band(-10, -34, 20, 18, color);
      band(-10, -34, 20, 1, CYBERPUNK_SHANGHAI.holoCyan);
      band(-8, -14, 16, 8, CYBERPUNK_SHANGHAI.chromeSteel);
      band(-6, -12, 12, 4, CYBERPUNK_SHANGHAI.neonAmber);
      band(-12, 0, 24, 2, CYBERPUNK_SHANGHAI.chromeRust);
      return c;
    };

    setDepthForProp(buildVendingMachine(4 * TILE_PX, 9 * TILE_PX, CYBERPUNK_SHANGHAI.neonMagenta));
    setDepthForProp(buildVendingMachine(5 * TILE_PX, 9 * TILE_PX, CYBERPUNK_SHANGHAI.neonCyan));
    setDepthForProp(buildVendingMachine(23 * TILE_PX, 11 * TILE_PX, CYBERPUNK_SHANGHAI.neonViolet));

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
      band(-3, 0, 6, 2, CYBERPUNK_SHANGHAI.chromeBlack);
      return c;
    };

    setDepthForProp(buildSignPole(8 * TILE_PX, 8 * TILE_PX, CYBERPUNK_SHANGHAI.neonCyan));
    setDepthForProp(buildSignPole(14 * TILE_PX, 6 * TILE_PX, CYBERPUNK_SHANGHAI.neonMagenta));
    setDepthForProp(buildSignPole(20 * TILE_PX, 8 * TILE_PX, CYBERPUNK_SHANGHAI.neonViolet));

    // Hologram pulse columns
    const buildHologram = (x: number, y: number, color: number) => {
      const c = this.add.container(x, y);
      for (let i = 0; i < 5; i++) {
        const r = this.add.rectangle(-8, -8 - i * 8, 16, 4, color);
        r.setOrigin(0, 0);
        r.setAlpha(0.5);
        c.add(r);
      }
      return c;
    };

    const holo1 = buildHologram(11 * TILE_PX, 8 * TILE_PX, CYBERPUNK_SHANGHAI.holoCyan);
    setDepthForProp(holo1);
    const holo2 = buildHologram(17 * TILE_PX, 9 * TILE_PX, CYBERPUNK_SHANGHAI.holoMagenta);
    setDepthForProp(holo2);

    // Pulse the holograms (alpha tween for "alive" effect)
    this.holoPulseTween = this.tweens.add({
      targets: [...holo1.getAll(), ...holo2.getAll()],
      alpha: { from: 0.3, to: 0.85 },
      yoyo: true,
      repeat: -1,
      duration: 1400,
      ease: 'Sine.easeInOut',
      delay: this.tweens.stagger(120, { start: 0 }),
    });

    // Dumpster (ambient prop)
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
      return c;
    };

    setDepthForProp(buildDumpster(25 * TILE_PX, 7 * TILE_PX));
    setDepthForProp(buildDumpster(3 * TILE_PX, 14 * TILE_PX));
  }

  private layoutOverhead(width: number): void {
    // Hanging neon sign strips at top of scene (above_tiles depth)
    for (let x = 32; x < width; x += 96) {
      const cable = this.add.rectangle(x, 0, 1, 16, CYBERPUNK_SHANGHAI.chromeSteel);
      cable.setOrigin(0, 0);
      cable.setDepth(DEPTH.ABOVE_TILES);
      const sign = this.add.rectangle(x - 14, 16, 30, 8, CYBERPUNK_SHANGHAI.neonMagenta);
      sign.setOrigin(0, 0);
      sign.setDepth(DEPTH.ABOVE_TILES + 1);
      sign.setAlpha(0.9);
    }
    // Power cables across top
    const cable1 = this.add.rectangle(0, 4, width, 1, CYBERPUNK_SHANGHAI.chromeSteel);
    cable1.setOrigin(0, 0);
    cable1.setDepth(DEPTH.ABOVE_TILES);
    const cable2 = this.add.rectangle(0, 12, width, 1, CYBERPUNK_SHANGHAI.chromeRust);
    cable2.setOrigin(0, 0);
    cable2.setDepth(DEPTH.ABOVE_TILES);
  }

  private spawnPlayer(): void {
    // Spawn at far west edge (entering from CaravanRoad direction)
    const spawnX = 2 * TILE_PX;
    const spawnY = Math.round(SHANGHAI_ROWS * 0.6) * TILE_PX;
    this.player = new Player(this, spawnX, spawnY, {
      textureKey: this.atlasKey,
      frame: FRAME_AGENT_IDLE,
      speed: 130,
    });
  }

  private spawnNpcs(): void {
    // Caravan vendor relocated here per quest step 7
    this.caravanVendorNpc = new NPC(this, 6 * TILE_PX, 10 * TILE_PX, {
      npcId: 'caravan_vendor',
      displayName: 'Caravan Vendor',
      textureKey: this.atlasKey,
      frame: FRAME_AGENT_IDLE,
      interactRadius: 48,
    });

    // Ambient cyberpunk NPCs (4 variants)
    this.synthVendorNpc = new NPC(this, 13 * TILE_PX, 9 * TILE_PX, {
      npcId: 'synth_vendor',
      displayName: 'Synth Vendor',
      textureKey: this.atlasKey,
      frame: FRAME_AGENT_ACTIVE,
      interactRadius: 40,
    });
    this.cyborgGuardNpc = new NPC(this, 21 * TILE_PX, 7 * TILE_PX, {
      npcId: 'cyborg_guard',
      displayName: 'Cyborg Guard',
      textureKey: this.atlasKey,
      frame: FRAME_AGENT_ACTIVE,
      interactRadius: 40,
    });
    this.streetRatNpc = new NPC(this, 9 * TILE_PX, 13 * TILE_PX, {
      npcId: 'street_rat',
      displayName: 'Street Rat',
      textureKey: this.atlasKey,
      frame: FRAME_AGENT_IDLE,
      interactRadius: 40,
    });
    this.salarymanNpc = new NPC(this, 18 * TILE_PX, 13 * TILE_PX, {
      npcId: 'salaryman',
      displayName: 'Salaryman',
      textureKey: this.atlasKey,
      frame: FRAME_AGENT_IDLE,
      interactRadius: 40,
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
