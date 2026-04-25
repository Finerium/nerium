//
// src/game/visual/groundPaint.ts
//
// Helios-v2 W3 CORRECTION: hand-placed multi-band ground paint primitives.
// Replaces the bright-orange CC0 atlas tile checkerboard that rendered in
// the Run #1 snapshot.
//
// Pattern transplanted from
// _Reference/visual_inspiration/claude_design_output/scene-art.js scene1()
// ground paint sequence (lines 92-127). Each ground variant paints 4-5
// horizontal bands (back to fore warm progression) plus a speckle dither
// scatter for organic tile-detail variance, plus a winding trail of darker
// dirt slabs from foreground toward the courtyard center.
//
// Why bands instead of tiles:
//   - The shipped CC0 atlas tile is 32x32 with one of two saturated colors
//     (bright orange + speckled cream). A 24x16 grid of those tiles renders
//     as flat checkerboard, the Run #1 visual drift root cause.
//   - Multi-band rect paint matches the proven scene-art.js recipe: warm
//     progression dark-back -> warm-mid -> bright-near -> shadowed-fore so
//     the floor reads volumetric (Sea of Stars dusk floor).
//   - Speckle dither overlay (60-80 random 1x1 pixels per band) supplies
//     the tile-detail variance that scene-inspiration screenshots show
//     (no zone uses single repeating tile).
//   - Trail slabs widen toward foreground (trapezoid feel) so the player
//     reads "path leads from foreground toward Apollo at center".
//
// All paints are static (no per-frame work). Generated once in scene
// create() and disposed at scene SHUTDOWN.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import { MEDIEVAL_DESERT, CYBERPUNK_SHANGHAI, CARAVAN_ROAD } from './palette';
import { DEPTH } from './depth';

/**
 * Mulberry32 PRNG so speckle scatter is deterministic across runs (stable
 * Playwright snapshot).
 */
function makeRand(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Paint helper: rectangle band added to a container at GROUND_TILES depth.
 * Each call creates a new Phaser.GameObjects.Rectangle with origin (0,0).
 */
function paintBand(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
): void {
  const r = scene.add.rectangle(x, y, w, h, color);
  r.setOrigin(0, 0);
  container.add(r);
}

// ============================================================================
// MEDIEVAL DESERT GROUND
// ============================================================================

/**
 * Paint the Apollo Village ground: 4-band warm sand progression, speckle
 * dither overlay, winding trail slabs from foreground to center, plus
 * ground-shadow long stripes under tents (sunset cast).
 *
 * The ground container scrolls with the camera (default scrollFactor 1) so
 * decoration props on it y-sort correctly. Bands paint in WORLD coordinate
 * space at world y starting from worldHeight * 0.55 so the upper 55 percent
 * of the world is reserved for sky gradient + parallax silhouette + horizon
 * haze (camera-anchored layers via scrollFactor 0).
 */
export function paintApolloVillageGround(
  scene: Phaser.Scene,
  width: number,
  height: number,
): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  container.setDepth(DEPTH.GROUND_TILES);

  // 4-band horizontal warm progression. yRatio shifted so ground starts at
  // 55 percent of world height (was 45 percent), giving sky + parallax more
  // room in the camera-anchored upper half of viewport.
  const bands = [
    { yRatio: 0.55, hRatio: 0.08, color: MEDIEVAL_DESERT.sandBack },
    { yRatio: 0.63, hRatio: 0.1, color: MEDIEVAL_DESERT.sandMid },
    { yRatio: 0.73, hRatio: 0.12, color: MEDIEVAL_DESERT.sandNear },
    { yRatio: 0.85, hRatio: 0.16, color: MEDIEVAL_DESERT.sandFore },
  ];
  for (const b of bands) {
    paintBand(
      scene,
      container,
      0,
      Math.round(b.yRatio * height),
      width,
      Math.max(1, Math.round(b.hRatio * height)),
      b.color,
    );
  }

  // Dune-edge dither across the back-to-mid transition (subtle wave)
  const rand = makeRand(0xabc123);
  for (let x = 0; x < width; x += 3) {
    const wave = Math.round(Math.sin(x * 0.04) * 3);
    paintBand(
      scene,
      container,
      x,
      Math.round(height * 0.55) + 2 + wave,
      2,
      1,
      MEDIEVAL_DESERT.duneEdge,
    );
  }

  // Speckle scatter over the lower 50 percent of the scene (sand grains)
  const speckleCount = Math.round((width * height) / 1500);
  for (let i = 0; i < speckleCount; i++) {
    const x = Math.round(rand() * width);
    const y = Math.round(height * 0.6 + rand() * height * 0.4);
    const roll = i % 3;
    const c =
      roll === 0
        ? MEDIEVAL_DESERT.sandSpeckleDark
        : roll === 1
          ? MEDIEVAL_DESERT.sandSpeckleLight
          : MEDIEVAL_DESERT.sandMid;
    paintBand(scene, container, x, y, 2, 2, c);
  }

  // Winding trail slabs from foreground bottom toward upper-center courtyard
  const trail = [
    { yRatio: 0.94, w: 0.78, color: MEDIEVAL_DESERT.trail },
    { yRatio: 0.88, w: 0.7, color: MEDIEVAL_DESERT.trailEdge },
    { yRatio: 0.83, w: 0.62, color: MEDIEVAL_DESERT.trail },
    { yRatio: 0.78, w: 0.52, color: MEDIEVAL_DESERT.trailEdge },
    { yRatio: 0.73, w: 0.4, color: MEDIEVAL_DESERT.trail },
    { yRatio: 0.68, w: 0.3, color: MEDIEVAL_DESERT.trailEdge },
    { yRatio: 0.63, w: 0.22, color: MEDIEVAL_DESERT.trail },
  ];
  const cx = width / 2;
  for (const slab of trail) {
    const slabW = Math.round(slab.w * width);
    paintBand(
      scene,
      container,
      Math.round(cx - slabW / 2),
      Math.round(slab.yRatio * height),
      slabW,
      Math.max(8, Math.round(height * 0.04)),
      slab.color,
    );
  }
  // Trail dither edge dots
  for (let x = Math.round(cx - width * 0.35); x < Math.round(cx + width * 0.35); x += 4) {
    paintBand(scene, container, x, Math.round(height * 0.92), 1, 1, MEDIEVAL_DESERT.trailDither);
  }

  // Long ground-shadows under tent positions (sunset cast east). The scene
  // places tents at columns 4, 7, 10, 14, 17 (per ApolloVillageScene
  // spawnDecoration) so we paint matching tinted strips under each.
  const tentCols = [4, 7, 10, 14, 17];
  const tilePx = 32;
  const tentRow = 8.5;
  for (const col of tentCols) {
    const sx = col * tilePx;
    const sy = tentRow * tilePx + 4;
    paintBand(scene, container, sx - 12, sy, 36, 1, 0x6a4020);
  }

  return container;
}

