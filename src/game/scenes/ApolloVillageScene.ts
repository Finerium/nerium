//
// src/game/scenes/ApolloVillageScene.ts
//
// Helios-v2 W3 S2: Apollo Village main scene full revamp.
//
// VISUAL AUTHORITY SWAP: prior session shipped a procedural SVG / pixel-rect
// composition (groundPaint + spriteTextures + decoration containers). S2
// transitions the scene to consume the AI-generated PNG asset bundle shipped
// at `_Reference/ai_generated_assets/` (96 active assets, V6 SHA c74547f).
// The placement coordinate map authored at
// `_skills_staging/apollo_village_placement.md` is the contract for every
// `this.add.image(...)` call in this file.
//
// Visual stack (5-layer per visual_manifest.contract):
//   Layer 0 (sky_gradient, depth -100): camera-locked dusk gradient bands
//                                       via buildSkyGradient(medieval_desert).
//                                       scrollFactor 0 so bands stay above
//                                       horizon regardless of camera scroll.
//   Layer 1 (parallax_bg, depth -50):   apollo_village_bg.jpg painted at
//                                       (0, 0) origin (0, 0), scrollFactor
//                                       0.3 mild parallax disambiguation.
//   Layer 2 (ground_tiles, depth -10):  reserved (the AI bg's painted sand
//                                       floor is a single image; no extra
//                                       paint passes needed in S2).
//   Layer 3 (world_tiles, depth 0..N):  4 landmark PNGs + 9 ambient prop
//                                       PNGs + 3 named NPC stills + 5 ambient
//                                       NPC stills + Caravan + player. All
//                                       go through SceneSorter for dynamic
//                                       y-sort via setDepth(sprite.y) per
//                                       Oak-Woods feet-anchor pattern.
//   Layer 4 (above_tiles, depth 100):   2 hanging lantern PNGs at scene
//                                       overhead so player walks under.
//   Layer 5 (ambient_fx, depth 500):    warm amber sand drift via the
//                                       buildAmbientFx 'dust' preset.
//
// Drop shadows: each NPC + landmark + tall ambient prop is shadow-anchored
// at (sprite.x, sprite.y) via Phaser.GameObjects.Ellipse (alpha 0.30-0.32,
// fill 0x000000). Shadows register with SceneSorter at offset y - 1 so they
// always render one slice below their owning sprite.
//
// NPC idle breathing: each static NPC sprite gets a scale tween 1.0 -> 1.02
// over 800ms loop ease Sine.easeInOut per S2 directive item 3.
//
// E-key landmark interaction: the four pillar landmarks (marketplace, builder
// workshop, registry pillar, trust shrine) emit `landmark.<name>.interact`
// via the scene event emitter when the player is within 128 px AND the E key
// is just-pressed. S7 session connects these events to the respective UI
// overlays.
//
// PRESERVED FROM RV (NON-REGRESSION):
//   - Player spawn + camera follow + setBounds
//   - Apollo NPC at central courtyard (npcId 'apollo')
//   - Treasurer NPC for Marshall W2 cross-pillar pricing dialogue (preserve
//     game.npc.interact { npcId: 'treasurer' } contract)
//   - Caravan Vendor NPC for lumio_onboarding step 8
//   - Caravan game object gated on questStore.unlockedWorlds
//   - Caravan arrival zone for lumio_onboarding step 7
//   - game.scene.ready, game.player.spawned, game.zone.entered emissions
//   - SHUTDOWN cleanup (tweens, emitter, sorter, listeners)
//   - window.__NERIUM_TEST__ Playwright hook
//
// Owner: Helios-v2 (W3 S2 revamp), Thalia-v2 (RV scaffold).
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
  buildAmbientFx,
  MEDIEVAL_DESERT,
  DEPTH,
  dynamicDepthFor,
} from '../visual';
import { ASSET_KEYS } from '../visual/asset_keys';

interface ApolloVillageSceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
}

