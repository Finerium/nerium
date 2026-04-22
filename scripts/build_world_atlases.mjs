#!/usr/bin/env node
//
// build_world_atlases.mjs
//
// Author: Thalia (Builder Worker, P3b, 2D pixel worlds).
// Conforms to: docs/contracts/sprite_atlas.contract.md v0.1.0.
//
// Procedurally renders the three world sprite atlases (Medieval Desert,
// Cyberpunk Shanghai, Steampunk Victorian) to PNG using a pure-JS encoder so
// NERIUM keeps one runtime dependency floor (no node-canvas, no sharp). Each
// atlas is a 64x64 PNG packing 16 sprites on a 4x4 grid of 16x16 tiles.
//
// Writes two copies per world:
//   - public/assets/worlds/{world_id}/atlas.png   (URL accessible via Next.js)
//   - app/builder/worlds/{world_id}/tiles.png     (colocated with atlas.json)
//
// Run: node scripts/build_world_atlases.mjs
//

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------- PNG encoder ----------

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
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
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
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idatData),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Drawing primitives ----------

const CANVAS = 64;
const TILE = 16;
const COLS = 4;

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

function scatter(canvas, x, y, w, h, color, seed) {
  // Deterministic LCG for reproducible texture specks.
  let s = seed >>> 0;
  for (let i = 0; i < w * h; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    if ((s & 0xff) < 32) {
      const dx = s % w;
      const dy = (s >>> 16) % h;
      setPixel(canvas, x + dx, y + dy, color);
    }
  }
}

function spriteOrigin(index) {
  return [(index % COLS) * TILE, Math.floor(index / COLS) * TILE];
}

// ---------- Palettes (sRGB approximations of tokens.ts OKLCH values) ----------

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
  transparent:[  0,   0,   0,   0],
};

// ---------- Sprite drawers ----------
//
// Index layout (4x4 grid, row-major):
//  0 floor_primary      1 floor_secondary   2 wall_solid        3 wall_accent
//  4 corner_outer       5 pillar            6 arch_opening      7 feature_decor
//  8 ambient_on         9 ambient_off      10 path_marker      11 particle
// 12 agent_idle        13 agent_active     14 agent_completed  15 sigil_world
//