// ============================================================================
// CARAVAN ROAD GROUND
// ============================================================================

/**
 * Paint the Caravan Road ground: 5-band rust-tinted dirt progression with
 * trapezoid dirt road widening toward foreground + wagon track lines.
 */
export function paintCaravanRoadGround(
  scene: Phaser.Scene,
  width: number,
  height: number,
): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  container.setDepth(DEPTH.GROUND_TILES);

  // 5-band rust-tinted dirt progression (back to fore). yRatio shifted so
  // ground starts at 55 percent of world height (was 40 percent), giving
  // sky + parallax + cyberpunk-tease silhouette more room.
  const bands = [
    { yRatio: 0.55, hRatio: 0.08, color: CARAVAN_ROAD.groundFar },
    { yRatio: 0.63, hRatio: 0.1, color: CARAVAN_ROAD.groundMid },
    { yRatio: 0.73, hRatio: 0.12, color: CARAVAN_ROAD.groundNear },
    { yRatio: 0.85, hRatio: 0.1, color: CARAVAN_ROAD.groundFore },
    { yRatio: 0.95, hRatio: 0.06, color: CARAVAN_ROAD.groundShadow },
  ];
  for (const b of bands) {
    paintBand(
      scene,
      container,
      0,
      Math.round(b.yRatio * height),
      width,
      Math.max(1, Math.round(b.hRatio * height)),
      b.color,
    );
  }

  // Dither blend at sand-to-rust transition
  const rand = makeRand(0xfa5d31);
  for (let i = 0; i < 240; i++) {
    const x = Math.round(rand() * width);
    const y = Math.round(height * 0.55 + rand() * height * 0.4);
    const roll = i % 4;
    const c =
      roll === 0
        ? 0xa67240
        : roll === 1
          ? 0x6a3a1a
          : roll === 2
            ? 0xc28858
            : 0x5a3020;
    paintBand(scene, container, x, y, 2, 2, c);
  }

  // Trapezoid dirt road widens toward foreground. yRatio shifted to match
  // the lowered ground band placement.
  const roadBands = [
    { yRatio: 0.62, wRatio: 0.2, color: CARAVAN_ROAD.roadDark },
    { yRatio: 0.66, wRatio: 0.28, color: CARAVAN_ROAD.roadMid },
    { yRatio: 0.71, wRatio: 0.38, color: CARAVAN_ROAD.roadHi },
    { yRatio: 0.76, wRatio: 0.5, color: CARAVAN_ROAD.roadHi },
    { yRatio: 0.82, wRatio: 0.66, color: CARAVAN_ROAD.roadMid },
    { yRatio: 0.89, wRatio: 0.84, color: CARAVAN_ROAD.roadDark },
    { yRatio: 0.95, wRatio: 1.0, color: CARAVAN_ROAD.roadDither },
  ];
  const cx = width / 2;
  for (const slab of roadBands) {
    const sw = Math.round(slab.wRatio * width);
    paintBand(
      scene,
      container,
      Math.round(cx - sw / 2),
      Math.round(slab.yRatio * height),
      sw,
      Math.max(6, Math.round(height * 0.04)),
      slab.color,
    );
  }

  // Wagon-track lines parallel along road
  for (let x = 0; x < width; x += 6) {
    paintBand(scene, container, x, Math.round(height * 0.86), 4, 1, CARAVAN_ROAD.roadDither);
    paintBand(scene, container, x, Math.round(height * 0.92), 4, 1, CARAVAN_ROAD.roadDither);
  }

  // Pebbles scattered on road
  const pebbleSpots: Array<[number, number]> = [
    [Math.round(width * 0.13), Math.round(height * 0.82)],
    [Math.round(width * 0.27), Math.round(height * 0.87)],
    [Math.round(width * 0.4), Math.round(height * 0.84)],
    [Math.round(width * 0.55), Math.round(height * 0.9)],
    [Math.round(width * 0.68), Math.round(height * 0.83)],
    [Math.round(width * 0.82), Math.round(height * 0.88)],
    [Math.round(width * 0.93), Math.round(height * 0.85)],
  ];
  for (const [px, py] of pebbleSpots) {
    paintBand(scene, container, px, py, 2, 2, 0x6a4a30);
    paintBand(scene, container, px, py, 1, 1, 0x8a6a4a);
  }

  return container;
}

