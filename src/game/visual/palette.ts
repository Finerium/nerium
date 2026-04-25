//
// src/game/visual/palette.ts
//
// Helios-v2 W3 S1: shared palette module aligned to P6 OKLCH design tokens
// from _skills_staging/claude_design_landing.html (Marshall pricing landing
// authority). The Phaser canvas does not natively read OKLCH so each token is
// pre-resolved to its hex equivalent at constants time. Hex values were
// derived by sampling the rendered landing in a CRT-overlay free viewport;
// the .ts file becomes the single source of truth for any Phaser scene that
// needs palette-cohesive colors.
//
// Palette is split into three tiers:
//   1. SHARED: cross-scene tokens (ink, phos, bone, fog, line, amber, rose).
//      Must match Marshall pricing landing + Helios-v2 scenes 1:1 so a player
//      hopping between /pricing and /play sees a single coherent NERIUM
//      brand.
//   2. PER_WORLD: Medieval Desert, Cyberpunk Shanghai, Steampunk Workshop
//      saturated palettes (32-48 colors per world per visual_manifest.contract
//      Section 7 directive). Scenes pull primary/secondary/accent/ink + the
//      decoration sub-palette as needed.
//   3. CARAVAN_ROAD: transition palette (warm desert dusk + cool cyberpunk
//      teaser blend) for CaravanRoadScene Session 4.
//
// All hex values are integer-pixel-snap RGB without alpha. For alpha-tinted
// surfaces (day-night MULTIPLY overlay, ambient FX particle drift) use the
// helper rgba() wrapper at the bottom of the module.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

// ============================================================================
// SHARED CROSS-SCENE TOKENS (Marshall pricing landing authority)
// ============================================================================

/**
 * SHARED palette: tokens that ANY NERIUM surface (pricing landing, /play
 * scene, HUD overlay, treasurer NPC chrome) must reuse 1:1 to preserve brand
 * cohesion. Pulled from _skills_staging/claude_design_landing.html :root.
 *
 * Hex equivalents resolved from OKLCH:
 *   --ink:       oklch(0.14 0.012 250)  -> #14181f
 *   --ink-2:     oklch(0.18 0.015 250)  -> #1c2027
 *   --ink-3:     oklch(0.22 0.018 250)  -> #232830
 *   --line:      oklch(0.32 0.02  250)  -> #353c47
 *   --phos:      oklch(0.88 0.15  140)  -> #82f0a0
 *   --phos-dim:  oklch(0.55 0.12  140)  -> #4ea063
 *   --phos-deep: oklch(0.38 0.09  140)  -> #386944
 *   --phos-faint:oklch(0.26 0.05  140)  -> #2a4a33
 *   --amber:     oklch(0.78 0.17  55 )  -> #f0b45a
 *   --rose:      oklch(0.72 0.18  20 )  -> #f08070
 *   --fog:       oklch(0.72 0.02  250)  -> #b4bac6
 *   --bone:      oklch(0.95 0.01  85 )  -> #f4eedf
 */
export const SHARED = {
  ink: 0x14181f,
  inkDeep: 0x0a0d12,
  inkSoft: 0x1c2027,
  inkLine: 0x353c47,
  phos: 0x82f0a0,
  phosDim: 0x4ea063,
  phosDeep: 0x386944,
  phosFaint: 0x2a4a33,
  amber: 0xf0b45a,
  amberDeep: 0xc28547,
  rose: 0xf08070,
  fog: 0xb4bac6,
  bone: 0xf4eedf,
  boneSoft: 0xd9d3c3,
  black: 0x000000,
  white: 0xffffff,
} as const;

export type SharedPaletteKey = keyof typeof SHARED;

// ============================================================================
// PER-WORLD PALETTES (32-48 saturated colors per visual_manifest 7)
// ============================================================================

/**
 * MEDIEVAL_DESERT palette per agent prompt scene matrix:
 *   primary: #c97a4a (terracotta), secondary: #e8c57d (sand),
 *   accent: #8b6f47 (stone), ink: #3d2817 (dark wood), warm orange evening.
 *
 * Sub-palette derived from scene-art.js scene1() Apollo Village authoritative
 * pixel-rect placement (sky/sand/canyon/cactus/tent/firepit/lamp).
 */
