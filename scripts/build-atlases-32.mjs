#!/usr/bin/env node
//
// build-atlases-32.mjs
//
// Author: Talos (RV W2 Sub-Phase 2).
// Conforms to: docs/contracts/sprite_atlas.contract.md v0.1.0.
//
// Procedurally renders the three world sprite atlases at 32x32 per tile (SNES-era pixel
// resolution uniform per RV_PLAN RV.7 and M2 Section 4.1). Each atlas is a 128x128 PNG
// packing 16 sprites on a 4x4 grid of 32x32 tiles.
//
// Distinct from `scripts/build_world_atlases.mjs` (P0 Thalia P3b, 16x16 tiles, 64x64 canvas):
// this script doubles linear dimension to hit the RV-locked 32x32 target and uses the richer
// pixel budget to add shading, texture variance, and silhouette definition.
//
// Output paths (non-destructive to P0 16x16 atlas.png):
//   - public/assets/worlds/{world}/atlas_32.png
//
// Run: node scripts/build-atlases-32.mjs
//

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------- PNG encoder (identical to build_world_atlases.mjs primitives) ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'latin1');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(rgba, width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const scanlineSize = width * 4 + 1;
  const raw = Buffer.alloc(scanlineSize * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * scanlineSize;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = rowStart + 1 + x * 4;
      raw[dst] = rgba[src];
      raw[dst + 1] = rgba[src + 1];
      raw[dst + 2] = rgba[src + 2];
      raw[dst + 3] = rgba[src + 3];
    }
  }
  const idatData = deflateSync(raw);
  return Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', idatData), pngChunk('IEND', Buffer.alloc(0))]);
}

// ---------- Drawing primitives ----------

const TILE = 32;
const COLS = 4;
const CANVAS = TILE * COLS;

function createCanvas() {
  return new Uint8Array(CANVAS * CANVAS * 4);
}

function setPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= CANVAS || y >= CANVAS) return;
  const idx = (y * CANVAS + x) * 4;
  canvas[idx] = color[0];
  canvas[idx + 1] = color[1];
  canvas[idx + 2] = color[2];
  canvas[idx + 3] = color[3] === undefined ? 255 : color[3];
}

function fillRect(canvas, x, y, w, h, color) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(canvas, x + dx, y + dy, color);
    }
  }
}

function outlineRect(canvas, x, y, w, h, color) {
  for (let dx = 0; dx < w; dx++) {
    setPixel(canvas, x + dx, y, color);
    setPixel(canvas, x + dx, y + h - 1, color);
  }
  for (let dy = 0; dy < h; dy++) {
    setPixel(canvas, x, y + dy, color);
    setPixel(canvas, x + w - 1, y + dy, color);
  }
}

function scatter(canvas, x, y, w, h, color, seed, densityDenominator = 32) {
  let s = seed >>> 0;
  for (let i = 0; i < w * h; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    if ((s & 0xff) < densityDenominator) {
      const dx = s % w;
      const dy = (s >>> 16) % h;
      setPixel(canvas, x + dx, y + dy, color);
    }
  }
}

function circle(canvas, cx, cy, radius, color) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(canvas, cx + dx, cy + dy, color);
      }
    }
  }
}

function spriteOrigin(index) {
  return [(index % COLS) * TILE, Math.floor(index / COLS) * TILE];
}

// ---------- Palettes ----------

const MEDIEVAL = {
  primary:    [201, 122,  74, 255],
  secondary:  [212, 176, 107, 255],
  accent:     [227, 160,  74, 255],
  background: [232, 197, 125, 255],
  foreground: [ 61,  40,  23, 255],
  muted:      [139, 111,  71, 255],
  success:    [122, 139,  71, 255],
  warning:    [232, 165,  77, 255],
  critical:   [139,  46,  30, 255],
  highlight:  [245, 220, 160, 255],
  shadow:     [ 86,  52,  24, 255],
  deepShadow: [ 42,  24,  12, 255],
  transparent:[  0,   0,   0,   0],
};

