#!/usr/bin/env -S node --experimental-strip-types
//
// pack-atlas.ts
//
// Author: Talos (RV W2 Sub-Phase 2, asset pipeline infrastructure).
// Conforms to: docs/contracts/sprite_atlas.contract.md v0.1.0, docs/contracts/game_asset_registry.contract.md v0.1.0.
//
// Reads CC0 source sprite sheets under public/assets/cc0/*/sheet.png plus the Opus procedural
// atlases under public/assets/worlds/<world>/atlas.png and emits per-world Phaser 3 atlas
// manifests plus aggregate assets.json. No raster transformation here: Phaser 3 loads the
// source PNG directly via `this.load.atlas('<world>', '<world>.atlas.png', '<world>.atlas.json')`.
// This wrapper produces the JSON side, along with a preload pack for Thalia-v2 consumption.
//
// No external npm install required: the script uses Node's built-in fs plus path plus url.
// A future upgrade path to free-tex-packer-cli is noted in scripts/pack-atlas.README.md
// (not committed) but deliberately skipped for the hackathon RV scope.
//
// Usage:
//   node --experimental-strip-types scripts/pack-atlas.ts
//   node --experimental-strip-types scripts/pack-atlas.ts --world medieval_desert
//
// Environment requirements:
//   - Node.js 23 or later with strip-types enabled (v25.x default).
//   - Sprite sheets present under public/assets/{cc0|procedural|worlds}/.
//
// Output:
//   - public/assets/packs/{world}.atlas.json (Phaser 3 "JSON Hash" format)
//   - public/assets/packs/preload-asset-pack.json (global preload manifest)
//   - public/assets/assets.json (aggregate catalog, consumed by AssetRegistry)
//

import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUB = resolve(ROOT, 'public/assets');
const PACKS_DIR = resolve(PUB, 'packs');
const WORLDS_DIR = resolve(PUB, 'worlds');

type WorldId = 'medieval_desert' | 'cyberpunk_shanghai' | 'steampunk_victorian';

type PhaserAtlasFrame = {
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: false;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
};

type PhaserAtlasJsonHash = {
  frames: Record<string, PhaserAtlasFrame>;
  meta: {
    app: 'pack-atlas.ts';
    version: '0.1.0';
    image: string;
    format: 'RGBA8888';
    size: { w: number; h: number };
    scale: '1';
    world: WorldId;
    source: 'opus_procedural' | 'cc0' | 'hybrid';
  };
};

type WorldConfig = {
  world: WorldId;
  canvas: { w: number; h: number };
  tile: number;
  frames: Array<{ name: string; col: number; row: number }>;
  atlasPngRelative: string;
  sourceKind: 'opus_procedural' | 'cc0' | 'hybrid';
};

const FRAMES_16 = [
  'floor_primary', 'floor_secondary', 'wall_solid', 'wall_accent',
  'corner_outer', 'pillar', 'arch_opening', 'feature_decor',
  'ambient_on', 'ambient_off', 'path_marker', 'particle',
  'agent_idle', 'agent_active', 'agent_completed', 'sigil_world',
];

const WORLDS: WorldConfig[] = [
  {
    world: 'medieval_desert',
    canvas: { w: 128, h: 128 },
    tile: 32,
    frames: FRAMES_16.map((name, index) => ({ name, col: index % 4, row: Math.floor(index / 4) })),
    atlasPngRelative: 'worlds/medieval_desert/atlas_32.png',
    sourceKind: 'opus_procedural',
  },
  {
    world: 'cyberpunk_shanghai',
    canvas: { w: 128, h: 128 },
    tile: 32,
    frames: FRAMES_16.map((name, index) => ({ name, col: index % 4, row: Math.floor(index / 4) })),
    atlasPngRelative: 'worlds/cyberpunk_shanghai/atlas_32.png',
    sourceKind: 'opus_procedural',
  },
  {
    world: 'steampunk_victorian',
    canvas: { w: 128, h: 128 },
    tile: 32,
    frames: FRAMES_16.map((name, index) => ({ name, col: index % 4, row: Math.floor(index / 4) })),
    atlasPngRelative: 'worlds/steampunk_victorian/atlas_32.png',
    sourceKind: 'opus_procedural',
  },
];

function buildAtlasJson(cfg: WorldConfig): PhaserAtlasJsonHash {
  const frames: Record<string, PhaserAtlasFrame> = {};
  for (const f of cfg.frames) {
    const x = f.col * cfg.tile;
    const y = f.row * cfg.tile;
    frames[f.name] = {
      frame: { x, y, w: cfg.tile, h: cfg.tile },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: cfg.tile, h: cfg.tile },
      sourceSize: { w: cfg.tile, h: cfg.tile },
    };
  }
  return {
    frames,
    meta: {
      app: 'pack-atlas.ts',
      version: '0.1.0',
      image: `/assets/${cfg.atlasPngRelative}`,
      format: 'RGBA8888',
      size: cfg.canvas,
      scale: '1',
      world: cfg.world,
      source: cfg.sourceKind,
    },
  };
}

