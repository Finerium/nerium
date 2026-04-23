#!/usr/bin/env node
//
// seed-asset-ledger.mjs
//
// Author: Talos (RV W2 Sub-Phase 2).
// Conforms to: docs/contracts/asset_ledger.contract.md v0.1.0.
//
// Seeds public/assets/ledger/asset-ledger.jsonl with the canonical Talos Sub-Phase 2 entries.
// Idempotent: if the file already contains any of the documented Talos Sub-Phase 2 asset_ids,
// those lines are preserved and no duplicates are added. The script only appends lines that
// are not yet represented by asset_id in the file.
//
// Run: node scripts/seed-asset-ledger.mjs
//

import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const LEDGER_DIR = resolve(ROOT, 'public/assets/ledger');
const LEDGER_PATH = resolve(LEDGER_DIR, 'asset-ledger.jsonl');

const SEED_TIME = '2026-04-23T11:20:00.000Z';

const entries = [
  {
    asset_id: 'cc0-kenney-roguelike-rpg-sheet',
    event_kind: 'pack_ingest',
    source_key: 'kenney_roguelike_rpg',
    category: 'tileset',
    world_affinity: 'medieval_desert',
    license_id: 'cc0',
    attribution_text: 'Kenney (kenney.nl), CC0 1.0 Universal',
    dimensions: { width_px: 968, height_px: 526, pixel_aspect: '1:1', color_depth_bits: 32 },
    generation: null,
    cost: { cost_usd: 0, currency_original: 'USD', metered: false },
    reviewer: { decision: 'accepted', agent_id: 'talos', rationale: 'Primary Medieval Desert baseline tileset. Verified transparent alpha channel, 16x16 tile grid confirmed via Kenney spritesheetInfo.txt. License text committed.' },
    local_file_paths: ['public/assets/cc0/kenney-roguelike/sheet.png', 'public/assets/cc0/kenney-roguelike/spritesheetInfo.txt', 'public/assets/cc0/kenney-roguelike/LICENSE.txt', 'public/assets/cc0/kenney-roguelike/README.md'],
    tags: ['cc0', 'kenney', 'medieval', 'baseline', 'tileset'],
    external_request_id: null,
    supersedes_ledger_id: null,
  },
  {
    asset_id: 'cc0-kenney-ui-rpg-expansion-sheet',
    event_kind: 'pack_ingest',
    source_key: 'kenney_ui_pack_rpg_expansion',
    category: 'ui_chrome',
    world_affinity: 'world_agnostic',
    license_id: 'cc0',
    attribution_text: 'Kenney (kenney.nl), CC0 1.0 Universal',
    dimensions: { width_px: 512, height_px: 512, pixel_aspect: '1:1', color_depth_bits: 32 },
    generation: null,
    cost: { cost_usd: 0, currency_original: 'USD', metered: false },
    reviewer: { decision: 'accepted', agent_id: 'talos', rationale: 'HUD chrome fallback for Erato-v2 when Opus SVG chrome is unavailable. Kenney-standard XML atlas.' },
    local_file_paths: ['public/assets/cc0/kenney-ui-rpg-expansion/sheet.png', 'public/assets/cc0/kenney-ui-rpg-expansion/sheet.xml', 'public/assets/cc0/kenney-ui-rpg-expansion/LICENSE.txt', 'public/assets/cc0/kenney-ui-rpg-expansion/README.md'],
    tags: ['cc0', 'kenney', 'ui', 'chrome', 'fallback'],
    external_request_id: null,
    supersedes_ledger_id: null,
  },
  {
    asset_id: 'cc0-kenney-rpg-audio-pack',
    event_kind: 'pack_ingest',
    source_key: 'kenney_audio_rpg_sfx',
    category: 'audio_sfx',
    world_affinity: 'world_agnostic',
    license_id: 'cc0',
    attribution_text: 'Kenney (kenney.nl), CC0 1.0 Universal',
    dimensions: null,
    generation: null,
    cost: { cost_usd: 0, currency_original: 'USD', metered: false },
    reviewer: { decision: 'accepted', agent_id: 'talos', rationale: 'Upstream SFX pack for Euterpe Howler.js integration. All OGG Vorbis files from the archive included, approximately 824 KB aggregate.' },
    local_file_paths: ['public/assets/cc0/kenney-audio-rpg/'],
    tags: ['cc0', 'kenney', 'audio', 'sfx', 'euterpe_upstream'],
    external_request_id: null,
    supersedes_ledger_id: null,
  },
  {
    asset_id: 'cc0-opengameart-warped-city-pack',
    event_kind: 'pack_ingest',
    source_key: 'opengameart_warped_city',
    category: 'tileset',
    world_affinity: 'cyberpunk_shanghai',
    license_id: 'cc0',
    attribution_text: 'Ansimuz on OpenGameArt (opengameart.org/content/warped-city), CC0 1.0',
    dimensions: { width_px: 256, height_px: 256, pixel_aspect: '1:1', color_depth_bits: 32 },
    generation: null,
    cost: { cost_usd: 0, currency_original: 'USD', metered: false },
    reviewer: { decision: 'accepted', agent_id: 'talos', rationale: 'Primary Cyberpunk Shanghai baseline. Tileset, sprites, background, props committed; PSD and MACOSX metadata gitignored.' },
    local_file_paths: ['public/assets/cc0/warped-city/tileset.png', 'public/assets/cc0/warped-city/sprites/', 'public/assets/cc0/warped-city/background/', 'public/assets/cc0/warped-city/props/', 'public/assets/cc0/warped-city/README.md'],
    tags: ['cc0', 'opengameart', 'cyberpunk', 'baseline', 'warped_city'],
    external_request_id: null,
    supersedes_ledger_id: null,
  },
  {
    asset_id: 'cc0-opengameart-steampunk-32x32-tiles',
    event_kind: 'pack_ingest',
    source_key: 'opengameart_steampunk_32x32',
    category: 'tileset',
    world_affinity: 'steampunk_victorian',
    license_id: 'cc0',
    attribution_text: 'OpenGameArt contributor (opengameart.org/content/steampunk-inspired-tiles-32x32), CC0 1.0',
    dimensions: { width_px: 256, height_px: 256, pixel_aspect: '1:1', color_depth_bits: 32 },
    generation: null,
    cost: { cost_usd: 0, currency_original: 'USD', metered: false },
    reviewer: { decision: 'accepted', agent_id: 'talos', rationale: 'Steampunk tile reference plus showcase sheet, used by Talos procedural steampunk gap-fill for silhouette lookup. Coverage weak elsewhere in CC0 for this genre.' },
    local_file_paths: ['public/assets/procedural/opengameart_steampunk_tiles_32x32.png', 'public/assets/procedural/opengameart_steampunk_show.png'],
    tags: ['cc0', 'opengameart', 'steampunk', 'gap_fill_reference'],
    external_request_id: null,
    supersedes_ledger_id: null,
  },
  {
    asset_id: 'permissive-brullov-oak-woods-stub',
    event_kind: 'pack_ingest',
    source_key: 'brullov_oak_woods',
    category: 'tileset',
    world_affinity: 'medieval_desert',
    license_id: 'brullov_custom_permissive',
    attribution_text: 'brullov (brullov.itch.io/oak-woods), custom permissive: free plus commercial, no redistribution, credit appreciated',
    dimensions: null,
    generation: null,
    cost: { cost_usd: 0, currency_original: 'USD', metered: false },
    reviewer: { decision: 'retry_pending', agent_id: 'talos', rationale: 'itch.io download is form-gated; direct unattended fetch would violate the no-redistribution clause. README committed at public/assets/cc0/oak-woods/README.md with pull instructions. Local clones can add the pack without source control pushing bytes upstream.' },
    local_file_paths: ['public/assets/cc0/oak-woods/README.md'],
    tags: ['permissive', 'brullov', 'medieval', 'oak_woods', 'local_pull_only'],
    external_request_id: null,
    supersedes_ledger_id: null,
  },
  {
    asset_id: 'proc-medieval-desert-atlas-32',
    event_kind: 'procedural_generate',
    source_key: 'opus_procedural_canvas',
    category: 'tileset',
    world_affinity: 'medieval_desert',
    license_id: 'original_mit',
    attribution_text: null,
    dimensions: { width_px: 128, height_px: 128, pixel_aspect: '1:1', color_depth_bits: 32 },
    generation: { prompt: null, seed: 0x2001, model_identifier: 'claude-opus-4-7', resolution_tier: null, thinking_level: 'high', enable_web_search: false, additional_flags: { script: 'scripts/build-atlases-32.mjs', frames: 16, tile_px: 32, canvas_px: 128 } },
    cost: { cost_usd: 0, currency_original: 'USD', metered: false },
    reviewer: { decision: 'accepted', agent_id: 'talos', rationale: 'Medieval Desert 16-frame atlas generated at 32x32 per tile per RV_PLAN RV.7 32x32 SNES-era lock. Supersedes the P0 16x16 variant at public/assets/worlds/medieval_desert/atlas.png for the RV build while leaving P0 bytes intact as legacy fallback.' },
    local_file_paths: ['public/assets/worlds/medieval_desert/atlas_32.png', 'public/assets/packs/medieval_desert.atlas.json'],
    tags: ['procedural', 'opus', 'medieval', '32x32', 'rv_primary'],
    external_request_id: null,
    supersedes_ledger_id: null,
  },
  {
    asset_id: 'proc-cyberpunk-shanghai-atlas-32',
    event_kind: 'procedural_generate',
    source_key: 'opus_procedural_canvas',
    category: 'tileset',
    world_affinity: 'cyberpunk_shanghai',
    license_id: 'original_mit',
    attribution_text: null,
    dimensions: { width_px: 128, height_px: 128, pixel_aspect: '1:1', color_depth_bits: 32 },
    generation: { prompt: null, seed: 0x3001, model_identifier: 'claude-opus-4-7', resolution_tier: null, thinking_level: 'high', enable_web_search: false, additional_flags: { script: 'scripts/build-atlases-32.mjs', frames: 16, tile_px: 32, canvas_px: 128 } },
    cost: { cost_usd: 0, currency_original: 'USD', metered: false },
    reviewer: { decision: 'accepted', agent_id: 'talos', rationale: 'Cyberpunk Shanghai 16-frame atlas, neon grid floor, holo billboard accents, magenta-plus-cyan accent discipline per M2 world palette spec.' },
    local_file_paths: ['public/assets/worlds/cyberpunk_shanghai/atlas_32.png', 'public/assets/packs/cyberpunk_shanghai.atlas.json'],
    tags: ['procedural', 'opus', 'cyberpunk', '32x32', 'rv_primary'],
    external_request_id: null,
    supersedes_ledger_id: null,
  },
  {
    asset_id: 'proc-steampunk-victorian-atlas-32',
    event_kind: 'procedural_generate',
    source_key: 'opus_procedural_canvas',
    category: 'tileset',
    world_affinity: 'steampunk_victorian',
    license_id: 'original_mit',
    attribution_text: null,
    dimensions: { width_px: 128, height_px: 128, pixel_aspect: '1:1', color_depth_bits: 32 },
    generation: { prompt: null, seed: 0x4001, model_identifier: 'claude-opus-4-7', resolution_tier: null, thinking_level: 'high', enable_web_search: false, additional_flags: { script: 'scripts/build-atlases-32.mjs', frames: 16, tile_px: 32, canvas_px: 128 } },
    cost: { cost_usd: 0, currency_original: 'USD', metered: false },
    reviewer: { decision: 'accepted', agent_id: 'talos', rationale: 'Steampunk Victorian 16-frame atlas, clockwork gear motif, brass riveted plate, gaslit doorway. Steampunk coverage gap-filled since CC0 pool is weakest here.' },
    local_file_paths: ['public/assets/worlds/steampunk_victorian/atlas_32.png', 'public/assets/packs/steampunk_victorian.atlas.json'],
    tags: ['procedural', 'opus', 'steampunk', '32x32', 'rv_primary', 'gap_fill'],
    external_request_id: null,
    supersedes_ledger_id: null,
  },
  {
    asset_id: 'proc-svg-hud-frame-medieval',
    event_kind: 'procedural_generate',
    source_key: 'opus_procedural_svg',
    category: 'ui_chrome',
    world_affinity: 'medieval_desert',
    license_id: 'original_mit',
    attribution_text: null,
    dimensions: { width_px: 128, height_px: 96, pixel_aspect: '1:1', color_depth_bits: 32 },
    generation: { prompt: null, seed: null, model_identifier: 'claude-opus-4-7', resolution_tier: null, thinking_level: 'high', enable_web_search: false, additional_flags: { form_factor: 'dialog_frame', genre: 'medieval_brass' } },
    cost: { cost_usd: 0, currency_original: 'USD', metered: false },
    reviewer: { decision: 'accepted', agent_id: 'talos', rationale: 'Medieval HUD frame seed. Hesperus may author a higher-fidelity variant in Sub-Phase 3 and emit a supersede line.' },
    local_file_paths: ['public/assets/procedural/svg/hud_frame_medieval.svg'],
    tags: ['procedural', 'opus_svg', 'ui', 'medieval', 'hud_frame'],
    external_request_id: null,
    supersedes_ledger_id: null,
  },
  {
    asset_id: 'proc-svg-hud-frame-cyberpunk',
    event_kind: 'procedural_generate',
    source_key: 'opus_procedural_svg',
    category: 'ui_chrome',
    world_affinity: 'cyberpunk_shanghai',
    license_id: 'original_mit',
    attribution_text: null,
    dimensions: { width_px: 128, height_px: 96, pixel_aspect: '1:1', color_depth_bits: 32 },
    generation: { prompt: null, seed: null, model_identifier: 'claude-opus-4-7', resolution_tier: null, thinking_level: 'high', enable_web_search: false, additional_flags: { form_factor: 'dialog_frame', genre: 'cyberpunk_neon' } },
    cost: { cost_usd: 0, currency_original: 'USD', metered: false },
    reviewer: { decision: 'accepted', agent_id: 'talos', rationale: 'Cyberpunk HUD frame seed. Hesperus may supersede in Sub-Phase 3.' },
    local_file_paths: ['public/assets/procedural/svg/hud_frame_cyberpunk.svg'],
    tags: ['procedural', 'opus_svg', 'ui', 'cyberpunk', 'hud_frame'],
    external_request_id: null,
    supersedes_ledger_id: null,
  },
  {
    asset_id: 'proc-svg-hud-frame-steampunk',
    event_kind: 'procedural_generate',
    source_key: 'opus_procedural_svg',
    category: 'ui_chrome',
    world_affinity: 'steampunk_victorian',
    license_id: 'original_mit',
    attribution_text: null,
    dimensions: { width_px: 128, height_px: 96, pixel_aspect: '1:1', color_depth_bits: 32 },
    generation: { prompt: null, seed: null, model_identifier: 'claude-opus-4-7', resolution_tier: null, thinking_level: 'high', enable_web_search: false, additional_flags: { form_factor: 'dialog_frame', genre: 'steampunk_rivet' } },
    cost: { cost_usd: 0, currency_original: 'USD', metered: false },
    reviewer: { decision: 'accepted', agent_id: 'talos', rationale: 'Steampunk HUD frame seed with brass rivets. Hesperus may supersede in Sub-Phase 3.' },
    local_file_paths: ['public/assets/procedural/svg/hud_frame_steampunk.svg'],
    tags: ['procedural', 'opus_svg', 'ui', 'steampunk', 'hud_frame'],
    external_request_id: null,
    supersedes_ledger_id: null,
  },
  {
    asset_id: 'proc-svg-minimap-ring',
    event_kind: 'procedural_generate',
    source_key: 'opus_procedural_svg',
    category: 'ui_chrome',
    world_affinity: 'world_agnostic',
    license_id: 'original_mit',
    attribution_text: null,
    dimensions: { width_px: 96, height_px: 96, pixel_aspect: '1:1', color_depth_bits: 32 },
    generation: { prompt: null, seed: null, model_identifier: 'claude-opus-4-7', resolution_tier: null, thinking_level: 'high', enable_web_search: false, additional_flags: { form_factor: 'minimap_ring', genre: 'genre_neutral' } },
    cost: { cost_usd: 0, currency_original: 'USD', metered: false },
    reviewer: { decision: 'accepted', agent_id: 'talos', rationale: 'Genre-neutral minimap ring. Each world overlays its palette tint at runtime.' },
    local_file_paths: ['public/assets/procedural/svg/minimap_ring.svg'],
    tags: ['procedural', 'opus_svg', 'ui', 'minimap', 'neutral'],
    external_request_id: null,
    supersedes_ledger_id: null,
  },
  {
    asset_id: 'proc-svg-inventory-slot',
    event_kind: 'procedural_generate',
    source_key: 'opus_procedural_svg',
    category: 'ui_chrome',
    world_affinity: 'world_agnostic',
    license_id: 'original_mit',
    attribution_text: null,
    dimensions: { width_px: 48, height_px: 48, pixel_aspect: '1:1', color_depth_bits: 32 },
    generation: { prompt: null, seed: null, model_identifier: 'claude-opus-4-7', resolution_tier: null, thinking_level: 'high', enable_web_search: false, additional_flags: { form_factor: 'inventory_slot', genre: 'genre_neutral' } },
    cost: { cost_usd: 0, currency_original: 'USD', metered: false },
    reviewer: { decision: 'accepted', agent_id: 'talos', rationale: 'Genre-neutral 48x48 inventory slot. Erato-v2 inventory toast consumes this path via registry lookup.' },
    local_file_paths: ['public/assets/procedural/svg/inventory_slot.svg'],
    tags: ['procedural', 'opus_svg', 'ui', 'inventory', 'neutral'],
    external_request_id: null,
    supersedes_ledger_id: null,
  },
  {
    asset_id: 'proc-svg-nerium-logo-seed',
    event_kind: 'procedural_generate',
    source_key: 'opus_procedural_svg',
    category: 'icon',
    world_affinity: 'world_agnostic',
    license_id: 'original_mit',
    attribution_text: null,
    dimensions: { width_px: 192, height_px: 48, pixel_aspect: '1:1', color_depth_bits: 32 },
    generation: { prompt: null, seed: null, model_identifier: 'claude-opus-4-7', resolution_tier: null, thinking_level: 'high', enable_web_search: false, additional_flags: { form_factor: 'wordmark', genre: 'genre_neutral', supersede_expected: 'hesperus_sub_phase_3' } },
    cost: { cost_usd: 0, currency_original: 'USD', metered: false },
    reviewer: { decision: 'accepted', agent_id: 'talos', rationale: 'Logo baseline so downstream components have a working asset path. Hesperus authors the polished variant in Sub-Phase 3 and will emit a supersede line at that time.' },
    local_file_paths: ['public/assets/procedural/svg/nerium_logo.svg'],
    tags: ['procedural', 'opus_svg', 'icon', 'logo', 'seed'],
    external_request_id: null,
    supersedes_ledger_id: null,
  },
];