const CYBERPUNK = {
  primary:    [  0, 240, 255, 255],
  secondary:  [255,  46, 136, 255],
  accent:     [139,  92, 246, 255],
  background: [  6,   6,  12, 255],
  foreground: [230, 236, 255, 255],
  muted:      [ 85,  85, 119, 255],
  success:    [ 58, 255, 161, 255],
  warning:    [255, 179,   0, 255],
  critical:   [255,  61,  90, 255],
  highlight:  [180, 255, 255, 255],
  shadow:     [ 14,  10,  30, 255],
  deepShadow: [  0,   0,   4, 255],
  transparent:[  0,   0,   0,   0],
};

const STEAMPUNK = {
  primary:    [201, 160,  97, 255],
  secondary:  [122,  47,  36, 255],
  accent:     [164, 107,  63, 255],
  background: [229, 214, 184, 255],
  foreground: [ 62,  42,  27, 255],
  muted:      [168, 148, 120, 255],
  success:    [107, 134, 112, 255],
  warning:    [209, 140,  58, 255],
  critical:   [ 74,  26,  18, 255],
  highlight:  [255, 236, 196, 255],
  shadow:     [ 40,  28,  18, 255],
  deepShadow: [ 20,  14,   8, 255],
  transparent:[  0,   0,   0,   0],
};

// ---------- Tile drawers ----------
//
// Layout (16 tiles, row-major on 4x4 grid):
//   0 floor_primary       1 floor_secondary    2 wall_solid        3 wall_accent
//   4 corner_outer        5 pillar             6 arch_opening      7 feature_decor
//   8 ambient_on          9 ambient_off       10 path_marker      11 particle
//  12 agent_idle         13 agent_active      14 agent_completed  15 sigil_world
//

