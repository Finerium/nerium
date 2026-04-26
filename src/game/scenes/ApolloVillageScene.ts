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
  enableSceneAmbient,
  addPointLight,
  addLandmarkHalo,
  buildDayNightOverlay,
  type PointLightHandle,
  type DayNightHandle,
} from '../visual';
import { ASSET_KEYS } from '../visual/asset_keys';

interface ApolloVillageSceneData {
  worldId?: WorldId;
  spawn?: { x: number; y: number };
  /**
   * Set when the player is returning from an Apollo sub-area scene
   * (Helios-v2 W3 S5). Lets create() respawn the player at the matching
   * landmark approach instead of the default south-center spawn coord.
   */
  returnFromSubArea?: 'temple_interior' | 'marketplace_bazaar' | 'oasis';
}

// World dimensions match the apollo_village_bg.jpg native 1408 x 793 with a
// tiny vertical headroom strip (8 px) absorbed by the sky gradient. The
// 32 px tile reference is preserved for compatibility with NPC interact
// radii + Caravan + arrival zone authored against 32 px scale in RV.
const WORLD_W = 1408;
const WORLD_H = 800;
const TILE_PX = 32;

// Player + ambient NPC scale: 0.18 against player_spritesheet 512x512 frame
// renders a ~92x92 character sprite (player-sized).
//
// Named NPC (apollo, treasurer, caravan_vendor) scale: source PNGs are
// 2048x2048, NOT spritesheet-frame-sliced, so their on-screen size at
// scale 0.18 was 370 px -> 4x larger than player. Nemea-RV-v2 W4 Phase 0
// scales them to 0.05 (~100 px) for player-visual parity. The original
// 0.18 was a Helios-v2 S2 oversight (constant intended for spritesheet
// frame consumers, applied to monolithic PNG NPC sources).
const NPC_SCALE_NAMED = 0.05;
const NPC_SCALE_AMBIENT = 0.18;
const NPC_SCALE_CHILD = 0.13;
const PLAYER_SCALE = 0.18;

// Nemea-RV-v2 W4 Phase 0 visual regression fix.
//
// PRIOR PROBLEM (Helios-v2 S2 ship): the AI-generated landmark + ambient
// prop PNGs were spawned at scales 0.40-0.65 against PNG source dimensions
// 1024x1024 to 2880x5824, producing display sizes 700-2900 px against an
// 1408x800 viewport. Combined with the AI-generated apollo_village_bg.jpg
// painted backdrop ALREADY containing every prop (well, palm, market stall,
// fruit cart, temple archway, adobe building), the scene duplicated visual
// content + giant sprites masked the painted scene.
//
// PHASE 0 FIX (Nemea-RV-v2 W4):
//   1. Delete every ambient prop spawn that duplicates a painted backdrop
//      element (stone_well, date_palm_cluster, cypress_tree, market_stall,
//      wooden_cart, apollo_house_filler, stone_column, stone_signpost).
//      The backdrop paints these; spawned sprites are visual noise.
//   2. Delete hanging_lantern overhead sprites; backdrop has no painted
//      lanterns at the spawned coords, and Lights2D point lights already
//      provide warm halos in those positions for atmospheric feedback.
//   3. Drastically rescale + reposition the 4 NERIUM-pillar landmarks
//      (marketplace_stall, builder_workshop, registry_pillar, trust_shrine)
//      so they read as iconic ~150-200 px markers anchored at semantic
//      backdrop positions (not building-replacement giants).
//   4. Rescale + reposition temple_arch ambient entry to a small marker
//      glyph adjacent to the painted temple, not on top of it.
//
// The 4 landmark interaction surfaces (E-key proximity + dialogue + sub-area
// scene transitions) all preserve their original event topics + bindings;
// only sprite size + position change. Y-sort + drop shadow + glyph + prompt
// text systems flow unchanged.
const SCALE_MARKETPLACE = 0.06;
const SCALE_BUILDER_WORKSHOP = 0.06;
const SCALE_REGISTRY_PILLAR = 0.05;
const SCALE_TRUST_SHRINE = 0.06;
const SCALE_TEMPLE_ARCH_MARKER = 0.05;

// Idle breathing tween standard (per S2 directive item 3).
const BREATHING_DURATION_MS = 800;
const BREATHING_AMPLITUDE = 1.02;

// Landmark E-key interaction trigger radius (px). Slightly larger than NPC
// radius so the landmark feels more discoverable.
const LANDMARK_INTERACT_RADIUS_PX = 128;
const LANDMARK_INTERACT_COOLDOWN_MS = 500;

// Helios-v2 W3 S7 landmark glyph + prompt depth. Above world tiles + ambient
// FX overlay (depth 500), below the dual-path choice prompt (9500) and the
// UIScene chat (10000) so the glyph stays visible during routine play but
// is shaded by modal overlays.
const LANDMARK_GLYPH_DEPTH = 9001;

// Helios-v2 W3 S7 floating prompt labels per Apollo NERIUM-pillar landmark.
// JRPG-tradition action verbs; clarity over flair. Ambient entry landmarks
// (temple_arch) supply their own promptLabel directly via the helper.
const APOLLO_LANDMARK_PROMPTS: Readonly<Record<string, string>> = Object.freeze({
  marketplace_stall: 'Press E to browse marketplace',
  builder_workshop: 'Press E to enter workshop',
  registry_pillar: 'Press E to view registry',
  trust_shrine: 'Press E to view trust scores',
});

