//
// src/game/visual/decoration.ts
//
// Helios-v2 W3 S2: hand-placed pixel-rect decoration primitives. Each prop
// (tent, cactus, well, firepit, lamp post, palm tree) is built from a
// stack of small Phaser.GameObjects.Rectangle instances grouped in a
// container. Pattern is direct Phaser canvas primitive composition.
// W3 S0 cleanup: deprecated authority reference removed; the AI-generated
// PNG bundle at `_Reference/ai_generated_assets/` is the new visual
// authority that S1 transitions to.
//
// Why rectangles instead of a sprite atlas: the existing CC0 atlas at
// public/assets/worlds/medieval_desert/atlas_32.png ships a 16-slot 32x32
// generic palette (floor, wall, pillar, sigil) which is too schematic for
// Sea of Stars / Crosscode tier polish. Hand-placed rect props deliver
// detail per-prop without needing a new sprite atlas authoring round.
// Procedural Opus output is locked to UI chrome + particle FX per
// agent prompt strategic decision hard-stop; rectangle composition is
// neither a sprite character (still on CC0) nor a procedural Opus pixel
// generator, it is direct Phaser canvas primitive use.
//
// Each builder returns a Phaser.GameObjects.Container with the rectangles
// already added. The container is placed at the prop's anchor (feet, for
// tall sprites; visual center for low rocks). Caller registers the
// container with the scene's SceneSorter via registerGroundSprite so the
// y-sort gives correct occlusion.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import { MEDIEVAL_DESERT } from './palette';

/**
 * Internal helper: emit a Rectangle at relative (rx, ry, w, h, color)
 * inside a container. setOrigin(0,0) on each band so the rectangle's
 * (rx, ry) is its top-left corner.
 */
function band(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  rx: number,
  ry: number,
  w: number,
  h: number,
  color: number,
): void {
  const r = scene.add.rectangle(rx, ry, w, h, color);
  r.setOrigin(0, 0);
  container.add(r);
}

/**
 * Build a desert tent decoration (3 fabric variants: sand / terracotta /
 * olive). The container's (x, y) anchor is the tent's BASE CENTER (where
 * its stake meets the ground); shape extends upward.
 */
export type TentVariant = 'sand' | 'terracotta' | 'olive';

export function buildTent(
  scene: Phaser.Scene,
  x: number,
  y: number,
  variant: TentVariant = 'sand',
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  // Color resolution per variant
  const baseColor =
    variant === 'terracotta'
      ? MEDIEVAL_DESERT.tentTerracotta
      : variant === 'olive'
        ? MEDIEVAL_DESERT.tentOlive
        : MEDIEVAL_DESERT.tentSand;
  const hi = MEDIEVAL_DESERT.tentHi;
  const sh = MEDIEVAL_DESERT.tentShadow;
  // Triangle fabric stair-step (heights from peak to base, narrow to wide)
  const heights: Array<[number, number, number, number]> = [
    [-1, -18, 2, 2],
    [-3, -16, 6, 2],
    [-5, -14, 10, 2],
    [-7, -12, 14, 2],
    [-9, -10, 18, 2],
    [-11, -8, 22, 2],
    [-13, -6, 26, 2],
    [-15, -4, 30, 2],
    [-17, -2, 34, 2],
    [-19, 0, 38, 3],
  ];
  for (const [rx, ry, w, h] of heights) band(scene, c, rx, ry, w, h, baseColor);
  // highlight stripe (left edge sunlit)
  band(scene, c, -1, -18, 1, 18, hi);
  // shadow stripe (right edge)
  band(scene, c, 1, -16, 1, 16, sh);
  // door slit
  band(scene, c, -2, -6, 4, 9, MEDIEVAL_DESERT.plankDeep);
  // pole top
  band(scene, c, 0, -22, 1, 4, MEDIEVAL_DESERT.plankDeep);
  // stakes + ground shadow
  band(scene, c, -20, 3, 40, 2, sh);
  band(scene, c, -22, 5, 44, 2, MEDIEVAL_DESERT.cactusShadow);
  return c;
}

/**
 * Build a cactus decoration. Anchor is base center.
 */
