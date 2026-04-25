//
// src/game/scenes/ApolloVillageScene.ts
//
// Main lobby scene for the vertical slice. Medieval Desert world aesthetic,
// top-down JRPG perspective. Helios-v2 W3 CORRECTION: rewritten ground paint
// + character sprite textures + foliage canopy + horizon haze to reach the
// Sea of Stars / Crosscode polish tier after Run #1 returned VISUAL DRIFT
// SEVERE. W3 S0 cleanup neutralized deprecated authority references; S1
// transitions to AI-asset PNG transplant.
//
// Visual stack (5 layer + ambient FX):
//   Layer 0 (sky_gradient): per-world dusk gradient via buildSkyGradient
//   Layer 1 (parallax_bg):  canyon silhouette stair-step at scrollFactor 0.4
//                           PLUS horizon atmospheric haze blend strip
//   Layer 2 (ground_tiles): paintApolloVillageGround (multi-band warm sand
//                           + speckle dither + winding trail). Replaces
//                           prior atlas-tile checkerboard.
//   Layer 3 (world_tiles):  decoration props (tent, cactus, well, firepit,
//                           palm, rock, lamp post) plus player + NPCs with
//                           dynamic y-sort via SceneSorter. Player + NPCs
//                           use generated pixel-rect sprite textures from
//                           src/game/visual/spriteTextures.ts (Apollo,
//                           treasurer, caravan vendor, guard, child,
//                           elder, 3 villager variants).
//   Layer 4 (above_tiles):  paintApolloCanopy acacia foliage overhang +
//                           hanging leaf clusters that occlude sprites
//                           passing beneath.
//   Ambient FX:             sand particle drift via buildAmbientFx('dust')
//
// Preserved from prior shipped scene (NON-REGRESSION):
//   - Player spawn + camera follow + setBounds
//   - Apollo NPC at central courtyard with 48 px interact radius
//   - Caravan gated on questStore unlock state (Caravan game object)
//   - Caravan vendor NPC for lumio_onboarding step 8 (caravan_interact)
//   - Treasurer NPC for Marshall W2 cross-pillar tier-state surface
//   - Caravan arrival zone for lumio_onboarding step 7 (caravan_spawned)
//   - game.scene.ready, game.player.spawned, game.zone.entered emissions
//   - SHUTDOWN cleanup
//   - window.__NERIUM_TEST__ Playwright hook
//
// Owner: Helios-v2 (W3 correction), Thalia-v2 (original RV scaffold).
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import type { WorldId } from '../../state/types';
import { Player } from '../objects/Player';
import { NPC } from '../objects/NPC';
import { Caravan } from '../objects/Caravan';
import { TreasurerNPC } from '../objects/TreasurerNPC';
import type { GameEventBus } from '../../state/GameEventBus';
import {
  SceneSorter,
  buildSkyGradient,
  buildParallaxLayer,
  stairStepSilhouette,
  buildAmbientFx,
  buildTent,
  buildCactus,
  buildWaterWell,
  buildFirePit,
  buildLampPost,
  buildPalmTree,
  buildRock,
  paintApolloVillageGround,
  paintApolloCanopy,
  paintHorizonHaze,
  buildApolloVillageSprites,
  type ApolloSpriteKeys,
  MEDIEVAL_DESERT,
  DEPTH,
  dynamicDepthFor,
} from '../visual';

interface ApolloVillageSceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
}

const FRAME_SIGIL_WORLD = 'sigil_world';

const TILE_PX = 32;
const VILLAGE_COLS = 24;
const VILLAGE_ROWS = 16;

// Computed scene bounds
const WORLD_W = VILLAGE_COLS * TILE_PX;
const WORLD_H = VILLAGE_ROWS * TILE_PX;

// Pixel-rect character sprites are authored 8-10 px wide / 10-16 px tall
// to match the per-world palette directive; on a 32 px tile world we
// render them at 3x so they read at proper character size (24-30 px
// tall body).
const CHARACTER_SPRITE_SCALE = 3;

