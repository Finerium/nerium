//
// src/game/visual/depth.ts
//
// Helios-v2 W3 S1: 5-layer depth band constants per visual_manifest.contract
// Section 3.3 + agent prompt scene matrix Section "5-layer depth".
//
// Phaser GameObjects compute final render z-order via setDepth(). The five
// world layers below sandwich every world entity into a deterministic stack
// so a sprite at layer N never accidentally renders above a sprite at
// layer > N. Within Layer 3 (WORLD_TILES), the y-sort util at
// src/game/visual/ysort.ts dynamically calls setDepth(sprite.y) so the
// player and NPCs occlude each other based on their feet position
// (Oak-Woods setOrigin(0.5, 1) pattern).
//
// Reserve bands for ambient FX (always above world but below UI) and the
// day-night overlay (above ambient FX, below the chat HUD UIScene).
//
// Critical invariants for downstream scenes:
//   - Sky gradient renders at SKY_GRADIENT (-100): farthest, always painted
//     first.
//   - Parallax silhouette layers render at PARALLAX_BG (-50): scrollFactor
//     {x: 0.2..0.5, y: 0.3..0.6} so they drift slower than camera.
//   - Ground tilemap layer renders at GROUND_TILES (-10): below world tile
//     interactive layer but above parallax silhouette.
//   - World tilemap collision + dynamic entities (player, NPC, decoration
//     props with y-sort) live at WORLD_TILES (0) baseline. Final per-sprite
//     depth = WORLD_TILES + sprite.y so taller-y sprites occlude.
//   - Above tiles (roof, canopy overhang, treetop) render at ABOVE_TILES
//     (100) so they sit above any y-sorted dynamic entity.
//   - Ambient FX particle emitter (sand, neon, steam, leaves) at AMBIENT_FX
//     (500) so it fronts world but does not bleed onto the chat HUD.
//   - Day-night MULTIPLY overlay at DAY_NIGHT_OVERLAY (9500) so it tints
//     world + ambient FX as a single composite, but lives below UIScene
//     chat which must remain readable regardless of lighting.
//   - UIScene chat + HUD lives at UI_SCENE (10000) on its own scene.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

/**
 * Five-layer base depth bands. Render z-order ascending: lower depth = drawn
 * first = appears behind higher-depth siblings. Phaser default depth is 0 so
 * SKY_GRADIENT < 0 ensures sky always behind any default-depth GameObject.
 */
export const DEPTH = {
  /** Layer 0: sky gradient + far horizon, always behind */
  SKY_GRADIENT: -100,
  /** Layer 1: parallax silhouette (mesa, skyline, rooftop) */
  PARALLAX_BG: -50,
  /** Layer 2: ground tilemap floor (sand, pavement, cobble, plank) */
  GROUND_TILES: -10,
  /** Layer 3: collision-baseline interactive layer for player/NPC/props.
   *  Per-sprite final depth = WORLD_TILES + sprite.y via ysort util. */
  WORLD_TILES: 0,
  /** Layer 3 dynamic offset added inside y-sort so y=128 sprite renders at
   *  depth 129 (1 + 128), keeping above the static world tile. */
  DYNAMIC_ENTITY_OFFSET: 1,
  /** Layer 4: roof / canopy / awning overhang, always above any y-sorted
   *  dynamic entity at typical scene heights (<= 1080 px world height). */
  ABOVE_TILES: 100,
  /** Ambient FX particle emitter band, above world entities, below UI. */
  AMBIENT_FX: 500,
  /** Reserved for future weather overlays (rain, snow, fog) above ambient
   *  FX but below day-night tint. */
  WEATHER: 600,
  /** UI overlay rendered inside the world scene (rare, e.g. world-space
   *  pointer label). Strictly above ambient + weather. */
  UI_OVERLAY: 9000,
  /** Day-night MULTIPLY tint overlay covering the world. */
  DAY_NIGHT_OVERLAY: 9500,
  /** UIScene root depth. Boreas chat + HUD live here. */
  UI_SCENE: 10000,
} as const;