function drawMedieval(canvas) {
  const p = MEDIEVAL;
  // 0 floor_primary: terracotta courtyard stone with darker grout cross.
  const [x0, y0] = spriteOrigin(0);
  fillRect(canvas, x0, y0, TILE, TILE, p.primary);
  fillRect(canvas, x0 + 7, y0, 2, TILE, p.shadow);
  fillRect(canvas, x0, y0 + 7, TILE, 2, p.shadow);
  scatter(canvas, x0, y0, TILE, TILE, p.highlight, 0x1001);

  // 1 floor_secondary: packed sand with dune speckle.
  const [x1, y1] = spriteOrigin(1);
  fillRect(canvas, x1, y1, TILE, TILE, p.background);
  scatter(canvas, x1, y1, TILE, TILE, p.muted, 0x1002);
  scatter(canvas, x1, y1, TILE, TILE, p.secondary, 0x1012);

  // 2 wall_solid: sandstone ashlar block.
  const [x2, y2] = spriteOrigin(2);
  fillRect(canvas, x2, y2, TILE, TILE, p.muted);
  fillRect(canvas, x2, y2, TILE, 1, p.highlight);
  fillRect(canvas, x2, y2 + TILE - 1, TILE, 1, p.shadow);
  fillRect(canvas, x2, y2 + 7, TILE, 1, p.shadow);
  fillRect(canvas, x2 + 7, y2, 1, 7, p.shadow);
  fillRect(canvas, x2 + 3, y2 + 8, 1, 7, p.shadow);
  fillRect(canvas, x2 + 11, y2 + 8, 1, 7, p.shadow);

  // 3 wall_accent: banner drape on stone.
  const [x3, y3] = spriteOrigin(3);
  fillRect(canvas, x3, y3, TILE, TILE, p.muted);
  fillRect(canvas, x3 + 5, y3 + 2, 6, 12, p.critical);
  fillRect(canvas, x3 + 6, y3 + 3, 4, 10, p.warning);
  fillRect(canvas, x3 + 4, y3 + 13, 8, 1, p.shadow);
  setPixel(canvas, x3 + 4, y3 + 14, p.critical);
  setPixel(canvas, x3 + 11, y3 + 14, p.critical);

  // 4 corner_outer: crenellation cap.
  const [x4, y4] = spriteOrigin(4);
  fillRect(canvas, x4, y4 + 4, TILE, TILE - 4, p.muted);
  fillRect(canvas, x4, y4 + 4, 3, 3, p.primary);
  fillRect(canvas, x4 + 6, y4 + 4, 3, 3, p.primary);
  fillRect(canvas, x4 + 12, y4 + 4, 3, 3, p.primary);
  fillRect(canvas, x4, y4 + 4, TILE, 1, p.highlight);

  // 5 pillar: engaged column.
  const [x5, y5] = spriteOrigin(5);
  fillRect(canvas, x5 + 5, y5, 6, TILE, p.secondary);
  fillRect(canvas, x5 + 5, y5, 1, TILE, p.highlight);
  fillRect(canvas, x5 + 10, y5, 1, TILE, p.shadow);
  fillRect(canvas, x5 + 3, y5, TILE - 6, 2, p.primary);
  fillRect(canvas, x5 + 3, y5 + TILE - 2, TILE - 6, 2, p.primary);

  // 6 arch_opening: Moorish keyhole arch.
  const [x6, y6] = spriteOrigin(6);
  fillRect(canvas, x6, y6, TILE, TILE, p.muted);
  fillRect(canvas, x6 + 5, y6 + 4, 6, 11, p.shadow);
  setPixel(canvas, x6 + 5, y6 + 3, p.shadow);
  setPixel(canvas, x6 + 10, y6 + 3, p.shadow);
  setPixel(canvas, x6 + 6, y6 + 2, p.shadow);
  setPixel(canvas, x6 + 9, y6 + 2, p.shadow);
  setPixel(canvas, x6 + 7, y6 + 1, p.shadow);
  setPixel(canvas, x6 + 8, y6 + 1, p.shadow);
  fillRect(canvas, x6 + 6, y6 + 5, 4, 1, p.accent);

  // 7 feature_decor: hanging lantern.
  const [x7, y7] = spriteOrigin(7);
  fillRect(canvas, x7 + 7, y7, 2, 3, p.foreground);
  fillRect(canvas, x7 + 5, y7 + 3, 6, 6, p.accent);
  fillRect(canvas, x7 + 5, y7 + 3, 6, 1, p.highlight);
  fillRect(canvas, x7 + 6, y7 + 9, 4, 1, p.foreground);
  fillRect(canvas, x7 + 7, y7 + 10, 2, 2, p.warning);

  // 8 ambient_on: lit torch.
  const [x8, y8] = spriteOrigin(8);
  fillRect(canvas, x8 + 6, y8 + 8, 4, 8, p.muted);
  fillRect(canvas, x8 + 6, y8 + 8, 1, 8, p.highlight);
  fillRect(canvas, x8 + 7, y8 + 3, 2, 5, p.warning);
  fillRect(canvas, x8 + 6, y8 + 5, 4, 3, p.warning);
  fillRect(canvas, x8 + 7, y8 + 1, 2, 2, p.highlight);
  setPixel(canvas, x8 + 7, y8, p.warning);
  setPixel(canvas, x8 + 8, y8, p.warning);

  // 9 ambient_off: unlit torch stub.
  const [x9, y9] = spriteOrigin(9);
  fillRect(canvas, x9 + 6, y9 + 8, 4, 8, p.muted);
  fillRect(canvas, x9 + 6, y9 + 8, 1, 8, p.shadow);
  fillRect(canvas, x9 + 7, y9 + 5, 2, 3, p.shadow);

  // 10 path_marker: footprint on sand.
  const [x10, y10] = spriteOrigin(10);
  fillRect(canvas, x10, y10, TILE, TILE, p.background);
  fillRect(canvas, x10 + 5, y10 + 6, 5, 5, p.muted);
  setPixel(canvas, x10 + 5, y10 + 4, p.muted);
  setPixel(canvas, x10 + 7, y10 + 4, p.muted);
  setPixel(canvas, x10 + 9, y10 + 4, p.muted);

  // 11 particle: dust swirl.
  const [x11, y11] = spriteOrigin(11);
  setPixel(canvas, x11 + 7, y11 + 4, p.highlight);
  setPixel(canvas, x11 + 9, y11 + 6, p.highlight);
  setPixel(canvas, x11 + 10, y11 + 9, p.background);
  setPixel(canvas, x11 + 8, y11 + 11, p.background);
  setPixel(canvas, x11 + 6, y11 + 9, p.muted);

  // 12 agent_idle: stone figure.
  drawAgent(canvas, 12, p, 'idle');
  // 13 agent_active: halo.
  drawAgent(canvas, 13, p, 'active');
  // 14 agent_completed: banner stripe.
  drawAgent(canvas, 14, p, 'completed');

  // 15 sigil_world: crescent over dune.
  const [x15, y15] = spriteOrigin(15);
  fillRect(canvas, x15, y15, TILE, TILE, p.primary);
  fillRect(canvas, x15, y15 + 10, TILE, 6, p.secondary);
  fillRect(canvas, x15 + 1, y15 + 11, 3, 1, p.highlight);
  fillRect(canvas, x15 + 4, y15 + 12, 8, 1, p.highlight);
  fillRect(canvas, x15 + 12, y15 + 11, 3, 1, p.highlight);
  for (let dy = 2; dy <= 7; dy++) {
    for (let dx = 6; dx <= 11; dx++) {
      const rx = dx - 8;
      const ry = dy - 4.5;
      if (rx * rx + ry * ry <= 9.5 && !((rx + 1.5) ** 2 + ry * ry <= 8)) {
        setPixel(canvas, x15 + dx, y15 + dy, p.highlight);
      }
    }
  }
}