export function buildCactus(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: 'large' | 'small' = 'large',
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const body = MEDIEVAL_DESERT.cactusBody;
  const hi = MEDIEVAL_DESERT.cactusHi;
  const spine = MEDIEVAL_DESERT.cactusSpine;
  const shadow = MEDIEVAL_DESERT.cactusShadow;
  if (size === 'large') {
    // Trunk
    band(scene, c, -3, -34, 6, 34, body);
    band(scene, c, 1, -34, 2, 34, hi);
    band(scene, c, -3, -36, 6, 2, MEDIEVAL_DESERT.plankDeep);
    // Left arm
    band(scene, c, -9, -18, 4, 10, body);
    band(scene, c, -5, -20, 2, 2, body);
    band(scene, c, -11, -14, 2, 8, hi);
    // Right arm
    band(scene, c, 3, -24, 4, 12, body);
    band(scene, c, 7, -24, 2, 2, body);
    band(scene, c, 7, -22, 2, 10, hi);
    // Spines
    for (let yy = -32; yy < -2; yy += 4) band(scene, c, -2, yy, 1, 1, spine);
    for (let yy = -32; yy < -2; yy += 4) band(scene, c, 2, yy, 1, 1, spine);
    // Shadow
    band(scene, c, -10, 0, 20, 2, shadow);
  } else {
    band(scene, c, -2, -18, 4, 18, body);
    band(scene, c, 1, -18, 2, 18, hi);
    band(scene, c, -4, -8, 2, 6, body);
    band(scene, c, 4, -12, 2, 8, body);
    band(scene, c, -5, 0, 10, 2, shadow);
  }
  return c;
}

/**
 * Build a stone water well with post + roof + bucket.
 */
export function buildWaterWell(
  scene: Phaser.Scene,
  x: number,
  y: number,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  // Base stones
  band(scene, c, -14, -10, 28, 4, MEDIEVAL_DESERT.stoneDark);
  band(scene, c, -18, -6, 36, 10, MEDIEVAL_DESERT.stoneMid);
  band(scene, c, -14, 4, 28, 4, MEDIEVAL_DESERT.stoneDark);
  band(scene, c, -14, -4, 28, 2, MEDIEVAL_DESERT.stoneHi);
  band(scene, c, -10, -6, 4, 2, MEDIEVAL_DESERT.stoneHi);
  band(scene, c, 2, -6, 4, 2, MEDIEVAL_DESERT.stoneHi);
  // Posts
  band(scene, c, -10, -24, 3, 18, MEDIEVAL_DESERT.plankMid);
  band(scene, c, 7, -24, 3, 18, MEDIEVAL_DESERT.plankMid);
  // Roof
  band(scene, c, -16, -30, 32, 3, MEDIEVAL_DESERT.clothCrimson);
  band(scene, c, -12, -28, 24, 3, MEDIEVAL_DESERT.tentHi);
  // Bucket rope + bucket
  band(scene, c, 0, -27, 1, 18, MEDIEVAL_DESERT.plankDeep);
  band(scene, c, -4, -10, 8, 4, MEDIEVAL_DESERT.plankMid);
  return c;
}

/**
 * Build a central fire pit with stones, logs, flame, ember sparks.
 */
export function buildFirePit(
  scene: Phaser.Scene,
  x: number,
  y: number,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  // Stone ring
  band(scene, c, -17, -4, 34, 4, MEDIEVAL_DESERT.stoneDark);
  band(scene, c, -19, 0, 38, 6, MEDIEVAL_DESERT.stoneMid);
  band(scene, c, -17, 6, 34, 4, MEDIEVAL_DESERT.plankDeep);
  for (let i = 0; i < 5; i++) band(scene, c, -15 + i * 7, 0, 3, 2, MEDIEVAL_DESERT.stoneHi);
  // Logs
  band(scene, c, -11, -6, 22, 3, MEDIEVAL_DESERT.plankDeep);
  band(scene, c, -9, -8, 18, 2, MEDIEVAL_DESERT.plankMid);
  // Flame (will pulse via tween in ApolloVillageScene)
  const flame = scene.add.rectangle(0, -18, 10, 8, MEDIEVAL_DESERT.flameOrange);
  flame.setOrigin(0.5, 0);
  c.add(flame);
  band(scene, c, -3, -22, 6, 4, MEDIEVAL_DESERT.flameAmber);
  band(scene, c, -2, -26, 4, 4, MEDIEVAL_DESERT.flameBright);
  band(scene, c, -1, -30, 2, 4, MEDIEVAL_DESERT.flameWhite);
  band(scene, c, -7, -10, 14, 2, MEDIEVAL_DESERT.flameRed);
  // Sparks
  band(scene, c, 7, -24, 1, 1, MEDIEVAL_DESERT.flameBright);
  band(scene, c, -11, -30, 1, 1, MEDIEVAL_DESERT.flameBright);
  band(scene, c, 1, -34, 1, 1, MEDIEVAL_DESERT.flameWhite);
  return c;
}

/**
 * Build a lamp post with warm orange light.
 */
export function buildLampPost(
  scene: Phaser.Scene,
  x: number,
  y: number,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  band(scene, c, -1, -40, 2, 40, MEDIEVAL_DESERT.plankDeep);
  band(scene, c, -3, -46, 6, 6, MEDIEVAL_DESERT.canyonFar);
  band(scene, c, -2, -46, 4, 1, MEDIEVAL_DESERT.plankMid);
  band(scene, c, -2, -45, 4, 4, MEDIEVAL_DESERT.flameAmber);
  band(scene, c, -1, -44, 2, 2, MEDIEVAL_DESERT.flameBright);
  band(scene, c, -3, 0, 6, 2, MEDIEVAL_DESERT.plankDeep);
  // Light spill on ground
  band(scene, c, -9, 2, 18, 1, MEDIEVAL_DESERT.plankBright);
  band(scene, c, -7, 3, 14, 1, MEDIEVAL_DESERT.trail);
  return c;
}