function drawMedieval(canvas) {
  const p = MEDIEVAL;

  // 0 floor_primary: terracotta tiled courtyard with grout cross.
  let [x, y] = spriteOrigin(0);
  fillRect(canvas, x, y, TILE, TILE, p.primary);
  fillRect(canvas, x + 15, y, 2, TILE, p.shadow);
  fillRect(canvas, x, y + 15, TILE, 2, p.shadow);
  fillRect(canvas, x, y, 1, TILE, p.highlight);
  fillRect(canvas, x, y, TILE, 1, p.highlight);
  scatter(canvas, x, y, TILE, TILE, p.highlight, 0x2001, 20);
  scatter(canvas, x, y, TILE, TILE, p.shadow, 0x2002, 16);

  // 1 floor_secondary: packed sand with dune grain.
  [x, y] = spriteOrigin(1);
  fillRect(canvas, x, y, TILE, TILE, p.background);
  scatter(canvas, x, y, TILE, TILE, p.muted, 0x2003, 28);
  scatter(canvas, x, y, TILE, TILE, p.secondary, 0x2013, 32);
  scatter(canvas, x, y, TILE, TILE, p.shadow, 0x2023, 10);

  // 2 wall_solid: sandstone ashlar with 2-row coursing.
  [x, y] = spriteOrigin(2);
  fillRect(canvas, x, y, TILE, TILE, p.muted);
  fillRect(canvas, x, y, TILE, 2, p.highlight);
  fillRect(canvas, x, y + TILE - 2, TILE, 2, p.shadow);
  fillRect(canvas, x, y + 14, TILE, 2, p.shadow);
  fillRect(canvas, x + 15, y, 2, 14, p.shadow);
  fillRect(canvas, x + 7, y + 16, 2, 14, p.shadow);
  fillRect(canvas, x + 23, y + 16, 2, 14, p.shadow);

  // 3 wall_accent: banner drape on stone.
  [x, y] = spriteOrigin(3);
  fillRect(canvas, x, y, TILE, TILE, p.muted);
  fillRect(canvas, x + 10, y + 4, 12, 22, p.critical);
  fillRect(canvas, x + 12, y + 6, 8, 18, p.warning);
  fillRect(canvas, x + 14, y + 9, 4, 12, p.accent);
  fillRect(canvas, x + 8, y + 24, 16, 2, p.shadow);
  setPixel(canvas, x + 8, y + 26, p.critical);
  setPixel(canvas, x + 23, y + 26, p.critical);

  // 4 corner_outer: crenellated stone corner.
  [x, y] = spriteOrigin(4);
  fillRect(canvas, x, y + 8, TILE, TILE - 8, p.muted);
  fillRect(canvas, x, y + 8, 6, 6, p.primary);
  fillRect(canvas, x + 13, y + 8, 6, 6, p.primary);
  fillRect(canvas, x + 26, y + 8, 6, 6, p.primary);
  fillRect(canvas, x, y + 8, TILE, 2, p.highlight);
  fillRect(canvas, x, y + TILE - 2, TILE, 2, p.shadow);

  // 5 pillar: engaged column with capital.
  [x, y] = spriteOrigin(5);
  fillRect(canvas, x + 10, y, 12, TILE, p.secondary);
  fillRect(canvas, x + 10, y, 2, TILE, p.highlight);
  fillRect(canvas, x + 20, y, 2, TILE, p.shadow);
  fillRect(canvas, x + 6, y, 20, 4, p.primary);
  fillRect(canvas, x + 6, y + TILE - 4, 20, 4, p.primary);
  fillRect(canvas, x + 13, y + 8, 6, 2, p.shadow);
  fillRect(canvas, x + 13, y + 22, 6, 2, p.shadow);

  // 6 arch_opening: Moorish keyhole arch with archway shadow.
  [x, y] = spriteOrigin(6);
  fillRect(canvas, x, y, TILE, TILE, p.muted);
  fillRect(canvas, x + 10, y + 10, 12, 22, p.deepShadow);
  for (let dy = 0; dy <= 10; dy++) {
    const bulge = Math.round(6 - Math.abs(dy - 5) * 0.8);
    fillRect(canvas, x + 10 - bulge + 6, y + 10 - dy, 12 - 2 * (6 - bulge), 1, p.deepShadow);
  }
  fillRect(canvas, x + 13, y + 12, 6, 2, p.accent);
  fillRect(canvas, x + 10, y + 11, 12, 1, p.highlight);

  // 7 feature_decor: hanging lantern with glow.
  [x, y] = spriteOrigin(7);
  fillRect(canvas, x + 14, y, 4, 6, p.foreground);
  fillRect(canvas, x + 10, y + 6, 12, 12, p.accent);
  fillRect(canvas, x + 10, y + 6, 12, 2, p.highlight);
  fillRect(canvas, x + 12, y + 18, 8, 2, p.foreground);
  fillRect(canvas, x + 14, y + 20, 4, 4, p.warning);
  setPixel(canvas, x + 15, y + 9, p.highlight);
  setPixel(canvas, x + 17, y + 13, p.highlight);

  // 8 ambient_on: lit torch.
  [x, y] = spriteOrigin(8);
  fillRect(canvas, x + 13, y + 16, 6, 16, p.muted);
  fillRect(canvas, x + 13, y + 16, 2, 16, p.highlight);
  fillRect(canvas, x + 17, y + 16, 2, 16, p.shadow);
  fillRect(canvas, x + 14, y + 7, 4, 10, p.warning);
  fillRect(canvas, x + 13, y + 11, 6, 5, p.warning);
  fillRect(canvas, x + 15, y + 2, 2, 5, p.highlight);
  setPixel(canvas, x + 14, y + 4, p.warning);
  setPixel(canvas, x + 17, y + 4, p.warning);
  setPixel(canvas, x + 15, y, p.highlight);
  setPixel(canvas, x + 16, y, p.highlight);

  // 9 ambient_off: unlit torch.
  [x, y] = spriteOrigin(9);
  fillRect(canvas, x + 13, y + 16, 6, 16, p.muted);
  fillRect(canvas, x + 13, y + 16, 2, 16, p.shadow);
  fillRect(canvas, x + 14, y + 11, 4, 5, p.shadow);

  // 10 path_marker: camel footprint on sand.
  [x, y] = spriteOrigin(10);
  fillRect(canvas, x, y, TILE, TILE, p.background);
  fillRect(canvas, x + 10, y + 13, 12, 10, p.muted);
  fillRect(canvas, x + 10, y + 8, 4, 4, p.muted);
  fillRect(canvas, x + 18, y + 8, 4, 4, p.muted);
  scatter(canvas, x, y, TILE, TILE, p.muted, 0x2044, 12);

  // 11 particle: dust swirl.
  [x, y] = spriteOrigin(11);
  setPixel(canvas, x + 15, y + 8, p.highlight);
  setPixel(canvas, x + 18, y + 12, p.highlight);
  setPixel(canvas, x + 21, y + 18, p.background);
  setPixel(canvas, x + 16, y + 22, p.background);
  setPixel(canvas, x + 13, y + 18, p.muted);
  setPixel(canvas, x + 12, y + 14, p.muted);
  setPixel(canvas, x + 19, y + 21, p.secondary);

  // 12-14 agent variants share a silhouette drawer with different accents.
  drawAgent(canvas, 12, p, 'idle');
  drawAgent(canvas, 13, p, 'active');
  drawAgent(canvas, 14, p, 'completed');

  // 15 sigil_world: crescent over dune.
  [x, y] = spriteOrigin(15);
  fillRect(canvas, x, y, TILE, TILE, p.primary);
  fillRect(canvas, x, y + 22, TILE, 10, p.secondary);
  fillRect(canvas, x + 2, y + 23, 6, 2, p.highlight);
  fillRect(canvas, x + 10, y + 24, 12, 2, p.highlight);
  fillRect(canvas, x + 24, y + 23, 6, 2, p.highlight);
  for (let dy = 6; dy <= 18; dy++) {
    for (let dx = 12; dx <= 24; dx++) {
      const rx = dx - 18;
      const ry = dy - 12;
      if (rx * rx + ry * ry <= 36 && !((rx + 3) ** 2 + ry * ry <= 28)) {
        setPixel(canvas, x + dx, y + dy, p.highlight);
      }
    }
  }
}

