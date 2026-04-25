//
// src/game/visual/parallaxLayer.ts
//
// Helios-v2 W3 S2: parallax silhouette layer factory. Stacks decorative
// silhouette rectangles (canyon, city skyline, Victorian rooftop) at the
// PARALLAX_BG depth band with scrollFactor < 1 so the layer drifts slower
// than the camera, giving depth illusion without a true 3D camera.
//
// Pattern transplanted from _Reference/visual_inspiration/claude_design_output
// /scene-art.js scene1() canyon silhouette + scene2() distant cyberpunk
// city teaser. Each silhouette uses a simple stair-stepped rectangle stack
// to simulate a horizon irregularity, no per-pixel shader required.
//
// The layer is anchored to the camera's scroll origin; scrollFactor 0.4
// means moving the camera 100 px right shifts the silhouette 40 px right
// (so it appears 60 px farther). Scenes may layer multiple silhouettes at
// different scroll factors (0.2 far, 0.4 mid, 0.7 near) for parallax
// stacking depth.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import { DEPTH } from './depth';

export interface SilhouetteRect {
  x: number;
  y: number;
  width: number;
  height: number;
  color: number;
}

export interface ParallaxLayerOptions {
  /** Stair-stepped rectangle stack defining the silhouette outline. */
  rects: readonly SilhouetteRect[];
  /** Scroll factor 0..1 (0 = locked to camera, 1 = world space). */
  scrollFactor?: number;
  /** Override depth (defaults to PARALLAX_BG). */
  depth?: number;
  /** Optional alpha for atmospheric fade (defaults to 1). */
  alpha?: number;
  /** Optional tint applied uniformly. */
  tint?: number;
}

/**
 * Build a parallax silhouette layer container. Caller may reposition or
 * destroy the container after creation.
 */
export function buildParallaxLayer(
  scene: Phaser.Scene,
  options: ParallaxLayerOptions,
): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0);
  container.setDepth(options.depth ?? DEPTH.PARALLAX_BG);
  container.setScrollFactor(options.scrollFactor ?? 0.4);
  if (options.alpha !== undefined) container.setAlpha(options.alpha);

  for (const rect of options.rects) {
    const r = scene.add.rectangle(rect.x, rect.y, rect.width, rect.height, rect.color);
    r.setOrigin(0, 0);
    if (options.tint !== undefined) r.setFillStyle(options.tint);
    container.add(r);
  }

  return container;
}

/**
 * Generate a stair-stepped silhouette for a horizon span. Useful when
 * scenes want a procedural canyon or skyline without hand-placing every
 * rectangle. Algorithm:
 *   - walk along x in `step` pixel increments
 *   - emit a rectangle of `step` width and pseudo-random height in
 *     [minHeight, maxHeight]
 *   - use a deterministic seed-driven pseudo-random sequence so the
 *     silhouette is reproducible across runs (Playwright snapshot stable)
 */
export function stairStepSilhouette(
  startX: number,
  endX: number,
  baseY: number,
  step: number,
  minHeight: number,
  maxHeight: number,
  color: number,
  seed: number = 1,
): SilhouetteRect[] {
  const rects: SilhouetteRect[] = [];
  let s = seed >>> 0;
  // Mulberry32 PRNG for deterministic output
  const rand = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let x = startX; x < endX; x += step) {
    const h = Math.round(minHeight + rand() * (maxHeight - minHeight));
    rects.push({ x, y: baseY - h, width: step, height: h, color });
  }
  return rects;
}
