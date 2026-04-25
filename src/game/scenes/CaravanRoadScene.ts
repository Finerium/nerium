//
// src/game/scenes/CaravanRoadScene.ts
//
// Helios-v2 W3 CORRECTION: rewritten ground paint + sprite textures +
// foliage canopy + horizon haze to reach Sea of Stars / Crosscode tier.
//
// Caravan Road transition scene. Bridges Medieval Desert lobby (Apollo) to
// Cyberpunk Shanghai. Travel montage along a dirt road that fades from
// warm desert dusk into a distant cyberpunk neon-tease silhouette.
//
// Visual stack:
//   Layer 0 sky_gradient: 7-band warm-cool transitional dusk
//   Layer 1 parallax_bg:  warm mountain silhouette + cyberpunk-tease
//                         silhouette right + horizon haze blend strip
//   Layer 2 ground_tiles: paintCaravanRoadGround (5-band rust earth +
//                         trapezoid widening road + wagon tracks)
//   Layer 3 world_tiles:  caravan wagon decoration container + ox + 3
//                         traveler NPCs + cacti + palm + rocks + player.
//                         All y-sorted via SceneSorter.
//   Layer 4 above_tiles:  paintCaravanCanopy banner flags + distant birds
//   Ambient FX:           leaves flutter rate 20/s
//
// Quest narrative integration: scene entered when questStore unlocks
// cyberpunk_shanghai. Walking far enough east emits game.zone.entered
// with zoneId 'caravan_road_arrival_zone' for quest step 5-7 advance.
//
// Cinematic 500ms fade-in via cameras.main.fadeIn(500).
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
  paintCaravanRoadGround,
  paintCaravanCanopy,
  paintHorizonHaze,
  buildCaravanRoadSprites,
  type CaravanRoadSpriteKeys,
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

const TILE_PX = 32;
const ROAD_COLS = 32;
const ROAD_ROWS = 14;
const WORLD_W = ROAD_COLS * TILE_PX;
const WORLD_H = ROAD_ROWS * TILE_PX;

const CHARACTER_SPRITE_SCALE = 3;

export class CaravanRoadScene extends Phaser.Scene {
  private worldId: WorldId = 'medieval_desert';
  private atlasKey = 'atlas_medieval_desert';
  private spriteKeys?: CaravanRoadSpriteKeys;
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
  private lanternFlicker?: Phaser.Tweens.Tween;

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

    // Cinematic fade-in
    this.cameras.main.fadeIn(500, 0, 0, 0);

    // Build character sprite textures FIRST
    this.spriteKeys = buildCaravanRoadSprites(this);

    // Layer 0: dusk gradient anchored to camera viewport (scrollFactor 0)
    buildSkyGradient(this, {
      world: 'caravan_road',
      width: this.scale.width,
      height: this.scale.height,
    });

    // Layer 1a: distant warm mountains. baseY at world height * 0.55 so
    // silhouettes sit right above the ground band.
    const mountainsRects = stairStepSilhouette(
      0,
      width,
      Math.round(height * 0.55),
      52,
      24,
      48,
      CARAVAN_ROAD.mountainFar,
      0xc1a3a3,
    );
    buildParallaxLayer(this, { rects: mountainsRects, scrollFactor: 0.25, alpha: 0.9 });

    // Mountain top warm highlight
    const mtnHighlight = stairStepSilhouette(
      0,
      Math.round(width * 0.55),
      Math.round(height * 0.55),
      52,
      24,
      28,
      CARAVAN_ROAD.mountainHi,
      0xc1a3a3,
    );
    buildParallaxLayer(this, {
      rects: mtnHighlight.map((r) => ({ ...r, height: 2 })),
      scrollFactor: 0.25,
      alpha: 0.7,
    });

    // Layer 1b: cyberpunk-tease silhouette on right portion
    const cityTeaserRects = stairStepSilhouette(
      Math.round(width * 0.55),
      width,
      Math.round(height * 0.58),
      24,
      32,
      72,
      CARAVAN_ROAD.cityTeaser,
      0x5e7e7,
    );
    const teaserContainer = buildParallaxLayer(this, {
      rects: cityTeaserRects,
      scrollFactor: 0.45,
      alpha: 0.92,
    });

    // Add neon flicker dots over the cyberpunk silhouette
    this.spawnCityTeaserFlicker(width, height, teaserContainer);

    // Horizon haze blend strip
    paintHorizonHaze(this, width, height, CARAVAN_ROAD.skyAmber, 0.4);

    // Layer 2: ground floor multi-band paint
    paintCaravanRoadGround(this, width, height);

    // Layer 3: decoration props + caravan wagon + travelers + player
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

    // Layer 4: canopy + birds
    paintCaravanCanopy(this, width);

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
    const cact5 = buildCactus(this, 7 * TILE_PX, 12 * TILE_PX, 'small');
    setDepthForProp(cact5);
    const cact6 = buildCactus(this, 23 * TILE_PX, 4 * TILE_PX, 'small');
    setDepthForProp(cact6);

    // Palm tree (oasis hint near cyberpunk transition)
    const palm = buildPalmTree(this, 22 * TILE_PX, 11 * TILE_PX);
    setDepthForProp(palm);
    const palm2 = buildPalmTree(this, 3 * TILE_PX, 4 * TILE_PX);
    setDepthForProp(palm2);

