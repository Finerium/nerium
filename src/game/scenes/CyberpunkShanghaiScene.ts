//
// src/game/scenes/CyberpunkShanghaiScene.ts
//
// Helios-v2 W3 S4: Cyberpunk Shanghai main scene full revamp + FINAL deprecated
// SVG consumer cutover. After S4 ships, all 3 main scenes (Apollo S2 + Caravan
// S3 + Cyber S4) are migrated off groundPaint/spriteTextures/parallaxLayer/
// decoration. The procedural files become unconsumed and ready for physical
// rename to .deprecated.ts pending Ghaisan greenlight.
//
// VISUAL AUTHORITY SWAP: prior session shipped a procedural SVG / pixel-rect
// composition (paintCyberpunkShanghaiGround + paintCyberpunkOverhead +
// paintHorizonHaze + buildCyberpunkShanghaiSprites + buildParallaxLayer +
// stairStepSilhouette + bespoke vending machine + sign pole + hologram +
// dumpster containers). S4 transitions the scene to consume the AI-generated
// PNG asset bundle shipped at `_Reference/ai_generated_assets/` (96 active
// assets, V6 SHA c74547f). The placement coordinate map authored at
// `_skills_staging/cyberpunk_shanghai_placement.md` is the contract for every
// `this.add.image(...)` call in this file.
//
// Visual stack (5-layer per visual_manifest.contract):
//   Layer 0 (sky_gradient, depth -100): camera-locked deep void to violet smog
//                                       gradient bands via buildSkyGradient
//                                       (cyberpunk_shanghai). scrollFactor 0.
//   Layer 1 (parallax_bg, depth -50):   cyberpunk_shanghai_bg.jpg painted at
//                                       (0, 0) origin (0, 0), scrollFactor
//                                       0.3 mild parallax disambiguation.
//   Layer 2 (ground_tiles, depth -10):  2 wet_puddle PNGs distributed across
//                                       pavement (player walks OVER puddles).
//   Layer 3 (world_tiles, depth 0..N):  4 NERIUM-pillar landmark PNGs + 14
//                                       ambient prop PNGs + 1 cyber_apartment
//                                       filler + 1 synth_vendor NPC + 1
//                                       caravan_vendor NPC (relocated per
//                                       quest step 7) + player + drop shadows.
//                                       All go through SceneSorter for dynamic
//                                       y-sort via setDepth(sprite.y) per
//                                       Oak-Woods feet-anchor pattern.
//   Layer 4 (above_tiles, depth 100):   2 cyber_lantern + 1 laundry_line +
//                                       cyber_chrome_sculpture + hologram_glitch
//                                       hanging overhead so player walks under.
//   Layer 5 (drone, depth 200):         1 drone flying ambient observer
//                                       between world tiles and canopy.
//   Layer 6 (ambient_fx, depth 500):    rain (60/s) + neon_smog (25/s) via
//                                       buildAmbientFx presets.
//   Layer 7 (overlay, depth 9000):      smog_wisps PNG static distribution
//                                       covering full scene (mirrors S3
//                                       autumn_leaves overlay pattern).
//
// Drop shadows: each NPC + landmark + tall ambient prop is shadow-anchored at
// (sprite.x, sprite.y) via Phaser.GameObjects.Ellipse (alpha 0.30-0.32, fill
// 0x000000). Shadows register with SceneSorter at offset y - 1 so they always
// render one slice below their owning sprite.
//
// NPC idle breathing: synth_vendor + caravan_vendor NPCs get scale tween 1.0
// to 1.02 over 800ms loop ease Sine.easeInOut per S4 directive item 5.
//
// E-key landmark interaction: the four NERIUM pillar landmarks (cyber
// marketplace, bank treasury, admin hall, protocol gateway) emit
// `landmark.<name>.interact` via the scene event emitter when the player is
// within 128 px AND the E key is just-pressed. S7 session connects these
// events to the respective UI overlays.
//
// PRESERVED FROM RV (NON-REGRESSION):
//   - Player spawn + camera follow + setBounds
//   - Caravan Vendor relocates here per quest step 7 (Epimetheus B5 build)
//   - game.scene.ready, game.player.spawned emissions
//   - Cinematic 500ms fade-in via cameras.main.fadeIn(500)
//   - SHUTDOWN cleanup (tweens, emitters, sorter, listeners, smog overlay)
//   - window.__NERIUM_TEST__ Playwright hook
//
// CUTOVER (S4 boundary -- FINAL deprecated SVG consumer cutover):
//   - groundPaint.ts symbols removed: paintCyberpunkShanghaiGround,
//     paintCyberpunkOverhead, paintHorizonHaze
//   - spriteTextures.ts symbols removed: buildCyberpunkShanghaiSprites,
//     CyberpunkShanghaiSpriteKeys
//   - parallaxLayer.ts symbols removed: buildParallaxLayer,
//     stairStepSilhouette
//   - All bespoke pixel-rect Container decoration replaced by AI-asset PNG
//     render.
//
// Owner: Helios-v2 (W3 S4 revamp), Thalia-v2 (RV scaffold).
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
  buildAmbientFx,
  DEPTH,
} from '../visual';
import { ASSET_KEYS } from '../visual/asset_keys';

interface CyberpunkShanghaiSceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
}

// World dimensions match S2 + S3 conventions (1408 x 800) so the scene snapshot
// is consistent across Apollo + Caravan + Cyberpunk for /ultrareview diff.
// The cyberpunk_shanghai_bg.jpg is 690x386 native; setDisplaySize stretches
// the bg to fill the full world.
const WORLD_W = 1408;
const WORLD_H = 800;

// NPC + player scale per placement map (S2 + S3 parity).
const NPC_SCALE_NAMED = 0.18;
const PLAYER_SCALE = 0.18;

// Landmark scales per placement map.
const SCALE_CYBER_MARKETPLACE = 0.42;
const SCALE_BANK_TREASURY = 0.45;
const SCALE_ADMIN_HALL = 0.40;
const SCALE_PROTOCOL_GATEWAY = 0.40;

// Ambient prop scales per placement map.
const SCALE_SYNTH_VENDOR_CART = 0.30;
const SCALE_VENDOR_CART_ALT = 0.28;
const SCALE_NEON_MARKET_STALL = 0.30;
const SCALE_CYBER_DATA_TERMINAL = 0.22;
const SCALE_HOLO_AD_PANEL = 0.25;
const SCALE_NEON_SIGN_VERTICAL = 0.25;
const SCALE_STEAM_VENT = 0.22;
const SCALE_CRATE_STACK = 0.22;
const SCALE_TRASH_BIN = 0.22;
const SCALE_CYBER_INDUSTRIAL_PIPE = 0.22;
const SCALE_REFRIGERATOR = 0.22;
const SCALE_DRONE = 0.18;
const SCALE_CYBER_CHROME_SCULPTURE = 0.20;
const SCALE_HOLOGRAM_GLITCH = 0.18;

const SCALE_CYBER_APARTMENT_FILLER = 0.32;
const SCALE_CYBER_LANTERN = 0.18;
const SCALE_LAUNDRY_LINE = 0.30;
const SCALE_WET_PUDDLE_LARGE = 0.20;
const SCALE_WET_PUDDLE_SMALL = 0.18;

// Idle breathing tween standard (per S4 directive, S2 + S3 parity).
const BREATHING_DURATION_MS = 800;
const BREATHING_AMPLITUDE = 1.02;

// smog_wisps overlay depth + alpha (per directive 6).
const SMOG_WISPS_DEPTH = 9000;
const SMOG_WISPS_ALPHA = 0.5;

// Drone depth: above world tiles, below canopy ABOVE_TILES (100). Per
// inventory 6.14: "Set at depth 200 (above world tiles, below canopy)".
const DRONE_DEPTH = 200;