// ============================================================================
// CYBERPUNK SHANGHAI GROUND
// ============================================================================

/**
 * Paint the Cyberpunk Shanghai pavement: dark wet pavement base + neon
 * cyan + magenta puddle reflections + grime streaks.
 */
export function paintCyberpunkShanghaiGround(
  scene: Phaser.Scene,
  width: number,
  height: number,
): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  container.setDepth(DEPTH.GROUND_TILES);

  // 4-band cool dark progression (deeper at foreground for depth). yRatio
  // shifted so ground starts at 55 percent of world height (was 42 percent),
  // giving sky + parallax buildings + horizon haze more room.
  const bands = [
    { yRatio: 0.55, hRatio: 0.1, color: CYBERPUNK_SHANGHAI.pavement },
    { yRatio: 0.65, hRatio: 0.13, color: CYBERPUNK_SHANGHAI.pavementWet },
    { yRatio: 0.78, hRatio: 0.13, color: CYBERPUNK_SHANGHAI.pavement },
    { yRatio: 0.91, hRatio: 0.1, color: CYBERPUNK_SHANGHAI.voidMid },
  ];
  for (const b of bands) {
    paintBand(
      scene,
      container,
      0,
      Math.round(b.yRatio * height),
      width,
      Math.max(1, Math.round(b.hRatio * height)),
      b.color,
    );
  }

  // Grid line texture: faint cyan grid hint at ground (cyberpunk floor pattern)
  for (let x = 0; x < width; x += 24) {
    paintBand(scene, container, x, Math.round(height * 0.55), 1, Math.round(height * 0.45), 0x14202c);
  }
  for (let y = Math.round(height * 0.58); y < height; y += 24) {
    paintBand(scene, container, 0, y, width, 1, 0x14202c);
  }

  // Neon puddle reflections (long horizontal strips, low alpha via second
  // pass).
  const rand = makeRand(0xc1b3a7);
  const puddleCount = 18;
  for (let i = 0; i < puddleCount; i++) {
    const x = Math.round(rand() * width);
    const y = Math.round(height * 0.65 + rand() * height * 0.3);
    const w = 28 + Math.round(rand() * 32);
    const isCyan = i % 2 === 0;
    const color = isCyan
      ? CYBERPUNK_SHANGHAI.pavementReflectCyan
      : CYBERPUNK_SHANGHAI.pavementReflectMagenta;
    const r = scene.add.rectangle(x, y, w, 3, color);
    r.setOrigin(0, 0);
    r.setAlpha(0.7);
    container.add(r);
    // Light bloom strip below
    const bloom = scene.add.rectangle(x + 2, y + 3, w - 4, 1, color);
    bloom.setOrigin(0, 0);
    bloom.setAlpha(0.4);
    container.add(bloom);
  }

  // Grime streaks (dark vertical stripes at random)
  for (let i = 0; i < 26; i++) {
    const x = Math.round(rand() * width);
    const y = Math.round(height * 0.6);
    const h = Math.round(20 + rand() * 60);
    paintBand(scene, container, x, y, 1, h, CYBERPUNK_SHANGHAI.voidDeep);
  }

  // Trash specks scattered (amber + violet small dots)
  for (let i = 0; i < 30; i++) {
    const x = Math.round(rand() * width);
    const y = Math.round(height * 0.7 + rand() * height * 0.25);
    const c = i % 3 === 0 ? CYBERPUNK_SHANGHAI.neonAmber : i % 3 === 1 ? CYBERPUNK_SHANGHAI.neonViolet : CYBERPUNK_SHANGHAI.chromeRust;
    paintBand(scene, container, x, y, 2, 1, c);
  }

  return container;
}