    // Rocks scattered for foreground anchoring
    const rk1 = buildRock(this, 6 * TILE_PX, 11 * TILE_PX, 14, 5);
    setDepthForProp(rk1);
    const rk2 = buildRock(this, 16 * TILE_PX, 12 * TILE_PX, 12, 5);
    setDepthForProp(rk2);
    const rk3 = buildRock(this, 26 * TILE_PX, 4 * TILE_PX, 10, 4);
    setDepthForProp(rk3);
    const rk4 = buildRock(this, 9 * TILE_PX, 13 * TILE_PX, 8, 4);
    setDepthForProp(rk4);
  }

  /**
   * Caravan wagon centerpiece. Hand-placed pixel rectangles matching
   * scene-art.js scene2() reference caravan ox + cart bed + canvas awning.
   */
  private spawnCaravanWagon(): void {
    const wagonX = 14 * TILE_PX;
    const wagonY = 9 * TILE_PX;
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
    // Wheel spokes (cosmetic)
    band(-50, 12, 1, 16, MEDIEVAL_DESERT.plankBright);
    band(50, 12, 1, 16, MEDIEVAL_DESERT.plankBright);
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
    // Lantern hanging from awning right (flicker tweened)
    band(64, -28, 1, 14, MEDIEVAL_DESERT.plankDeep);
    band(60, -14, 8, 8, MEDIEVAL_DESERT.plankDeep);
    const lanternFlame = this.add.rectangle(61, -13, 6, 6, MEDIEVAL_DESERT.flameAmber);
    lanternFlame.setOrigin(0, 0);
    c.add(lanternFlame);
    const lanternBright = this.add.rectangle(62, -12, 4, 4, MEDIEVAL_DESERT.flameBright);
    lanternBright.setOrigin(0, 0);
    c.add(lanternBright);
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
    // Ox eye
    band(oxX + 42, oxY + 12, 1, 1, MEDIEVAL_DESERT.plankDeep);
    // Legs
    band(oxX + 4, oxY + 26, 3, 12, CARAVAN_ROAD.oxShadow);
    band(oxX + 14, oxY + 26, 3, 12, CARAVAN_ROAD.oxShadow);
    band(oxX + 24, oxY + 26, 3, 12, CARAVAN_ROAD.oxShadow);
    band(oxX + 30, oxY + 26, 3, 12, CARAVAN_ROAD.oxShadow);

    c.setDepth(dynamicDepthFor(c.y));

    // Tween lantern flicker
    this.lanternFlicker = this.tweens.add({
      targets: [lanternFlame, lanternBright],
      alpha: { from: 0.7, to: 1.0 },
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      duration: 280,
    });
  }

  /**
   * Cyberpunk-tease neon flicker over distant city silhouette.
   */
  private spawnCityTeaserFlicker(
    width: number,
    height: number,
    container: Phaser.GameObjects.Container,
  ): void {
    const yMin = Math.round(height * 0.45);
    const yMax = Math.round(height * 0.58);
    const positions: Array<[number, number, number]> = [
      [Math.round(width * 0.62), yMin + 4, CYBERPUNK_SHANGHAI.neonCyan],
      [Math.round(width * 0.66), yMin + 12, CYBERPUNK_SHANGHAI.neonMagenta],
      [Math.round(width * 0.7), yMin + 6, CYBERPUNK_SHANGHAI.neonAmber],
      [Math.round(width * 0.74), yMin + 18, CYBERPUNK_SHANGHAI.neonCyan],
      [Math.round(width * 0.78), yMin + 10, CYBERPUNK_SHANGHAI.neonMagenta],
      [Math.round(width * 0.82), yMin + 22, CYBERPUNK_SHANGHAI.neonViolet],
      [Math.round(width * 0.86), yMin + 8, CYBERPUNK_SHANGHAI.neonCyan],
      [Math.round(width * 0.9), yMin + 16, CYBERPUNK_SHANGHAI.neonMagenta],
      [Math.round(width * 0.94), yMax - 4, CYBERPUNK_SHANGHAI.neonCyan],
    ];
    const dots: Phaser.GameObjects.Rectangle[] = [];
    for (const [x, y, color] of positions) {
      const dot = this.add.rectangle(x, y, 2, 2, color);
      dot.setOrigin(0, 0);
      dot.setAlpha(0.7);
      container.add(dot);
      dots.push(dot);
      // Neon glow halo (slightly larger faded box)
      const halo = this.add.rectangle(x - 1, y - 1, 4, 4, color);
      halo.setOrigin(0, 0);
      halo.setAlpha(0.25);
      container.add(halo);
      dots.push(halo);
    }
    this.neonTeaseFlicker = this.tweens.add({
      targets: dots,
      alpha: { from: 0.4, to: 1.0 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: this.tweens.stagger(140, { start: 0, ease: 'Linear' }),
    });
  }

  private spawnPlayer(): void {
    const spawnX = 2 * TILE_PX;
    const spawnY = Math.round(ROAD_ROWS * 0.6) * TILE_PX;
    this.player = new Player(this, spawnX, spawnY, {
      textureKey: this.spriteKeys?.player ?? this.atlasKey,
      speed: 130,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
      hitboxSize: 18,
    });
  }

  private spawnTravelers(): void {
    if (!this.spriteKeys) return;
    this.travelerA = new NPC(this, 9 * TILE_PX, 7 * TILE_PX, {
      npcId: 'traveler_a',
      displayName: 'Traveler',
      textureKey: this.spriteKeys.travelerA,
      interactRadius: 40,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
    });
    this.travelerB = new NPC(this, 17 * TILE_PX, 10 * TILE_PX, {
      npcId: 'traveler_b',
      displayName: 'Wanderer',
      textureKey: this.spriteKeys.travelerB,
      interactRadius: 40,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
    });
    this.travelerC = new NPC(this, 25 * TILE_PX, 7 * TILE_PX, {
      npcId: 'traveler_c',
      displayName: 'Pilgrim',
      textureKey: this.spriteKeys.travelerC,
      interactRadius: 40,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
    });
  }

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
      this.lanternFlicker?.stop();
      this.lanternFlicker = undefined;
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
