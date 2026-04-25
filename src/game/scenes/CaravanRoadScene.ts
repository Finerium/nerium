//
// src/game/scenes/CaravanRoadScene.ts
//
// Helios-v2 W3 S3: Caravan Road transition scene (NEW). Bridges the Medieval
// Desert lobby (ApolloVillageScene) and the Cyberpunk Shanghai district
// (CyberpunkShanghaiScene, ships S4). Scene reads as a travel montage along
// a dirt road that fades from warm desert dusk into a distant cyberpunk
// neon-tease silhouette on the horizon.
//
// Visual stack:
//   Layer 0 (sky_gradient):  buildSkyGradient('caravan_road') 7-band
//                            warm-cool transitional dusk gradient.
//   Layer 1 (parallax_bg):   distant warm mountains at scrollFactor 0.25
//                            + cyberpunk-tease silhouette at scrollFactor
//                            0.45 with neon flicker glints.
//   Layer 2 (ground_tiles):  rust-tinted dirt road bands progressing wider
//                            toward foreground (near-camera trapezoid).
//   Layer 3 (world_tiles):   caravan wagon (decoration container) + ox
//                            silhouette + 2-3 ambient traveler NPCs +
//                            player. Y-sort dynamic via SceneSorter.
//   Layer 4 (above_tiles):   wind-blown leaf overhang / banner strips.
//   Ambient FX:              buildAmbientFx('leaves') flutter rate 20/s.
//
// Quest narrative integration: scene is entered when the questStore has
// unlocked cyberpunk_shanghai. Inside the scene, walking far enough east
// emits game.zone.entered with zoneId 'caravan_road_arrival_zone' so the
// quest engine can advance step 5-7 narrative flow. Single-shot emission
// guard prevents bus spam.
//
// Cinematic 500 ms fade tween policy: scene transition manager (S7 polish
// pass) will wire the scene fade-out tween; this scene self-fades-in at
// create() with cameras.main.fadeIn(500).
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
  buildCactus,
  buildPalmTree,
  buildRock,
  CARAVAN_ROAD,
  CYBERPUNK_SHANGHAI,
  MEDIEVAL_DESERT,
  DEPTH,
  dynamicDepthFor,
} from '../visual';

interface CaravanRoadSceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
}

const FRAME_FLOOR_PRIMARY = 'floor_primary';
const FRAME_FLOOR_SECONDARY = 'floor_secondary';
const FRAME_PATH_MARKER = 'path_marker';
const FRAME_AGENT_IDLE = 'agent_idle';
const FRAME_AGENT_ACTIVE = 'agent_active';

const TILE_PX = 32;
const ROAD_COLS = 32; // longer than apollo for travel feel
const ROAD_ROWS = 14;
const WORLD_W = ROAD_COLS * TILE_PX;
const WORLD_H = ROAD_ROWS * TILE_PX;

export class CaravanRoadScene extends Phaser.Scene {
  // World id is medieval_desert per existing WorldId enum (caravan_road
  // is a transit zone within the medieval_desert atlas world; per
  // visual_manifest.contract Section 3.1 the manifest world enum includes
  // caravan_transit but state/types.ts WorldId stays at the 3-world set).
  private worldId: WorldId = 'medieval_desert';
  private atlasKey = 'atlas_medieval_desert';
  private player?: Player;
  private travelerA?: NPC;
  private travelerB?: NPC;
  private travelerC?: NPC;
  private arrivalZone?: Phaser.GameObjects.Zone;
  private arrivalEmitted = false;
  private unsubscribers: Array<() => void> = [];

  private sorter?: SceneSorter;
  private ambientFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private neonTeaseFlicker?: Phaser.Tweens.Tween;