// ============================================================================
// FOLIAGE / OVERHANG CANOPY (above_tiles depth)
// ============================================================================

/**
 * Paint a foliage canopy strip across the top of the scene at ABOVE_TILES
 * depth. Used by ApolloVillage (acacia branches, warm green overhead). The
 * canopy occludes the upper portion of any sprite passing under it (Sea of
 * Stars overhang occlusion).
 */
export function paintApolloCanopy(
  scene: Phaser.Scene,
  width: number,
): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  container.setDepth(DEPTH.ABOVE_TILES);

  const rand = makeRand(0xacac1a);
  // Branch silhouettes overhead (organic widths)
  for (let x = -8; x < width; x += 18) {
    const w = 16 + Math.round(rand() * 22);
    const h = 10 + Math.round(rand() * 14);
    const r = scene.add.rectangle(x, -2, w, h, MEDIEVAL_DESERT.cactusBody);
    r.setOrigin(0, 0);
    r.setAlpha(0.95);
    container.add(r);

    // Highlight upper edge
    const hi = scene.add.rectangle(x + 2, 0, w - 4, 2, MEDIEVAL_DESERT.cactusHi);
    hi.setOrigin(0, 0);
    hi.setAlpha(0.9);
    container.add(hi);
  }

  // Hanging leaf-clusters droop down at intervals
  for (let x = 14; x < width; x += 56) {
    const dropX = x + Math.round(rand() * 8);
    const dropH = 18 + Math.round(rand() * 12);
    const drop = scene.add.rectangle(dropX, 6, 4, dropH, MEDIEVAL_DESERT.cactusBody);
    drop.setOrigin(0, 0);
    drop.setAlpha(0.85);
    container.add(drop);
    // Leaf cluster at end
    const leaves = scene.add.rectangle(dropX - 4, 6 + dropH, 12, 6, MEDIEVAL_DESERT.cactusHi);
    leaves.setOrigin(0, 0);
    leaves.setAlpha(0.9);
    container.add(leaves);
  }

  return container;
}

/**
 * Paint a wind-blown overhead banner strip for CaravanRoad (cloth flags
 * trailing from off-screen poles).
 */
