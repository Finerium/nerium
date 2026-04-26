//
// src/game/visual/lighting.ts
//
// Helios-v2 W3 S9: Phaser Lights2D wrapper + per-scene ambient color preset
// + safe point light helper with flicker/pulse tween presets.
//
// Per S9 directive Section 9.1, every scene calls `enableSceneAmbient(scene,
// kind)` once in `create()` to enable the Lights2D plugin and set the
// ambient color matching scene tone. Per S9 directive 9.2, scene-specific
// point lights are added via `addPointLight(scene, opts)` returning the
// Phaser Light handle so scene cleanup can remove it on shutdown.
//
// Crucial design: WE DO NOT CALL `sprite.setPipeline('Light2D')` ON
// EXISTING SPRITES. That would be an invasive change risking visual
// regression because every sprite would suddenly require lighting to be
// visible. Instead, we use Lights2D as an *additive* glow / pulse system:
// the ambient color tints sprites that are pipeline-marked, and explicit
// halo glow Phaser.GameObjects.Arc (PointLight-style overlays) provide the
// visible point-light feel without forcing pipeline migration. This is the
// "lights as polish" pattern recommended for incremental Phaser upgrades.
//
// The actual Phaser PointLight (not the Lights2D plugin's Light) is a
// separate built-in GameObject that paints a radial gradient at a coord.
// We use this as the visible point-light surface because it does NOT
// require sprites to be pipeline-marked. Source:
// https://newdocs.phaser.io/docs/3.70.0/Phaser.GameObjects.PointLight.
//
// Performance note: Each PointLight is a Mesh internally. Per S9 budget
// guidance, scenes target 2-4 active PointLights max for 60 fps headroom
// on mid-tier laptop. Halo pulses run via scene.tweens (cheap).
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';

/**
 * Per-scene ambient color preset per S9 directive 9.1. Used as the input
 * to `scene.lights.setAmbientColor(...)` after `scene.lights.enable()`.
 *
 * Naming mirrors the scene key; values match S9 directive 9.1 verbatim.
 */
export const SCENE_AMBIENT_COLOR: Readonly<Record<string, number>> = Object.freeze({
  ApolloVillage: 0x4a3520,
  CaravanRoad: 0x2a3045,
  CyberpunkShanghai: 0x1a0f2a,
  ApolloTempleInterior: 0x5a3a18,
  ApolloMarketplaceBazaar: 0x4a3018,
  ApolloOasis: 0x3a4a3a,
  CaravanWayhouseInterior: 0x5a3525,
  CaravanForestCrossroad: 0x2a3525,
  CaravanMountainPass: 0x35404a,
  CyberSkyscraperLobby: 0x152030,
  CyberRooftop: 0x0a0820,
  CyberUndergroundAlley: 0x150a25,
  CyberServerRoom: 0x0a1a25,
});

/**
 * Enable Lights2D for the scene + set ambient color from the SCENE_AMBIENT_COLOR
 * preset. Idempotent; safe to call from create() once per scene boot.
 *
 * Returns true on success, false if the scene name is missing from the preset
 * map (caller can fall back to no-op if the lighting is optional).
 */
export function enableSceneAmbient(scene: Phaser.Scene): boolean {
  const sceneKey = scene.scene.key;
  const ambient = SCENE_AMBIENT_COLOR[sceneKey];
  if (ambient === undefined) {
    console.warn(`[lighting] no ambient color preset for scene ${sceneKey}; skipping enable`);
    return false;
  }
  // Phaser Lights2D plugin: enable() + setAmbientColor().
  scene.lights.enable();
  scene.lights.setAmbientColor(ambient);
  return true;
}

// ============================================================================
// PointLight halo helper (visible point-light feel without pipeline migration)
// ============================================================================

/**
 * T-REGR R1 fix: global intensity scale applied to every PointLight + halo
 * authored via this module. Helios-v2 S9 ship intensities (0.4..1.0 with
 * tween peaks up to 1.0) over-saturated the warm dusk Apollo + neon Cyber +
 * cool Caravan road scenes; the resulting glow swallowed midtone detail in
 * a Ghaisan visual playthrough.
 *
 * 0.6 mid-range pick from the V6_TO_V7 default rec band 0.5..0.7. Applied
 * once here so every existing call site (Apollo Village + Caravan Road +
 * Cyberpunk Shanghai + landmark halos) inherits the reduction without
 * touching scene authorship; T-WORLD territory stays unmodified.
 */
const INTENSITY_SCALE = 0.6;

/**
 * Options for `addPointLight`. Coords are world-space; the helper uses
 * Phaser.GameObjects.PointLight which paints a radial gradient additively.
 */