export const MEDIEVAL_DESERT = {
  // Sky bands (twilight cobalt to amber-orange dusk gradient)
  skyDeep: 0x101830,
  skyCobalt: 0x1a2a4d,
  skyMidnight: 0x284078,
  skyVioletDusk: 0x6b5a82,
  skyRosePink: 0xa06a6a,
  skyEmber: 0xd0825a,
  skySunset: 0xe09e50,
  skyHorizonGlow: 0xb67248,
  skyStars: 0xcdd7f0,
  // Canyon silhouette layers (far cooler, near warmer)
  canyonFar: 0x3b2e52,
  canyonNear: 0x5a3a42,
  canyonNearHi: 0x8a5a56,
  // Sand/ground bands (back-to-fore warm progression)
  sandBack: 0xb87a4a,
  sandMid: 0xc88a56,
  sandNear: 0xd4a76a,
  sandFore: 0xb88a56,
  sandSpeckleDark: 0xa46a3e,
  sandSpeckleLight: 0xe0b078,
  duneEdge: 0x9a5c34,
  // Trail/path
  trail: 0xa67240,
  trailEdge: 0x9a6a3a,
  trailDither: 0x7a4a2a,
  // Tent fabrics (3 variants for crowd density)
  tentSand: 0xb87a4a,
  tentTerracotta: 0xc26c40,
  tentOlive: 0x8a9a5b,
  tentHi: 0xe08a58,
  tentShadow: 0x7a4a2a,
  // Cactus
  cactusBody: 0x5a7a3a,
  cactusHi: 0x74964a,
  cactusSpine: 0xffe090,
  cactusShadow: 0x6a4a2a,
  // Stone / rock / well
  stoneDark: 0x4a3a2a,
  stoneMid: 0x6a5a4a,
  stoneHi: 0x8a7a6a,
  // Wood / planks
  plankDeep: 0x3a2418,
  plankMid: 0x5a3820,
  plankHi: 0x8a5a32,
  plankBright: 0xc28858,
  // Fire / lamp
  flameRed: 0xff3010,
  flameOrange: 0xff5020,
  flameAmber: 0xff8844,
  flameBright: 0xffc060,
  flameWhite: 0xfff0a0,
  // Skin tones (Sea of Stars muted JRPG range)
  skinPale: 0xe8c090,
  skinTan: 0xc8a878,
  skinDark: 0x8a5a3a,
  // Cloth accents
  clothBlue: 0x3a5d8f,
  clothPurple: 0x5a3a6a,
  clothGold: 0xd4a050,
  clothCrimson: 0x7a2a20,
  // Identity colors (Apollo signature, sigil)
  apolloGold: 0xffd84a,
  apolloVioletGlow: 0xc090ff,
  // Day-night ambient overlay (multiplied on top of MULTIPLY blend)
  ambientDay: 0xffffff,
  ambientDusk: 0xe09060,
  ambientNight: 0x1a1830,
} as const;

/**
 * CYBERPUNK_SHANGHAI palette per agent prompt:
 *   primary: #00f0ff (cyan neon), secondary: #ff2e88 (magenta neon),
 *   accent: #8b5cf6 (electric violet), ink: #06060c (deep void).
 *
 * Sub-palette aligned with scene-art.js distant city silhouette + neon picks
 * referenced at scene2() lines 794-822 (cyberpunk skyline teaser).
 */
export const CYBERPUNK_SHANGHAI = {
  // Sky / void
  voidDeep: 0x06060c,
  voidMid: 0x0d0a18,
  voidUp: 0x1a1525,
  smogPurple: 0x2a1f3a,
  // Neon primary
  neonCyan: 0x00f0ff,
  neonCyanDim: 0x00b8c8,
  neonCyanGlow: 0x80f5ff,
  neonMagenta: 0xff2e88,
  neonMagentaDim: 0xc81e6a,
  neonMagentaGlow: 0xff80b8,
  neonViolet: 0x8b5cf6,
  neonVioletDim: 0x6a44c0,
  neonAmber: 0xf5c542,
  // Building bases (silhouette layers)
  buildingFar: 0x1a1525,
  buildingMid: 0x231a30,
  buildingNear: 0x2a2238,
  buildingHi: 0x3a3045,
  // Wet pavement (rim-light reflection per agent prompt)
  pavement: 0x12141c,
  pavementWet: 0x1a1c26,
  pavementReflectCyan: 0x182a35,
  pavementReflectMagenta: 0x2a1825,
  // Hologram pulse (translucent in canvas, hex for tint)
  holoCyan: 0x40f8ff,
  holoMagenta: 0xff60a0,
  // Rain
  rainDrop: 0x88ccd8,
  rainStreak: 0x4a8090,
  // Vending / sign chrome
  chromeSteel: 0x6a7888,
  chromeRust: 0x6a4a3a,
  chromeBlack: 0x080a10,
  // Skin tones (slightly cooler than medieval to read cyberpunk-tinted)
  skinPale: 0xd8b8a0,
  skinTan: 0xa88068,
  skinDark: 0x6a4838,
  // Cloth accents (synth + corporate neutral)
  clothBlack: 0x12141c,
  clothChrome: 0x4a5260,
  clothBlood: 0xa01030,
  // Ambient overlays
  ambientDay: 0x4a4858,
  ambientDusk: 0x60406a,
  ambientNight: 0x080612,
} as const;