interface LandmarkBinding {
  name: string;
  x: number;
  y: number;
  eventTopic: string;
  /**
   * Helios-v2 W3 S5 dual-path. When set, pressing E within range opens an
   * in-game choice prompt offering both the existing UI-modal event topic
   * (choice 0) and a sub-area scene transition (choice 1). Landmarks
   * without this binding remain UI-modal-only.
   */
  subArea?: {
    sceneKey: 'ApolloTempleInterior' | 'ApolloMarketplaceBazaar' | 'ApolloOasis';
    optionUiLabel: string; // e.g. "Browse listings (UI)"
    optionGameLabel: string; // e.g. "Enter bazaar (game)"
    title: string; // prompt title text
  };
  /**
   * Helios-v2 W3 S7. Floating action prompt label (e.g., "Press E to browse
   * marketplace"). Rendered as a Phaser Text above the landmark when the
   * player is within LANDMARK_INTERACT_RADIUS_PX. Auto-derived from name if
   * unset; explicit label preferred for accessibility + JRPG-tradition
   * clarity.
   */
  promptLabel?: string;
  /**
   * Helios-v2 W3 S7. Hovering glyph tween anchor coords (sprite-relative)
   * for the proximity feedback. Glyph alpha-pulses idle, scale-pulses on
   * proximity, flashes on E-key trigger. Auto-anchored above sprite top.
   */
  glyphAnchorOffset?: { x: number; y: number };
  /**
   * Helios-v2 W3 S7 ambient entry vs NERIUM-pillar discrimination. NERIUM-
   * pillar landmarks (marketplace_stall + builder_workshop + registry_pillar
   * + trust_shrine) emit landmark.{name}.interact + game.landmark.interact;
   * ambient entry landmarks (temple_arch) only fade-transition without
   * emission. Default true.
   */
  emitsInteract?: boolean;
  /**
   * Helios-v2 W3 S7 pure-fade ambient sub-area entry. When set on a non-
   * NERIUM-pillar landmark (e.g. temple_arch -> ApolloTempleInterior),
   * E-key proximity directly fade-transitions without choice prompt. The
   * `subArea` field is for dual-path with prompt; this is for direct
   * ambient entry.
   */
  ambientSubArea?: {
    sceneKey: 'ApolloTempleInterior' | 'ApolloMarketplaceBazaar' | 'ApolloOasis';
  };
}

/**
 * Helios-v2 W3 S7 hovering glyph + proximity prompt visuals per landmark.
 * The glyph is a small Phaser Container holding the glyph texture (or a
 * simple drawn shape if no asset registered) plus an idle pulse tween. The
 * promptText is a Phaser Text rendered above the glyph, only visible when
 * the player is within LANDMARK_INTERACT_RADIUS_PX. Both share a setDepth
 * above the foliage canopy ABOVE_TILES band to clear ambient FX overlays.
 */
interface LandmarkVisualHandle {
  binding: LandmarkBinding;
  glyph: Phaser.GameObjects.Container;
  glyphIdleTween: Phaser.Tweens.Tween;
  glyphProximityTween?: Phaser.Tweens.Tween;
  promptText: Phaser.GameObjects.Text;
  proximityActive: boolean;
}

/**
 * Helios-v2 W3 S5 dual-path landmark choice prompt overlay.
 *
 * Container of native Phaser GameObjects (no DOMElement, no React) anchored
 * to the camera viewport so it stays put while the camera follows. Renders a
 * dim backdrop, a title line, and two option lines with a yellow caret arrow
 * on the highlighted option. ArrowUp/ArrowDown swap the highlight, Enter
 * confirms the highlighted option, Esc dismisses the prompt.
 *
 * The prompt belongs entirely to the game canvas; it does not coordinate
 * with the Boreas chat focus arbitration because it is a transient modal
 * (open + dismissed within seconds).
 */
interface LandmarkPromptState {
  binding: LandmarkBinding;
  container: Phaser.GameObjects.Container;
  optionTexts: Phaser.GameObjects.Text[]; // [0] = UI option, [1] = game option
  selectedIndex: 0 | 1;
  openedAt: number;
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

  // Helios-v2 W3 S9 Lights2D + day-night state. Each handle tracks the
  // PointLight + tween so SHUTDOWN can dispose without leaking.
  private pointLights: PointLightHandle[] = [];
  private landmarkHalos: PointLightHandle[] = [];
  private dayNight?: DayNightHandle;

  // Landmark E-key interaction state.
  private landmarkBindings: LandmarkBinding[] = [];
  private eKey?: Phaser.Input.Keyboard.Key;
  private lastLandmarkEmitAt: Record<string, number> = {};

  // Helios-v2 W3 S7 hovering glyph + proximity prompt state.
  private landmarkVisuals: LandmarkVisualHandle[] = [];

  // Helios-v2 W3 S8 quest indicator state. Each entry binds a target NPC
  // sprite (Apollo / Treasurer / Caravan Vendor) to a `quest_exclamation`
  // PNG image bobbing above the NPC's head. The list is iterated in
  // update() to keep position synced with the moving NPC sprite (currently
  // static, but tween-aware for future S8 wander motion).
  private questIndicators: Array<{
    target: Phaser.Physics.Arcade.Sprite;
    image: Phaser.GameObjects.Image;
    bobTween: Phaser.Tweens.Tween;
    offsetY: number;
  }> = [];

  // Helios-v2 W3 S5 dual-path landmark choice prompt state. While non-null,
  // E-key interaction polling is paused (player cannot open a second prompt).
  // ArrowUp/Down swap selection, Enter confirms, Esc dismisses.
  private landmarkPrompt: LandmarkPromptState | null = null;
  private upKey?: Phaser.Input.Keyboard.Key;
  private downKey?: Phaser.Input.Keyboard.Key;
  private enterKey?: Phaser.Input.Keyboard.Key;
  private escKey?: Phaser.Input.Keyboard.Key;
  // Honor incoming S5 sub-area return spawn override. Set once in init() and
  // consumed by spawnPlayer().
  private spawnOverride?: { x: number; y: number };

