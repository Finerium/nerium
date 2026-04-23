#!/usr/bin/env -S node --experimental-strip-types
//
// opus-svg-export.ts
//
// Author: Talos (RV W2 Sub-Phase 2, asset pipeline infrastructure).
// Related contracts: docs/contracts/sprite_atlas.contract.md v0.1.0, game_asset_registry.contract.md v0.1.0.
//
// Scans public/assets/procedural/svg/*.svg and emits an accompanying PNG at public/assets/procedural/*.png
// for each SVG, plus a machine-readable manifest at public/assets/procedural/manifest.json. Used by
// Hesperus (Opus SVG chrome author) as the commit-time rasterizer and by Talos as the gap-fill baker.
//
// Rasterization strategy:
//   - Primary: @resvg/resvg-js if available at node_modules. Zero-dependency WASM path.
//   - Fallback: librsvg `rsvg-convert` CLI if present on PATH (macOS `brew install librsvg`).
//   - Fallback-of-fallback: emit manifest marking the SVG as "native_svg_only" so Phaser 3's
//     `this.load.svg` path handles it at scene load time. Shipping build tolerates this.
//
// The script never fails hard when a rasterizer is unavailable. Missing rasterizers are a
// developer-convenience degradation, not a product-correctness failure: Phaser 3 reads SVG
// natively via `this.load.svg()` and the registry records the SVG path directly.
//
// Usage:
//   node --experimental-strip-types scripts/opus-svg-export.ts
//

import { existsSync, readdirSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, extname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SVG_DIR = resolve(ROOT, 'public/assets/procedural/svg');
const OUT_DIR = resolve(ROOT, 'public/assets/procedural');

type RasterBackend = 'resvg_js' | 'rsvg_convert_cli' | 'native_svg_only';

type ManifestEntry = {
  svg_path: string;
  png_path: string | null;
  dimensions_px: { w: number; h: number } | null;
  backend_used: RasterBackend;
  generated_at: string;
  notes: string;
};

async function detectBackend(): Promise<RasterBackend> {
  try {
    // @ts-expect-error @resvg/resvg-js is an optional dependency not installed in the RV tree.
    await import('@resvg/resvg-js');
    return 'resvg_js';
  } catch {
    // fall through
  }
  try {
    execFileSync('rsvg-convert', ['--version'], { stdio: 'ignore' });
    return 'rsvg_convert_cli';
  } catch {
    return 'native_svg_only';
  }
}

function parseDimensionsFromSvg(svg: string): { w: number; h: number } | null {
  const widthMatch = svg.match(/width\s*=\s*"(\d+)"/);
  const heightMatch = svg.match(/height\s*=\s*"(\d+)"/);
  if (widthMatch && heightMatch) {
    return { w: parseInt(widthMatch[1], 10), h: parseInt(heightMatch[1], 10) };
  }
  const viewBox = svg.match(/viewBox\s*=\s*"0\s+0\s+(\d+)\s+(\d+)"/);
  if (viewBox) {
    return { w: parseInt(viewBox[1], 10), h: parseInt(viewBox[2], 10) };
  }
  return null;
}

async function rasterizeResvg(svgContent: string, pngPath: string): Promise<{ w: number; h: number } | null> {
  // @ts-expect-error @resvg/resvg-js is an optional dependency not installed in the RV tree.
  const { Resvg } = await import('@resvg/resvg-js');
  const resvg = new Resvg(svgContent, { fitTo: { mode: 'original' } });
  const png = resvg.render();
  writeFileSync(pngPath, png.asPng());
  return { w: resvg.width, h: resvg.height };
}

function rasterizeRsvgConvert(svgPath: string, pngPath: string): { w: number; h: number } | null {
  execFileSync('rsvg-convert', ['-o', pngPath, svgPath]);
  return null;
}

async function main() {
  if (!existsSync(SVG_DIR)) {
    console.log(`[opus-svg-export] no SVG source directory at ${relative(ROOT, SVG_DIR)}; nothing to rasterize`);
    writeFileSync(resolve(OUT_DIR, 'manifest.json'), JSON.stringify({ entries: [], backend_probed: 'n/a', generated_at: new Date().toISOString() }, null, 2) + '\n');
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const backend = await detectBackend();
  console.log(`[opus-svg-export] backend: ${backend}`);

  const entries: ManifestEntry[] = [];
  const files = readdirSync(SVG_DIR).filter((f) => extname(f) === '.svg');

  for (const svgFile of files) {
    const svgAbs = resolve(SVG_DIR, svgFile);
    const pngAbs = resolve(OUT_DIR, basename(svgFile, '.svg') + '.png');
    const svgContent = readFileSync(svgAbs, 'utf8');
    const parsedDims = parseDimensionsFromSvg(svgContent);
    let pngPath: string | null = null;
    let dims: { w: number; h: number } | null = parsedDims;
    let notes = '';

    if (backend === 'resvg_js') {
      try {
        dims = await rasterizeResvg(svgContent, pngAbs);
        pngPath = `/assets/procedural/${basename(pngAbs)}`;
      } catch (err) {
        notes = `resvg_js rasterization failed: ${(err as Error).message}`;
      }
    } else if (backend === 'rsvg_convert_cli') {
      try {
        rasterizeRsvgConvert(svgAbs, pngAbs);
        pngPath = `/assets/procedural/${basename(pngAbs)}`;
      } catch (err) {
        notes = `rsvg-convert CLI rasterization failed: ${(err as Error).message}`;
      }
    } else {
      notes = 'no rasterizer available; Phaser will load SVG natively via this.load.svg()';
    }

    entries.push({
      svg_path: `/assets/procedural/svg/${svgFile}`,
      png_path: pngPath,
      dimensions_px: dims,
      backend_used: backend,
      generated_at: new Date().toISOString(),
      notes,
    });
    console.log(`[opus-svg-export] ${svgFile} -> ${pngPath ?? 'svg-only'} ${notes ? `(${notes})` : ''}`);
  }

  const manifestPath = resolve(OUT_DIR, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({ entries, backend_probed: backend, generated_at: new Date().toISOString() }, null, 2) + '\n');
  console.log(`[opus-svg-export] wrote ${relative(ROOT, manifestPath)}`);
}

main().catch((err) => {
  console.error('[opus-svg-export] fatal:', err);
  process.exit(1);
});