/**
 * STEAMPUNK_VICTORIAN palette per agent prompt:
 *   primary: #a47148 (brass), secondary: #3d2b1f (walnut),
 *   accent: #6b2e26 (oxblood), ink: #c8a464 (gold trim) + oil-lamp warm +
 *   electric blue arcs per workshop description.
 *
 * Sub-palette aligned with scene-art.js scene3() workshop monitor + brass
 * lamp + cog wheel pattern.
 */
export const STEAMPUNK_VICTORIAN = {
  // Wood (floor, walls, beams)
  walnut: 0x3d2b1f,
  walnutDeep: 0x251710,
  walnutHi: 0x5a3e2a,
  oakLight: 0x8a6440,
  // Brass / copper
  brassDark: 0x6a4828,
  brassMid: 0xa47148,
  brassBright: 0xc8a464,
  brassGlint: 0xf0c878,
  copperDark: 0x6a3818,
  copperMid: 0x9a5828,
  copperBright: 0xc88040,
  // Oxblood / leather
  oxblood: 0x6b2e26,
  leatherDark: 0x4a201a,
  leatherMid: 0x7a3a2a,
  // Steam / fog (warm tint to read steampunk vs cyberpunk cool fog)
  steamPale: 0xd8d0c0,
  steamMid: 0xa898a0,
  steamShadow: 0x685868,
  // Electric arcs (blue accents per agent prompt)
  arcCyan: 0x68a8f8,
  arcWhite: 0xc8e0ff,
  arcDeep: 0x2848a0,
  // Oil lamp glow
  lampCore: 0xfff0c0,
  lampWarm: 0xffc060,
  lampSpill: 0xa07030,
  // Gear metal
  gearIron: 0x4a4848,
  gearIronHi: 0x787880,
  gearIronShadow: 0x202028,
  // Skin / cloth (Victorian formality, muted)
  skinPale: 0xe8c8a8,
  skinTan: 0xb89878,
  skinDark: 0x785838,
  clothPlum: 0x4a2848,
  clothBottle: 0x2a4838,
  clothCharcoal: 0x282828,
  // Ambient overlays
  ambientDay: 0xb8a890,
  ambientDusk: 0x8a6840,
  ambientNight: 0x181018,
} as const;

/**
 * CARAVAN_ROAD palette: bridge between MEDIEVAL_DESERT and CYBERPUNK_SHANGHAI
 * per agent prompt session 4 description (warm desert dusk fade -> cyberpunk
 * silhouette tease on horizon). Pulled from scene-art.js scene2() bands
 * lines 776-786 plus distant city teaser.
 */
export const CARAVAN_ROAD = {
  skyDeep: 0x1c1b2c,
  skyMid: 0x29263d,
  skyUpper: 0x3a3349,
  skyVioletDusk: 0x55435a,
  skyRose: 0x7a5a6a,
  skyAmber: 0xa07868,
  skyEmber: 0xc28858,
  // Distant city teaser (cyberpunk preview)
  cityTeaser: 0x1a1525,
  cityNeonCyan: 0x00e8f5,
  cityNeonMagenta: 0xff2e88,
  cityNeonAmber: 0xf5c542,
  // Mountains
  mountainFar: 0x4a3848,
  mountainMid: 0x3a2c44,
  mountainHi: 0x6a4a4a,
  // Ground (rust-tinted earth, transitional)
  groundFar: 0x7a5a46,
  groundMid: 0x8a6a4a,
  groundNear: 0x9a7250,
  groundFore: 0x8a5a3a,
  groundShadow: 0x6a3e28,
  // Road
  roadDark: 0x6a3a1a,
  roadMid: 0x8a5a3a,
  roadHi: 0xa67a50,
  roadDither: 0x4a2812,
  // Caravan colors (re-uses tent palette but distinct yoke/awning)
  awningBone: 0xd4c090,
  awningHi: 0xe0cc98,
  awningStripe: 0xa67240,
  oxBody: 0x5a3a2a,
  oxHi: 0x7a5a42,
  oxShadow: 0x2a1810,
} as const;

// ============================================================================
// BRIDGE / GRADIENT HELPERS
// ============================================================================

export type WorldPaletteId =
  | 'medieval_desert'
  | 'cyberpunk_shanghai'
  | 'steampunk_victorian'
  | 'caravan_road';

/**
 * Lookup table for any consumer that wants palette by world id.
 * scene_manifest.world_id flows directly to a palette lookup.
 */
export const PALETTE_BY_WORLD = {
  medieval_desert: MEDIEVAL_DESERT,
  cyberpunk_shanghai: CYBERPUNK_SHANGHAI,
  steampunk_victorian: STEAMPUNK_VICTORIAN,
  caravan_road: CARAVAN_ROAD,
} as const;

