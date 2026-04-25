//
// src/game/scenes/ApolloVillageScene.ts
//
// Main lobby scene for the vertical slice. Medieval Desert world aesthetic,
// top-down JRPG perspective. After Helios-v2 W3 S2 revamp the scene uses a
// 5-layer depth stack:
//   Layer 0 (sky_gradient): per-world dusk gradient via buildSkyGradient
//   Layer 1 (parallax_bg):  canyon silhouette stair-step at scrollFactor 0.4
//   Layer 2 (ground_tiles): floor checker via existing CC0 atlas slots
//   Layer 3 (world_tiles):  decoration props (tent, cactus, well, firepit,
//                           palm, rock, lamp post) plus player + NPCs with
//                           dynamic y-sort via SceneSorter
//   Layer 4 (above_tiles):  acacia canopy overhang silhouette (decorative)
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
// Owner: Helios-v2 (W3 S2 visual revamp), Thalia-v2 (original RV scaffold).
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
  MEDIEVAL_DESERT,
  DEPTH,
  dynamicDepthFor,
} from '../visual';

interface ApolloVillageSceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
}

// Atlas frame names from the existing CC0 medieval_desert atlas. The atlas
// remains the floor + wall ground source; decoration is now hand-placed
// rectangles per Helios-v2 visual revamp.
const FRAME_FLOOR_PRIMARY = 'floor_primary';
const FRAME_FLOOR_SECONDARY = 'floor_secondary';
const FRAME_PATH_MARKER = 'path_marker';
const FRAME_AGENT_IDLE = 'agent_idle';
const FRAME_AGENT_ACTIVE = 'agent_active';
const FRAME_SIGIL_WORLD = 'sigil_world';

const TILE_PX = 32;
const VILLAGE_COLS = 24;
const VILLAGE_ROWS = 16;

// Computed scene bounds
const WORLD_W = VILLAGE_COLS * TILE_PX;
const WORLD_H = VILLAGE_ROWS * TILE_PX;

export class ApolloVillageScene extends Phaser.Scene {
  private worldId: WorldId = 'medieval_desert';
  private atlasKey = 'atlas_medieval_desert';
  private player?: Player;
  private apolloNpc?: NPC;
  private caravanVendorNpc?: NPC;
  private treasurerNpc?: TreasurerNPC;
  private caravan?: Caravan;
  private caravanZone?: Phaser.GameObjects.Zone;
  private caravanZoneEntered = false;
  private unsubscribers: Array<() => void> = [];

  // Visual revamp state
  private sorter?: SceneSorter;
  private ambientFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private flameTween?: Phaser.Tweens.Tween;

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

    // Layer 0: sky gradient (camera-anchored, scrollFactor 0)
    buildSkyGradient(this, { world: 'medieval_desert', width, height });

    // Layer 1: parallax canyon silhouette (far + near). Stair-step
    // procedurally with a deterministic seed for stable Playwright snapshot.
    const farRects = stairStepSilhouette(
      0,
      width,
      Math.round(height * 0.45),
      48,
      18,
      36,
      MEDIEVAL_DESERT.canyonFar,
      0xa11ce, // arbitrary seed
    );
    buildParallaxLayer(this, { rects: farRects, scrollFactor: 0.3, alpha: 0.85 });

    const nearRects = stairStepSilhouette(
      0,
      width,
      Math.round(height * 0.55),
      40,
      14,
      28,
      MEDIEVAL_DESERT.canyonNear,
      0x5a3b1, // distinct seed for distinct silhouette
    );
    buildParallaxLayer(this, { rects: nearRects, scrollFactor: 0.5, alpha: 0.9 });

    // Layer 2: ground floor tilemap (existing CC0 atlas)
    this.layoutGroundFloor();

    // Layer 3 + dynamic y-sort: decoration props + player + NPCs
    this.sorter = new SceneSorter();

    this.spawnDecoration();
    this.spawnPlayer();
    this.spawnApollo();
    this.spawnCaravan();
    this.spawnCaravanVendor();
    this.spawnTreasurer();
    this.spawnCaravanArrivalZone();

    // Register dynamic entities into the y-sort pool. Player + NPCs use
    // setOrigin(0.5, 0.5) per existing constructors, so we apply the
    // dynamic depth without rewriting their origin (decoration containers
    // already use the correct anchor via the buildXxx() helpers).
    if (this.player) this.sorter.register(this.player);
    if (this.apolloNpc) this.sorter.register(this.apolloNpc);
    if (this.caravanVendorNpc) this.sorter.register(this.caravanVendorNpc);
    if (this.treasurerNpc) this.sorter.register(this.treasurerNpc);
    if (this.caravan) this.sorter.register(this.caravan);

    // Layer 4 (above_tiles): canopy overhang. We place a row of olive-tinted
    // foliage strips at the top of the scene to suggest acacia branches
    // above the player. Always renders above world entities at low y.
    this.layoutCanopy(width);