export type DepthBand = keyof typeof DEPTH;

/**
 * Layer kind enum mirroring visual_manifest.contract Section 3.1
 * LayerRefSchema. Used by scene manifest -> depth band lookup.
 */
export type LayerKind =
  | 'sky_gradient'
  | 'parallax_bg'
  | 'ground_tiles'
  | 'world_tiles'
  | 'above_tiles';

/**
 * Map a manifest layer kind to its base depth band. World tile layer base
 * depth is WORLD_TILES (0) and per-sprite y-sort happens in update() loop;
 * static tilemap pieces inside WORLD_TILES therefore must be at depth 0
 * with explicit setDepth(0) so a y-sorted entity can pass over them.
 */
export function depthForLayerKind(kind: LayerKind): number {
  switch (kind) {
    case 'sky_gradient':
      return DEPTH.SKY_GRADIENT;
    case 'parallax_bg':
      return DEPTH.PARALLAX_BG;
    case 'ground_tiles':
      return DEPTH.GROUND_TILES;
    case 'world_tiles':
      return DEPTH.WORLD_TILES;
    case 'above_tiles':
      return DEPTH.ABOVE_TILES;
    default: {
      const exhaustive: never = kind;
      throw new Error(`depthForLayerKind: unhandled kind ${exhaustive as string}`);
    }
  }
}

/**
 * Compute the y-sort dynamic depth for a sprite at world y-coordinate.
 * Returns WORLD_TILES + DYNAMIC_ENTITY_OFFSET + spriteY. Does not mutate.
 *
 * Caller responsibility:
 *   1. setOrigin(0.5, 1) on the sprite so its y-coordinate references the
 *      feet, not the center, per Oak-Woods pattern.
 *   2. Call this every update() tick (or when sprite.y changes) and pass
 *      result to sprite.setDepth(...).
 */
export function dynamicDepthFor(spriteY: number): number {
  return DEPTH.WORLD_TILES + DEPTH.DYNAMIC_ENTITY_OFFSET + spriteY;
}

/**
 * Helper to verify a depth value falls inside an expected band range. Used
 * by tests + assertion checks during development; not invoked at runtime.
 */
export function isInBand(depth: number, band: DepthBand): boolean {
  switch (band) {
    case 'SKY_GRADIENT':
      return depth >= DEPTH.SKY_GRADIENT && depth < DEPTH.PARALLAX_BG;
    case 'PARALLAX_BG':
      return depth >= DEPTH.PARALLAX_BG && depth < DEPTH.GROUND_TILES;
    case 'GROUND_TILES':
      return depth >= DEPTH.GROUND_TILES && depth < DEPTH.WORLD_TILES;
    case 'WORLD_TILES':
      // Includes y-sorted dynamic entities up to ABOVE_TILES.
      return depth >= DEPTH.WORLD_TILES && depth < DEPTH.ABOVE_TILES;
    case 'DYNAMIC_ENTITY_OFFSET':
      return depth === DEPTH.DYNAMIC_ENTITY_OFFSET;
    case 'ABOVE_TILES':
      return depth >= DEPTH.ABOVE_TILES && depth < DEPTH.AMBIENT_FX;
    case 'AMBIENT_FX':
      return depth >= DEPTH.AMBIENT_FX && depth < DEPTH.WEATHER;
    case 'WEATHER':
      return depth >= DEPTH.WEATHER && depth < DEPTH.UI_OVERLAY;
    case 'UI_OVERLAY':
      return depth >= DEPTH.UI_OVERLAY && depth < DEPTH.DAY_NIGHT_OVERLAY;
    case 'DAY_NIGHT_OVERLAY':
      return depth >= DEPTH.DAY_NIGHT_OVERLAY && depth < DEPTH.UI_SCENE;
    case 'UI_SCENE':
      return depth >= DEPTH.UI_SCENE;
    default: {
      const exhaustive: never = band;
      throw new Error(`isInBand: unhandled band ${exhaustive as string}`);
    }
  }
}