/**
 * Convert a 0xRRGGBB integer to a CSS hex string usable in
 * Phaser.GameObjects.Graphics.fillStyle string fallbacks (scene-art.js style)
 * and CSS gradient injection. Pads to 6 digits.
 */
export function hexToCss(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

/**
 * Build a 4-stop vertical gradient as the sky_gradient layer.
 * Returns an array of {y, color, height} triples that
 * SkyGradient.ts can render via Phaser.GameObjects.Rectangle band stack
 * (no shader; canvas-cheap). Caller renders bands top-to-bottom.
 *
 * Used by Lighting / DayNightOverlay during day-night cycle to interpolate.
 */
export interface GradientBand {
  yRatio: number;
  heightRatio: number;
  color: number;
}

export function buildSkyBands(world: WorldPaletteId): GradientBand[] {
  switch (world) {
    case 'medieval_desert':
      return [
        { yRatio: 0.0, heightRatio: 0.07, color: MEDIEVAL_DESERT.skyDeep },
        { yRatio: 0.07, heightRatio: 0.05, color: MEDIEVAL_DESERT.skyCobalt },
        { yRatio: 0.12, heightRatio: 0.05, color: MEDIEVAL_DESERT.skyMidnight },
        { yRatio: 0.17, heightRatio: 0.04, color: MEDIEVAL_DESERT.skyVioletDusk },
        { yRatio: 0.21, heightRatio: 0.04, color: MEDIEVAL_DESERT.skyRosePink },
        { yRatio: 0.25, heightRatio: 0.04, color: MEDIEVAL_DESERT.skyEmber },
        { yRatio: 0.29, heightRatio: 0.03, color: MEDIEVAL_DESERT.skySunset },
        { yRatio: 0.32, heightRatio: 0.03, color: MEDIEVAL_DESERT.skyHorizonGlow },
      ];
    case 'cyberpunk_shanghai':
      return [
        { yRatio: 0.0, heightRatio: 0.18, color: CYBERPUNK_SHANGHAI.voidDeep },
        { yRatio: 0.18, heightRatio: 0.1, color: CYBERPUNK_SHANGHAI.voidMid },
        { yRatio: 0.28, heightRatio: 0.08, color: CYBERPUNK_SHANGHAI.voidUp },
        { yRatio: 0.36, heightRatio: 0.04, color: CYBERPUNK_SHANGHAI.smogPurple },
      ];
    case 'steampunk_victorian':
      return [
        { yRatio: 0.0, heightRatio: 0.22, color: STEAMPUNK_VICTORIAN.walnutDeep },
        { yRatio: 0.22, heightRatio: 0.1, color: STEAMPUNK_VICTORIAN.walnut },
        { yRatio: 0.32, heightRatio: 0.04, color: STEAMPUNK_VICTORIAN.brassDark },
      ];
    case 'caravan_road':
      return [
        { yRatio: 0.0, heightRatio: 0.08, color: CARAVAN_ROAD.skyDeep },
        { yRatio: 0.08, heightRatio: 0.07, color: CARAVAN_ROAD.skyMid },
        { yRatio: 0.15, heightRatio: 0.06, color: CARAVAN_ROAD.skyUpper },
        { yRatio: 0.21, heightRatio: 0.05, color: CARAVAN_ROAD.skyVioletDusk },
        { yRatio: 0.26, heightRatio: 0.04, color: CARAVAN_ROAD.skyRose },
        { yRatio: 0.30, heightRatio: 0.03, color: CARAVAN_ROAD.skyAmber },
        { yRatio: 0.33, heightRatio: 0.02, color: CARAVAN_ROAD.skyEmber },
      ];
    default: {
      const exhaustive: never = world;
      throw new Error(`buildSkyBands: unhandled world ${exhaustive as string}`);
    }
  }
}

/**
 * Convert a 0xRRGGBB integer + alpha 0..1 to a CSS rgba() string usable by
 * Phaser canvas tint or DOM overlay. Used by AmbientFX particle alpha + day
 * night MULTIPLY overlay.
 */
export function rgba(value: number, alpha: number): string {
  if (alpha < 0 || alpha > 1) {
    throw new Error(`rgba: alpha out of range [0..1]: ${alpha}`);
  }
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Linearly interpolate two 0xRRGGBB integer colors and return a 0xRRGGBB
 * integer. Used by day-night cycle to tween between ambientDay -> ambientDusk
 * -> ambientNight smoothly without three discrete swaps.
 *
 * t = 0 -> a, t = 1 -> b. Channel-wise lerp.
 */
export function lerpColor(a: number, b: number, t: number): number {
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