  constructor() {
    super({ key: 'ApolloVillage' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: ApolloVillageSceneData) {
    if (data.worldId) this.worldId = data.worldId;
    this.atlasKey = `atlas_${this.worldId}`;
    // Helios-v2 W3 S5: when the player returns from an Apollo sub-area scene
    // (temple interior, marketplace bazaar, or oasis), the sub-area passes
    // an explicit spawn coord at the matching landmark approach so the
    // player visibly returns to where they left.
    if (data.spawn) {
      this.spawnOverride = { x: data.spawn.x, y: data.spawn.y };
    } else {
      this.spawnOverride = undefined;
    }
    // Reset dual-path prompt state on every fresh init so a previous
    // sub-area roundtrip does not leak prompt UI artifacts.
    this.landmarkPrompt = null;
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

    // Spawn order: landmarks first (interactive markers anchored to painted
    // backdrop semantic spots), then NPCs + player on top so creation order
    // does not shadow y-sort.
    //
    // Nemea-RV-v2 W4 Phase 0: ambient prop spawns (spawnAmbientProps,
    // spawnHangingLanterns) deleted because each redundantly duplicates a
    // backdrop-painted element. The painted apollo_village_bg.jpg already
    // contains the well, palm, market stall, fruit cart, temple archway,
    // and adobe building; spawning sprite versions on top produced visual
    // collision + scale mismatch + Y-sort chaos.
    this.spawnLandmarks();
    this.spawnPlayer();
    this.spawnApollo();
    this.spawnCaravan();
    this.spawnCaravanVendor();
    this.spawnTreasurer();
    this.spawnAmbientNpcs();
    this.spawnCaravanArrivalZone();

    // Layer 5: warm amber sand particle drift.
    this.ambientFx = buildAmbientFx(this, { kind: 'dust' });

    // Helios-v2 W3 S9: enable Lights2D plugin + ambient color preset.
    enableSceneAmbient(this);

    // Helios-v2 W3 S9: hero point lights at key Apollo Village landmarks.
    // Coords align to placement map Lights2D coord MARKS. Each light renders
    // additively via Phaser PointLight so existing sprites need no pipeline
    // migration. Budget 4 lights/scene per S9 perf guidance.
    this.pointLights.push(
      addPointLight(this, {
        x: 384,
        y: 280,
        radius: 180,
        color: 0xff8844,
        intensity: 0.7,
        tween: { target: 1.0, duration: 350, ease: 'Sine.easeInOut' },
      }),
    );
    this.pointLights.push(
      addPointLight(this, {
        x: 1024,
        y: 280,
        radius: 180,
        color: 0xff8844,
        intensity: 0.7,
        tween: { target: 1.0, duration: 280, ease: 'Sine.easeInOut' },
      }),
    );
    // Soft warm halo on the well center for visual interest.
    this.pointLights.push(
      addPointLight(this, {
        x: 700,
        y: 460,
        radius: 220,
        color: 0xf0b45a,
        intensity: 0.4,
        tween: { target: 0.6, duration: 2200, ease: 'Sine.easeInOut' },
      }),
    );

    // Helios-v2 W3 S9 9.6: warm amber halos on the four NERIUM-pillar
    // landmarks for proximity glow polish. The halos pulse out-of-sync with
    // the existing glyph alpha tween for organic feel.
    for (const binding of this.landmarkBindings) {
      // Skip ambient entry landmarks (temple_arch); halos for pillar only.
      if (binding.emitsInteract === false) continue;
      this.landmarkHalos.push(
        addLandmarkHalo(this, {
          x: binding.x,
          y: binding.y - 60,
          radius: 140,
          color: 0xffb14a,
          peakIntensity: 0.6,
          pulseMs: 1700,
        }),
      );
    }

    // Helios-v2 W3 S9 9.3: day-night MULTIPLY overlay; ApolloVillage is a
    // main outdoor scene so initial phase 'dusk' for warm evening feel.
    this.dayNight = buildDayNightOverlay(this, 'dusk');

    // Helios-v2 W3 S8 quest indicators above Apollo + Treasurer NPCs.
    // The exclamation PNG bobs alpha + y to draw player attention. Quest
    // store consumption is intentionally read-only (S8 directive 5); the
    // S8 ship demos the visual surface for future wiring agents who can
    // subscribe to quest store + selectively show/hide via the indicator
    // image's setVisible() handle.
    this.spawnQuestIndicators();

    // E-key binding for landmark interaction (S7 wires UI overlays).
    // Helios-v2 W3 S5 dual-path: ArrowUp / ArrowDown swap selection in the
    // choice prompt; Enter confirms; Esc dismisses. The keys are bound here
    // in create() so the prompt overlay can poll JustDown without re-binding.
    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.eKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
      this.upKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
      this.downKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
      this.enterKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
      this.escKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
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

    // Helios-v2 W3 S7: per-frame proximity update for the hovering glyph +
    // floating prompt visuals across all landmarks. Cheap O(N) walk where
    // N <= 5 (4 pillar + 1 ambient), no spatial index needed.
    this.updateLandmarkVisualProximity();

    // Helios-v2 W3 S8: keep quest indicator images positioned above their
    // bound NPC sprites (cheap O(N <= 3) walk).
    this.updateQuestIndicators();

    // Helios-v2 W3 S5: when a dual-path choice prompt is open, route the
    // landmark interaction polling to prompt input handling instead. The
    // prompt is modal: arrow keys swap selection, Enter confirms, Esc
    // dismisses; E-key landmark polling is paused until the prompt closes.
    if (this.landmarkPrompt) {
      this.handleLandmarkPromptInput(time);
      return;
    }

    // Landmark E-key interaction: when player is in range and E is just
    // pressed, emit `landmark.<name>.interact`. Cooldown gate prevents
    // double-fire on key auto-repeat.
    this.checkLandmarkInteraction(time);
  }

  /**
   * Helios-v2 W3 S7 per-frame landmark visual proximity update. Compares
   * each landmark's distance to player; when distance crosses the
   * LANDMARK_INTERACT_RADIUS_PX threshold the glyph engages a scale tween
   * + alpha boost and the floating prompt becomes visible. The prompt
   * label respects the `promptLabel` binding (ambient entry landmarks
   * provide their own bespoke label).
   */
  private updateLandmarkVisualProximity(): void {
    if (!this.player) return;
    for (const v of this.landmarkVisuals) {
      const dx = this.player.x - v.binding.x;
      const dy = this.player.y - v.binding.y;
      const dist = Math.hypot(dx, dy);
      const inProximity = dist <= LANDMARK_INTERACT_RADIUS_PX;
      if (inProximity === v.proximityActive) continue;

      v.proximityActive = inProximity;
      if (inProximity) {
        // Engage proximity tween: scale 1.0 to 1.15 over 300ms loop + alpha
        // to 1.0. Stop the idle tween briefly while the proximity tween
        // takes over (idle resumes on disengage).
        v.glyphIdleTween.pause();
        v.glyph.setAlpha(1.0);
        v.glyphProximityTween?.stop();
        v.glyphProximityTween = this.tweens.add({
          targets: v.glyph,
          scale: { from: 1.0, to: 1.15 },
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
          duration: 300,
        });
        v.promptText.setVisible(true);
      } else {
        // Disengage: stop proximity tween, reset scale, resume idle.
        v.glyphProximityTween?.stop();
        v.glyphProximityTween = undefined;
        v.glyph.setScale(1.0);
        v.glyphIdleTween.resume();
        v.promptText.setVisible(false);
      }
    }
  }

  /**
   * Helios-v2 W3 S8 spawn quest indicator images above Apollo + Treasurer
   * NPCs. The indicator is the V6 quest_exclamation PNG; bob tween moves
   * it 3 px up + alpha 0.6 to 1.0 over 800 ms loop. Future agents can
   * subscribe to the quest store and call indicator.setVisible(active)
   * to toggle per quest state.
   */
  private spawnQuestIndicators(): void {
    if (this.apolloNpc) {
      this.attachQuestIndicator(this.apolloNpc, 64);
    }
    if (this.treasurerNpc) {
      this.attachQuestIndicator(this.treasurerNpc, 64);
    }
  }

  /**
   * Helios-v2 W3 S8 attach a single quest_exclamation indicator above a
   * sprite. The image setOrigin(0.5, 1) so the bottom edge hangs at the
   * sprite head; the offsetY constant lifts it further above the head.
   * Bob tween + alpha pulse run as a yoyo loop ease Sine.easeInOut.
   *
   * The indicator depth is set to LANDMARK_GLYPH_DEPTH so it sits above
   * world tiles + ambient FX overlay but below the dual-path landmark
   * choice prompt overlay (depth 9500) and the UIScene chat (10000).
   */
  private attachQuestIndicator(
    target: Phaser.Physics.Arcade.Sprite,
    offsetY: number,
  ): void {
    const initialY = target.y - target.displayHeight - offsetY;
    const image = this.add.image(
      target.x,
      initialY,
      ASSET_KEYS.ui.quest.quest_exclamation,
    );
    image.setOrigin(0.5, 1);
    image.setScale(0.06); // PNG source ~600x600 -> ~36x36 displayed
    image.setDepth(LANDMARK_GLYPH_DEPTH);
    image.setAlpha(0.6);

    const bobTween = this.tweens.add({
      targets: image,
      y: { from: initialY, to: initialY - 3 },
      alpha: { from: 0.6, to: 1.0 },
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      duration: 800,
      delay: Math.floor(Math.random() * 400),
    });

    this.questIndicators.push({
      target,
      image,
      bobTween,
      offsetY,
    });
  }

  /**
   * Helios-v2 W3 S8 per-frame quest indicator position update. Keeps each
   * indicator image positioned above its bound NPC sprite. Bob tween
   * mutates the y offset; we reset the base each frame relative to the
   * sprite so the bob centers remain attached.
   */
  private updateQuestIndicators(): void {
    for (const ind of this.questIndicators) {
      // The bob tween animates y between baseY and baseY-3. We track the
      // baseline via target.x + (target.y - displayHeight - offsetY); the
      // tween's relative offset is preserved by Phaser.
      const baseX = ind.target.x;
      // We do not reset y here because the bob tween owns y; only x.
      ind.image.setX(baseX);
    }
  }

  /**
   * Helios-v2 W3 S7 brief E-key trigger flash. Boosts glyph alpha + scale
   * for 100 ms then reverts. Called from emitLandmarkInteract +
   * triggerAmbientSubAreaEntry just before the actual action fires for
   * tactile press feedback.
   */
  private flashLandmarkGlyph(name: string): void {
    const v = this.landmarkVisuals.find((lv) => lv.binding.name === name);
    if (!v) return;
    v.glyph.setAlpha(1.0);
    v.glyph.setScale(1.3);
    this.tweens.add({
      targets: v.glyph,
      scale: 1.15,
      duration: 100,
      ease: 'Sine.easeOut',
    });
  }

  // ---- Landmarks (Layer 3, 4 pillar anchors) ----

  /**
   * Spawn the 4 NERIUM-pillar landmark PNGs at their placement-map coords.
   * Each landmark gets a drop shadow registered into the y-sort pool and
   * an entry in landmarkBindings for E-key interaction.
   */
  private spawnLandmarks(): void {
    // Nemea-RV-v2 W4 Phase 0 anchor positions match backdrop semantic spots.
    // Each landmark renders as a small iconic marker (scale 0.14-0.18 against
    // 600-1024 px source PNGs => ~135-200 px display) so it reads as an
    // interactive "stamp" placed on the painted scene rather than a
    // building-sized prop competing with the backdrop.

    // Marketplace stall landmark on cobblestone path mid-right, distinct
    // from the painted striped-awning stall on the left half so the player
    // visually parses two separate market structures (painted vs interactive).
    // Helios-v2 W3 S5 dual-path: E-key opens choice prompt for UI marketplace
    // listings or sub-area bazaar scene.
    this.placeLandmark(
      'marketplace_stall',
      ASSET_KEYS.props.apollo_village.marketplace_stall_landmark,
      1010,
      600,
      SCALE_MARKETPLACE,
      { sw: 50, sh: 12, alpha: 0.32 },
      {
        sceneKey: 'ApolloMarketplaceBazaar',
        optionUiLabel: 'Browse listings (UI)',
        optionGameLabel: 'Enter bazaar (game)',
        title: 'Marketplace Stall',
      },
    );

    // Builder workshop landmark in the NW open courtyard. Single-path UI
    // modal. Position keeps the workshop sprite on bare ground left of the
    // backdrop's painted striped fruit stall so the workshop reads as a
    // separate guild structure.
    this.placeLandmark(
      'builder_workshop',
      ASSET_KEYS.props.apollo_village.builder_workshop_landmark,
      330,
      560,
      SCALE_BUILDER_WORKSHOP,
      { sw: 50, sh: 12, alpha: 0.32 },
    );

    // Registry pillar landmark on mid-right open ground, slight horizontal
    // offset from the painted temple at (950, 280) so the inscribed-monument
    // silhouette reads as a separate civic record-keeping artefact.
    // Single-path UI modal.
    this.placeLandmark(
      'registry_pillar',
      ASSET_KEYS.props.apollo_village.registry_pillar_landmark,
      1180,
      460,
      SCALE_REGISTRY_PILLAR,
      { sw: 32, sh: 10, alpha: 0.30 },
    );

    // Trust shrine landmark on the open courtyard center. Helios-v2 W3 S5
    // dual-path: E-key opens choice prompt for UI trust audit or sub-area
    // oasis scene.
    this.placeLandmark(
      'trust_shrine',
      ASSET_KEYS.props.apollo_village.trust_shrine_landmark,
      640,
      540,
      SCALE_TRUST_SHRINE,
      { sw: 50, sh: 12, alpha: 0.32 },
      {
        sceneKey: 'ApolloOasis',
        optionUiLabel: 'View trust audit (UI)',
        optionGameLabel: 'Visit oasis shrine (game)',
        title: 'Trust Shrine',
      },
    );

    // Helios-v2 W3 S7 ambient entry fold-in: temple_arch as 5th entry-trigger
    // landmark. NOT a NERIUM-pillar landmark per anomaly resolution 2; E-key
    // proximity within 128 px fades to ApolloTempleInteriorScene without
    // emitting landmark.{name}.interact. Lighter glyph weight than the 4
    // pillar landmarks (subtle ambient) per directive 3 hovering glyph
    // styling: alpha pulse only, no y-bob.
    //
    // Nemea-RV-v2 W4 Phase 0: rescaled + repositioned. Original placement at
    // (910, 300) overlapped the painted temple in apollo_village_bg.jpg.
    // New coord (820, 400) places the marker glyph on open ground south of
    // the painted temple so the player visually associates the marker with
    // the temple entrance without a sprite-on-painted-prop collision.
    this.placeAmbientEntryLandmark(
      'temple_arch',
      ASSET_KEYS.props.apollo_village.temple_arch,
      820,
      400,
      SCALE_TEMPLE_ARCH_MARKER,
      'ApolloTempleInterior',
      'Press E to enter temple',
    );
  }

  /**
   * Helper for landmark placement. Authors the PNG sprite, attaches a drop
   * shadow ellipse anchored at the sprite base, and binds the E-key event.
   *
   * Helios-v2 W3 S5: optional `subArea` param wires the dual-path choice
   * prompt for landmarks that have a sub-area scene (Marketplace Stall,
   * Trust Shrine). Single-path landmarks omit the param and behave exactly
   * as in S2 (E-key emits the UI event directly).
   */
  private placeLandmark(
    name: string,
    textureKey: string,
    x: number,
    y: number,
    scale: number,
    shadow: { sw: number; sh: number; alpha: number },
    subArea?: LandmarkBinding['subArea'],
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

    const promptLabel = APOLLO_LANDMARK_PROMPTS[name] ?? `Press E to interact`;
    const binding: LandmarkBinding = {
      name,
      x,
      y,
      eventTopic: `landmark.${name}.interact`,
      subArea,
      promptLabel,
      emitsInteract: true,
    };
    this.landmarkBindings.push(binding);

    // Helios-v2 W3 S7 hovering glyph + proximity prompt visuals.
    // The glyph anchors above the sprite top (sprite.y - displayHeight - 20).
    const spriteDisplayHeight = sprite.displayHeight;
    this.spawnLandmarkGlyph(binding, spriteDisplayHeight, /* ambient */ false);
  }

  /**
   * Helios-v2 W3 S7 ambient entry landmark helper. Used for temple_arch (and
   * any future ambient entry props). Differs from placeLandmark in that:
   *   - emitsInteract is false (NOT a NERIUM pillar)
   *   - glyph is lighter weight (alpha pulse only, no y-bob)
   *   - E-key proximity directly fade-transitions to bound sub-area scene
   */
  private placeAmbientEntryLandmark(
    name: string,
    textureKey: string,
    x: number,
    y: number,
    scale: number,
    sceneKey: 'ApolloTempleInterior' | 'ApolloMarketplaceBazaar' | 'ApolloOasis',
    promptLabel: string,
  ): void {
    const sprite = this.add.image(x, y, textureKey);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(scale);

    // Lighter shadow for ambient props.
    const dropShadow = this.add.ellipse(x, y, 90, 16, 0x000000, 0.28);
    this.dropShadows.push(dropShadow);
    this.sorter?.register(sprite);
    this.sorter?.register({
      y: y - 1,
      setDepth: (v) => dropShadow.setDepth(v),
    });

    const binding: LandmarkBinding = {
      name,
      x,
      y,
      eventTopic: `landmark.${name}.interact`,
      promptLabel,
      emitsInteract: false,
      ambientSubArea: { sceneKey },
    };
    this.landmarkBindings.push(binding);

    const spriteDisplayHeight = sprite.displayHeight;
    this.spawnLandmarkGlyph(binding, spriteDisplayHeight, /* ambient */ true);
  }

  /**
   * Helios-v2 W3 S7 hovering glyph + proximity prompt creator. The glyph is
   * a small Phaser-drawn diamond shape (no dedicated PNG asset registered
   * for landmark glyphs in V6 96-asset bundle, so a primitive shape is the
   * cleanest fit). Color: warm amber for Apollo (medieval_desert palette),
   * cool cyan for Cyber landmarks. The prompt text floats above the glyph
   * and is hidden until proximity-active.
   *
   * Idle tween:
   *   - Pillar landmark: alpha 0.6 to 0.9 over 1.5s loop + y-bob 1-2 px
   *   - Ambient (temple_arch): alpha 0.4 to 0.7 over 1.5s loop, no y-bob
   *
   * Proximity-active tween (engaged when player is within radius):
   *   - Scale 1.0 to 1.15 over 300ms loop, alpha boost to 1.0
   *
   * E-key flash on trigger: brief alpha-1.0 + scale-1.3 over 100ms.
   */
  private spawnLandmarkGlyph(
    binding: LandmarkBinding,
    spriteDisplayHeight: number,
    ambient: boolean,
  ): void {
    // Glyph anchor: top-center of landmark sprite, offset y = -displayHeight - 20.
    const anchorX = binding.x;
    const anchorY = binding.y - spriteDisplayHeight - 20;
    binding.glyphAnchorOffset = { x: 0, y: -spriteDisplayHeight - 20 };

    const glyphContainer = this.add.container(anchorX, anchorY);
    glyphContainer.setDepth(LANDMARK_GLYPH_DEPTH);

    // Phaser-drawn diamond glyph. Warm amber for pillar (Apollo desert
    // palette), softer for ambient. No PNG asset; primitive shape keeps the
    // S7 scope tight without adding a new asset dependency.
    const glyphColor = ambient ? 0xc89a4a : 0xffd86b;
    const glyphSize = ambient ? 9 : 12;
    const glyph = this.add.graphics();
    glyph.fillStyle(glyphColor, 1);
    glyph.beginPath();
    glyph.moveTo(0, -glyphSize);
    glyph.lineTo(glyphSize, 0);
    glyph.lineTo(0, glyphSize);
    glyph.lineTo(-glyphSize, 0);
    glyph.closePath();
    glyph.fillPath();
    // Outline for legibility against bright bg.
    glyph.lineStyle(1.5, 0x3d2817, 0.85);
    glyph.strokePath();
    glyphContainer.add(glyph);

    // Idle alpha pulse tween. Pillar adds y-bob, ambient skips y-bob per
    // directive 3 lighter ambient styling.
    const idleAlphaFrom = ambient ? 0.4 : 0.6;
    const idleAlphaTo = ambient ? 0.7 : 0.9;
    glyphContainer.setAlpha(idleAlphaFrom);
    const tweenTargets: Record<string, unknown> = {
      alpha: { from: idleAlphaFrom, to: idleAlphaTo },
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      duration: 1500,
      delay: Math.floor(Math.random() * 800),
    };
    if (!ambient) {
      tweenTargets.y = { from: anchorY, to: anchorY - 2 };
    }
    const idleTween = this.tweens.add({
      targets: glyphContainer,
      ...tweenTargets,
    });

    // Floating prompt text. Hidden by default; revealed when player enters
    // proximity. Renders above glyph with a slight backdrop for legibility.
    const promptLabel = binding.promptLabel ?? `Press E to interact`;
    const promptText = this.add.text(anchorX, anchorY - 22, promptLabel, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: ambient ? '#cfb47a' : '#ffd86b',
      align: 'center',
      backgroundColor: 'rgba(20, 12, 5, 0.7)',
      padding: { left: 6, right: 6, top: 3, bottom: 3 },
    });
    promptText.setOrigin(0.5, 1);
    promptText.setDepth(LANDMARK_GLYPH_DEPTH);
    promptText.setVisible(false);

    this.landmarkVisuals.push({
      binding,
      glyph: glyphContainer,
      glyphIdleTween: idleTween,
      promptText,
      proximityActive: false,
    });
  }

  // ---- Ambient props + hanging lanterns: REMOVED in Nemea-RV-v2 W4 Phase 0
  //
  // Prior Helios-v2 S2 ship spawned 9 ambient prop PNGs (stone_well,
  // date_palm_cluster, cypress_tree x2, market_stall, wooden_cart,
  // apollo_house_filler, stone_column, stone_signpost) plus 2 hanging
  // lantern PNGs across the Apollo scene. Each duplicated visual content
  // already painted into apollo_village_bg.jpg, producing sprite-on-painted
  // collision + Y-sort chaos + scale mismatch. The painted backdrop is the
  // single source of truth for desert village ambience; spawned ambient
  // prop sprites have been removed entirely.
  //
  // The 4 NERIUM-pillar landmarks + temple_arch ambient entry remain because
  // they are interaction-bearing surfaces (E-key proximity + glyph + prompt
  // + dialogue + sub-area transition); they have been rescaled + repositioned
  // to read as small iconic markers anchored at backdrop-distinct spots.
  // ----

  // ---- Player + named NPCs ----

  private spawnPlayer() {
    // Helios-v2 W3 S5 sub-area roundtrip: if the player is returning from a
    // sub-area scene the spawn coord is the matching landmark approach,
    // otherwise the default south-center courtyard.
    const spawnX = this.spawnOverride?.x ?? 704;
    const spawnY = this.spawnOverride?.y ?? 640;
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
      // T-REGR R2 wander spec: ambient NPCs idle 2-5 sec then random-walk
      // within 100 px of their spawn anchor. Replaces the static-NPC parallax
      // illusion (NPC appears to slide opposite when player + camera move
      // because the painted backdrop sits at scrollFactor 0.3) with visible
      // active life motion. Spawn anchor stays world-space; wander is purely
      // animation, not camera-coupled.
      wander: {
        radiusPx: 100,
        idleMsMin: 2000,
        idleMsMax: 5000,
        speedPxPerSec: 30,
      },
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
    // T-REGR R2: ambient NPCs now wander via Phaser tween (not body
    // velocity), so the per-sprite preupdate listener may not reliably
    // fire on every tick. Bind a scene-level update listener as the
    // belt-and-suspenders sync so wandering NPC shadows always track.
    // The listener auto-disposes when the scene shuts down (registered
    // in SHUTDOWN cleanup).
    const sceneUpdateListener = () => {
      if (sprite && sprite.scene) {
        shadow.setPosition(sprite.x, sprite.y);
      }
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, sceneUpdateListener);
    this.unsubscribers.push(() => {
      this.events.off(Phaser.Scenes.Events.UPDATE, sceneUpdateListener);
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

      // Helios-v2 W3 S7 ambient entry direct fade (temple_arch precedent):
      // pure-fade transition without choice prompt or event emission.
      if (lm.ambientSubArea) {
        this.triggerAmbientSubAreaEntry(lm);
        break;
      }

      // Helios-v2 W3 S5 dual-path: if the landmark binds a sub-area scene,
      // open the in-game choice prompt. Otherwise (single-path, S2 default)
      // emit the UI event topic directly.
      if (lm.subArea) {
        this.openLandmarkPrompt(lm, time);
      } else {
        this.emitLandmarkInteract(lm);
      }

      // First match wins per frame (player only triggers one landmark on
      // a single E press even if multiple are within range).
      break;
    }
  }

  /**
   * Helios-v2 W3 S7 ambient entry direct fade. Used by temple_arch (and
   * any future ambient-entry landmark). Mirrors the dual-path "Enter
   * sub-area (game)" path: fadeOut + scene.start; differs in that no
   * landmark interact event is emitted (NOT a NERIUM pillar).
   */
  private triggerAmbientSubAreaEntry(lm: LandmarkBinding): void {
    if (!lm.ambientSubArea) return;
    this.flashLandmarkGlyph(lm.name);
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(lm.ambientSubArea!.sceneKey, {
        worldId: 'medieval_desert',
        from: 'ApolloVillage',
      });
    });
  }