export class ApolloVillageScene extends Phaser.Scene {
  private worldId: WorldId = 'medieval_desert';
  private atlasKey = 'atlas_medieval_desert';
  private spriteKeys?: ApolloSpriteKeys;
  private player?: Player;
  private apolloNpc?: NPC;
  private caravanVendorNpc?: NPC;
  private treasurerNpc?: TreasurerNPC;
  private caravan?: Caravan;
  private caravanZone?: Phaser.GameObjects.Zone;
  private caravanZoneEntered = false;
  private ambientNpcs: NPC[] = [];
  private unsubscribers: Array<() => void> = [];

  // Visual revamp state
  private sorter?: SceneSorter;
  private ambientFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private flameTween?: Phaser.Tweens.Tween;
  private lampGlowTween?: Phaser.Tweens.Tween;

  constructor() {
    super({ key: 'ApolloVillage' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: ApolloVillageSceneData) {
    if (data.worldId) this.worldId = data.worldId;
    this.atlasKey = `atlas_${this.worldId}`;
  }

  create() {
    const width = WORLD_W;
    const height = WORLD_H;

    // Background sets the under-sky color so any unfilled pixel reads as
    // ink, not the default Phaser gray.
    this.cameras.main.setBackgroundColor('#1a0f05');
    this.physics.world.setBounds(0, 0, width, height);

    // Build all character sprite textures FIRST so any object spawn below
    // can reference the cached keys.
    this.spriteKeys = buildApolloVillageSprites(this);

    // Layer 0: sky gradient anchored to camera viewport (scrollFactor 0)
    // so the dusk bands are visible regardless of camera scroll position.
    // We pass scale.width / scale.height so the gradient fills the
    // visible canvas, not the world bounds (the world is taller than the
    // viewport and the camera lerp would otherwise leave the sky off-screen).
    buildSkyGradient(this, {
      world: 'medieval_desert',
      width: this.scale.width,
      height: this.scale.height,
    });

    // Layer 1a: parallax canyon silhouette (far + near). Stair-step
    // procedurally with a deterministic seed for stable Playwright snapshot.
    // baseY at world height * 0.55 so the silhouette sits right above the
    // ground band (which now starts at y * 0.55).
    const farRects = stairStepSilhouette(
      0,
      width,
      Math.round(height * 0.55),
      48,
      18,
      36,
      MEDIEVAL_DESERT.canyonFar,
      0xa11ce,
    );
    buildParallaxLayer(this, { rects: farRects, scrollFactor: 0.3, alpha: 0.9 });

    const nearRects = stairStepSilhouette(
      0,
      width,
      Math.round(height * 0.58),
      40,
      14,
      28,
      MEDIEVAL_DESERT.canyonNear,
      0x5a3b1,
    );
    buildParallaxLayer(this, { rects: nearRects, scrollFactor: 0.5, alpha: 0.95 });

    // Distant village fort silhouette on the far ridge (depth + horizon
    // anchor for the Apollo Village far ridge layer)
    this.spawnDistantFort(width, height);

    // Layer 1b: horizon haze blend strip (sea of stars depth feel)
    paintHorizonHaze(this, width, height, MEDIEVAL_DESERT.skyEmber, 0.4);

    // Layer 2: ground floor multi-band paint (replaces atlas-tile checker)
    paintApolloVillageGround(this, width, height);

    // Sigil at the central courtyard (decorative ground decal)
    const centerX = (VILLAGE_COLS / 2) * TILE_PX;
    const centerY = (VILLAGE_ROWS / 2) * TILE_PX;
    if (this.textures.exists(this.atlasKey)) {
      const sigil = this.add.image(centerX, centerY, this.atlasKey, FRAME_SIGIL_WORLD);
      sigil.setOrigin(0.5, 0.5);
      sigil.setAlpha(0.5);
      sigil.setDepth(DEPTH.GROUND_TILES + 4);
    }

    // Layer 3 + dynamic y-sort: decoration props + player + NPCs
    this.sorter = new SceneSorter();

    this.spawnDecoration();
    this.spawnPlayer();
    this.spawnApollo();
    this.spawnCaravan();
    this.spawnCaravanVendor();
    this.spawnTreasurer();
    this.spawnAmbientNpcs();
    this.spawnCaravanArrivalZone();

    // Register dynamic entities into the y-sort pool. Player + NPCs use
    // setOrigin(0.5, 1) Oak-Woods feet anchor (groundAnchor: true); the
    // y-sort tick assigns dynamicDepthFor(sprite.y) per frame.
    if (this.player) this.sorter.register(this.player);
    if (this.apolloNpc) this.sorter.register(this.apolloNpc);
    if (this.caravanVendorNpc) this.sorter.register(this.caravanVendorNpc);
    if (this.treasurerNpc) this.sorter.register(this.treasurerNpc);
    if (this.caravan) this.sorter.register(this.caravan);
    for (const n of this.ambientNpcs) this.sorter.register(n);

    // Layer 4 (above_tiles): foliage canopy overhang
    paintApolloCanopy(this, width);

    // Ambient FX: sand particle drift
    this.ambientFx = buildAmbientFx(this, { kind: 'dust' });

    // Flame pulse on the central fire pit
    this.startFlamePulse();
    this.startLampGlow();

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

    // Expose scene handle to Playwright smoke test per gotcha 5.
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
    if (this.player && this.apolloNpc) {
      this.apolloNpc.updateProximity(this.player);
    }
    if (this.player && this.caravanVendorNpc) {
      this.caravanVendorNpc.updateProximity(this.player);
    }
    if (this.player && this.treasurerNpc) {
      this.treasurerNpc.updateProximity(this.player);
    }
    if (this.player) {
      for (const n of this.ambientNpcs) n.updateProximity(this.player);
    }
    // Per-frame y-sort
    this.sorter?.tick();
  }

  // ---- setup helpers ----

  /**
   * Distant village fort silhouette on the far ridge, populated with lit
   * windows. Reads as a destination beyond the scene boundaries.
   */
  private spawnDistantFort(width: number, height: number): void {
    const baseY = Math.round(height * 0.5);
    const fortX = Math.round(width * 0.6);
    const fortW = Math.round(width * 0.18);
    const fort = this.add.rectangle(fortX, baseY, fortW, 22, MEDIEVAL_DESERT.canyonFar);
    fort.setOrigin(0, 0);
    fort.setScrollFactor(0.25);
    fort.setDepth(DEPTH.PARALLAX_BG + 1);
    // Tower cluster
    for (let i = 0; i < 5; i++) {
      const tw = 8;
      const th = 6 + i * 2;
      const t = this.add.rectangle(fortX + i * 14, baseY - th, tw, th, MEDIEVAL_DESERT.canyonFar);
      t.setOrigin(0, 0);
      t.setScrollFactor(0.25);
      t.setDepth(DEPTH.PARALLAX_BG + 2);
    }
    // Lit windows along fort
    for (let i = 0; i < 4; i++) {
      const wx = fortX + 6 + i * 16;
      const wy = baseY + 6;
      const w1 = this.add.rectangle(wx, wy, 2, 2, MEDIEVAL_DESERT.flameAmber);
      w1.setOrigin(0, 0);
      w1.setScrollFactor(0.25);
      w1.setDepth(DEPTH.PARALLAX_BG + 3);
    }
  }

  /**
   * Spawn the decoration set (tents, cacti, well, firepit, palm, rocks,
   * lamp posts).
   */
  private spawnDecoration(): void {
    const setDepthForProp = (c: Phaser.GameObjects.Container) => {
      c.setDepth(dynamicDepthFor(c.y));
    };

    // Tents: 3-cluster behind firepit + 2 farther out for density
    const c1 = buildTent(this, 7 * TILE_PX, 8 * TILE_PX, 'sand');
    setDepthForProp(c1);
    const c2 = buildTent(this, 10 * TILE_PX, 7 * TILE_PX, 'terracotta');
    setDepthForProp(c2);
    const c3 = buildTent(this, 14 * TILE_PX, 8 * TILE_PX, 'olive');
    setDepthForProp(c3);
    const c4 = buildTent(this, 4 * TILE_PX, 11 * TILE_PX, 'sand');
    setDepthForProp(c4);
    const c5 = buildTent(this, 17 * TILE_PX, 11 * TILE_PX, 'terracotta');
    setDepthForProp(c5);

    // Water well (left mid)
    const well = buildWaterWell(this, 3 * TILE_PX, 9 * TILE_PX);
    setDepthForProp(well);

    // Cacti scatter
    const cact1 = buildCactus(this, 1.5 * TILE_PX, 6 * TILE_PX, 'large');
    setDepthForProp(cact1);
    const cact2 = buildCactus(this, 22 * TILE_PX, 12 * TILE_PX, 'large');
    setDepthForProp(cact2);
    const cact3 = buildCactus(this, 19 * TILE_PX, 4 * TILE_PX, 'small');
    setDepthForProp(cact3);
    const cact4 = buildCactus(this, 6 * TILE_PX, 13 * TILE_PX, 'small');
    setDepthForProp(cact4);
    const cact5 = buildCactus(this, 20 * TILE_PX, 14 * TILE_PX, 'small');
    setDepthForProp(cact5);

    // Palm trees (oasis feel, near corners + scattered)
    const palm1 = buildPalmTree(this, 2 * TILE_PX, 4 * TILE_PX);
    setDepthForProp(palm1);
    const palm2 = buildPalmTree(this, 21 * TILE_PX, 3 * TILE_PX);
    setDepthForProp(palm2);
    const palm3 = buildPalmTree(this, 12 * TILE_PX, 2.5 * TILE_PX);
    setDepthForProp(palm3);

    // Rocks (foreground scatter)
    const rk1 = buildRock(this, 5 * TILE_PX, 12 * TILE_PX, 14, 6);
    setDepthForProp(rk1);
    const rk2 = buildRock(this, 18 * TILE_PX, 13 * TILE_PX, 10, 5);
    setDepthForProp(rk2);
    const rk3 = buildRock(this, 9 * TILE_PX, 13 * TILE_PX, 8, 4);
    setDepthForProp(rk3);
    const rk4 = buildRock(this, 16 * TILE_PX, 5 * TILE_PX, 12, 5);
    setDepthForProp(rk4);

    // Central fire pit at courtyard, slightly south of sigil
    const fp = buildFirePit(this, 12 * TILE_PX, 9.5 * TILE_PX);
    setDepthForProp(fp);
    this.firePitContainer = fp;

    // Warm orange evening: lamp posts flanking the courtyard
    const lp1 = buildLampPost(this, 9 * TILE_PX, 8 * TILE_PX);
    setDepthForProp(lp1);
    const lp2 = buildLampPost(this, 15 * TILE_PX, 8 * TILE_PX);
    setDepthForProp(lp2);
    const lp3 = buildLampPost(this, 5 * TILE_PX, 14 * TILE_PX);
    setDepthForProp(lp3);
    const lp4 = buildLampPost(this, 19 * TILE_PX, 14 * TILE_PX);
    setDepthForProp(lp4);
    this.lampPosts = [lp1, lp2, lp3, lp4];

    // Lamp warm light spill rings on ground (cosmetic)
    for (const post of this.lampPosts) {
      const spill = this.add.circle(post.x, post.y + 6, 24, MEDIEVAL_DESERT.flameAmber, 0.18);
      spill.setDepth(DEPTH.GROUND_TILES + 6);
      this.lampSpills.push(spill);
    }
  }

  private firePitContainer?: Phaser.GameObjects.Container;
  private lampPosts: Phaser.GameObjects.Container[] = [];
  private lampSpills: Phaser.GameObjects.Arc[] = [];

  /**
   * Pulse the firepit flame container with a gentle scale tween so the
   * central courtyard reads "alive".
   */
  private startFlamePulse(): void {
    if (!this.firePitContainer) return;
    this.flameTween = this.tweens.add({
      targets: this.firePitContainer,
      scaleY: { from: 0.95, to: 1.07 },
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      duration: 520,
    });
  }

  /**
   * Pulse the warm light spill rings under each lamp post for a flickering
   * candle feel (cheap alpha tween, no Lights2D pipeline).
   */
  private startLampGlow(): void {
    if (this.lampSpills.length === 0) return;
    this.lampGlowTween = this.tweens.add({
      targets: this.lampSpills,
      alpha: { from: 0.16, to: 0.28 },
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      duration: 1400,
      delay: this.tweens.stagger(220, { start: 0 }),
    });
  }

  // ---- Quest-mechanic helpers (NON-REGRESSION; preserve emission contracts) ----

  private spawnPlayer() {
    const spawnX = (VILLAGE_COLS / 2) * TILE_PX;
    const spawnY = (VILLAGE_ROWS - 3) * TILE_PX;
    this.player = new Player(this, spawnX, spawnY, {
      textureKey: this.spriteKeys?.player ?? this.atlasKey,
      speed: 120,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
      hitboxSize: 18,
    });
  }

  private spawnApollo() {
    const apolloX = (VILLAGE_COLS / 2) * TILE_PX;
    const apolloY = (VILLAGE_ROWS / 2 - 2) * TILE_PX;
    this.apolloNpc = new NPC(this, apolloX, apolloY, {
      npcId: 'apollo',
      displayName: 'Apollo Advisor',
      textureKey: this.spriteKeys?.apollo ?? this.atlasKey,
      interactRadius: 56,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
    });
  }

  private spawnCaravan() {
    // Caravan parks near the east wall; gated on unlockedWorlds.
    const caravanX = (VILLAGE_COLS - 4) * TILE_PX;
    const caravanY = (VILLAGE_ROWS / 2) * TILE_PX;
    this.caravan = new Caravan(this, caravanX, caravanY, {
      textureKey: this.atlasKey,
      frame: FRAME_SIGIL_WORLD,
      targetWorld: 'cyberpunk_shanghai',
      displayLabel: 'Caravan: Shanghai',
    });
  }

  private spawnCaravanVendor() {
    const vendorX = (VILLAGE_COLS - 5) * TILE_PX;
    const vendorY = (VILLAGE_ROWS / 2 + 1) * TILE_PX;
    this.caravanVendorNpc = new NPC(this, vendorX, vendorY, {
      npcId: 'caravan_vendor',
      displayName: 'Caravan Vendor',
      textureKey: this.spriteKeys?.caravanVendor ?? this.atlasKey,
      interactRadius: 48,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
    });
  }

  private spawnTreasurer() {
    const treasurerX = (VILLAGE_COLS - 6) * TILE_PX;
    const treasurerY = (VILLAGE_ROWS / 2 - 2) * TILE_PX;
    this.treasurerNpc = new TreasurerNPC(this, treasurerX, treasurerY, {
      textureKey: this.spriteKeys?.treasurer ?? this.atlasKey,
      interactRadius: 56,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
    });
  }

  /**
   * Ambient villager NPCs: 5-8 populated per scene matrix Session 2 spec.
   * Each renders with its distinct sprite texture (guard, child, elder, 3
   * villager variants) for crowd density. They emit interact events too,
   * so the player can press E near any of them; the dialogue overlay can
   * still surface a flavor line via the dialogue store registration.
   */
  private spawnAmbientNpcs(): void {
    if (!this.spriteKeys) return;

    const guardA = new NPC(this, 9.5 * TILE_PX, 14 * TILE_PX, {
      npcId: 'guard_a',
      displayName: 'Guard',
      textureKey: this.spriteKeys.guard,
      interactRadius: 36,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
    });
    this.ambientNpcs.push(guardA);

    const guardB = new NPC(this, 14.5 * TILE_PX, 14 * TILE_PX, {
      npcId: 'guard_b',
      displayName: 'Guard',
      textureKey: this.spriteKeys.guard,
      interactRadius: 36,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
    });
    this.ambientNpcs.push(guardB);

    const child = new NPC(this, 11 * TILE_PX, 10.5 * TILE_PX, {
      npcId: 'child_a',
      displayName: 'Child',
      textureKey: this.spriteKeys.child,
      interactRadius: 32,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
    });
    this.ambientNpcs.push(child);

    const elder = new NPC(this, 4 * TILE_PX, 7 * TILE_PX, {
      npcId: 'elder_a',
      displayName: 'Elder',
      textureKey: this.spriteKeys.elder,
      interactRadius: 36,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
    });
    this.ambientNpcs.push(elder);

    const villBlue = new NPC(this, 6 * TILE_PX, 11 * TILE_PX, {
      npcId: 'villager_blue',
      displayName: 'Villager',
      textureKey: this.spriteKeys.villagerBlue,
      interactRadius: 36,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
    });
    this.ambientNpcs.push(villBlue);

    const villOlive = new NPC(this, 16 * TILE_PX, 7.5 * TILE_PX, {
      npcId: 'villager_olive',
      displayName: 'Villager',
      textureKey: this.spriteKeys.villagerOlive,
      interactRadius: 36,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
    });
    this.ambientNpcs.push(villOlive);

    const villRose = new NPC(this, 13 * TILE_PX, 12 * TILE_PX, {
      npcId: 'villager_rose',
      displayName: 'Villager',
      textureKey: this.spriteKeys.villagerRose,
      interactRadius: 36,
      spriteScale: CHARACTER_SPRITE_SCALE,
      groundAnchor: true,
    });
    this.ambientNpcs.push(villRose);
  }

  private spawnCaravanArrivalZone() {
    const zoneX = (VILLAGE_COLS - 4) * TILE_PX;
    const zoneY = (VILLAGE_ROWS / 2 + 0.5) * TILE_PX;
    const zoneWidth = 4 * TILE_PX;
    const zoneHeight = 3 * TILE_PX;
    const zone = this.add.zone(zoneX, zoneY, zoneWidth, zoneHeight);
    this.physics.add.existing(zone, true);
    this.caravanZone = zone;
    if (this.player) {
      this.physics.add.overlap(this.player, zone, () => {
        if (this.caravanZoneEntered) return;
        this.caravanZoneEntered = true;
        const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
        const payload = {
          zoneId: 'caravan_arrival_zone',
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

  private configureCamera(worldWidth: number, worldHeight: number) {
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    // Higher zoom so the pixel art reads at a readable SNES scale.
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
      this.flameTween?.stop();
      this.flameTween = undefined;
      this.lampGlowTween?.stop();
      this.lampGlowTween = undefined;

      this.ambientFx?.stop();
      this.ambientFx?.destroy();
      this.ambientFx = undefined;

      this.sorter?.unregisterAll();
      this.sorter = undefined;
      this.ambientNpcs = [];

      for (const unsub of this.unsubscribers) {
        try {
          unsub();
        } catch (err) {
          console.error('[ApolloVillageScene] subscription cleanup threw', err);
        }
      }
      this.unsubscribers = [];

      const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
      bus?.emit('game.scene.shutdown', { sceneKey: this.scene.key });
    });
  }
}