// World dimensions match the apollo_village_bg.jpg native 1408 x 793 with a
// tiny vertical headroom strip (8 px) absorbed by the sky gradient. The
// 32 px tile reference is preserved for compatibility with NPC interact
// radii + Caravan + arrival zone authored against 32 px scale in RV.
const WORLD_W = 1408;
const WORLD_H = 800;
const TILE_PX = 32;

// Landmark + NPC scale per placement map. Source PNGs are 600x600 (landmark)
// or 512x512 (character) at scale 0.18-0.55 -> ~92-330 px display size.
const NPC_SCALE_NAMED = 0.18;
const NPC_SCALE_AMBIENT = 0.18;
const NPC_SCALE_CHILD = 0.13;
const PLAYER_SCALE = 0.18;

// Landmark PNGs source dimensions vary; scale picked per asset to balance
// silhouette weight against the bg.
const SCALE_MARKETPLACE = 0.55;
const SCALE_BUILDER_WORKSHOP = 0.5;
const SCALE_REGISTRY_PILLAR = 0.55;
const SCALE_TRUST_SHRINE = 0.5;

// Ambient prop scales per placement map.
const SCALE_STONE_WELL = 0.45;
const SCALE_DATE_PALM = 0.42;
const SCALE_CYPRESS_LARGE = 0.65;
const SCALE_CYPRESS_SMALL = 0.55;
const SCALE_MARKET_STALL = 0.42;
const SCALE_WOODEN_CART = 0.4;
const SCALE_HOUSE_FILLER = 0.5;
const SCALE_STONE_COLUMN = 0.5;
const SCALE_STONE_SIGNPOST = 0.4;
const SCALE_HANGING_LANTERN = 0.3;

// Idle breathing tween standard (per S2 directive item 3).
const BREATHING_DURATION_MS = 800;
const BREATHING_AMPLITUDE = 1.02;

// Landmark E-key interaction trigger radius (px). Slightly larger than NPC
// radius so the landmark feels more discoverable.
const LANDMARK_INTERACT_RADIUS_PX = 128;
const LANDMARK_INTERACT_COOLDOWN_MS = 500;

interface LandmarkBinding {
  name: string;
  x: number;
  y: number;
  eventTopic: string;
}

export class ApolloVillageScene extends Phaser.Scene {
  private worldId: WorldId = 'medieval_desert';
  private atlasKey = 'atlas_medieval_desert';

  // Active dynamic objects.
  private player?: Player;
  private apolloNpc?: NPC;
  private caravanVendorNpc?: NPC;
  private treasurerNpc?: TreasurerNPC;
  private caravan?: Caravan;
  private caravanZone?: Phaser.GameObjects.Zone;
  private caravanZoneEntered = false;
  private ambientNpcs: NPC[] = [];
  private unsubscribers: Array<() => void> = [];

  // Visual revamp state.
  private sorter?: SceneSorter;
  private ambientFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private idleBreathingTweens: Phaser.Tweens.Tween[] = [];
  private dropShadows: Phaser.GameObjects.Ellipse[] = [];

  // Landmark E-key interaction state.
  private landmarkBindings: LandmarkBinding[] = [];
  private eKey?: Phaser.Input.Keyboard.Key;
  private lastLandmarkEmitAt: Record<string, number> = {};

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

    // Background fallback color so any unfilled pixel reads warm dusk, not
    // the default Phaser gray.
    this.cameras.main.setBackgroundColor('#1a0f05');
    this.physics.world.setBounds(0, 0, width, height);

    // Layer 0: sky gradient bands camera-locked above bg.
    buildSkyGradient(this, {
      world: 'medieval_desert',
      width: this.scale.width,
      height: this.scale.height,
    });

    // Layer 1: AI background painted at (0, 0) covering the full scene.
    // setOrigin(0, 0) so x,y references the top-left corner.
    const bg = this.add.image(0, 0, ASSET_KEYS.backgrounds.apollo_village_bg);
    bg.setOrigin(0, 0);
    bg.setDisplaySize(width, height);
    bg.setDepth(DEPTH.PARALLAX_BG);
    bg.setScrollFactor(0.3);