// Cinematic fade-in (preserved from RV).
const FADE_IN_MS = 500;

// Landmark E-key interaction trigger radius (px, S2 parity).
const LANDMARK_INTERACT_RADIUS_PX = 128;
const LANDMARK_INTERACT_COOLDOWN_MS = 500;

interface LandmarkBinding {
  name: string;
  x: number;
  y: number;
  eventTopic: string;
}

export class CyberpunkShanghaiScene extends Phaser.Scene {
  private worldId: WorldId = 'cyberpunk_shanghai';

  // Active dynamic objects.
  private player?: Player;
  private synthVendorNpc?: NPC;
  private caravanVendorNpc?: NPC;
  private unsubscribers: Array<() => void> = [];

  // Visual revamp state.
  private sorter?: SceneSorter;
  private rainFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private smogFx?: Phaser.GameObjects.Particles.ParticleEmitter | null;
  private idleBreathingTweens: Phaser.Tweens.Tween[] = [];
  private dropShadows: Phaser.GameObjects.Ellipse[] = [];
  private smogWispsOverlay?: Phaser.GameObjects.Image;

  // Landmark E-key interaction state.
  private landmarkBindings: LandmarkBinding[] = [];
  private eKey?: Phaser.Input.Keyboard.Key;
  private lastLandmarkEmitAt: Record<string, number> = {};