export interface PointLightOptions {
  x: number;
  y: number;
  /** Radius of the radial gradient halo (world px). */
  radius: number;
  /** Color (hex int, e.g. 0xffb14a). */
  color: number;
  /** Initial intensity 0..1. */
  intensity: number;
  /** Optional intensity tween for breathing / flicker / pulse animation. */
  tween?: {
    /** Target intensity at peak/trough of the tween. */
    target: number;
    /** Duration in ms for one full ease cycle. */
    duration: number;
    /** ease function key (e.g., 'Sine.easeInOut', 'Cubic.easeOut'). */
    ease?: string;
    /** Random hold-at-edge ms (jitter); used for fast flicker. 0 = none. */
    holdJitterMs?: number;
  };
  /** Optional render depth override (defaults to 600 just below DAY_NIGHT_OVERLAY). */
  depth?: number;
  /** Camera scrollFactor (default 1.0). Set 0 for HUD-anchored point lights. */
  scrollFactor?: number;
}

/**
 * Result handle bundling the PointLight + its idle/flicker tween for cleanup.
 */
export interface PointLightHandle {
  light: Phaser.GameObjects.PointLight;
  tween?: Phaser.Tweens.Tween;
  /** Tear down the light + tween. Idempotent. */
  destroy: () => void;
}

/**
 * Add a visible PointLight halo at world coords. Does NOT modify any sprite
 * pipeline; the light renders as an additive radial gradient at depth 600
 * (just below DAY_NIGHT_OVERLAY). Returns a handle the caller stores so the
 * scene shutdown can dispose the light + its tween.
 *
 * Performance: each PointLight is a Phaser Mesh internally. Budget per scene
 * is ~4 active PointLights for 60 fps headroom on mid-tier laptop.
 */
export function addPointLight(
  scene: Phaser.Scene,
  options: PointLightOptions,
): PointLightHandle {
  // Phaser PointLight is a built-in GameObject taking color (hex), intensity,
  // and radius via `add.pointlight(x, y, color, radius, intensity)`. The
  // attenuation parameter (0..1) controls falloff; 0 = sharp ring, 1 = soft.
  // T-REGR R1: scale baseline intensity + tween target by INTENSITY_SCALE so
  // every existing call site is dampened without per-scene rewrites.
  const scaledIntensity = options.intensity * INTENSITY_SCALE;
  const light = scene.add.pointlight(
    options.x,
    options.y,
    options.color,
    options.radius,
    scaledIntensity,
    0.05,
  );
  light.setDepth(options.depth ?? 600);
  light.setScrollFactor(options.scrollFactor ?? 1.0);

  let tween: Phaser.Tweens.Tween | undefined;
  if (options.tween) {
    const tweenSpec: Phaser.Types.Tweens.TweenBuilderConfig = {
      targets: light,
      intensity: options.tween.target * INTENSITY_SCALE,
      duration: options.tween.duration,
      ease: options.tween.ease ?? 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    };
    if (options.tween.holdJitterMs && options.tween.holdJitterMs > 0) {
      tweenSpec.hold = options.tween.holdJitterMs;
    }
    tween = scene.tweens.add(tweenSpec);
  }

  const destroy = () => {
    if (tween && tween.isPlaying()) {
      tween.stop();
    }
    if (light.scene) {
      light.destroy();
    }
  };

  return { light, tween, destroy };
}

// ============================================================================
// Halo glow for landmark glyphs (S9 9.6)
// ============================================================================

/**
 * Add a soft outer glow halo around a landmark glyph anchor. Returns the halo
 * GameObject + its idle pulse tween + a destroy disposer.
 *
 * The halo is a PointLight at the glyph anchor coord (world-space) with a
 * pulse 0.3..0.8 over 1.5s, slightly out-of-sync with the glyph alpha pulse
 * for organic feel per S9 directive 9.6.
 */
export interface LandmarkHaloOptions {
  x: number;
  y: number;
  /** Halo radius in world px. */
  radius: number;
  /** Halo color (warm amber for Apollo, cyan-magenta for Cyber). */
  color: number;
  /** Optional initial peak intensity (default 0.7). */
  peakIntensity?: number;
  /** Optional pulse duration ms (default 1500). */
  pulseMs?: number;
}

export function addLandmarkHalo(
  scene: Phaser.Scene,
  options: LandmarkHaloOptions,
): PointLightHandle {
  return addPointLight(scene, {
    x: options.x,
    y: options.y,
    radius: options.radius,
    color: options.color,
    intensity: 0.3,
    tween: {
      target: options.peakIntensity ?? 0.8,
      duration: options.pulseMs ?? 1500,
      ease: 'Sine.easeInOut',
    },
    depth: 9001,
  });
}