export function paintCaravanCanopy(
  scene: Phaser.Scene,
  width: number,
): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  container.setDepth(DEPTH.ABOVE_TILES);

  const rand = makeRand(0xbabcad);
  for (let x = 24; x < width; x += 96) {
    // Pole
    const pole = scene.add.rectangle(x, -4, 1, 14, MEDIEVAL_DESERT.plankDeep);
    pole.setOrigin(0, 0);
    container.add(pole);
    // Flag fabric
    const flagW = 32 + Math.round(rand() * 14);
    const flagColor =
      rand() > 0.5 ? MEDIEVAL_DESERT.tentTerracotta : MEDIEVAL_DESERT.tentOlive;
    const flag = scene.add.rectangle(x, -2, flagW, 8, flagColor);
    flag.setOrigin(0, 0);
    flag.setAlpha(0.85);
    container.add(flag);
    // Wind ripple highlight
    const ripple = scene.add.rectangle(x + 2, 0, flagW - 4, 1, MEDIEVAL_DESERT.tentHi);
    ripple.setOrigin(0, 0);
    ripple.setAlpha(0.7);
    container.add(ripple);
  }

  // Distant bird silhouettes occasional
  for (const [bx, by] of [
    [width * 0.18, 18],
    [width * 0.34, 12],
    [width * 0.55, 22],
    [width * 0.78, 14],
  ] as Array<[number, number]>) {
    const bird = scene.add.rectangle(bx, by, 4, 1, MEDIEVAL_DESERT.canyonFar);
    bird.setOrigin(0, 0);
    container.add(bird);
    const birdR = scene.add.rectangle(bx + 4, by - 1, 4, 1, MEDIEVAL_DESERT.canyonFar);
    birdR.setOrigin(0, 0);
    container.add(birdR);
  }

  return container;
}

/**
 * Paint a hanging neon sign + cable overhead strip for CyberpunkShanghai.
 */
export function paintCyberpunkOverhead(
  scene: Phaser.Scene,
  width: number,
): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  container.setDepth(DEPTH.ABOVE_TILES);

  // Tangled cable network across the top
  const cable1 = scene.add.rectangle(0, 4, width, 1, CYBERPUNK_SHANGHAI.chromeSteel);
  cable1.setOrigin(0, 0);
  container.add(cable1);
  const cable2 = scene.add.rectangle(0, 14, width, 1, CYBERPUNK_SHANGHAI.chromeRust);
  cable2.setOrigin(0, 0);
  container.add(cable2);
  const cable3 = scene.add.rectangle(0, 22, width, 1, CYBERPUNK_SHANGHAI.chromeSteel);
  cable3.setOrigin(0, 0);
  cable3.setAlpha(0.75);
  container.add(cable3);

  // Hanging neon signs at intervals
  const rand = makeRand(0xfa9c2d);
  for (let x = 32; x < width; x += 88) {
    const cable = scene.add.rectangle(x, 4, 1, 18, CYBERPUNK_SHANGHAI.chromeSteel);
    cable.setOrigin(0, 0);
    container.add(cable);
    const signColor =
      rand() < 0.33
        ? CYBERPUNK_SHANGHAI.neonMagenta
        : rand() < 0.66
          ? CYBERPUNK_SHANGHAI.neonCyan
          : CYBERPUNK_SHANGHAI.neonAmber;
    const signFrame = scene.add.rectangle(x - 14, 22, 30, 12, CYBERPUNK_SHANGHAI.chromeBlack);
    signFrame.setOrigin(0, 0);
    container.add(signFrame);
    const signGlyph = scene.add.rectangle(x - 12, 24, 26, 8, signColor);
    signGlyph.setOrigin(0, 0);
    signGlyph.setAlpha(0.95);
    container.add(signGlyph);
    // Mounting bolts
    const boltL = scene.add.rectangle(x - 14, 22, 2, 2, CYBERPUNK_SHANGHAI.chromeRust);
    boltL.setOrigin(0, 0);
    container.add(boltL);
    const boltR = scene.add.rectangle(x + 14, 22, 2, 2, CYBERPUNK_SHANGHAI.chromeRust);
    boltR.setOrigin(0, 0);
    container.add(boltR);
  }

  return container;
}

// ============================================================================
// HORIZON ATMOSPHERIC HAZE (mid-band fade between parallax + ground)
// ============================================================================

/**
 * Paint a horizontal atmospheric haze band where the parallax silhouette
 * meets the ground floor. Soft tint gradient that hides the parallax-to-
 * ground seam and adds Sea of Stars-tier depth feel.
 */
export function paintHorizonHaze(
  scene: Phaser.Scene,
  width: number,
  height: number,
  hazeColor: number,
  alphaPeak: number = 0.32,
): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  container.setDepth(DEPTH.PARALLAX_BG + 5);

  const bandTop = Math.round(height * 0.5);
  const bandHeight = Math.max(8, Math.round(height * 0.12));
  for (let i = 0; i < bandHeight; i++) {
    const t = i / Math.max(1, bandHeight - 1);
    const alpha = (1 - Math.abs(t - 0.5) * 2) * alphaPeak;
    if (alpha <= 0.02) continue;
    const r = scene.add.rectangle(0, bandTop + i, width, 1, hazeColor);
    r.setOrigin(0, 0);
    r.setAlpha(alpha);
    container.add(r);
  }

  return container;
}