function drawCyberpunk(canvas) {
  const p = CYBERPUNK;
  // 0 floor_primary: neon grid.
  const [x0, y0] = spriteOrigin(0);
  fillRect(canvas, x0, y0, TILE, TILE, p.background);
  for (let k = 0; k < TILE; k += 4) {
    fillRect(canvas, x0 + k, y0, 1, TILE, p.muted);
    fillRect(canvas, x0, y0 + k, TILE, 1, p.muted);
  }
  setPixel(canvas, x0 + 4, y0 + 4, p.primary);
  setPixel(canvas, x0 + 12, y0 + 4, p.primary);
  setPixel(canvas, x0 + 4, y0 + 12, p.primary);
  setPixel(canvas, x0 + 12, y0 + 12, p.primary);

  // 1 floor_secondary: circuit etch.
  const [x1, y1] = spriteOrigin(1);
  fillRect(canvas, x1, y1, TILE, TILE, p.shadow);
  fillRect(canvas, x1 + 2, y1 + 4, 8, 1, p.accent);
  fillRect(canvas, x1 + 9, y1 + 4, 1, 6, p.accent);
  fillRect(canvas, x1 + 9, y1 + 9, 5, 1, p.accent);
  fillRect(canvas, x1 + 4, y1 + 12, 6, 1, p.secondary);
  setPixel(canvas, x1 + 2, y1 + 4, p.primary);
  setPixel(canvas, x1 + 13, y1 + 9, p.primary);
  setPixel(canvas, x1 + 10, y1 + 12, p.secondary);

  // 2 wall_solid: metal panel with seam.
  const [x2, y2] = spriteOrigin(2);
  fillRect(canvas, x2, y2, TILE, TILE, p.muted);
  fillRect(canvas, x2, y2, TILE, 1, p.foreground);
  fillRect(canvas, x2, y2 + TILE - 1, TILE, 1, p.background);
  fillRect(canvas, x2 + 7, y2 + 2, 1, 12, p.background);
  setPixel(canvas, x2 + 2, y2 + 2, p.primary);
  setPixel(canvas, x2 + 13, y2 + 2, p.primary);
  setPixel(canvas, x2 + 2, y2 + 13, p.primary);
  setPixel(canvas, x2 + 13, y2 + 13, p.primary);

  // 3 wall_accent: hanzi hologram panel.
  const [x3, y3] = spriteOrigin(3);
  fillRect(canvas, x3, y3, TILE, TILE, p.shadow);
  fillRect(canvas, x3 + 3, y3 + 1, 10, 14, p.background);
  fillRect(canvas, x3 + 5, y3 + 3, 6, 1, p.secondary);
  fillRect(canvas, x3 + 7, y3 + 4, 2, 4, p.secondary);
  fillRect(canvas, x3 + 5, y3 + 8, 6, 1, p.secondary);
  fillRect(canvas, x3 + 5, y3 + 10, 6, 1, p.primary);
  fillRect(canvas, x3 + 5, y3 + 12, 6, 1, p.primary);

  // 4 corner_outer: neon gantry.
  const [x4, y4] = spriteOrigin(4);
  fillRect(canvas, x4, y4 + 4, 4, TILE - 4, p.muted);
  fillRect(canvas, x4 + 12, y4 + 4, 4, TILE - 4, p.muted);
  fillRect(canvas, x4, y4 + 4, TILE, 2, p.muted);
  fillRect(canvas, x4, y4 + 4, TILE, 1, p.primary);
  fillRect(canvas, x4 + 1, y4 + 6, 2, 10, p.primary);
  fillRect(canvas, x4 + 13, y4 + 6, 2, 10, p.secondary);

  // 5 pillar: antenna spike.
  const [x5, y5] = spriteOrigin(5);
  fillRect(canvas, x5 + 6, y5 + 6, 4, 10, p.muted);
  fillRect(canvas, x5 + 7, y5 + 2, 2, 4, p.foreground);
  setPixel(canvas, x5 + 8, y5, p.primary);
  setPixel(canvas, x5 + 7, y5 + 1, p.primary);
  setPixel(canvas, x5 + 6, y5 + 6, p.primary);
  setPixel(canvas, x5 + 9, y5 + 6, p.primary);
  fillRect(canvas, x5 + 5, y5 + 14, 6, 2, p.secondary);

  // 6 arch_opening: holographic portal.
  const [x6, y6] = spriteOrigin(6);
  fillRect(canvas, x6, y6, TILE, TILE, p.muted);
  fillRect(canvas, x6 + 5, y6 + 3, 6, 12, p.background);
  fillRect(canvas, x6 + 5, y6 + 3, 6, 1, p.primary);
  fillRect(canvas, x6 + 5, y6 + 14, 6, 1, p.primary);
  fillRect(canvas, x6 + 5, y6 + 3, 1, 12, p.primary);
  fillRect(canvas, x6 + 10, y6 + 3, 1, 12, p.primary);
  fillRect(canvas, x6 + 7, y6 + 7, 2, 1, p.accent);

  // 7 feature_decor: neon sign.
  const [x7, y7] = spriteOrigin(7);
  fillRect(canvas, x7 + 2, y7 + 3, TILE - 4, 4, p.shadow);
  outlineRect(canvas, x7 + 2, y7 + 3, TILE - 4, 4, p.secondary);
  fillRect(canvas, x7 + 4, y7 + 5, 1, 1, p.secondary);
  fillRect(canvas, x7 + 6, y7 + 5, 1, 1, p.primary);
  fillRect(canvas, x7 + 8, y7 + 5, 1, 1, p.accent);
  fillRect(canvas, x7 + 10, y7 + 5, 1, 1, p.primary);
  fillRect(canvas, x7 + 7, y7 + 7, 2, 5, p.muted);

  // 8 ambient_on: bright neon tube.
  const [x8, y8] = spriteOrigin(8);
  fillRect(canvas, x8 + 2, y8 + 7, 12, 2, p.primary);
  fillRect(canvas, x8 + 2, y8 + 6, 12, 1, p.highlight);
  fillRect(canvas, x8 + 2, y8 + 9, 12, 1, p.highlight);
  setPixel(canvas, x8 + 1, y8 + 7, p.primary);
  setPixel(canvas, x8 + 14, y8 + 7, p.primary);
  setPixel(canvas, x8 + 1, y8 + 8, p.primary);
  setPixel(canvas, x8 + 14, y8 + 8, p.primary);

  // 9 ambient_off: dim neon tube.
  const [x9, y9] = spriteOrigin(9);
  fillRect(canvas, x9 + 2, y9 + 7, 12, 2, p.muted);

  // 10 path_marker: LED strip step.
  const [x10, y10] = spriteOrigin(10);
  fillRect(canvas, x10, y10, TILE, TILE, p.background);
  fillRect(canvas, x10 + 3, y10 + 12, 10, 1, p.primary);
  setPixel(canvas, x10 + 4, y10 + 11, p.primary);
  setPixel(canvas, x10 + 8, y10 + 11, p.primary);
  setPixel(canvas, x10 + 12, y10 + 11, p.primary);

  // 11 particle: rain glyph.
  const [x11, y11] = spriteOrigin(11);
  for (let k = 0; k < 4; k++) {
    setPixel(canvas, x11 + 2 + k * 3, y11 + 3 + k, p.primary);
    setPixel(canvas, x11 + 2 + k * 3, y11 + 4 + k, p.primary);
  }

  drawAgent(canvas, 12, p, 'idle');
  drawAgent(canvas, 13, p, 'active');
  drawAgent(canvas, 14, p, 'completed');

  // 15 sigil_world: neon triangle glyph.
  const [x15, y15] = spriteOrigin(15);
  fillRect(canvas, x15, y15, TILE, TILE, p.background);
  for (let dy = 2; dy < TILE - 2; dy++) {
    const inset = Math.floor(((TILE - 4 - dy) * 2) / 2);
    const width = dy - 1;
    setPixel(canvas, x15 + 7 - Math.floor(width / 2), y15 + dy, p.primary);
    setPixel(canvas, x15 + 8 + Math.floor(width / 2), y15 + dy, p.secondary);
  }
  fillRect(canvas, x15 + 3, y15 + TILE - 3, 10, 1, p.accent);
}

