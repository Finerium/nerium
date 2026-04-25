//
// src/game/visual/skyGradient.ts
//
// Helios-v2 W3 S2: sky gradient layer builder. Stacks Phaser
// GameObjects.Rectangle bands top-to-bottom per buildSkyBands() output so
// each per-world palette renders its dusk/twilight/neon void atmosphere.
//
// Why rectangles instead of a true gradient shader: Phaser canvas is cheap
// for solid fill rectangles (no shader uniforms, no Pipeline cost) and the
// banded look reproduces the per-world palette directive (8-band sky for
// the Medieval Desert dusk, 4-band for the Cyberpunk Shanghai void, etc.).
// The bands are fixed once per scene; day-night MULTIPLY overlay handles
// the tint sweep. W3 S0 cleanup: deprecated authority references removed;
// the AI-generated PNG bundle at `_Reference/ai_generated_assets/` is the
// new visual authority that S1 transitions to.
//
// Note: bands use scrollFactor 0 so they remain anchored to the camera and
// fill the viewport regardless of camera scroll. Depth is locked to
// DEPTH.SKY_GRADIENT.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import { buildSkyBands, type WorldPaletteId } from './palette';
import { DEPTH } from './depth';

export interface SkyGradientOptions {
  world: WorldPaletteId;
  /** Width of the band in pixels. Defaults to scene scale.width. */
  width?: number;
  /** Height of the gradient region. Defaults to scene scale.height. */
  height?: number;
  /** Anchor x in screen space. Defaults to 0 (top-left band stack). */
  anchorX?: number;
  /** Anchor y. Defaults to 0. */
  anchorY?: number;
}

/**
 * Build a per-world sky band stack inside the given Phaser scene. Returns
 * a Phaser.GameObjects.Container holding all bands so the caller can manage
 * a single GameObject (toggle visibility, fade, destroy). Bands inside the
 * container are at relative coordinates; the container itself is positioned
 * at anchor (default 0,0).
 *
 * Caller should NOT change the container's depth; SKY_GRADIENT is locked.
 */
export function buildSkyGradient(
  scene: Phaser.Scene,
  options: SkyGradientOptions,
): Phaser.GameObjects.Container {
  const width = options.width ?? scene.scale.width;
  const height = options.height ?? scene.scale.height;
  const ax = options.anchorX ?? 0;
  const ay = options.anchorY ?? 0;

  const bands = buildSkyBands(options.world);
  const container = scene.add.container(ax, ay);
  container.setDepth(DEPTH.SKY_GRADIENT);
  container.setScrollFactor(0);

  // Compute total ratio coverage so band yRatio + heightRatio scale to a
  // full vertical fill. The buildSkyBands() output covers only the upper
  // portion of the viewport (sky); below the last band the world ground
  // tilemap takes over, so we paint the residual region with the final
  // band color to avoid a transparent gap (visible during fade-in).
  let cumulative = 0;
  for (const band of bands) {
    const y = Math.round(band.yRatio * height);
    const h = Math.max(1, Math.round(band.heightRatio * height));
    const rect = scene.add.rectangle(0, y, width, h, band.color);
    rect.setOrigin(0, 0);
    rect.setScrollFactor(0);
    container.add(rect);
    cumulative = Math.max(cumulative, y + h);
  }
  // Residual fill below the last band uses the last band color so dawn /
  // dusk horizon glow continues smoothly into the ground area before the
  // ground tilemap paints over.
  if (cumulative < height) {
    const lastColor = bands.at(-1)?.color ?? 0x000000;
    const rect = scene.add.rectangle(
      0,
      cumulative,
      width,
      height - cumulative,
      lastColor,
    );
    rect.setOrigin(0, 0);
    rect.setScrollFactor(0);
    container.add(rect);
  }

  return container;
}