/**
 * Build a palm tree (oasis decoration).
 */
export function buildPalmTree(
  scene: Phaser.Scene,
  x: number,
  y: number,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  // Trunk
  band(scene, c, -1, -30, 3, 30, MEDIEVAL_DESERT.plankDeep);
  band(scene, c, -1, -30, 1, 30, MEDIEVAL_DESERT.plankMid);
  band(scene, c, 1, -30, 1, 30, MEDIEVAL_DESERT.canyonFar);
  // Trunk rings
  for (let i = 4; i < 30; i += 5) band(scene, c, -1, -30 + i, 3, 1, MEDIEVAL_DESERT.canyonFar);
  // Fronds: left + right + up + downward arc
  band(scene, c, -10, -32, 10, 2, MEDIEVAL_DESERT.cactusBody);
  band(scene, c, -10, -34, 8, 2, MEDIEVAL_DESERT.cactusHi);
  band(scene, c, -8, -30, 6, 2, MEDIEVAL_DESERT.cactusBody);
  band(scene, c, 2, -32, 10, 2, MEDIEVAL_DESERT.cactusBody);
  band(scene, c, 2, -34, 8, 2, MEDIEVAL_DESERT.cactusHi);
  band(scene, c, 2, -30, 6, 2, MEDIEVAL_DESERT.cactusBody);
  band(scene, c, -1, -40, 3, 8, MEDIEVAL_DESERT.cactusBody);
  band(scene, c, -1, -40, 1, 8, MEDIEVAL_DESERT.cactusHi);
  band(scene, c, -6, -28, 2, 2, MEDIEVAL_DESERT.cactusBody);
  band(scene, c, 4, -28, 2, 2, MEDIEVAL_DESERT.cactusBody);
  // Coconuts
  band(scene, c, -2, -31, 2, 2, MEDIEVAL_DESERT.plankDeep);
  band(scene, c, 2, -31, 2, 2, MEDIEVAL_DESERT.plankDeep);
  return c;
}

/**
 * Build a small rock cluster.
 */
export function buildRock(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number = 10,
  height: number = 5,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  band(scene, c, -width / 2, -height, width, height, MEDIEVAL_DESERT.stoneMid);
  band(scene, c, -width / 2, -height, width, 1, MEDIEVAL_DESERT.stoneHi);
  band(scene, c, width / 2 - 1, -height + 1, 1, height - 1, MEDIEVAL_DESERT.plankDeep);
  return c;
}

/**
 * Build a wooden plank merchant stall (for caravan vendor relocation in S3).
 * Anchor is base center.
 */
export function buildMerchantStall(
  scene: Phaser.Scene,
  x: number,
  y: number,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  // Posts
  band(scene, c, -41, -40, 3, 40, MEDIEVAL_DESERT.plankMid);
  band(scene, c, 39, -40, 3, 40, MEDIEVAL_DESERT.plankMid);
  // Canopy stripes
  band(scene, c, -41, -46, 82, 4, MEDIEVAL_DESERT.clothCrimson);
  band(scene, c, -41, -42, 82, 2, MEDIEVAL_DESERT.tentTerracotta);
  for (let xx = -39; xx < 41; xx += 6) band(scene, c, xx, -46, 3, 4, MEDIEVAL_DESERT.clothGold);
  // Counter
  band(scene, c, -41, -12, 82, 4, MEDIEVAL_DESERT.plankHi);
  band(scene, c, -41, -8, 82, 4, MEDIEVAL_DESERT.plankMid);
  // Wares on counter
  band(scene, c, -33, -18, 4, 6, MEDIEVAL_DESERT.clothGold);
  band(scene, c, -25, -16, 6, 4, MEDIEVAL_DESERT.tentTerracotta);
  band(scene, c, -15, -20, 8, 8, MEDIEVAL_DESERT.cactusBody);
  band(scene, c, -3, -16, 4, 4, MEDIEVAL_DESERT.tentSand);
  band(scene, c, 5, -20, 10, 8, MEDIEVAL_DESERT.tentSand);
  band(scene, c, 19, -16, 6, 4, MEDIEVAL_DESERT.flameAmber);
  band(scene, c, 29, -18, 6, 6, MEDIEVAL_DESERT.clothBlue);
  // Back wall planks
  band(scene, c, -33, -38, 66, 24, MEDIEVAL_DESERT.plankMid);
  for (let xx = -29; xx < 29; xx += 8) band(scene, c, xx, -38, 1, 24, MEDIEVAL_DESERT.plankDeep);
  return c;
}

