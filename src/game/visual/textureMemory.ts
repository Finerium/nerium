//
// src/game/visual/textureMemory.ts
//
// Helios-v2 W3 S11: texture memory inspection helper for /play. Per S11
// directive 3, the texture peak target is < 200 MB. We expose a diagnostic
// function via window for debug + Playwright assertion.
//
// Phaser stores textures in scene.textures.list (TextureManager). Each
// Texture has `frames` and a `source` array; the source's image element
// has natural width/height and is RGBA so byte estimate per source is
// width * height * 4. We sum across all textures to get an estimate.
//
// Note: this is a visual estimate. The actual GPU texture memory may be
// less if Phaser deduplicates atlases or higher if mipmaps are auto-built.
// The estimate suffices for the < 200 MB sanity check.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';

export interface TextureMemoryReport {
  textureCount: number;
  estimatedBytes: number;
  estimatedMB: number;
  topConsumers: Array<{ key: string; bytes: number; mb: number }>;
}

/**
 * Walk the Phaser TextureManager and compute an upper-bound estimate of
 * texture memory consumed. Returns the top 10 largest textures so a
 * developer can quickly identify which assets to downscale if the peak is
 * exceeded.
 */
export function inspectTextureMemory(scene: Phaser.Scene): TextureMemoryReport {
  let bytes = 0;
  const perKey: Array<{ key: string; bytes: number }> = [];

  // Phaser TextureManager exposes `list` as a Record<key, Texture>. Skip
  // built-in '__DEFAULT' / '__MISSING' / '__WHITE' to keep the report
  // focused on user-loaded assets.
  const list = scene.textures.list as Record<string, Phaser.Textures.Texture>;
  for (const key of Object.keys(list)) {
    if (key.startsWith('__')) continue;
    const tex = list[key];
    if (!tex) continue;
    let texBytes = 0;
    for (const src of tex.source) {
      const img = src.image as HTMLImageElement | undefined;
      if (img && img.naturalWidth && img.naturalHeight) {
        // RGBA: 4 bytes per pixel.
        texBytes += img.naturalWidth * img.naturalHeight * 4;
      } else if (src.width && src.height) {
        // Phaser graphic-generated texture (e.g. ambient FX 2x2 pixel).
        texBytes += src.width * src.height * 4;
      }
    }
    bytes += texBytes;
    perKey.push({ key, bytes: texBytes });
  }

  perKey.sort((a, b) => b.bytes - a.bytes);
  const top = perKey.slice(0, 10).map((e) => ({
    key: e.key,
    bytes: e.bytes,
    mb: Math.round((e.bytes / (1024 * 1024)) * 100) / 100,
  }));

  const estimatedMB = Math.round((bytes / (1024 * 1024)) * 100) / 100;
  return {
    textureCount: perKey.length,
    estimatedBytes: bytes,
    estimatedMB,
    topConsumers: top,
  };
}

/**
 * Expose `inspectTextureMemory` via window for Playwright + dev console.
 * Call once from PreloadScene.create() after the registry preload completes.
 */
export function exposeTextureMemoryHook(scene: Phaser.Scene): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Record<string, unknown>;
  const existing = (w.__NERIUM_TEST__ ?? {}) as Record<string, unknown>;
  w.__NERIUM_TEST__ = {
    ...existing,
    inspectTextureMemory: () => inspectTextureMemory(scene),
  };
}