function drawCyberpunk(canvas) {
  const p = CYBERPUNK;

  // 0 floor_primary: neon grid with corner dots.
  let [x, y] = spriteOrigin(0);
  fillRect(canvas, x, y, TILE, TILE, p.background);
  for (let k = 0; k < TILE; k += 8) {
    fillRect(canvas, x + k, y, 1, TILE, p.muted);
    fillRect(canvas, x, y + k, TILE, 1, p.muted);
  }
  setPixel(canvas, x + 8, y + 8, p.primary);
  setPixel(canvas, x + 24, y + 8, p.primary);
  setPixel(canvas, x + 8, y + 24, p.primary);
  setPixel(canvas, x + 24, y + 24, p.primary);
  setPixel(canvas, x + 16, y + 16, p.secondary);

  // 1 floor_secondary: circuit etch with magenta traces.
  [x, y] = spriteOrigin(1);
  fillRect(canvas, x, y, TILE, TILE, p.shadow);
  for (let k = 0; k < TILE; k += 4) {
    fillRect(canvas, x + k, y + 10, 2, 2, p.secondary);
    fillRect(canvas, x + k, y + 20, 2, 2, p.primary);
  }
  fillRect(canvas, x + 10, y, 2, TILE, p.muted);
  fillRect(canvas, x + 22, y, 2, TILE, p.muted);
  scatter(canvas, x, y, TILE, TILE, p.accent, 0x3001, 14);

  // 2 wall_solid: armored panel with seam.
  [x, y] = spriteOrigin(2);
  fillRect(canvas, x, y, TILE, TILE, p.shadow);
  fillRect(canvas, x, y, TILE, 4, p.muted);
  fillRect(canvas, x, y + 14, TILE, 4, p.muted);
  fillRect(canvas, x, y + TILE - 4, TILE, 4, p.deepShadow);
  fillRect(canvas, x, y + 2, TILE, 1, p.highlight);
  circle(canvas, x + 6, y + 16, 1, p.primary);
  circle(canvas, x + 26, y + 16, 1, p.primary);

  // 3 wall_accent: holographic billboard.
  [x, y] = spriteOrigin(3);
  fillRect(canvas, x, y, TILE, TILE, p.deepShadow);
  fillRect(canvas, x + 4, y + 4, TILE - 8, TILE - 8, p.accent);
  fillRect(canvas, x + 6, y + 6, TILE - 12, TILE - 12, p.background);
  outlineRect(canvas, x + 6, y + 6, TILE - 12, TILE - 12, p.primary);
  fillRect(canvas, x + 10, y + 10, 4, 4, p.secondary);
  fillRect(canvas, x + 18, y + 10, 4, 4, p.primary);
  fillRect(canvas, x + 12, y + 18, 8, 2, p.warning);

  // 4 corner_outer: LED-strip corner pylon.
  [x, y] = spriteOrigin(4);
  fillRect(canvas, x, y + 6, TILE, TILE - 6, p.shadow);
  fillRect(canvas, x + 2, y + 8, 4, TILE - 10, p.primary);
  fillRect(canvas, x + TILE - 6, y + 8, 4, TILE - 10, p.secondary);
  scatter(canvas, x + 8, y + 8, TILE - 16, TILE - 12, p.accent, 0x3004, 14);
  fillRect(canvas, x, y + 6, TILE, 1, p.highlight);

  // 5 pillar: antenna with status lights.
  [x, y] = spriteOrigin(5);
  fillRect(canvas, x + 14, y, 4, TILE, p.muted);
  fillRect(canvas, x + 14, y, 1, TILE, p.highlight);
  fillRect(canvas, x + 17, y, 1, TILE, p.shadow);
  fillRect(canvas, x + 11, y + 2, 10, 3, p.primary);
  fillRect(canvas, x + 13, y + 10, 6, 2, p.secondary);
  fillRect(canvas, x + 13, y + 20, 6, 2, p.warning);

  // 6 arch_opening: neon gate with cyan frame.
  [x, y] = spriteOrigin(6);
  fillRect(canvas, x, y, TILE, TILE, p.shadow);
  fillRect(canvas, x + 8, y + 10, 16, 22, p.deepShadow);
  outlineRect(canvas, x + 8, y + 8, 16, 24, p.primary);
  fillRect(canvas, x + 10, y + 12, 2, 20, p.primary);
  fillRect(canvas, x + 20, y + 12, 2, 20, p.primary);
  fillRect(canvas, x + 8, y + 14, 16, 1, p.secondary);

  // 7 feature_decor: floating drone.
  [x, y] = spriteOrigin(7);
  fillRect(canvas, x + 8, y + 10, 16, 10, p.muted);
  fillRect(canvas, x + 8, y + 10, 16, 2, p.highlight);
  fillRect(canvas, x + 14, y + 18, 4, 4, p.accent);
  fillRect(canvas, x + 10, y + 13, 3, 3, p.primary);
  fillRect(canvas, x + 19, y + 13, 3, 3, p.primary);
  setPixel(canvas, x + 12, y + 23, p.secondary);
  setPixel(canvas, x + 20, y + 23, p.secondary);

  // 8 ambient_on: neon sign lit.
  [x, y] = spriteOrigin(8);
  fillRect(canvas, x + 6, y + 6, TILE - 12, TILE - 14, p.shadow);
  outlineRect(canvas, x + 6, y + 6, TILE - 12, TILE - 14, p.secondary);
  fillRect(canvas, x + 10, y + 10, 3, 8, p.primary);
  fillRect(canvas, x + 16, y + 10, 3, 8, p.primary);
  fillRect(canvas, x + 12, y + 22, 8, 2, p.warning);

  // 9 ambient_off: sign dark.
  [x, y] = spriteOrigin(9);
  fillRect(canvas, x + 6, y + 6, TILE - 12, TILE - 14, p.shadow);
  outlineRect(canvas, x + 6, y + 6, TILE - 12, TILE - 14, p.muted);
  fillRect(canvas, x + 10, y + 10, 3, 8, p.deepShadow);
  fillRect(canvas, x + 16, y + 10, 3, 8, p.deepShadow);

  // 10 path_marker: painted magenta arrow.
  [x, y] = spriteOrigin(10);
  fillRect(canvas, x, y, TILE, TILE, p.shadow);
  fillRect(canvas, x + 12, y + 6, 8, 12, p.secondary);
  fillRect(canvas, x + 6, y + 16, 20, 4, p.secondary);
  fillRect(canvas, x + 8, y + 14, 16, 2, p.secondary);

  // 11 particle: glitch sparkle.
  [x, y] = spriteOrigin(11);
  setPixel(canvas, x + 14, y + 6, p.primary);
  setPixel(canvas, x + 18, y + 10, p.primary);
  setPixel(canvas, x + 22, y + 18, p.secondary);
  setPixel(canvas, x + 10, y + 20, p.secondary);
  setPixel(canvas, x + 16, y + 22, p.highlight);
  setPixel(canvas, x + 20, y + 26, p.accent);

  drawAgent(canvas, 12, p, 'idle');
  drawAgent(canvas, 13, p, 'active');
  drawAgent(canvas, 14, p, 'completed');

  // 15 sigil_world: Shanghai skyline silhouette.
  [x, y] = spriteOrigin(15);
  fillRect(canvas, x, y, TILE, TILE, p.accent);
  fillRect(canvas, x, y + 20, TILE, 12, p.shadow);
  fillRect(canvas, x + 3, y + 8, 4, 24, p.deepShadow);
  fillRect(canvas, x + 9, y + 2, 6, 30, p.deepShadow);
  fillRect(canvas, x + 17, y + 12, 5, 20, p.deepShadow);
  fillRect(canvas, x + 24, y + 5, 5, 27, p.deepShadow);
  setPixel(canvas, x + 4, y + 12, p.primary);
  setPixel(canvas, x + 11, y + 10, p.primary);
  setPixel(canvas, x + 12, y + 18, p.secondary);
  setPixel(canvas, x + 18, y + 16, p.primary);
  setPixel(canvas, x + 26, y + 9, p.primary);
}