  /**
   * Helios-v2 W3 S5: emit the landmark UI event + the bus event topic. Used
   * by single-path landmarks directly and by dual-path landmark choice 0
   * (UI option) selection.
   */
  private emitLandmarkInteract(lm: LandmarkBinding): void {
    this.flashLandmarkGlyph(lm.name);
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
  }

  /**
   * Helios-v2 W3 S5: open the dual-path choice prompt for a landmark with a
   * sub-area scene binding. Renders a dim backdrop + title + 2 option lines
   * anchored to the camera viewport center via setScrollFactor(0).
   */
  private openLandmarkPrompt(lm: LandmarkBinding, time: number): void {
    if (!lm.subArea) return;
    if (this.landmarkPrompt) return;

    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2 - 60;

    const container = this.add.container(cx, cy);
    container.setScrollFactor(0);
    container.setDepth(9500); // above world + ambient FX, below UIScene chat

    // Backdrop rectangle.
    const backdrop = this.add.rectangle(0, 0, 480, 200, 0x000000, 0.7);
    backdrop.setStrokeStyle(2, 0xe8c57d, 1);
    container.add(backdrop);

    // Title text.
    const title = this.add.text(0, -60, lm.subArea.title, {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#e8c57d',
      align: 'center',
    });
    title.setOrigin(0.5, 0.5);
    container.add(title);

    // Option 0 (UI modal). The "> " prefix slot is left for the caret arrow
    // which moves between options on ArrowUp / ArrowDown.
    const optUi = this.add.text(0, -10, `> ${lm.subArea.optionUiLabel}`, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffd86b',
      align: 'center',
    });
    optUi.setOrigin(0.5, 0.5);
    optUi.setData('label', lm.subArea.optionUiLabel);
    container.add(optUi);