function assembleLine(entry) {
  const full = {
    ledger_id: randomUUID(),
    event_kind: entry.event_kind,
    occurred_at: SEED_TIME,
    asset_id: entry.asset_id,
    source_key: entry.source_key,
    category: entry.category,
    world_affinity: entry.world_affinity,
    license_id: entry.license_id,
    attribution_text: entry.attribution_text,
    dimensions: entry.dimensions,
    generation: entry.generation,
    cost: entry.cost,
    reviewer: {
      decision: entry.reviewer.decision,
      agent_id: entry.reviewer.agent_id,
      decided_at: SEED_TIME,
      rationale: entry.reviewer.rationale,
    },
    supersedes_ledger_id: entry.supersedes_ledger_id,
    external_request_id: entry.external_request_id,
    local_file_paths: entry.local_file_paths,
    tags: entry.tags,
  };
  return JSON.stringify(full);
}

function main() {
  mkdirSync(LEDGER_DIR, { recursive: true });

  const existing = existsSync(LEDGER_PATH) ? readFileSync(LEDGER_PATH, 'utf8').split('\n').filter(Boolean) : [];
  const knownAssetIds = new Set();
  for (const line of existing) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.asset_id) knownAssetIds.add(parsed.asset_id);
    } catch {
      // Ignore malformed lines.
    }
  }

  let appended = 0;
  for (const entry of entries) {
    if (knownAssetIds.has(entry.asset_id)) continue;
    appendFileSync(LEDGER_PATH, assembleLine(entry) + '\n', 'utf8');
    appended += 1;
  }
  console.log(`[seed-asset-ledger] appended ${appended} new entries to ${LEDGER_PATH}`);
  console.log(`[seed-asset-ledger] ledger now holds ${existing.length + appended} total lines`);
}

main();