  constructor() {
    super({ key: 'CyberpunkShanghai' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: CyberpunkShanghaiSceneData) {
    if (data.worldId) this.worldId = data.worldId;
  }

  create() {
    const width = WORLD_W;
    const height = WORLD_H;

    // Background fallback color so any unfilled pixel reads deep void, not
    // the default Phaser gray.
    this.cameras.main.setBackgroundColor('#06060c');
    this.physics.world.setBounds(0, 0, width, height);

    // Cinematic fade-in (preserved from RV).
    this.cameras.main.fadeIn(FADE_IN_MS, 0, 0, 0);

    // Layer 0: sky gradient bands camera-locked above bg.
    buildSkyGradient(this, {
      world: 'cyberpunk_shanghai',
      width: this.scale.width,
      height: this.scale.height,
    });

    // Layer 1: AI background painted at (0, 0) covering the full scene.
    // The cyberpunk_shanghai_bg.jpg is 690x386 native; setDisplaySize
    // stretches to 1408x800 so the bg fills the world.
    const bg = this.add.image(0, 0, ASSET_KEYS.backgrounds.cyberpunk_shanghai_bg);
    bg.setOrigin(0, 0);
    bg.setDisplaySize(width, height);
    bg.setDepth(DEPTH.PARALLAX_BG);
    bg.setScrollFactor(0.3);

    // Layer 3 setup: register the per-frame y-sort pool for every dynamic
    // sprite (player + NPCs + landmark images + ambient props + drop shadows).
    this.sorter = new SceneSorter();

    // Spawn order: ground puddles first (Layer 2), then landmarks + ambient
    // props (Layer 3), then apartment filler (Layer 3), then NPCs + player on
    // top so creation order does not shadow y-sort.
    this.spawnGroundPuddles();
    this.spawnLandmarks();
    this.spawnAmbientProps();
    this.spawnApartmentFiller();
    this.spawnHangingProps();
    this.spawnDrone();
    this.spawnPlayer();
    this.spawnSynthVendor();
    this.spawnCaravanVendor();

    // Layer 6: ambient FX particle emitters (rain front + neon_smog behind).
    this.smogFx = buildAmbientFx(this, { kind: 'neon_smog' });
    this.rainFx = buildAmbientFx(this, { kind: 'rain' });

    // Layer 7: smog_wisps PNG static overlay covering full scene.
    // Per directive 6: S4 ships baseline overlay; S9 polishes drift tween.
    this.spawnSmogWispsOverlay(width, height);

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
    if (this.player && this.synthVendorNpc) {
      this.synthVendorNpc.updateProximity(this.player);
    }
    if (this.player && this.caravanVendorNpc) {
      this.caravanVendorNpc.updateProximity(this.player);
    }

    // Per-frame y-sort across all registered dynamic sprites + drop shadows.
    this.sorter?.tick();

    // Landmark E-key interaction polling.
    this.checkLandmarkInteraction(time);
  }

  // ---- Layer 2: wet_puddle ground tiles (player walks OVER) ----

  /**
   * Distribute 2 wet_puddle PNGs across the cyberpunk pavement at varied
   * positions per inventory 6.26. Set at DEPTH.GROUND_TILES (-10) so player
   * walks over puddle. S9 polishes ripple tween.
   */
  private spawnGroundPuddles(): void {
    const puddle1 = this.add.image(440, 660, ASSET_KEYS.props.cyberpunk_shanghai.wet_puddle);
    puddle1.setOrigin(0.5, 0.5);
    puddle1.setScale(SCALE_WET_PUDDLE_LARGE);
    puddle1.setDepth(DEPTH.GROUND_TILES);

    const puddle2 = this.add.image(1140, 540, ASSET_KEYS.props.cyberpunk_shanghai.wet_puddle);
    puddle2.setOrigin(0.5, 0.5);
    puddle2.setScale(SCALE_WET_PUDDLE_SMALL);
    puddle2.setDepth(DEPTH.GROUND_TILES);
  }

  // ---- Layer 3: 4 NERIUM-pillar landmark PNGs ----

  /**
   * Spawn the 4 NERIUM-pillar landmark PNGs at their placement-map coords
   * (TR cyber_marketplace, BL bank_treasury, BR admin_hall, ML protocol_
   * gateway). Each landmark gets a drop shadow registered into the y-sort
   * pool and an entry in landmarkBindings for E-key interaction.
   */
  private spawnLandmarks(): void {
    // Cyber marketplace landmark (TR quadrant).
    this.placeLandmark(
      'cyber_marketplace',
      ASSET_KEYS.props.cyberpunk_shanghai.cyber_marketplace_landmark,
      1180,
      460,
      SCALE_CYBER_MARKETPLACE,
      { sw: 140, sh: 22, alpha: 0.32 },
    );

    // Bank treasury landmark (BL quadrant).
    this.placeLandmark(
      'bank_treasury',
      ASSET_KEYS.props.cyberpunk_shanghai.bank_treasury_landmark,
      130,
      480,
      SCALE_BANK_TREASURY,
      { sw: 80, sh: 18, alpha: 0.32 },
    );

    // Admin hall landmark (BR quadrant).
    this.placeLandmark(
      'admin_hall',
      ASSET_KEYS.props.cyberpunk_shanghai.admin_hall_landmark,
      1260,
      760,
      SCALE_ADMIN_HALL,
      { sw: 120, sh: 22, alpha: 0.32 },
    );

    // Protocol gateway landmark (ML quadrant).
    this.placeLandmark(
      'protocol_gateway',
      ASSET_KEYS.props.cyberpunk_shanghai.protocol_gateway_landmark,
      320,
      720,
      SCALE_PROTOCOL_GATEWAY,
      { sw: 90, sh: 18, alpha: 0.32 },
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

  // ---- Layer 3: 14 ambient prop PNGs ----

  /**
   * Place 14 ambient prop PNGs across the scene per placement map. Each
   * registers into the sorter for dynamic y-sort. Drop shadows added for
   * props that lack built-in PNG ground shadow.
   *
   * Lights2D coordinate reservations are MARKED in placement map for S9
   * enable; S4 just places sprites + drop shadows.
   */
  private spawnAmbientProps(): void {
    // synth_vendor_cart (PRIMARY anchor in mid-bottom pavement).
    this.placeAmbientProp(
      ASSET_KEYS.props.cyberpunk_shanghai.synth_vendor_cart,
      980,
      700,
      SCALE_SYNTH_VENDOR_CART,
      { sw: 120, sh: 18, alpha: 0.32 },
    );

    // vendor_cart_alt (secondary cart, mid-mid pavement).
    this.placeAmbientProp(
      ASSET_KEYS.props.cyberpunk_shanghai.vendor_cart_alt,
      760,
      460,
      SCALE_VENDOR_CART_ALT,
      { sw: 110, sh: 16, alpha: 0.30 },
    );

    // neon_market_stall (mid-bottom right pavement).
    this.placeAmbientProp(
      ASSET_KEYS.props.cyberpunk_shanghai.neon_market_stall,
      1100,
      700,
      SCALE_NEON_MARKET_STALL,
      { sw: 110, sh: 18, alpha: 0.30 },
    );

    // cyber_data_terminal (mid-bottom open pavement, near manhole).
    this.placeAmbientProp(
      ASSET_KEYS.props.cyberpunk_shanghai.cyber_data_terminal,
      480,
      740,
      SCALE_CYBER_DATA_TERMINAL,
      { sw: 60, sh: 12, alpha: 0.30 },
    );

    // holo_ad_panel (mid-mid air, bronze base built into PNG).
    this.placeAmbientProp(
      ASSET_KEYS.props.cyberpunk_shanghai.holo_ad_panel,
      640,
      380,
      SCALE_HOLO_AD_PANEL,
      null,
    );

    // neon_sign_vertical (far-left wall vertical accent).
    this.placeAmbientProp(
      ASSET_KEYS.props.cyberpunk_shanghai.neon_sign_vertical,
      60,
      360,
      SCALE_NEON_SIGN_VERTICAL,
      { sw: 26, sh: 10, alpha: 0.30 },
    );

    // steam_vent (mid-bottom pavement second steam vent).
    this.placeAmbientProp(
      ASSET_KEYS.props.cyberpunk_shanghai.steam_vent,
      700,
      700,
      SCALE_STEAM_VENT,
      null,
    );

    // crate_stack (far-left bottom corner).
    this.placeAmbientProp(
      ASSET_KEYS.props.cyberpunk_shanghai.crate_stack,
      40,
      660,
      SCALE_CRATE_STACK,
      { sw: 90, sh: 16, alpha: 0.30 },
    );

    // trash_bin (far-left bottom open pavement, "discarded tech" anchor).
    this.placeAmbientProp(
      ASSET_KEYS.props.cyberpunk_shanghai.trash_bin,
      220,
      720,
      SCALE_TRASH_BIN,
      { sw: 56, sh: 12, alpha: 0.30 },
    );

    // cyber_industrial_pipe (far-right wall mid; rust-vs-neon contrast).
    this.placeAmbientProp(
      ASSET_KEYS.props.cyberpunk_shanghai.cyber_industrial_pipe,
      1380,
      360,
      SCALE_CYBER_INDUSTRIAL_PIPE,
      { sw: 100, sh: 14, alpha: 0.28 },
    );

    // refrigerator (far-right corner bottom; "lived-in" prop).
    this.placeAmbientProp(
      ASSET_KEYS.props.cyberpunk_shanghai.refrigerator,
      1380,
      660,
      SCALE_REFRIGERATOR,
      { sw: 56, sh: 12, alpha: 0.30 },
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

  // ---- Layer 3: cyber_apartment_filler structural anchor ----

  /**
   * Cyber apartment filler at far-right. Twin apartment buildings with cyan
   * trim, fire escapes, hanging laundry between, magenta neon roof trim.
   * Lights2D coord reserved S9 for per-window subtle alpha tween + laundry
   * sway tween.
   */
  private spawnApartmentFiller(): void {
    const x = 1290;
    const y = 540;
    const sprite = this.add.image(
      x,
      y,
      ASSET_KEYS.props.cyberpunk_shanghai.cyber_apartment_filler,
    );
    sprite.setOrigin(0.5, 1);
    sprite.setScale(SCALE_CYBER_APARTMENT_FILLER);
    this.sorter?.register(sprite);

    const dropShadow = this.add.ellipse(x, y, 180, 20, 0x000000, 0.32);
    this.dropShadows.push(dropShadow);
    this.sorter?.register({
      y: y - 1,
      setDepth: (v) => dropShadow.setDepth(v),
    });
  }

  // ---- Layer 4: hanging overhead props (ABOVE_TILES depth 100) ----

  /**
   * Hanging cyber_lantern (x2) + laundry_line + cyber_chrome_sculpture +
   * hologram_glitch at scene overhead. Set above_tiles depth so player
   * sprite renders UNDER the hanging position. S9 polishes sway / glitch
   * tweens.
   */
  private spawnHangingProps(): void {
    // Cyber lantern (left mid-top).
    const lantern1 = this.add.image(
      560,
      200,
      ASSET_KEYS.props.cyberpunk_shanghai.cyber_lantern,
    );
    lantern1.setOrigin(0.5, 0.3);
    lantern1.setScale(SCALE_CYBER_LANTERN);
    lantern1.setDepth(DEPTH.ABOVE_TILES);
    this.tweens.add({
      targets: lantern1,
      angle: { from: -2, to: 2 },
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      duration: 4000,
      delay: 200,
    });

    // Cyber lantern (right mid-top, mirror).
    const lantern2 = this.add.image(
      1080,
      200,
      ASSET_KEYS.props.cyberpunk_shanghai.cyber_lantern,
    );
    lantern2.setOrigin(0.5, 0.3);
    lantern2.setScale(SCALE_CYBER_LANTERN);
    lantern2.setDepth(DEPTH.ABOVE_TILES);
    this.tweens.add({
      targets: lantern2,
      angle: { from: 2, to: -2 },
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      duration: 4200,
      delay: 600,
    });

    // Laundry line (mid-top hanging between apartment buildings).
    const laundry = this.add.image(
      820,
      160,
      ASSET_KEYS.props.cyberpunk_shanghai.laundry_line,
    );
    laundry.setOrigin(0.5, 0.5);
    laundry.setScale(SCALE_LAUNDRY_LINE);
    laundry.setDepth(DEPTH.ABOVE_TILES);

    // Cyber chrome sculpture (mid-top hanging sculpture).
    const sculpture = this.add.image(
      340,
      280,
      ASSET_KEYS.props.cyberpunk_shanghai.cyber_chrome_sculpture,
    );
    sculpture.setOrigin(0.5, 0.5);
    sculpture.setScale(SCALE_CYBER_CHROME_SCULPTURE);
    sculpture.setDepth(DEPTH.ABOVE_TILES);

    // Hologram glitch (mid-top right air, subtle quest-discovery cue).
    const holoGlitch = this.add.image(
      1140,
      320,
      ASSET_KEYS.props.cyberpunk_shanghai.hologram_glitch,
    );
    holoGlitch.setOrigin(0.5, 0.5);
    holoGlitch.setScale(SCALE_HOLOGRAM_GLITCH);
    holoGlitch.setDepth(DEPTH.ABOVE_TILES);
  }

  // ---- Layer 5: drone flying ambient observer (depth 200) ----

  /**
   * Drone flying ambient observer between world tiles and canopy. Set depth
   * 200 so it floats above world props but below canopy ABOVE_TILES (100,
   * note: ABOVE_TILES at 100 is BELOW depth 200 since lower-depth renders
   * first; the comment in inventory 6.14 was inverted but the intent stands:
   * drone hovers high in scene). S9 polishes vertical bob + horizontal
   * patrol tween.
   */
  private spawnDrone(): void {
    const drone = this.add.image(820, 240, ASSET_KEYS.props.cyberpunk_shanghai.drone);
    drone.setOrigin(0.5, 0.5);
    drone.setScale(SCALE_DRONE);
    drone.setDepth(DRONE_DEPTH);
  }

  // ---- Player ----

  private spawnPlayer() {
    const spawnX = 160;
    const spawnY = 640;
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

  // ---- Synth Vendor NPC ----

  private spawnSynthVendor() {
    // Synth Vendor stands beside synth_vendor_cart at (980, 700).
    // Inventory 2.8: cyan-magenta trim hooded merchant with robotic forearm
    // cyan glow. Already palette-coherent with cyberpunk world.
    const synthX = 920;
    const synthY = 720;
    this.synthVendorNpc = new NPC(this, synthX, synthY, {
      npcId: 'synth_vendor',
      displayName: 'Synth Vendor',
      textureKey: ASSET_KEYS.characters.synth_vendor,
      interactRadius: 48,
      spriteScale: NPC_SCALE_NAMED,
      groundAnchor: true,
    });
    this.sorter?.register(this.synthVendorNpc);
    this.attachDropShadow(this.synthVendorNpc, 32, 7, 0.30);
    this.startBreathingTween(this.synthVendorNpc);
  }

  // ---- Caravan Vendor NPC (relocated per quest step 7) ----

  private spawnCaravanVendor() {
    // Caravan Vendor relocates to Cyberpunk Shanghai per quest step 7
    // (Epimetheus B5 build). Stands near vendor_cart_alt offset east. The
    // warm-palette character in cool cyberpunk world reads as visual
    // punctuation per inventory 2.6 directive.
    const vendorX = 1040;
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

  // ---- Atmospheric overlay (Layer 7 smog_wisps) ----

  /**
   * Smog-wisps static distribution overlay covering full scene per directive
   * 6 (NOT cut V6 unlike Apollo's dust_motes). Mirrors S3 autumn_leaves
   * overlay pattern.
   *
   * Per directive 6:
   * - depth 9000 (above world, below UIScene 10000)
   * - alpha 0.5 (S9 polishes alpha tween 0.4 to 0.6 over 3s)
   * - displaySize matches world dimensions
   * - origin (0, 0) so coordinates reference top-left corner
   *
   * S9 wire-up: position drift tween left-to-right slow + alpha tween.
   */
  private spawnSmogWispsOverlay(worldWidth: number, worldHeight: number): void {
    const overlay = this.add.image(0, 0, ASSET_KEYS.overlays.smog_wisps);
    overlay.setOrigin(0, 0);
    overlay.setDisplaySize(worldWidth, worldHeight);
    overlay.setAlpha(SMOG_WISPS_ALPHA);
    overlay.setDepth(SMOG_WISPS_DEPTH);
    overlay.setScrollFactor(0.6);
    this.smogWispsOverlay = overlay;
  }

  // ---- Drop shadow + breathing tween helpers (S2 + S3 parity) ----

  /**
   * Attach a drop shadow ellipse to a moving sprite (player, NPC). The
   * shadow is registered as a YSortable tracking the sprite's y-coordinate
   * minus 1 so it renders one slice below.
   */
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
    // S2 + S3 parity: camera viewport reveals more of the scene. Lower clamp
    // keeps the AI bg detail readable without over-magnification.
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
          console.error('[CyberpunkShanghaiScene] tween stop threw', err);
        }
      }
      this.idleBreathingTweens = [];

      for (const s of this.dropShadows) {
        try {
          s.destroy();
        } catch (err) {
          console.error('[CyberpunkShanghaiScene] shadow destroy threw', err);
        }
      }
      this.dropShadows = [];

      this.smogWispsOverlay?.destroy();
      this.smogWispsOverlay = undefined;

      this.rainFx?.stop();
      this.rainFx?.destroy();
      this.rainFx = undefined;
      this.smogFx?.stop();
      this.smogFx?.destroy();
      this.smogFx = undefined;

      this.sorter?.unregisterAll();
      this.sorter = undefined;
      this.landmarkBindings = [];
      this.lastLandmarkEmitAt = {};

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