    // Ambient FX: sand particle drift across the scene (camera-anchored)
    this.ambientFx = buildAmbientFx(this, { kind: 'dust' });

    // Flame pulse on the central fire pit: gentle scale tween for the
    // amber glow effect. Cosmetic only, no behavior coupling.
    this.startFlamePulse();

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
    // Per-frame y-sort (Helios-v2 W3 S1 SceneSorter)
    this.sorter?.tick();
  }

  // ---- setup helpers ----

  /**
   * Layer 2 ground floor: alternating primary/secondary atlas tiles in a
   * checker pattern. Each ground tile sits at depth GROUND_TILES (-10).
   * Path markers form a visual lead from the entrance toward the courtyard.
   */
  private layoutGroundFloor(): void {
    for (let row = 0; row < VILLAGE_ROWS; row++) {
      for (let col = 0; col < VILLAGE_COLS; col++) {
        const slot =
          (row + col) % 3 === 0 ? FRAME_FLOOR_SECONDARY : FRAME_FLOOR_PRIMARY;
        const t = this.add.image(
          col * TILE_PX + TILE_PX / 2,
          row * TILE_PX + TILE_PX / 2,
          this.atlasKey,
          slot,
        );
        t.setOrigin(0.5, 0.5);
        t.setDepth(DEPTH.GROUND_TILES);
      }
    }

    // Path markers from entrance to center
    const centerX = (VILLAGE_COLS / 2) * TILE_PX;
    for (let step = 2; step < VILLAGE_ROWS / 2; step++) {
      const t = this.add.image(
        centerX,
        step * TILE_PX + TILE_PX / 2,
        this.atlasKey,
        FRAME_PATH_MARKER,
      );
      t.setOrigin(0.5, 0.5);
      t.setDepth(DEPTH.GROUND_TILES);
    }

    // Sigil at the central courtyard (decorative, ground depth so player walks over)
    const centerY = (VILLAGE_ROWS / 2) * TILE_PX;
    const sigil = this.add.image(centerX, centerY, this.atlasKey, FRAME_SIGIL_WORLD);
    sigil.setOrigin(0.5, 0.5);
    sigil.setDepth(DEPTH.GROUND_TILES);
  }

  /**
   * Spawn the decoration set (tents, cacti, well, firepit, palm, rocks,
   * lamp posts). Each prop is a Phaser.GameObjects.Container at world
   * coordinates; depth is computed by SceneSorter from container.y.
   * Containers default to setOrigin(0.5, 0.5) but each builder draws
   * its rects relative to (0, 0) being the FEET anchor (i.e., container.y
   * === ground line). Manual setDepth(dynamicDepthFor(container.y)) sets
   * baseline depth; SceneSorter does not include containers by default
   * since they have no y-sort registration.
   */
  private spawnDecoration(): void {
    const decorationY = (anchor: number) => anchor;
    const setDepthForProp = (c: Phaser.GameObjects.Container) => {
      c.setDepth(dynamicDepthFor(c.y));
    };

    // Tents: 3-cluster behind firepit + 2 farther out for density
    const c1 = buildTent(this, 7 * TILE_PX, decorationY(8 * TILE_PX), 'sand');
    setDepthForProp(c1);
    const c2 = buildTent(this, 10 * TILE_PX, decorationY(7 * TILE_PX), 'terracotta');
    setDepthForProp(c2);
    const c3 = buildTent(this, 14 * TILE_PX, decorationY(8 * TILE_PX), 'olive');
    setDepthForProp(c3);
    const c4 = buildTent(this, 4 * TILE_PX, decorationY(11 * TILE_PX), 'sand');
    setDepthForProp(c4);
    const c5 = buildTent(this, 17 * TILE_PX, decorationY(11 * TILE_PX), 'terracotta');
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

    // Central fire pit at courtyard, slightly south of sigil
    const fp = buildFirePit(this, 12 * TILE_PX, 9.5 * TILE_PX);
    setDepthForProp(fp);
    // Stash flame ref for pulse tween
    this.firePitContainer = fp;

    // Warm orange evening: 2 lamp posts flanking the courtyard
    const lp1 = buildLampPost(this, 9 * TILE_PX, 8 * TILE_PX);
    setDepthForProp(lp1);
    const lp2 = buildLampPost(this, 15 * TILE_PX, 8 * TILE_PX);
    setDepthForProp(lp2);
  }

  private firePitContainer?: Phaser.GameObjects.Container;

  /**
   * Layer 4 above_tiles: canopy overhang. Rectangles painted at the top
   * of the world to suggest tree branches reaching from off-screen.
   */
  private layoutCanopy(width: number): void {
    // Acacia-tinted irregular bands at very top of scene
    for (let x = 0; x < width; x += 28) {
      const w = 24 + ((x * 17) % 16);
      const h = 8 + ((x * 11) % 10);
      const branch = this.add.rectangle(
        x,
        -2,
        w,
        h,
        MEDIEVAL_DESERT.cactusBody,
      );
      branch.setOrigin(0, 0);
      branch.setAlpha(0.85);
      branch.setDepth(DEPTH.ABOVE_TILES);
    }
    // Highlight glints on the canopy
    for (let x = 8; x < width; x += 36) {
      const glint = this.add.rectangle(
        x,
        2,
        4,
        2,
        MEDIEVAL_DESERT.cactusHi,
      );
      glint.setOrigin(0, 0);
      glint.setDepth(DEPTH.ABOVE_TILES + 1);
    }
  }

  /**
   * Cosmetic: pulse the firepit flame container with a gentle scale tween
   * so the central courtyard reads "alive" without consuming game logic
   * cycles. Pure decoration, no quest coupling.
   */
  private startFlamePulse(): void {
    if (!this.firePitContainer) return;
    this.flameTween = this.tweens.add({
      targets: this.firePitContainer,
      scaleY: { from: 0.95, to: 1.05 },
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      duration: 600,
    });
  }

  // ---- Quest-mechanic helpers (NON-REGRESSION; unchanged from RV ship) ----

  private spawnPlayer() {
    const spawnX = (VILLAGE_COLS / 2) * TILE_PX;
    const spawnY = (VILLAGE_ROWS - 3) * TILE_PX;
    this.player = new Player(this, spawnX, spawnY, {
      textureKey: this.atlasKey,
      frame: FRAME_AGENT_IDLE,
      speed: 120,
    });
  }

  private spawnApollo() {
    const apolloX = (VILLAGE_COLS / 2) * TILE_PX;
    const apolloY = (VILLAGE_ROWS / 2 - 2) * TILE_PX;
    this.apolloNpc = new NPC(this, apolloX, apolloY, {
      npcId: 'apollo',
      displayName: 'Apollo Advisor',
      textureKey: this.atlasKey,
      frame: FRAME_AGENT_ACTIVE,
      interactRadius: 48,
    });
  }

  private spawnCaravan() {
    // Caravan parks near the east wall; gated on unlockedWorlds including
    // cyberpunk_shanghai (the next world in rotation).
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
    // Caravan vendor NPC for lumio_onboarding step 8 (caravan_interact). The
    // vendor stands a tile south of the caravan sigil; pointer-follow and
    // interact prompt reuse the generic NPC class so the Press-E pattern
    // matches Apollo.
    const vendorX = (VILLAGE_COLS - 5) * TILE_PX;
    const vendorY = (VILLAGE_ROWS / 2 + 1) * TILE_PX;
    this.caravanVendorNpc = new NPC(this, vendorX, vendorY, {
      npcId: 'caravan_vendor',
      displayName: 'Caravan Vendor',
      textureKey: this.atlasKey,
      frame: FRAME_AGENT_IDLE,
      interactRadius: 48,
    });
  }

  private spawnTreasurer() {
    // Treasurer NPC for the Marshall W2 cross-pillar tier-state surface.
    // Sits two tiles north-west of the caravan sigil so the trade district
    // reads as a cluster (caravan + caravan vendor + treasurer) without
    // overlapping the caravan arrival zone bounds.
    const treasurerX = (VILLAGE_COLS - 6) * TILE_PX;
    const treasurerY = (VILLAGE_ROWS / 2 - 2) * TILE_PX;
    this.treasurerNpc = new TreasurerNPC(this, treasurerX, treasurerY, {
      textureKey: this.atlasKey,
      frame: FRAME_AGENT_ACTIVE,
      interactRadius: 56,
    });
  }

  private spawnCaravanArrivalZone() {
    // Caravan arrival zone for lumio_onboarding step 7 (caravan_spawned). An
    // invisible physics zone east of village center; first overlap with the
    // player emits game.zone.entered, which the bridge translates into the
    // zone_enter trigger. The once-flag keeps the emission single-shot so
    // the bus is not spammed during sustained overlap.
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
    // Higher zoom so the 16x16 tile art reads at a readable SNES scale.
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
      // Stop tween before scene tears down to avoid stale-target warning
      this.flameTween?.stop();
      this.flameTween = undefined;

      // Pause + destroy ambient particle emitter
      this.ambientFx?.stop();
      this.ambientFx?.destroy();
      this.ambientFx = undefined;

      // Flush y-sort registry
      this.sorter?.unregisterAll();
      this.sorter = undefined;

      for (const unsub of this.unsubscribers) {
        try {
          unsub();
        } catch (err) {
          console.error('[ApolloVillageScene] subscription cleanup threw', err);
        }
      }
      this.unsubscribers = [];

      // Emit shutdown topic so Euterpe and other consumers can unbind.
      const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
      bus?.emit('game.scene.shutdown', { sceneKey: this.scene.key });
    });
  }
}