function drawSteampunk(canvas) {
  const p = STEAMPUNK;
  // 0 floor_primary: polished brass plank.
  const [x0, y0] = spriteOrigin(0);
  fillRect(canvas, x0, y0, TILE, TILE, p.primary);
  fillRect(canvas, x0, y0, TILE, 1, p.highlight);
  fillRect(canvas, x0, y0 + TILE - 1, TILE, 1, p.shadow);
  fillRect(canvas, x0, y0 + 7, TILE, 1, p.shadow);
  fillRect(canvas, x0, y0 + 8, TILE, 1, p.highlight);
  setPixel(canvas, x0 + 2, y0 + 2, p.shadow);
  setPixel(canvas, x0 + 13, y0 + 2, p.shadow);
  setPixel(canvas, x0 + 2, y0 + 13, p.shadow);
  setPixel(canvas, x0 + 13, y0 + 13, p.shadow);

  // 1 floor_secondary: walnut parquet.
  const [x1, y1] = spriteOrigin(1);
  fillRect(canvas, x1, y1, TILE, TILE, p.foreground);
  for (let k = 0; k < TILE; k += 4) {
    fillRect(canvas, x1, y1 + k, TILE, 1, p.accent);
  }
  scatter(canvas, x1, y1, TILE, TILE, p.muted, 0x3001);

  // 2 wall_solid: plaster over rivets.
  const [x2, y2] = spriteOrigin(2);
  fillRect(canvas, x2, y2, TILE, TILE, p.background);
  fillRect(canvas, x2, y2 + 7, TILE, 1, p.muted);
  fillRect(canvas, x2, y2 + 8, TILE, 1, p.highlight);
  for (let dx = 2; dx < TILE; dx += 4) {
    setPixel(canvas, x2 + dx, y2 + 3, p.primary);
    setPixel(canvas, x2 + dx, y2 + 12, p.primary);
  }

  // 3 wall_accent: gauge dial.
  const [x3, y3] = spriteOrigin(3);
  fillRect(canvas, x3, y3, TILE, TILE, p.background);
  for (let dy = 3; dy <= 12; dy++) {
    for (let dx = 3; dx <= 12; dx++) {
      const rx = dx - 7.5;
      const ry = dy - 7.5;
      const d = rx * rx + ry * ry;
      if (d <= 20 && d >= 4) setPixel(canvas, x3 + dx, y3 + dy, p.primary);
      else if (d < 4) setPixel(canvas, x3 + dx, y3 + dy, p.foreground);
    }
  }
  setPixel(canvas, x3 + 7, y3 + 7, p.critical);
  setPixel(canvas, x3 + 8, y3 + 6, p.critical);
  setPixel(canvas, x3 + 9, y3 + 5, p.critical);

  // 4 corner_outer: brass capital.
  const [x4, y4] = spriteOrigin(4);
  fillRect(canvas, x4, y4 + 4, TILE, TILE - 4, p.primary);
  fillRect(canvas, x4 - 1, y4 + 4, TILE + 2, 3, p.accent);
  fillRect(canvas, x4, y4 + 5, TILE, 1, p.highlight);
  fillRect(canvas, x4, y4 + 7, TILE, 1, p.shadow);

  // 5 pillar: fluted column.
  const [x5, y5] = spriteOrigin(5);
  fillRect(canvas, x5 + 5, y5, 6, TILE, p.primary);
  fillRect(canvas, x5 + 5, y5, 1, TILE, p.highlight);
  fillRect(canvas, x5 + 6, y5, 1, TILE, p.shadow);
  fillRect(canvas, x5 + 9, y5, 1, TILE, p.shadow);
  fillRect(canvas, x5 + 10, y5, 1, TILE, p.highlight);
  fillRect(canvas, x5 + 3, y5, TILE - 6, 2, p.accent);
  fillRect(canvas, x5 + 3, y5 + TILE - 2, TILE - 6, 2, p.accent);

  // 6 arch_opening: engraved portal.
  const [x6, y6] = spriteOrigin(6);
  fillRect(canvas, x6, y6, TILE, TILE, p.primary);
  fillRect(canvas, x6 + 5, y6 + 3, 6, 12, p.foreground);
  fillRect(canvas, x6 + 5, y6 + 3, 6, 1, p.accent);
  for (let dx = 5; dx <= 10; dx++) setPixel(canvas, x6 + dx, y6 + 2, p.accent);
  setPixel(canvas, x6 + 4, y6 + 3, p.accent);
  setPixel(canvas, x6 + 11, y6 + 3, p.accent);

  // 7 feature_decor: brass gear.
  const [x7, y7] = spriteOrigin(7);
  for (let dy = 2; dy <= 13; dy++) {
    for (let dx = 2; dx <= 13; dx++) {
      const rx = dx - 7.5;
      const ry = dy - 7.5;
      const d = rx * rx + ry * ry;
      if (d <= 36 && d >= 12) setPixel(canvas, x7 + dx, y7 + dy, p.primary);
      else if (d < 4) setPixel(canvas, x7 + dx, y7 + dy, p.shadow);
    }
  }
  fillRect(canvas, x7 + 7, y7, 2, 3, p.primary);
  fillRect(canvas, x7 + 7, y7 + 13, 2, 3, p.primary);
  fillRect(canvas, x7, y7 + 7, 3, 2, p.primary);
  fillRect(canvas, x7 + 13, y7 + 7, 3, 2, p.primary);

  // 8 ambient_on: lit gas lamp.
  const [x8, y8] = spriteOrigin(8);
  fillRect(canvas, x8 + 7, y8 + 8, 2, 8, p.primary);
  fillRect(canvas, x8 + 5, y8 + 4, 6, 4, p.foreground);
  fillRect(canvas, x8 + 6, y8 + 5, 4, 2, p.warning);
  fillRect(canvas, x8 + 7, y8 + 3, 2, 1, p.highlight);
  setPixel(canvas, x8 + 5, y8 + 3, p.primary);
  setPixel(canvas, x8 + 10, y8 + 3, p.primary);

  // 9 ambient_off: unlit gas lamp.
  const [x9, y9] = spriteOrigin(9);
  fillRect(canvas, x9 + 7, y9 + 8, 2, 8, p.primary);
  fillRect(canvas, x9 + 5, y9 + 4, 6, 4, p.foreground);

  // 10 path_marker: brass dot inlay.
  const [x10, y10] = spriteOrigin(10);
  fillRect(canvas, x10, y10, TILE, TILE, p.background);
  fillRect(canvas, x10 + 6, y10 + 6, 4, 4, p.primary);
  fillRect(canvas, x10 + 7, y10 + 7, 2, 2, p.highlight);

  // 11 particle: steam puff.
  const [x11, y11] = spriteOrigin(11);
  setPixel(canvas, x11 + 6, y11 + 10, p.background);
  setPixel(canvas, x11 + 7, y11 + 9, p.background);
  setPixel(canvas, x11 + 8, y11 + 8, p.background);
  setPixel(canvas, x11 + 9, y11 + 9, p.background);
  setPixel(canvas, x11 + 10, y11 + 10, p.background);
  setPixel(canvas, x11 + 8, y11 + 7, p.highlight);
  setPixel(canvas, x11 + 7, y11 + 11, p.muted);
  setPixel(canvas, x11 + 9, y11 + 11, p.muted);

  drawAgent(canvas, 12, p, 'idle');
  drawAgent(canvas, 13, p, 'active');
  drawAgent(canvas, 14, p, 'completed');

  // 15 sigil_world: brass cog over compass.
  const [x15, y15] = spriteOrigin(15);
  fillRect(canvas, x15, y15, TILE, TILE, p.background);
  for (let dy = 2; dy <= 13; dy++) {
    for (let dx = 2; dx <= 13; dx++) {
      const rx = dx - 7.5;
      const ry = dy - 7.5;
      const d = rx * rx + ry * ry;
      if (d <= 30 && d >= 18) setPixel(canvas, x15 + dx, y15 + dy, p.primary);
    }
  }
  fillRect(canvas, x15 + 7, y15 + 2, 2, 12, p.secondary);
  fillRect(canvas, x15 + 2, y15 + 7, 12, 2, p.secondary);
  setPixel(canvas, x15 + 7, y15 + 7, p.highlight);
  setPixel(canvas, x15 + 8, y15 + 7, p.highlight);
  setPixel(canvas, x15 + 7, y15 + 8, p.highlight);
  setPixel(canvas, x15 + 8, y15 + 8, p.highlight);
}