    // Option 1 (game sub-area scene).
    const optGame = this.add.text(0, 30, `  ${lm.subArea.optionGameLabel}`, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#cfb47a',
      align: 'center',
    });
    optGame.setOrigin(0.5, 0.5);
    optGame.setData('label', lm.subArea.optionGameLabel);
    container.add(optGame);

    // Hint line for keyboard.
    const hint = this.add.text(
      0,
      80,
      'Up Down to select  Enter to confirm  Esc to cancel',
      {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#9f8a5a',
        align: 'center',
      },
    );
    hint.setOrigin(0.5, 0.5);
    container.add(hint);

    this.landmarkPrompt = {
      binding: lm,
      container,
      optionTexts: [optUi, optGame],
      selectedIndex: 0,
      openedAt: time,
    };
  }

  /**
   * Helios-v2 W3 S5: per-frame landmark prompt input handler. Called from
   * update() while a prompt is open. ArrowUp / ArrowDown swap the highlight,
   * Enter confirms the selection, Esc dismisses the prompt.
   */
  private handleLandmarkPromptInput(_time: number): void {
    const prompt = this.landmarkPrompt;
    if (!prompt) return;
    if (!this.upKey || !this.downKey || !this.enterKey || !this.escKey) return;

    let dirty = false;
    if (Phaser.Input.Keyboard.JustDown(this.upKey)) {
      prompt.selectedIndex = ((prompt.selectedIndex + 1) % 2) as 0 | 1;
      dirty = true;
    }
    if (Phaser.Input.Keyboard.JustDown(this.downKey)) {
      prompt.selectedIndex = ((prompt.selectedIndex + 1) % 2) as 0 | 1;
      dirty = true;
    }
    if (dirty) {
      // Update caret arrow + color highlight on the option texts.
      for (let i = 0; i < prompt.optionTexts.length; i += 1) {
        const t = prompt.optionTexts[i];
        const label = t.getData('label') as string;
        if (i === prompt.selectedIndex) {
          t.setText(`> ${label}`);
          t.setColor('#ffd86b');
        } else {
          t.setText(`  ${label}`);
          t.setColor('#cfb47a');
        }
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.enterKey)) {
      this.confirmLandmarkPrompt();
    } else if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.dismissLandmarkPrompt();
    }
  }

  /**
   * Helios-v2 W3 S5: confirm the highlighted prompt option. Choice 0 emits
   * the UI landmark interact event (preserves the existing Phanes flow);
   * choice 1 fades out and starts the bound sub-area scene.
   */
  private confirmLandmarkPrompt(): void {
    const prompt = this.landmarkPrompt;
    if (!prompt) return;
    const lm = prompt.binding;
    const sub = lm.subArea;
    if (!sub) {
      this.dismissLandmarkPrompt();
      return;
    }

    // Tear down prompt UI before triggering the action so the prompt does
    // not bleed into the sub-area or remain after the modal action.
    const choice = prompt.selectedIndex;
    this.dismissLandmarkPrompt();

    if (choice === 0) {
      // UI modal path: existing Phanes flow.
      this.emitLandmarkInteract(lm);
    } else {
      // Game sub-area path: fade out + scene.start.
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start(sub.sceneKey, {
          worldId: 'medieval_desert',
          from: 'ApolloVillage',
        });
      });
    }
  }

  /**
   * Helios-v2 W3 S5: tear down the prompt overlay container + clear state.
   */
  private dismissLandmarkPrompt(): void {
    const prompt = this.landmarkPrompt;
    if (!prompt) return;
    try {
      prompt.container.destroy(true);
    } catch (err) {
      console.error('[ApolloVillageScene] prompt container destroy threw', err);
    }
    this.landmarkPrompt = null;
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

      // Helios-v2 W3 S7: tear down landmark glyph + prompt visuals + tweens.
      for (const v of this.landmarkVisuals) {
        try {
          v.glyphIdleTween.stop();
          v.glyphProximityTween?.stop();
          v.glyph.destroy();
          v.promptText.destroy();
        } catch (err) {
          console.error('[ApolloVillageScene] landmark visual destroy threw', err);
        }
      }
      this.landmarkVisuals = [];

      // Helios-v2 W3 S8: tear down quest indicator images + bob tweens.
      for (const ind of this.questIndicators) {
        try {
          ind.bobTween.stop();
          ind.image.destroy();
        } catch (err) {
          console.error('[ApolloVillageScene] quest indicator destroy threw', err);
        }
      }
      this.questIndicators = [];

      // Helios-v2 W3 S5: dismiss any open landmark prompt overlay.
      if (this.landmarkPrompt) {
        try {
          this.landmarkPrompt.container.destroy(true);
        } catch (err) {
          console.error('[ApolloVillageScene] prompt container destroy threw', err);
        }
        this.landmarkPrompt = null;
      }

      // Helios-v2 W3 S9: tear down Lights2D point lights + landmark halos +
      // day-night overlay. Each handle owns its tween so destroy() stops
      // tween before destroying the GameObject.
      for (const h of this.pointLights) {
        try {
          h.destroy();
        } catch (err) {
          console.error('[ApolloVillageScene] point light destroy threw', err);
        }
      }
      this.pointLights = [];
      for (const h of this.landmarkHalos) {
        try {
          h.destroy();
        } catch (err) {
          console.error('[ApolloVillageScene] landmark halo destroy threw', err);
        }
      }
      this.landmarkHalos = [];
      try {
        this.dayNight?.destroy();
      } catch (err) {
        console.error('[ApolloVillageScene] day-night destroy threw', err);
      }
      this.dayNight = undefined;

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