  constructor() {
    super({ key: 'CaravanRoad' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: CaravanRoadSceneData) {
    if (data.worldId) this.worldId = data.worldId;
    this.atlasKey = `atlas_${this.worldId}`;
  }

  create() {
    const width = WORLD_W;
    const height = WORLD_H;

    this.cameras.main.setBackgroundColor('#1c1b2c');
    this.physics.world.setBounds(0, 0, width, height);

    // Cinematic fade-in (S7 will wire fade-out from scene transition manager)
    this.cameras.main.fadeIn(500, 0, 0, 0);

    // Layer 0: caravan road dusk gradient
    buildSkyGradient(this, { world: 'caravan_road', width, height });

    // Layer 1a: distant warm mountains at scrollFactor 0.25
    const mountainsRects = stairStepSilhouette(
      0,
      width,
      Math.round(height * 0.5),
      52,
      24,
      48,
      CARAVAN_ROAD.mountainFar,
      0xc1a3a3, // arbitrary seed
    );
    buildParallaxLayer(this, { rects: mountainsRects, scrollFactor: 0.25, alpha: 0.9 });

    // Layer 1b: cyberpunk-tease silhouette on right portion of horizon
    // (player walks east toward it, story-foreshadowing element).
    const cityTeaserRects = stairStepSilhouette(
      Math.round(width * 0.55),
      width,
      Math.round(height * 0.55),
      24,
      32,
      72,
      CARAVAN_ROAD.cityTeaser,
      0x5e7e7, // distinct seed
    );
    const teaserContainer = buildParallaxLayer(this, {
      rects: cityTeaserRects,
      scrollFactor: 0.45,
      alpha: 0.92,
    });

    // Add neon flicker dots over the cyberpunk silhouette (cyan + magenta)
    this.spawnCityTeaserFlicker(width, height, teaserContainer);

    // Layer 2: dirt road tilemap. Use floor_primary as the cobble base then
    // overlay path_marker rectangles in widening bands toward foreground
    // (near-camera trapezoid effect).
    this.layoutRoad(width, height);

    // Layer 3: decoration props + caravan wagon + ox + travelers + player
    this.sorter = new SceneSorter();
    this.spawnDecoration();
    this.spawnCaravanWagon();
    this.spawnPlayer();
    this.spawnTravelers();
    this.spawnArrivalZone();

    if (this.player) this.sorter.register(this.player);
    if (this.travelerA) this.sorter.register(this.travelerA);
    if (this.travelerB) this.sorter.register(this.travelerB);
    if (this.travelerC) this.sorter.register(this.travelerC);

    // Layer 4: wind-stir banner / leaf strip overhead
    this.layoutCanopy(width);

    // Ambient FX: leaves
    this.ambientFx = buildAmbientFx(this, { kind: 'leaves' });

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
    if (this.player && this.travelerA) this.travelerA.updateProximity(this.player);
    if (this.player && this.travelerB) this.travelerB.updateProximity(this.player);
    if (this.player && this.travelerC) this.travelerC.updateProximity(this.player);
    this.sorter?.tick();
  }

  // ---- helpers ----

  private layoutRoad(width: number, height: number): void {
    // Base ground: alternating sand checker (re-uses MEDIEVAL_DESERT atlas)
    for (let row = 0; row < ROAD_ROWS; row++) {
      for (let col = 0; col < ROAD_COLS; col++) {
        const slot = (row + col) % 3 === 0 ? FRAME_FLOOR_SECONDARY : FRAME_FLOOR_PRIMARY;
        const t = this.add.image(
          col * TILE_PX + TILE_PX / 2,
          row * TILE_PX + TILE_PX / 2,
          this.atlasKey,
          slot,
        );
        t.setOrigin(0.5, 0.5);
        t.setDepth(DEPTH.GROUND_TILES);
        // Tint progressively cooler toward the east half so the road reads
        // "moving from warm desert into cyber district".
        if (col > ROAD_COLS * 0.6) {
          t.setTint(CARAVAN_ROAD.groundFar);
        } else {
          t.setTint(CARAVAN_ROAD.groundMid);
        }
      }
    }

    // Dirt road horizontal bands (trapezoid widening toward foreground)
    const roadRow = Math.floor(ROAD_ROWS * 0.55);
    const bandColors = [
      CARAVAN_ROAD.roadDark,
      CARAVAN_ROAD.roadMid,
      CARAVAN_ROAD.roadHi,
      CARAVAN_ROAD.roadMid,
      CARAVAN_ROAD.roadDark,
    ];
    for (let i = 0; i < bandColors.length; i++) {
      const y = (roadRow + i) * TILE_PX;
      const r = this.add.rectangle(0, y, width, TILE_PX, bandColors[i]);
      r.setOrigin(0, 0);
      r.setDepth(DEPTH.GROUND_TILES + 1);
    }

    // Wagon-track lines (parallel) so road reads as well-traveled
    for (let x = 0; x < width; x += 12) {
      const trackA = this.add.rectangle(x, (roadRow + 1) * TILE_PX + 6, 6, 1, CARAVAN_ROAD.roadDither);
      trackA.setOrigin(0, 0);
      trackA.setDepth(DEPTH.GROUND_TILES + 2);
      const trackB = this.add.rectangle(x, (roadRow + 3) * TILE_PX + 6, 6, 1, CARAVAN_ROAD.roadDither);
      trackB.setOrigin(0, 0);
      trackB.setDepth(DEPTH.GROUND_TILES + 2);
    }

    // Path markers along road shoulder (east-leading visual cue)
    for (let col = 4; col < ROAD_COLS - 2; col += 4) {
      const t = this.add.image(
        col * TILE_PX + TILE_PX / 2,
        (roadRow - 1) * TILE_PX + TILE_PX / 2,
        this.atlasKey,
        FRAME_PATH_MARKER,
      );
      t.setOrigin(0.5, 0.5);
      t.setDepth(DEPTH.GROUND_TILES + 3);
    }
  }

  private spawnDecoration(): void {
    const setDepthForProp = (c: Phaser.GameObjects.Container) => {
      c.setDepth(dynamicDepthFor(c.y));
    };

    // Cacti scattered along the road
    const cact1 = buildCactus(this, 4 * TILE_PX, 5 * TILE_PX, 'small');
    setDepthForProp(cact1);
    const cact2 = buildCactus(this, 11 * TILE_PX, 4 * TILE_PX, 'large');
    setDepthForProp(cact2);
    const cact3 = buildCactus(this, 19 * TILE_PX, 5 * TILE_PX, 'small');
    setDepthForProp(cact3);
    const cact4 = buildCactus(this, 28 * TILE_PX, 12 * TILE_PX, 'large');
    setDepthForProp(cact4);

    // Palm tree (oasis hint near cyberpunk transition)
    const palm = buildPalmTree(this, 22 * TILE_PX, 11 * TILE_PX);
    setDepthForProp(palm);

    // Rocks scattered for foreground anchoring
    const rk1 = buildRock(this, 6 * TILE_PX, 11 * TILE_PX, 14, 5);
    setDepthForProp(rk1);
    const rk2 = buildRock(this, 16 * TILE_PX, 12 * TILE_PX, 12, 5);
    setDepthForProp(rk2);
    const rk3 = buildRock(this, 26 * TILE_PX, 4 * TILE_PX, 10, 4);
    setDepthForProp(rk3);
  }

  /**
   * Caravan wagon decoration (centerpiece). Rendered as a hand-placed
   * pixel rectangle stack matching the scene-art.js scene2() reference
   * caravan ox + cart bed + canvas awning. Anchor is base center.
   */
  private spawnCaravanWagon(): void {
    const wagonX = 14 * TILE_PX;
    const wagonY = 8.5 * TILE_PX;
    const c = this.add.container(wagonX, wagonY);
    const band = (rx: number, ry: number, w: number, h: number, color: number) => {
      const r = this.add.rectangle(rx, ry, w, h, color);
      r.setOrigin(0, 0);
      c.add(r);
    };
    // Shadow under wagon
    band(-72, 24, 144, 3, CARAVAN_ROAD.oxShadow);
    // Wheels
    band(-60, 8, 20, 20, MEDIEVAL_DESERT.plankDeep);
    band(-58, 10, 16, 16, MEDIEVAL_DESERT.plankMid);
    band(-54, 14, 8, 8, MEDIEVAL_DESERT.plankDeep);
    band(-52, 16, 4, 4, MEDIEVAL_DESERT.plankBright);
    band(40, 8, 20, 20, MEDIEVAL_DESERT.plankDeep);
    band(42, 10, 16, 16, MEDIEVAL_DESERT.plankMid);
    band(46, 14, 8, 8, MEDIEVAL_DESERT.plankDeep);
    band(48, 16, 4, 4, MEDIEVAL_DESERT.plankBright);
    // Cart bed
    band(-66, -4, 132, 14, MEDIEVAL_DESERT.plankMid);
    band(-66, -4, 132, 2, MEDIEVAL_DESERT.plankHi);
    band(-66, 8, 132, 2, MEDIEVAL_DESERT.plankDeep);
    // Canvas awning bands
    band(-46, -28, 100, 2, CARAVAN_ROAD.awningBone);
    band(-52, -26, 112, 2, CARAVAN_ROAD.awningHi);
    band(-56, -24, 120, 2, CARAVAN_ROAD.awningBone);
    band(-58, -22, 124, 2, CARAVAN_ROAD.awningStripe);
    band(-60, -20, 128, 14, CARAVAN_ROAD.awningBone);
    band(-60, -6, 128, 2, MEDIEVAL_DESERT.plankBright);
    for (let xx = -52; xx < 64; xx += 10) band(xx, -20, 4, 14, CARAVAN_ROAD.awningStripe);
    // Opening in back
    band(-50, -12, 14, 14, CARAVAN_ROAD.oxShadow);
    band(8, -16, 18, 10, MEDIEVAL_DESERT.plankDeep);
    band(8, -16, 18, 1, MEDIEVAL_DESERT.plankHi);
    // Lantern hanging from awning right
    band(64, -28, 1, 14, MEDIEVAL_DESERT.plankDeep);
    band(60, -14, 8, 8, MEDIEVAL_DESERT.plankDeep);
    band(61, -13, 6, 6, MEDIEVAL_DESERT.flameAmber);
    band(62, -12, 4, 4, MEDIEVAL_DESERT.flameBright);
    // Ox in front pulling cart
    const oxX = 66;
    const oxY = -10;
    band(oxX, oxY + 6, 34, 20, CARAVAN_ROAD.oxBody);
    band(oxX, oxY + 6, 34, 2, CARAVAN_ROAD.oxHi);
    band(oxX, oxY + 24, 34, 2, CARAVAN_ROAD.oxShadow);
    band(oxX + 32, oxY + 10, 14, 14, CARAVAN_ROAD.oxBody);
    band(oxX + 32, oxY + 10, 14, 2, CARAVAN_ROAD.oxHi);
    band(oxX + 38, oxY + 6, 2, 4, CARAVAN_ROAD.awningBone); // horns
    band(oxX + 44, oxY + 6, 2, 4, CARAVAN_ROAD.awningBone);
    band(oxX + 40, oxY + 4, 4, 2, CARAVAN_ROAD.awningBone);
    band(oxX + 4, oxY + 26, 3, 12, CARAVAN_ROAD.oxShadow);
    band(oxX + 14, oxY + 26, 3, 12, CARAVAN_ROAD.oxShadow);
    band(oxX + 24, oxY + 26, 3, 12, CARAVAN_ROAD.oxShadow);
    band(oxX + 30, oxY + 26, 3, 12, CARAVAN_ROAD.oxShadow);

    c.setDepth(dynamicDepthFor(c.y));
  }

  private layoutCanopy(width: number): void {
    // Wind-stirred banner strips at top: alternating cloth colors
    for (let x = 24; x < width; x += 80) {
      const w = 36 + ((x * 7) % 10);
      const flagPole = this.add.rectangle(x, -4, 1, 12, MEDIEVAL_DESERT.plankDeep);
      flagPole.setOrigin(0, 0);
      flagPole.setDepth(DEPTH.ABOVE_TILES);
      const flag = this.add.rectangle(x, -2, w, 8, MEDIEVAL_DESERT.tentTerracotta);
      flag.setOrigin(0, 0);
      flag.setAlpha(0.8);
      flag.setDepth(DEPTH.ABOVE_TILES + 1);
    }
  }

  /**
   * Cyberpunk-tease neon flicker over distant city silhouette. 6 cyan +
   * magenta + amber pixel dots, tweened alpha so the horizon "blinks
   * alive" across the dusk gradient. Pure cosmetic, no quest coupling.
   */
  private spawnCityTeaserFlicker(
    width: number,
    height: number,
    container: Phaser.GameObjects.Container,
  ): void {
    const yMin = Math.round(height * 0.45);
    const yMax = Math.round(height * 0.55);
    const positions: Array<[number, number, number]> = [
      [Math.round(width * 0.62), yMin + 4, CYBERPUNK_SHANGHAI.neonCyan],
      [Math.round(width * 0.68), yMin + 12, CYBERPUNK_SHANGHAI.neonMagenta],
      [Math.round(width * 0.74), yMin + 6, CYBERPUNK_SHANGHAI.neonAmber],
      [Math.round(width * 0.78), yMin + 18, CYBERPUNK_SHANGHAI.neonCyan],
      [Math.round(width * 0.86), yMin + 10, CYBERPUNK_SHANGHAI.neonMagenta],
      [Math.round(width * 0.92), yMax - 8, CYBERPUNK_SHANGHAI.neonCyan],
    ];
    const dots: Phaser.GameObjects.Rectangle[] = [];
    for (const [x, y, color] of positions) {
      const dot = this.add.rectangle(x, y, 2, 2, color);
      dot.setOrigin(0, 0);
      dot.setAlpha(0.7);
      container.add(dot);
      dots.push(dot);
    }
    this.neonTeaseFlicker = this.tweens.add({
      targets: dots,
      alpha: { from: 0.4, to: 1.0 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: this.tweens.stagger(180, { start: 0, ease: 'Linear' }),
    });
  }

  private spawnPlayer(): void {
    // Spawn at far-west road edge (entering from Apollo Village direction)
    const spawnX = 2 * TILE_PX;
    const spawnY = Math.round(ROAD_ROWS * 0.6) * TILE_PX;
    this.player = new Player(this, spawnX, spawnY, {
      textureKey: this.atlasKey,
      frame: FRAME_AGENT_IDLE,
      speed: 130,
    });
  }

  private spawnTravelers(): void {
    // Three ambient traveler NPCs, scattered along the road
    this.travelerA = new NPC(this, 9 * TILE_PX, 7 * TILE_PX, {
      npcId: 'traveler_a',
      displayName: 'Traveler',
      textureKey: this.atlasKey,
      frame: FRAME_AGENT_ACTIVE,
      interactRadius: 40,
    });
    this.travelerB = new NPC(this, 17 * TILE_PX, 10 * TILE_PX, {
      npcId: 'traveler_b',
      displayName: 'Wanderer',
      textureKey: this.atlasKey,
      frame: FRAME_AGENT_IDLE,
      interactRadius: 40,
    });
    this.travelerC = new NPC(this, 25 * TILE_PX, 7 * TILE_PX, {
      npcId: 'traveler_c',
      displayName: 'Pilgrim',
      textureKey: this.atlasKey,
      frame: FRAME_AGENT_ACTIVE,
      interactRadius: 40,
    });
  }

  /**
   * Single-shot arrival zone at far east edge: walking into it advances
   * the quest narrative (step 5-7). Bridge translates game.zone.entered
   * into the zone_enter trigger per quest_schema.contract.md.
   */
  private spawnArrivalZone(): void {
    const zoneX = (ROAD_COLS - 2) * TILE_PX;
    const zoneY = Math.round(ROAD_ROWS * 0.6) * TILE_PX;
    const zoneWidth = 3 * TILE_PX;
    const zoneHeight = 4 * TILE_PX;
    const zone = this.add.zone(zoneX, zoneY, zoneWidth, zoneHeight);
    this.physics.add.existing(zone, true);
    this.arrivalZone = zone;
    if (this.player) {
      this.physics.add.overlap(this.player, zone, () => {
        if (this.arrivalEmitted) return;
        this.arrivalEmitted = true;
        const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
        const payload = {
          zoneId: 'caravan_road_arrival_zone',
          sceneKey: this.scene.key,
        };
        if (bus) {
          bus.emit('game.zone.entered', payload);
        } else {
          this.game.events.emit('game.zone.entered', payload);
        }
      });
    }
  }

  private configureCamera(worldWidth: number, _worldHeight: number) {
    this.cameras.main.setBounds(0, 0, worldWidth, _worldHeight);
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
      this.neonTeaseFlicker?.stop();
      this.neonTeaseFlicker = undefined;
      this.ambientFx?.stop();
      this.ambientFx?.destroy();
      this.ambientFx = undefined;
      this.sorter?.unregisterAll();
      this.sorter = undefined;
      for (const unsub of this.unsubscribers) {
        try {
          unsub();
        } catch (err) {
          console.error('[CaravanRoadScene] subscription cleanup threw', err);
        }
      }
      this.unsubscribers = [];
      const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
      bus?.emit('game.scene.shutdown', { sceneKey: this.scene.key });
    });
  }
}