function drawSteampunk(canvas) {
  const p = STEAMPUNK;

  // 0 floor_primary: cobblestone rhombus.
  let [x, y] = spriteOrigin(0);
  fillRect(canvas, x, y, TILE, TILE, p.muted);
  for (let ry = 0; ry < TILE; ry += 8) {
    for (let rx = 0; rx < TILE; rx += 8) {
      const off = (ry / 8) % 2 === 0 ? 0 : 4;
      fillRect(canvas, x + rx + off, y + ry, 6, 6, p.primary);
      setPixel(canvas, x + rx + off, y + ry, p.highlight);
      setPixel(canvas, x + rx + off + 5, y + ry + 5, p.shadow);
    }
  }

  // 1 floor_secondary: metal plate with rivets.
  [x, y] = spriteOrigin(1);
  fillRect(canvas, x, y, TILE, TILE, p.accent);
  fillRect(canvas, x, y, TILE, 2, p.highlight);
  fillRect(canvas, x, y + TILE - 2, TILE, 2, p.shadow);
  for (const cx of [4, 12, 20, 28]) {
    for (const cy of [4, 28]) {
      circle(canvas, x + cx, y + cy, 1, p.primary);
      setPixel(canvas, x + cx, y + cy, p.highlight);
    }
  }

  // 2 wall_solid: brick courses.
  [x, y] = spriteOrigin(2);
  fillRect(canvas, x, y, TILE, TILE, p.secondary);
  for (let ry = 0; ry < TILE; ry += 8) {
    fillRect(canvas, x, y + ry, TILE, 1, p.shadow);
    const off = (ry / 8) % 2 === 0 ? 0 : 8;
    for (let rx = off; rx < TILE; rx += 16) {
      fillRect(canvas, x + rx, y + ry, 1, 8, p.shadow);
    }
  }

  // 3 wall_accent: clockwork gear inset.
  [x, y] = spriteOrigin(3);
  fillRect(canvas, x, y, TILE, TILE, p.muted);
  circle(canvas, x + 16, y + 16, 11, p.accent);
  circle(canvas, x + 16, y + 16, 8, p.primary);
  circle(canvas, x + 16, y + 16, 3, p.shadow);
  for (let ang = 0; ang < 8; ang++) {
    const r = ang * (Math.PI / 4);
    const tx = Math.round(Math.cos(r) * 11) + 16;
    const ty = Math.round(Math.sin(r) * 11) + 16;
    fillRect(canvas, x + tx - 1, y + ty - 1, 3, 3, p.shadow);
  }

  // 4 corner_outer: riveted brass corner.
  [x, y] = spriteOrigin(4);
  fillRect(canvas, x, y + 8, TILE, TILE - 8, p.accent);
  fillRect(canvas, x, y + 8, TILE, 2, p.highlight);
  fillRect(canvas, x, y + TILE - 2, TILE, 2, p.shadow);
  for (const cx of [4, 12, 20, 28]) {
    circle(canvas, x + cx, y + 11, 1, p.primary);
  }

  // 5 pillar: brass column.
  [x, y] = spriteOrigin(5);
  fillRect(canvas, x + 9, y, 14, TILE, p.accent);
  fillRect(canvas, x + 9, y, 2, TILE, p.highlight);
  fillRect(canvas, x + 21, y, 2, TILE, p.shadow);
  fillRect(canvas, x + 6, y, 20, 3, p.primary);
  fillRect(canvas, x + 6, y + TILE - 3, 20, 3, p.primary);
  for (const ry of [6, 14, 22]) {
    fillRect(canvas, x + 9, y + ry, 14, 1, p.shadow);
  }

  // 6 arch_opening: gaslit doorway.
  [x, y] = spriteOrigin(6);
  fillRect(canvas, x, y, TILE, TILE, p.secondary);
  fillRect(canvas, x + 8, y + 4, 16, 28, p.deepShadow);
  outlineRect(canvas, x + 8, y + 4, 16, 28, p.accent);
  fillRect(canvas, x + 14, y + 12, 4, 10, p.warning);
  setPixel(canvas, x + 15, y + 10, p.highlight);
  setPixel(canvas, x + 16, y + 10, p.highlight);

  // 7 feature_decor: pipe junction with valve.
  [x, y] = spriteOrigin(7);
  fillRect(canvas, x + 4, y + 14, TILE - 8, 4, p.accent);
  fillRect(canvas, x + 14, y + 4, 4, TILE - 8, p.accent);
  fillRect(canvas, x + 4, y + 14, TILE - 8, 1, p.highlight);
  fillRect(canvas, x + 14, y + 4, 1, TILE - 8, p.highlight);
  circle(canvas, x + 16, y + 16, 4, p.primary);
  circle(canvas, x + 16, y + 16, 2, p.shadow);

  // 8 ambient_on: gas lamp lit.
  [x, y] = spriteOrigin(8);
  fillRect(canvas, x + 13, y + 16, 6, 16, p.accent);
  fillRect(canvas, x + 13, y + 16, 2, 16, p.highlight);
  circle(canvas, x + 16, y + 8, 6, p.warning);
  circle(canvas, x + 16, y + 8, 3, p.highlight);
  fillRect(canvas, x + 12, y + 14, 8, 2, p.primary);

  // 9 ambient_off: gas lamp unlit.
  [x, y] = spriteOrigin(9);
  fillRect(canvas, x + 13, y + 16, 6, 16, p.accent);
  fillRect(canvas, x + 13, y + 16, 2, 16, p.shadow);
  circle(canvas, x + 16, y + 8, 6, p.shadow);
  fillRect(canvas, x + 12, y + 14, 8, 2, p.muted);

  // 10 path_marker: brass arrow plate.
  [x, y] = spriteOrigin(10);
  fillRect(canvas, x, y, TILE, TILE, p.muted);
  fillRect(canvas, x + 8, y + 10, 16, 12, p.accent);
  fillRect(canvas, x + 8, y + 10, 16, 2, p.highlight);
  fillRect(canvas, x + 14, y + 4, 4, 8, p.primary);
  fillRect(canvas, x + 12, y + 6, 8, 4, p.primary);

  // 11 particle: steam puff.
  [x, y] = spriteOrigin(11);
  circle(canvas, x + 12, y + 16, 3, p.highlight);
  circle(canvas, x + 18, y + 12, 2, p.background);
  circle(canvas, x + 22, y + 18, 3, p.highlight);
  circle(canvas, x + 16, y + 22, 2, p.background);
  setPixel(canvas, x + 10, y + 8, p.muted);
  setPixel(canvas, x + 24, y + 10, p.muted);

  drawAgent(canvas, 12, p, 'idle');
  drawAgent(canvas, 13, p, 'active');
  drawAgent(canvas, 14, p, 'completed');

  // 15 sigil_world: gear cog emblem.
  [x, y] = spriteOrigin(15);
  fillRect(canvas, x, y, TILE, TILE, p.primary);
  circle(canvas, x + 16, y + 16, 13, p.accent);
  circle(canvas, x + 16, y + 16, 10, p.background);
  circle(canvas, x + 16, y + 16, 4, p.shadow);
  for (let ang = 0; ang < 12; ang++) {
    const r = ang * (Math.PI / 6);
    const tx = Math.round(Math.cos(r) * 13) + 16;
    const ty = Math.round(Math.sin(r) * 13) + 16;
    fillRect(canvas, x + tx - 1, y + ty - 1, 3, 3, p.secondary);
  }
}