    // Layer 3 setup: register the per-frame y-sort pool for every dynamic
    // sprite (player + NPCs + landmark images + ambient props + drop
    // shadows). Sorter.tick() runs in update() to recompute setDepth.
    this.sorter = new SceneSorter();

    // Spawn order: landmarks + ambient props first (background props), then
    // NPCs + player on top so creation order does not shadow y-sort.
    this.spawnLandmarks();
    this.spawnAmbientProps();
    this.spawnHangingLanterns();
    this.spawnPlayer();
    this.spawnApollo();
    this.spawnCaravan();
    this.spawnCaravanVendor();
    this.spawnTreasurer();
    this.spawnAmbientNpcs();
    this.spawnCaravanArrivalZone();

    // Layer 5: warm amber sand particle drift.
    this.ambientFx = buildAmbientFx(this, { kind: 'dust' });

    // E-key binding for landmark interaction (S7 wires UI overlays).
    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.eKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    }

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

    // Per-frame y-sort across all registered dynamic sprites + drop shadows.
    this.sorter?.tick();

    // Landmark E-key interaction: when player is in range and E is just
    // pressed, emit `landmark.<name>.interact`. Cooldown gate prevents
    // double-fire on key auto-repeat.
    this.checkLandmarkInteraction(time);
  }

  // ---- Landmarks (Layer 3, 4 pillar anchors) ----

  /**
   * Spawn the 4 NERIUM-pillar landmark PNGs at their placement-map coords.
   * Each landmark gets a drop shadow registered into the y-sort pool and
   * an entry in landmarkBindings for E-key interaction.
   */
  private spawnLandmarks(): void {
    // Marketplace stall landmark (SE quadrant).
    this.placeLandmark(
      'marketplace_stall',
      ASSET_KEYS.props.apollo_village.marketplace_stall_landmark,
      1080,
      660,
      SCALE_MARKETPLACE,
      { sw: 110, sh: 22, alpha: 0.32 },
    );

    // Builder workshop landmark (NW quadrant).
    this.placeLandmark(
      'builder_workshop',
      ASSET_KEYS.props.apollo_village.builder_workshop_landmark,
      310,
      480,
      SCALE_BUILDER_WORKSHOP,
      { sw: 100, sh: 20, alpha: 0.32 },
    );

    // Registry pillar landmark (NE quadrant).
    this.placeLandmark(
      'registry_pillar',
      ASSET_KEYS.props.apollo_village.registry_pillar_landmark,
      1040,
      380,
      SCALE_REGISTRY_PILLAR,
      { sw: 60, sh: 14, alpha: 0.30 },
    );

    // Trust shrine landmark (SW quadrant).
    this.placeLandmark(
      'trust_shrine',
      ASSET_KEYS.props.apollo_village.trust_shrine_landmark,
      490,
      660,
      SCALE_TRUST_SHRINE,
      { sw: 130, sh: 22, alpha: 0.32 },
    );
  }

  /**
   * Helper for landmark placement. Authors the PNG sprite, attaches a drop
   * shadow ellipse anchored at the sprite base, and binds the E-key event.
   */
  private placeLandmark(
    name: string,
    textureKey: string,
    x: number,
    y: number,
    scale: number,
    shadow: { sw: number; sh: number; alpha: number },
  ): void {
    const sprite = this.add.image(x, y, textureKey);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(scale);

    const dropShadow = this.add.ellipse(
      x,
      y,
      shadow.sw,
      shadow.sh,
      0x000000,
      shadow.alpha,
    );
    this.dropShadows.push(dropShadow);

    // Register both into the sorter so the depth tracks the sprite's
    // position-of-record (static here, but the sorter uses sprite.y so the
    // entry is consistent with player + NPC tracking).
    this.sorter?.register(sprite);
    this.sorter?.register({
      y: y - 1,
      setDepth: (v) => dropShadow.setDepth(v),
    });

    this.landmarkBindings.push({
      name,
      x,
      y,
      eventTopic: `landmark.${name}.interact`,
    });
  }

  // ---- Ambient props (Layer 3, 9 anchors) ----

  /**
   * Place 9 ambient prop PNGs across the scene per placement map.
   * Each registers into the sorter for dynamic y-sort. Drop shadows added
   * for props that lack built-in PNG ground shadow.
   */
  private spawnAmbientProps(): void {
    // Stone well (mid-left, narrative water source).
    this.placeAmbientProp(
      ASSET_KEYS.props.apollo_village.stone_well,
      260,
      570,
      SCALE_STONE_WELL,
      { sw: 80, sh: 16, alpha: 0.30 },
    );

    // Date palm cluster (SW foreground oasis). PNG has built-in sandy mound.
    this.placeAmbientProp(
      ASSET_KEYS.props.apollo_village.date_palm_cluster,
      160,
      660,
      SCALE_DATE_PALM,
      null,
    );

    // Cypress tree (top center vertical accent). PNG has built-in shadow.
    this.placeAmbientProp(
      ASSET_KEYS.props.apollo_village.cypress_tree,
      760,
      240,
      SCALE_CYPRESS_LARGE,
      null,
    );

    // Cypress tree (SE cluster mate, frames marketplace approach).
    this.placeAmbientProp(
      ASSET_KEYS.props.apollo_village.cypress_tree,
      1290,
      540,
      SCALE_CYPRESS_SMALL,
      null,
    );

    // Market stall (commerce anchor near marketplace landmark).
    this.placeAmbientProp(
      ASSET_KEYS.props.apollo_village.market_stall,
      910,
      720,
      SCALE_MARKET_STALL,
      { sw: 90, sh: 18, alpha: 0.30 },
    );

    // Wooden cart (foreground produce, color variety break).
    this.placeAmbientProp(
      ASSET_KEYS.props.apollo_village.wooden_cart,
      760,
      760,
      SCALE_WOODEN_CART,
      { sw: 100, sh: 20, alpha: 0.30 },
    );

    // Apollo house filler (far-right structural depth anchor).
    this.placeAmbientProp(
      ASSET_KEYS.props.apollo_village.apollo_house_filler,
      1320,
      320,
      SCALE_HOUSE_FILLER,
      { sw: 100, sh: 18, alpha: 0.30 },
    );

    // Stone column (mid-frame ruin accent, frames Apollo approach).
    this.placeAmbientProp(
      ASSET_KEYS.props.apollo_village.stone_column,
      610,
      360,
      SCALE_STONE_COLUMN,
      null,
    );

    // Stone signpost (foreground entry marker near player spawn).
    this.placeAmbientProp(
      ASSET_KEYS.props.apollo_village.stone_signpost,
      700,
      730,
      SCALE_STONE_SIGNPOST,
      { sw: 30, sh: 10, alpha: 0.30 },
    );
  }

  private placeAmbientProp(
    textureKey: string,
    x: number,
    y: number,
    scale: number,
    shadow: { sw: number; sh: number; alpha: number } | null,
  ): void {
    const sprite = this.add.image(x, y, textureKey);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(scale);
    this.sorter?.register(sprite);

    if (shadow) {
      const dropShadow = this.add.ellipse(
        x,
        y,
        shadow.sw,
        shadow.sh,
        0x000000,
        shadow.alpha,
      );
      this.dropShadows.push(dropShadow);
      this.sorter?.register({
        y: y - 1,
        setDepth: (v) => dropShadow.setDepth(v),
      });
    }
  }

  // ---- Hanging lanterns (Layer 4 ABOVE_TILES) ----

  /**
   * Two hanging lantern PNGs mounted at scene overhead. Set above_tiles
   * depth so the player sprite renders UNDER the hanging position.
   */
  private spawnHangingLanterns(): void {
    const places: Array<[number, number]> = [
      [480, 440],
      [980, 460],
    ];
    for (const [x, y] of places) {
      const lantern = this.add.image(x, y, ASSET_KEYS.props.apollo_village.hanging_lantern);
      lantern.setOrigin(0.5, 0.3);
      lantern.setScale(SCALE_HANGING_LANTERN);
      lantern.setDepth(DEPTH.ABOVE_TILES);
      // Subtle sway tween (rotation +/-3deg cycle 4s slow, asymmetric phase).
      this.tweens.add({
        targets: lantern,
        angle: { from: -2, to: 2 },
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        duration: 4000,
        delay: x % 700,
      });
    }
  }

  // ---- Player + named NPCs ----

  private spawnPlayer() {
    const spawnX = 704;
    const spawnY = 640;
    this.player = new Player(this, spawnX, spawnY, {
      textureKey: ASSET_KEYS.characters.player_spritesheet,
      frame: 0,
      speed: 160,
      spriteScale: PLAYER_SCALE,
      groundAnchor: true,
      hitboxSize: 28,
    });
    this.sorter?.register(this.player);
    this.attachDropShadow(this.player, 36, 8, 0.30);
  }

  private spawnApollo() {
    const apolloX = 704;
    const apolloY = 360;
    this.apolloNpc = new NPC(this, apolloX, apolloY, {
      npcId: 'apollo',
      displayName: 'Apollo Advisor',
      textureKey: ASSET_KEYS.characters.apollo,
      interactRadius: 56,
      spriteScale: NPC_SCALE_NAMED,
      groundAnchor: true,
    });
    this.sorter?.register(this.apolloNpc);
    this.attachDropShadow(this.apolloNpc, 36, 8, 0.30);
    this.startBreathingTween(this.apolloNpc);
  }

  private spawnCaravan() {
    // Caravan parks east; gated on questStore.unlockedWorlds. Reuses the
    // legacy atlas sigil frame so the gating subscription continues to work
    // unmodified. Future S6 polish may swap to a dedicated AI-asset PNG.
    const caravanX = 1280;
    const caravanY = 400;
    this.caravan = new Caravan(this, caravanX, caravanY, {
      textureKey: this.atlasKey,
      frame: 'sigil_world',
      targetWorld: 'cyberpunk_shanghai',
      displayLabel: 'Caravan: Shanghai',
    });
    this.sorter?.register(this.caravan);
  }

  private spawnCaravanVendor() {
    // S2 keeps caravan_vendor in Apollo Village; S3 (Cyberpunk Shanghai)
    // session relocates per quest step 7 wiring (Epimetheus B5 build).
    const vendorX = 1080;
    const vendorY = 460;
    this.caravanVendorNpc = new NPC(this, vendorX, vendorY, {
      npcId: 'caravan_vendor',
      displayName: 'Caravan Vendor',
      textureKey: ASSET_KEYS.characters.caravan_vendor,
      interactRadius: 48,
      spriteScale: NPC_SCALE_NAMED,
      groundAnchor: true,
    });
    this.sorter?.register(this.caravanVendorNpc);
    this.attachDropShadow(this.caravanVendorNpc, 32, 7, 0.30);
    this.startBreathingTween(this.caravanVendorNpc);
  }

  private spawnTreasurer() {
    // Treasurer NPC for Marshall W2 cross-pillar pricing dialogue. The
    // game.npc.interact { npcId: 'treasurer' } event contract is preserved
    // (treasurer.spec.ts regression). Sprite source swaps to the AI
    // characters.treasurer PNG; the underlying TreasurerNPC class still
    // emits via the base NPC class.
    const treasurerX = 520;
    const treasurerY = 380;
    this.treasurerNpc = new TreasurerNPC(this, treasurerX, treasurerY, {
      textureKey: ASSET_KEYS.characters.treasurer,
      interactRadius: 56,
      spriteScale: NPC_SCALE_NAMED,
      groundAnchor: true,
    });
    this.sorter?.register(this.treasurerNpc);
    this.attachDropShadow(this.treasurerNpc, 36, 8, 0.30);
    this.startBreathingTween(this.treasurerNpc);
  }

  // ---- Ambient NPCs (5 placeholders using player_spritesheet frame 0 +
  //      tint variations until S6 ships dedicated variant sprite pool) ----

  /**
   * Spawn 5 ambient NPCs to populate the scene. Until S6 introduces variant
   * sprites, ambient NPCs reuse the player spritesheet frame 0 (front-facing
   * pose) with palette-coherent tints applied via setTint(...) so each
   * variant reads as a distinct silhouette.
   */
  private spawnAmbientNpcs(): void {
    const playerKey = ASSET_KEYS.characters.player_spritesheet;

    const guardA = this.spawnTintedNpc({
      npcId: 'guard_a',
      displayName: 'Guard',
      textureKey: playerKey,
      x: 640,
      y: 720,
      tint: MEDIEVAL_DESERT.clothBlue,
      scale: NPC_SCALE_AMBIENT,
      interactRadius: 36,
    });
    this.ambientNpcs.push(guardA);

    const guardB = this.spawnTintedNpc({
      npcId: 'guard_b',
      displayName: 'Guard',
      textureKey: playerKey,
      x: 768,
      y: 720,
      tint: MEDIEVAL_DESERT.clothBlue,
      scale: NPC_SCALE_AMBIENT,
      interactRadius: 36,
    });
    this.ambientNpcs.push(guardB);

    const child = this.spawnTintedNpc({
      npcId: 'child_a',
      displayName: 'Child',
      textureKey: playerKey,
      x: 560,
      y: 560,
      tint: MEDIEVAL_DESERT.clothGold,
      scale: NPC_SCALE_CHILD,
      interactRadius: 32,
    });
    this.ambientNpcs.push(child);

    const elder = this.spawnTintedNpc({
      npcId: 'elder_a',
      displayName: 'Elder',
      textureKey: playerKey,
      x: 260,
      y: 380,
      tint: MEDIEVAL_DESERT.clothCrimson,
      scale: NPC_SCALE_AMBIENT,
      interactRadius: 36,
    });
    this.ambientNpcs.push(elder);

    const villager = this.spawnTintedNpc({
      npcId: 'villager_olive',
      displayName: 'Villager',
      textureKey: playerKey,
      x: 840,
      y: 540,
      tint: MEDIEVAL_DESERT.clothPurple,
      scale: NPC_SCALE_AMBIENT,
      interactRadius: 36,
    });
    this.ambientNpcs.push(villager);
  }

  private spawnTintedNpc(opts: {
    npcId: string;
    displayName: string;
    textureKey: string;
    x: number;
    y: number;
    tint: number;
    scale: number;
    interactRadius: number;
  }): NPC {
    const npc = new NPC(this, opts.x, opts.y, {
      npcId: opts.npcId,
      displayName: opts.displayName,
      textureKey: opts.textureKey,
      frame: 0,
      interactRadius: opts.interactRadius,
      spriteScale: opts.scale,
      groundAnchor: true,
    });
    npc.setTint(opts.tint);
    this.sorter?.register(npc);
    // Smaller drop shadow for ambient NPCs.
    this.attachDropShadow(npc, 30, 7, 0.28);
    this.startBreathingTween(npc);
    return npc;
  }

  // ---- Caravan arrival zone ----

  private spawnCaravanArrivalZone() {
    const zoneX = 1280;
    const zoneY = 432;
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

  // ---- Drop shadow + breathing tween helpers ----

  /**
   * Attach a drop shadow ellipse to a moving sprite (player, NPC). The
   * shadow is registered as a YSortable tracking the sprite's y-coordinate
   * minus 1 so it renders one slice below.
   *
   * The shadow position itself is updated in update() via a Phaser tween
   * binding; we attach an event listener so the shadow tracks the sprite
   * smoothly without needing a full SceneSorter member entry.
   */
  private attachDropShadow(
    sprite: Phaser.Physics.Arcade.Sprite,
    sw: number,
    sh: number,
    alpha: number,
  ): void {
    const shadow = this.add.ellipse(sprite.x, sprite.y, sw, sh, 0x000000, alpha);
    this.dropShadows.push(shadow);
    // Register a synthetic YSortable that mirrors sprite.x + sprite.y on each
    // tick; the sorter calls setDepth on the wrapper which forwards to the
    // ellipse.
    const wrapper: { y: number; setDepth: (v: number) => unknown } = {
      get y(): number {
        // Always read the live sprite y so the shadow tracks movement.
        return sprite.y - 1;
      },
      setDepth(this: { y: number; setDepth: (v: number) => unknown }, v: number) {
        shadow.setDepth(v);
        return v;
      },
    } as unknown as { y: number; setDepth: (v: number) => unknown };
    this.sorter?.register(wrapper);

    // Position update: tie shadow position to sprite via post-update hook.
    // We hook into the scene update step rather than overriding the sprite
    // class so the shadow lives independently and can be torn down on
    // SHUTDOWN without touching the sprite.
    sprite.on('preupdate', () => {
      shadow.setPosition(sprite.x, sprite.y);
    });
    // Phaser's `preupdate` event on Arcade sprites only fires when the body
    // is active; for static NPCs we instead update the position once at
    // creation and rely on the sorter tick + sprite proximity update to
    // reposition the shadow when the NPC moves. Static NPCs do not move,
    // so the initial position above is sufficient.
  }

  /**
   * Apply the standard idle breathing tween to a static NPC sprite. Uses
   * sprite's authored scale as the base so the breathing amplitude is
   * proportional to size.
   */
  private startBreathingTween(npc: NPC): void {
    const baseScaleX = npc.scaleX;
    const baseScaleY = npc.scaleY;
    const tween = this.tweens.add({
      targets: npc,
      scaleX: { from: baseScaleX, to: baseScaleX * BREATHING_AMPLITUDE },
      scaleY: { from: baseScaleY, to: baseScaleY * BREATHING_AMPLITUDE },
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      duration: BREATHING_DURATION_MS,
      delay: Math.floor(Math.random() * BREATHING_DURATION_MS),
    });
    this.idleBreathingTweens.push(tween);
  }

  // ---- Landmark E-key interaction polling (each frame in update) ----

  private checkLandmarkInteraction(time: number): void {
    if (!this.player || !this.eKey) return;
    if (!Phaser.Input.Keyboard.JustDown(this.eKey)) return;
    for (const lm of this.landmarkBindings) {
      const dx = this.player.x - lm.x;
      const dy = this.player.y - lm.y;
      const dist = Math.hypot(dx, dy);
      if (dist > LANDMARK_INTERACT_RADIUS_PX) continue;
      const last = this.lastLandmarkEmitAt[lm.name] ?? 0;
      if (time - last < LANDMARK_INTERACT_COOLDOWN_MS) continue;
      this.lastLandmarkEmitAt[lm.name] = time;
      this.events.emit(lm.eventTopic, {
        landmarkName: lm.name,
        x: lm.x,
        y: lm.y,
      });
      const bus = this.game.registry.get('gameEventBus') as GameEventBus | undefined;
      if (bus) {
        bus.emit('game.landmark.interact' as never, {
          landmarkName: lm.name,
          sceneKey: this.scene.key,
        } as never);
      }
      // First match wins per frame (player only triggers one landmark on
      // a single E press even if multiple are within range).
      break;
    }
  }

  // ---- Camera + cleanup ----

  private configureCamera(worldWidth: number, worldHeight: number) {
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    // Lower zoom at 1408x800 world so camera viewport reveals more of the
    // scene; the AI bg is high-res so a 1.0-1.5 zoom keeps detail readable.
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
      for (const t of this.idleBreathingTweens) {
        try {
          t.stop();
        } catch (err) {
          console.error('[ApolloVillageScene] tween stop threw', err);
        }
      }
      this.idleBreathingTweens = [];

      for (const s of this.dropShadows) {
        try {
          s.destroy();
        } catch (err) {
          console.error('[ApolloVillageScene] shadow destroy threw', err);
        }
      }
      this.dropShadows = [];

      this.ambientFx?.stop();
      this.ambientFx?.destroy();
      this.ambientFx = undefined;

      this.sorter?.unregisterAll();
      this.sorter = undefined;
      this.ambientNpcs = [];
      this.landmarkBindings = [];
      this.lastLandmarkEmitAt = {};

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