function buildBootPack() {
  return {
    boot: {
      files: [
        {
          type: 'image',
          key: 'nerium_logo_seed',
          url: '/assets/procedural/svg/nerium_logo.svg',
        },
      ],
    },
  };
}

function buildPreloadPack(worldsReady: WorldId[]) {
  return {
    preload: {
      files: [
        ...worldsReady.flatMap((w) => ([
          {
            type: 'atlas',
            key: `atlas_${w}`,
            textureURL: `/assets/worlds/${w}/atlas_32.png`,
            atlasURL: `/assets/packs/${w}.atlas.json`,
          },
        ])),
        {
          type: 'image',
          key: 'ui_panel_kenney',
          url: '/assets/cc0/kenney-ui-rpg-expansion/sheet.png',
        },
        {
          type: 'image',
          key: 'roguelike_master',
          url: '/assets/cc0/kenney-roguelike/sheet.png',
        },
        {
          type: 'image',
          key: 'warped_city_tileset',
          url: '/assets/cc0/warped-city/tileset.png',
        },
      ],
    },
  };
}

function buildAggregateAssetsJson(worldsReady: WorldId[], extra: { proceduralFiles: string[]; cc0Sheets: Array<{ sourceKey: string; path: string }> }) {
  return {
    version: '0.1.0',
    generated_by: 'pack-atlas.ts',
    generated_at: new Date().toISOString(),
    worlds: worldsReady.map((w) => ({
      world: w,
      atlas_png: `/assets/worlds/${w}/atlas_32.png`,
      atlas_json: `/assets/packs/${w}.atlas.json`,
    })),
    cc0_sheets: extra.cc0Sheets,
    procedural_gapfills: extra.proceduralFiles,
  };
}

async function main() {
  mkdirSync(PACKS_DIR, { recursive: true });

  const argIdx = process.argv.indexOf('--world');
  const only = argIdx >= 0 ? (process.argv[argIdx + 1] as WorldId | undefined) : undefined;

  const worldsReady: WorldId[] = [];
  for (const cfg of WORLDS) {
    if (only && cfg.world !== only) continue;
    const pngAbs = resolve(PUB, cfg.atlasPngRelative);
    if (!existsSync(pngAbs)) {
      console.warn(`[pack-atlas] skip ${cfg.world}: atlas PNG missing at ${relative(ROOT, pngAbs)}`);
      continue;
    }
    const atlas = buildAtlasJson(cfg);
    const outJson = resolve(PACKS_DIR, `${cfg.world}.atlas.json`);
    writeFileSync(outJson, JSON.stringify(atlas, null, 2) + '\n');
    worldsReady.push(cfg.world);
    console.log(`[pack-atlas] wrote ${relative(ROOT, outJson)}`);
  }

  const bootPack = buildBootPack();
  const bootPath = resolve(PACKS_DIR, 'boot-asset-pack.json');
  writeFileSync(bootPath, JSON.stringify(bootPack, null, 2) + '\n');
  console.log(`[pack-atlas] wrote ${relative(ROOT, bootPath)}`);

  const preloadPack = buildPreloadPack(worldsReady);
  const preloadPath = resolve(PACKS_DIR, 'preload-asset-pack.json');
  writeFileSync(preloadPath, JSON.stringify(preloadPack, null, 2) + '\n');
  console.log(`[pack-atlas] wrote ${relative(ROOT, preloadPath)}`);

  const proceduralFiles: string[] = [];
  const proceduralDir = resolve(PUB, 'procedural');
  if (existsSync(proceduralDir)) {
    for (const entry of readdirSync(proceduralDir)) {
      if (/\.(png|svg)$/i.test(entry)) proceduralFiles.push(`/assets/procedural/${entry}`);
    }
    const svgDir = resolve(proceduralDir, 'svg');
    if (existsSync(svgDir)) {
      for (const entry of readdirSync(svgDir)) {
        if (/\.svg$/i.test(entry)) proceduralFiles.push(`/assets/procedural/svg/${entry}`);
      }
    }
  }

  const cc0Sheets: Array<{ sourceKey: string; path: string }> = [
    { sourceKey: 'kenney_roguelike_rpg', path: '/assets/cc0/kenney-roguelike/sheet.png' },
    { sourceKey: 'kenney_ui_pack_rpg_expansion', path: '/assets/cc0/kenney-ui-rpg-expansion/sheet.png' },
    { sourceKey: 'opengameart_warped_city', path: '/assets/cc0/warped-city/tileset.png' },
  ];

  const aggregate = buildAggregateAssetsJson(worldsReady, { proceduralFiles, cc0Sheets });
  const aggregatePath = resolve(PUB, 'assets.json');
  writeFileSync(aggregatePath, JSON.stringify(aggregate, null, 2) + '\n');
  console.log(`[pack-atlas] wrote ${relative(ROOT, aggregatePath)}`);
}

main().catch((err) => {
  console.error('[pack-atlas] fatal:', err);
  process.exit(1);
});
