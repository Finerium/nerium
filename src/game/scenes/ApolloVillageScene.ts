//
// src/game/scenes/ApolloVillageScene.ts
//
// Main lobby scene for the vertical slice. Medieval Desert world aesthetic,
// top-down 32x32 tile grid where each tile cell renders a 16x16 sprite from
// the medieval_desert atlas (8x upscaled by camera zoom for SNES feel).
//
// Responsibilities:
//   - Lay down a procedural tilemap using atlas slots 0..15
//   - Spawn the player at the designated spawn point
//   - Place the Apollo NPC with a 48px interact zone
//   - Place a caravan gated on questStore unlock state (currently invisible)
//   - Emit game.scene.ready once setup completes
//   - Subscribe to questStore for caravan unlock reactions (via Caravan)
//   - Cleanup on SHUTDOWN per zustand-bridge contract
//
// Owner: Thalia-v2, absorbing V4 pre-sketch Eris scope for the main lobby.
//

import * as Phaser from 'phaser';
import type { WorldId } from '../../state/types';
import { Player } from '../objects/Player';
import { NPC } from '../objects/NPC';
import { Caravan } from '../objects/Caravan';
import type { GameEventBus } from '../../state/GameEventBus';

interface ApolloVillageSceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
}

// Frame names published by the Talos W2 atlas pipeline match
// app/builder/worlds/sprite_slots.ts semantics. Atlas files live at
// public/assets/worlds/{world}/atlas_32.png plus
// public/assets/packs/{world}.atlas.json.
const FRAME_FLOOR_PRIMARY = 'floor_primary';
const FRAME_FLOOR_SECONDARY = 'floor_secondary';
const FRAME_WALL_SOLID = 'wall_solid';
const FRAME_WALL_ACCENT = 'wall_accent';
const FRAME_CORNER_OUTER = 'corner_outer';
const FRAME_PILLAR = 'pillar';
const FRAME_ARCH_OPENING = 'arch_opening';
const FRAME_FEATURE_DECOR = 'feature_decor';
const FRAME_PATH_MARKER = 'path_marker';
const FRAME_AGENT_IDLE = 'agent_idle';
const FRAME_AGENT_ACTIVE = 'agent_active';
const FRAME_SIGIL_WORLD = 'sigil_world';

const TILE_PX = 32;
const VILLAGE_COLS = 24;
const VILLAGE_ROWS = 16;

export class ApolloVillageScene extends Phaser.Scene {
  private worldId: WorldId = 'medieval_desert';
  private atlasKey = 'atlas_medieval_desert';
  private player?: Player;
  private apolloNpc?: NPC;
  private caravanVendorNpc?: NPC;
  private caravan?: Caravan;
  private caravanZone?: Phaser.GameObjects.Zone;
  private caravanZoneEntered = false;
  private unsubscribers: Array<() => void> = [];