// ---------- Shared agent sprite drawer (32x32 scale) ----------

function drawAgent(canvas, index, palette, variant) {
  const [x, y] = spriteOrigin(index);
  const p = palette;

  // Shadow ellipse at base.
  fillRect(canvas, x + 10, y + 27, 12, 3, p.deepShadow);
  fillRect(canvas, x + 12, y + 26, 8, 1, p.deepShadow);

  // Legs.
  fillRect(canvas, x + 12, y + 19, 3, 8, p.muted);
  fillRect(canvas, x + 17, y + 19, 3, 8, p.muted);

  // Torso.
  fillRect(canvas, x + 10, y + 11, 12, 9, p.primary);
  fillRect(canvas, x + 10, y + 11, 12, 1, p.highlight);
  fillRect(canvas, x + 10, y + 19, 12, 1, p.shadow);

  // Arms.
  fillRect(canvas, x + 7, y + 13, 3, 6, p.primary);
  fillRect(canvas, x + 22, y + 13, 3, 6, p.primary);

  // Head.
  fillRect(canvas, x + 12, y + 4, 8, 8, p.secondary);
  fillRect(canvas, x + 12, y + 4, 8, 1, p.highlight);
  fillRect(canvas, x + 12, y + 11, 8, 1, p.shadow);
  setPixel(canvas, x + 13, y + 7, p.foreground);
  setPixel(canvas, x + 18, y + 7, p.foreground);
  fillRect(canvas, x + 14, y + 9, 4, 1, p.foreground);

  if (variant === 'active') {
    // Halo ring.
    outlineRect(canvas, x + 10, y + 1, 12, 3, p.accent);
  } else if (variant === 'completed') {
    // Chest sash + check mark.
    fillRect(canvas, x + 10, y + 14, 12, 2, p.success);
    fillRect(canvas, x + 13, y + 15, 2, 1, p.highlight);
    fillRect(canvas, x + 14, y + 17, 1, 1, p.success);
    fillRect(canvas, x + 15, y + 18, 1, 1, p.success);
    fillRect(canvas, x + 16, y + 17, 1, 1, p.success);
    fillRect(canvas, x + 17, y + 16, 1, 1, p.success);
  }
}

// ---------- Main ----------

function writeAtlas(world, drawFn) {
  const canvas = createCanvas();
  drawFn(canvas);
  const outDir = resolve(ROOT, `public/assets/worlds/${world}`);
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'atlas_32.png');
  writeFileSync(outPath, encodePNG(canvas, CANVAS, CANVAS));
  console.log(`[build-atlases-32] wrote ${outPath}`);
}

writeAtlas('medieval_desert', drawMedieval);
writeAtlas('cyberpunk_shanghai', drawCyberpunk);
writeAtlas('steampunk_victorian', drawSteampunk);
console.log('[build-atlases-32] done');