function drawAgent(canvas, spriteIndex, p, state) {
  const [x, y] = spriteOrigin(spriteIndex);
  // Body chassis + head: shared silhouette across states; state varies halo
  // and stripe color so active / completed read at a glance.
  fillRect(canvas, x + 5, y + 4, 6, 10, p.foreground);
  fillRect(canvas, x + 6, y + 2, 4, 4, p.foreground);
  fillRect(canvas, x + 7, y + 3, 2, 1, p.highlight);
  fillRect(canvas, x + 5, y + 14, 2, 2, p.foreground);
  fillRect(canvas, x + 9, y + 14, 2, 2, p.foreground);
  if (state === 'idle') {
    fillRect(canvas, x + 6, y + 7, 4, 2, p.muted);
  } else if (state === 'active') {
    fillRect(canvas, x + 6, y + 7, 4, 2, p.primary);
    // Halo around head.
    setPixel(canvas, x + 5, y + 1, p.primary);
    setPixel(canvas, x + 6, y + 0, p.primary);
    setPixel(canvas, x + 8, y + 0, p.primary);
    setPixel(canvas, x + 10, y + 1, p.primary);
    setPixel(canvas, x + 11, y + 3, p.primary);
    setPixel(canvas, x + 4, y + 3, p.primary);
  } else if (state === 'completed') {
    fillRect(canvas, x + 6, y + 7, 4, 2, p.success);
    // Tick mark on chest.
    setPixel(canvas, x + 6, y + 11, p.success);
    setPixel(canvas, x + 7, y + 12, p.success);
    setPixel(canvas, x + 8, y + 11, p.success);
    setPixel(canvas, x + 9, y + 10, p.success);
  }
}

// ---------- Runner ----------

const WORLDS = [
  { id: 'medieval_desert', draw: drawMedieval },
  { id: 'cyberpunk_shanghai', draw: drawCyberpunk },
  { id: 'steampunk_victorian', draw: drawSteampunk },
];

function writeAtlas(worldId, rgba) {
  const png = encodePNG(rgba, CANVAS, CANVAS);
  const targets = [
    resolve(ROOT, `public/assets/worlds/${worldId}/atlas.png`),
    resolve(ROOT, `app/builder/worlds/${worldId}/tiles.png`),
  ];
  for (const target of targets) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, png);
    console.log(`wrote ${target} (${png.length} bytes)`);
  }
}

for (const world of WORLDS) {
  const canvas = createCanvas();
  world.draw(canvas);
  writeAtlas(world.id, canvas);
}

console.log('All world atlases generated.');