  constructor() {
    super({ key: 'ApolloVillage' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: ApolloVillageSceneData) {
    if (data.worldId) this.worldId = data.worldId;
    this.atlasKey = `atlas_${this.worldId}`;
  }

  create() {
    const width = VILLAGE_COLS * TILE_PX;
    const height = VILLAGE_ROWS * TILE_PX;

    this.cameras.main.setBackgroundColor('#1a0f05');
    this.physics.world.setBounds(0, 0, width, height);

    this.layoutTiles();
    this.spawnPlayer();
    this.spawnApollo();
    this.spawnCaravan();
    this.spawnCaravanVendor();
    this.spawnCaravanArrivalZone();
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
      // Bridge not wired; use raw emitter as a graceful fallback so tests
      // still observe the event flow.
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
  }

  // ---- setup helpers ----

  private layoutTiles() {
    // Floor: alternating primary/secondary tiles in a soft checker pattern.
    for (let row = 0; row < VILLAGE_ROWS; row++) {
      for (let col = 0; col < VILLAGE_COLS; col++) {
        const slot =
          (row + col) % 3 === 0 ? FRAME_FLOOR_SECONDARY : FRAME_FLOOR_PRIMARY;
        this.add
          .image(col * TILE_PX + TILE_PX / 2, row * TILE_PX + TILE_PX / 2, this.atlasKey, slot)
          .setOrigin(0.5, 0.5);
      }
    }

    // Perimeter walls.
    for (let col = 0; col < VILLAGE_COLS; col++) {
      this.add
        .image(col * TILE_PX + TILE_PX / 2, TILE_PX / 2, this.atlasKey, FRAME_WALL_SOLID)
        .setOrigin(0.5, 0.5);
      this.add
        .image(
          col * TILE_PX + TILE_PX / 2,
          (VILLAGE_ROWS - 1) * TILE_PX + TILE_PX / 2,
          this.atlasKey,
          FRAME_WALL_SOLID,
        )
        .setOrigin(0.5, 0.5);
    }
    for (let row = 0; row < VILLAGE_ROWS; row++) {
      this.add
        .image(TILE_PX / 2, row * TILE_PX + TILE_PX / 2, this.atlasKey, FRAME_WALL_SOLID)
        .setOrigin(0.5, 0.5);
      this.add
        .image(
          (VILLAGE_COLS - 1) * TILE_PX + TILE_PX / 2,
          row * TILE_PX + TILE_PX / 2,
          this.atlasKey,
          FRAME_WALL_SOLID,
        )
        .setOrigin(0.5, 0.5);
    }

    // Four corner pillars as accents.
    const cornerCoords: Array<[number, number]> = [
      [TILE_PX / 2, TILE_PX / 2],
      [(VILLAGE_COLS - 1) * TILE_PX + TILE_PX / 2, TILE_PX / 2],
      [TILE_PX / 2, (VILLAGE_ROWS - 1) * TILE_PX + TILE_PX / 2],
      [
        (VILLAGE_COLS - 1) * TILE_PX + TILE_PX / 2,
        (VILLAGE_ROWS - 1) * TILE_PX + TILE_PX / 2,
      ],
    ];
    cornerCoords.forEach(([x, y]) =>
      this.add.image(x, y, this.atlasKey, FRAME_CORNER_OUTER).setOrigin(0.5, 0.5),
    );

    // Central fountain arrangement: arch + decor + sigil.
    const centerX = (VILLAGE_COLS / 2) * TILE_PX;
    const centerY = (VILLAGE_ROWS / 2) * TILE_PX;
    this.add.image(centerX, centerY - TILE_PX, this.atlasKey, FRAME_ARCH_OPENING).setOrigin(0.5, 0.5);
    this.add.image(centerX, centerY, this.atlasKey, FRAME_SIGIL_WORLD).setOrigin(0.5, 0.5);
    this.add
      .image(centerX - TILE_PX, centerY, this.atlasKey, FRAME_FEATURE_DECOR)
      .setOrigin(0.5, 0.5);
    this.add
      .image(centerX + TILE_PX, centerY, this.atlasKey, FRAME_FEATURE_DECOR)
      .setOrigin(0.5, 0.5);

    // Path from entrance to center as a visual lead for the player.
    for (let step = 2; step < VILLAGE_ROWS / 2; step++) {
      this.add
        .image(centerX, step * TILE_PX + TILE_PX / 2, this.atlasKey, FRAME_PATH_MARKER)
        .setOrigin(0.5, 0.5);
    }

    // A second accent wall row to give the NPC zone a courtyard feel.
    for (let col = Math.floor(VILLAGE_COLS / 2) - 3; col <= Math.floor(VILLAGE_COLS / 2) + 3; col++) {
      this.add
        .image(
          col * TILE_PX + TILE_PX / 2,
          (VILLAGE_ROWS - 4) * TILE_PX + TILE_PX / 2,
          this.atlasKey,
          FRAME_WALL_ACCENT,
        )
        .setOrigin(0.5, 0.5);
    }

    // Pillar decoratives flanking the central sigil.
    this.add
      .image(centerX - 3 * TILE_PX, centerY, this.atlasKey, FRAME_PILLAR)
      .setOrigin(0.5, 0.5);
    this.add
      .image(centerX + 3 * TILE_PX, centerY, this.atlasKey, FRAME_PILLAR)
      .setOrigin(0.5, 0.5);
  }

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
