//
// src/game/visual/asset_keys.ts
//
// Helios-v2 W3 S1: type-safe Phaser texture key registry for all 96 active
// AI-generated assets shipped at `_Reference/ai_generated_assets/` (mirrored to
// `public/assets/ai/` via symlinks for Next.js dev + build serving).
//
// Authority: V6 Ghaisan asset bundle SHA c74547f, 96 active assets total
// (77 PNG transparent + 19 JPG full-bg per V6 format flexibility lock).
// Archive folder `_archive/` is OFF LIMITS and not referenced from active code.
//
// Per S1 directive Section 3, scene authors consume textures by typed key
// rather than by string path. The constant tree groups keys by category to
// match the source folder layout, and the AssetKey type union derives from
// the value space so Phaser API call sites get compile-time safety:
//
//   import { ASSET_KEYS } from '@/game/visual/asset_keys';
//   this.load.image(ASSET_KEYS.backgrounds.apollo_village_bg, ...);
//   this.add.image(x, y, ASSET_KEYS.props.apollo_village.stone_well);
//
// Spritesheet entries are documented separately at SPRITESHEET_FRAMES below.
// Static images and spritesheets share the same flat key space because Phaser
// stores both as TextureManager entries; the load type (image vs spritesheet)
// is the differentiator, not the key.
//
// Format flexibility lock per S1 directive Section 2: whatever file extension
// exists per stem in active subtree is FINAL. Some stems are .png, some .jpg.
// The PATHS map below pairs each key to the actual on-disk path.
//
// dust_motes stem CUT entirely V6, NOT in registry. Apollo dust effect is
// handled by Phaser particle emitter (AmbientFxKind.sand) in S2 with no PNG.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

// ============================================================================
// CATEGORY KEY REGISTRY
// ============================================================================

/**
 * All 96 active AI-asset texture keys grouped by source folder. Keys mirror
 * the asset stem (filename without extension) so a stem rename in source
 * triggers a typed compile error here that bubbles to all consumers.
 */
export const ASSET_KEYS = {
  backgrounds: {
    apollo_village_bg: 'apollo_village_bg',
    apollo_marketplace_bazaar: 'apollo_marketplace_bazaar',
    apollo_oasis: 'apollo_oasis',
    apollo_temple_interior: 'apollo_temple_interior',
    caravan_road_bg: 'caravan_road_bg',
    caravan_forest_crossroad: 'caravan_forest_crossroad',
    caravan_mountain_pass: 'caravan_mountain_pass',
    caravan_wayhouse_interior: 'caravan_wayhouse_interior',
    cyberpunk_shanghai_bg: 'cyberpunk_shanghai_bg',
    cyber_underground_alley: 'cyber_underground_alley',
    cyber_rooftop: 'cyber_rooftop',
    cyber_skyscraper_lobby: 'cyber_skyscraper_lobby',
    cyber_server_room: 'cyber_server_room',
  },
  characters: {
    // Static single-pose PNGs (use this.load.image)
    player_portrait: 'player_portrait',
    apollo: 'apollo',
    apollo_portrait: 'apollo_portrait',
    caravan_vendor: 'caravan_vendor',
    synth_vendor: 'synth_vendor',
    synth_vendor_portrait: 'synth_vendor_portrait',
    treasurer: 'treasurer',
    treasurer_portrait: 'treasurer_portrait',
    // Spritesheet 4x4 grid 2048x2048, frame 512x512 (use this.load.spritesheet)
    player_spritesheet: 'player_spritesheet',
    apollo_spritesheet: 'apollo_spritesheet',
    caravan_vendor_spritesheet: 'caravan_vendor_spritesheet',
    synth_vendor_spritesheet: 'synth_vendor_spritesheet',
    treasurer_spritesheet: 'treasurer_spritesheet',
  },
  overlays: {
    autumn_leaves: 'autumn_leaves',
    smog_wisps: 'smog_wisps',
  },
  props: {
    apollo_village: {
      apollo_house_filler: 'apollo_house_filler',
      apollo_ruined_shrine: 'apollo_ruined_shrine',
      apollo_temple_altar: 'apollo_temple_altar',
      builder_workshop_landmark: 'builder_workshop_landmark',
      cypress_tree: 'cypress_tree',
      date_palm_cluster: 'date_palm_cluster',
      hanging_lantern: 'hanging_lantern',
      market_stall: 'market_stall',
      marketplace_stall_landmark: 'marketplace_stall_landmark',
      registry_pillar_landmark: 'registry_pillar_landmark',
      stone_column: 'stone_column',
      stone_signpost: 'stone_signpost',
      stone_well: 'stone_well',
      temple_arch: 'temple_arch',
      trust_shrine_landmark: 'trust_shrine_landmark',
      wooden_cart: 'wooden_cart',
    },
    caravan_road: {
      campfire_ring: 'campfire_ring',
      caravan_fireplace: 'caravan_fireplace',
      caravan_rope_bridge: 'caravan_rope_bridge',
      caravan_tavern_table: 'caravan_tavern_table',
      caravan_wayhouse_filler: 'caravan_wayhouse_filler',
      cobblestone_tile: 'cobblestone_tile',
      fallen_log: 'fallen_log',
      lantern_post: 'lantern_post',
      roadside_signpost: 'roadside_signpost',
      wooden_barrel: 'wooden_barrel',
      wooden_wagon: 'wooden_wagon',
    },
    cyberpunk_shanghai: {
      admin_hall_landmark: 'admin_hall_landmark',
      bank_treasury_landmark: 'bank_treasury_landmark',
      crate_stack: 'crate_stack',
      cyber_apartment_filler: 'cyber_apartment_filler',
      cyber_billboard_closeup: 'cyber_billboard_closeup',
      cyber_chrome_sculpture: 'cyber_chrome_sculpture',
      cyber_data_terminal: 'cyber_data_terminal',
      cyber_elevator_door: 'cyber_elevator_door',
      cyber_industrial_pipe: 'cyber_industrial_pipe',
      cyber_lantern: 'cyber_lantern',
      cyber_marketplace_landmark: 'cyber_marketplace_landmark',
      cyber_reception_desk: 'cyber_reception_desk',
      cyber_server_rack: 'cyber_server_rack',
      drone: 'drone',
      holo_ad_panel: 'holo_ad_panel',
      hologram_glitch: 'hologram_glitch',
      laundry_line: 'laundry_line',
      neon_market_stall: 'neon_market_stall',
      neon_sign_vertical: 'neon_sign_vertical',
      protocol_gateway_landmark: 'protocol_gateway_landmark',
      refrigerator: 'refrigerator',
      steam_vent: 'steam_vent',
      synth_vendor_cart: 'synth_vendor_cart',
      trash_bin: 'trash_bin',
      vendor_cart_alt: 'vendor_cart_alt',
      wet_puddle: 'wet_puddle',
    },
  },
  ui: {
    icons: {
      category_agent: 'category_agent',
      category_dataset: 'category_dataset',
      category_pipeline: 'category_pipeline',
      category_plugin: 'category_plugin',
      category_prompt_template: 'category_prompt_template',
      category_skill: 'category_skill',
      category_tileset: 'category_tileset',
    },
    loading: {
      loading_screen: 'loading_screen',
      transition_apollo_to_caravan: 'transition_apollo_to_caravan',
      transition_caravan_to_cyber: 'transition_caravan_to_cyber',
    },
    marketplace: {
      marketplace_empty_state: 'marketplace_empty_state',
      marketplace_hero_banner: 'marketplace_hero_banner',
    },
    quest: {
      quest_exclamation: 'quest_exclamation',
      quest_question: 'quest_question',
    },
    title: {
      title_screen: 'title_screen',
    },
  },
} as const;

// ============================================================================
// PATH REGISTRY (key -> manifest stem)
// ============================================================================

/**
 * Aether-Vercel T6 Phase 1.7.4: previously this map carried `/assets/ai/...`
 * paths served via per-category symlinks under `public/assets/ai/`. The
 * 369 MB asset bundle pushed the Lambda function past the 500 MB ephemeral
 * storage limit on Vercel, so the assets were migrated to Vercel Blob (1 GB
 * free tier, region iad1, matches Neon Postgres region). The migration
 * script `scripts/upload-assets-to-blob.ts` emits `public/asset_manifest.json`
 * mapping stem (relative path without extension) to the public blob URL.
 *
 * Each `ASSET_PATHS` entry is now a manifest stem like
 * `backgrounds/apollo_village_bg`, NOT a runtime URL. Consumers must call
 * `assetUrl(key)` to resolve a key to the served blob URL after the manifest
 * has been loaded (BootScene loads it via `this.load.json('asset_manifest',
 * '/asset_manifest.json')` and calls `setManifestFromCache()`).
 *
 * Format flexibility lock per S1 directive: stems are extension-free so the
 * manifest entry can carry the actual content type. Some on-disk files are
 * .png (transparent), some .jpg (full bg context). The blob URL preserves the
 * original extension.
 */
export const ASSET_PATHS: Readonly<Record<AssetKey, string>> = Object.freeze({
  // ---- backgrounds (13) ----
  apollo_village_bg: 'backgrounds/apollo_village_bg',
  apollo_marketplace_bazaar: 'backgrounds/apollo_marketplace_bazaar',
  apollo_oasis: 'backgrounds/apollo_oasis',
  apollo_temple_interior: 'backgrounds/apollo_temple_interior',
  caravan_road_bg: 'backgrounds/caravan_road_bg',
  caravan_forest_crossroad: 'backgrounds/caravan_forest_crossroad',
  caravan_mountain_pass: 'backgrounds/caravan_mountain_pass',
  caravan_wayhouse_interior: 'backgrounds/caravan_wayhouse_interior',
  cyberpunk_shanghai_bg: 'backgrounds/cyberpunk_shanghai_bg',
  cyber_underground_alley: 'backgrounds/cyber_underground_alley',
  cyber_rooftop: 'backgrounds/cyber_rooftop',
  cyber_skyscraper_lobby: 'backgrounds/cyber_skyscraper_lobby',
  cyber_server_room: 'backgrounds/cyber_server_room',

  // ---- characters (13; spritesheets handled by SPRITESHEET_FRAMES) ----
  player_portrait: 'characters/player_portrait',
  apollo: 'characters/apollo',
  apollo_portrait: 'characters/apollo_portrait',
  caravan_vendor: 'characters/caravan_vendor',
  synth_vendor: 'characters/synth_vendor',
  synth_vendor_portrait: 'characters/synth_vendor_portrait',
  treasurer: 'characters/treasurer',
  treasurer_portrait: 'characters/treasurer_portrait',
  player_spritesheet: 'characters/player_spritesheet',
  apollo_spritesheet: 'characters/apollo_spritesheet',
  caravan_vendor_spritesheet: 'characters/caravan_vendor_spritesheet',
  synth_vendor_spritesheet: 'characters/synth_vendor_spritesheet',
  treasurer_spritesheet: 'characters/treasurer_spritesheet',

  // ---- overlays (2) ----
  autumn_leaves: 'overlays/autumn_leaves',
  smog_wisps: 'overlays/smog_wisps',

  // ---- props apollo_village (16) ----
  apollo_house_filler: 'props/apollo_village/apollo_house_filler',
  apollo_ruined_shrine: 'props/apollo_village/apollo_ruined_shrine',
  apollo_temple_altar: 'props/apollo_village/apollo_temple_altar',
  builder_workshop_landmark: 'props/apollo_village/builder_workshop_landmark',
  cypress_tree: 'props/apollo_village/cypress_tree',
  date_palm_cluster: 'props/apollo_village/date_palm_cluster',
  hanging_lantern: 'props/apollo_village/hanging_lantern',
  market_stall: 'props/apollo_village/market_stall',
  marketplace_stall_landmark: 'props/apollo_village/marketplace_stall_landmark',
  registry_pillar_landmark: 'props/apollo_village/registry_pillar_landmark',
  stone_column: 'props/apollo_village/stone_column',
  stone_signpost: 'props/apollo_village/stone_signpost',
  stone_well: 'props/apollo_village/stone_well',
  temple_arch: 'props/apollo_village/temple_arch',
  trust_shrine_landmark: 'props/apollo_village/trust_shrine_landmark',
  wooden_cart: 'props/apollo_village/wooden_cart',

  // ---- props caravan_road (11) ----
  campfire_ring: 'props/caravan_road/campfire_ring',
  caravan_fireplace: 'props/caravan_road/caravan_fireplace',
  caravan_rope_bridge: 'props/caravan_road/caravan_rope_bridge',
  caravan_tavern_table: 'props/caravan_road/caravan_tavern_table',
  caravan_wayhouse_filler: 'props/caravan_road/caravan_wayhouse_filler',
  cobblestone_tile: 'props/caravan_road/cobblestone_tile',
  fallen_log: 'props/caravan_road/fallen_log',
  lantern_post: 'props/caravan_road/lantern_post',
  roadside_signpost: 'props/caravan_road/roadside_signpost',
  wooden_barrel: 'props/caravan_road/wooden_barrel',
  wooden_wagon: 'props/caravan_road/wooden_wagon',

  // ---- props cyberpunk_shanghai (26) ----
  admin_hall_landmark: 'props/cyberpunk_shanghai/admin_hall_landmark',
  bank_treasury_landmark: 'props/cyberpunk_shanghai/bank_treasury_landmark',
  crate_stack: 'props/cyberpunk_shanghai/crate_stack',
  cyber_apartment_filler: 'props/cyberpunk_shanghai/cyber_apartment_filler',
  cyber_billboard_closeup: 'props/cyberpunk_shanghai/cyber_billboard_closeup',
  cyber_chrome_sculpture: 'props/cyberpunk_shanghai/cyber_chrome_sculpture',
  cyber_data_terminal: 'props/cyberpunk_shanghai/cyber_data_terminal',
  cyber_elevator_door: 'props/cyberpunk_shanghai/cyber_elevator_door',
  cyber_industrial_pipe: 'props/cyberpunk_shanghai/cyber_industrial_pipe',
  cyber_lantern: 'props/cyberpunk_shanghai/cyber_lantern',
  cyber_marketplace_landmark: 'props/cyberpunk_shanghai/cyber_marketplace_landmark',
  cyber_reception_desk: 'props/cyberpunk_shanghai/cyber_reception_desk',
  cyber_server_rack: 'props/cyberpunk_shanghai/cyber_server_rack',
  drone: 'props/cyberpunk_shanghai/drone',
  holo_ad_panel: 'props/cyberpunk_shanghai/holo_ad_panel',
  hologram_glitch: 'props/cyberpunk_shanghai/hologram_glitch',
  laundry_line: 'props/cyberpunk_shanghai/laundry_line',
  neon_market_stall: 'props/cyberpunk_shanghai/neon_market_stall',
  neon_sign_vertical: 'props/cyberpunk_shanghai/neon_sign_vertical',
  protocol_gateway_landmark: 'props/cyberpunk_shanghai/protocol_gateway_landmark',
  refrigerator: 'props/cyberpunk_shanghai/refrigerator',
  steam_vent: 'props/cyberpunk_shanghai/steam_vent',
  synth_vendor_cart: 'props/cyberpunk_shanghai/synth_vendor_cart',
  trash_bin: 'props/cyberpunk_shanghai/trash_bin',
  vendor_cart_alt: 'props/cyberpunk_shanghai/vendor_cart_alt',
  wet_puddle: 'props/cyberpunk_shanghai/wet_puddle',

  // ---- ui icons (7) ----
  category_agent: 'ui/icons/category_agent',
  category_dataset: 'ui/icons/category_dataset',
  category_pipeline: 'ui/icons/category_pipeline',
  category_plugin: 'ui/icons/category_plugin',
  category_prompt_template: 'ui/icons/category_prompt_template',
  category_skill: 'ui/icons/category_skill',
  category_tileset: 'ui/icons/category_tileset',

  // ---- ui loading + transitions (3) ----
  loading_screen: 'ui/loading/loading_screen',
  transition_apollo_to_caravan: 'ui/loading/transition_apollo_to_caravan',
  transition_caravan_to_cyber: 'ui/loading/transition_caravan_to_cyber',

  // ---- ui marketplace (2) ----
  marketplace_empty_state: 'ui/marketplace/marketplace_empty_state',
  marketplace_hero_banner: 'ui/marketplace/marketplace_hero_banner',

  // ---- ui quest (2) ----
  quest_exclamation: 'ui/quest/quest_exclamation',
  quest_question: 'ui/quest/quest_question',

  // ---- ui title (1) ----
  title_screen: 'ui/title/title_screen',
});

// ============================================================================
// MANIFEST RESOLVER (stem -> blob URL via loaded manifest)
// ============================================================================

/**
 * Aether-Vercel T6 Phase 1.7.4: shape of one entry in
 * `public/asset_manifest.json` produced by `scripts/upload-assets-to-blob.ts`.
 */
export interface AssetManifestEntry {
  stem: string;
  url: string;
  size: number;
  contentType: string;
}

/**
 * Module-scoped cache for the loaded manifest. Populated by
 * `setAssetManifest` (called once from BootScene after Phaser loads
 * `/asset_manifest.json` as a JSON asset). Subsequent calls are idempotent.
 */
let MANIFEST: Readonly<Record<string, AssetManifestEntry>> | null = null;

/**
 * Install the manifest map from a parsed JSON object. Idempotent: a second
 * call with the same object is a no-op; a different object replaces the
 * previous map (used by hot reload + tests). Throws on null/undefined.
 */
export function setAssetManifest(
  m: Record<string, AssetManifestEntry> | null | undefined,
): void {
  if (!m || typeof m !== 'object') {
    throw new Error('setAssetManifest called with non-object payload');
  }
  MANIFEST = Object.freeze(m);
}

/**
 * Returns true after the manifest has been installed. Phaser scenes that load
 * during the very first paint should consult this gate before invoking
 * `assetUrl()` to surface useful error messages.
 */
export function isAssetManifestReady(): boolean {
  return MANIFEST !== null;
}

/**
 * Resolves a typed `AssetKey` (e.g. `apollo_village_bg`) to the served blob
 * URL via the manifest stem stored in `ASSET_PATHS`. Throws with a precise
 * message when the manifest is absent or the stem is missing so misconfig
 * is loud rather than silent (a missing texture in Phaser surfaces as the
 * default green-stripe placeholder which is unhelpful at debug time).
 */
export function assetUrl(key: AssetKey): string {
  if (MANIFEST === null) {
    throw new Error(
      `assetUrl(${key}) called before asset manifest loaded. ` +
        'Ensure BootScene loads /asset_manifest.json and calls setAssetManifest() ' +
        'before any subsequent scene runs preload().',
    );
  }
  const stem = ASSET_PATHS[key];
  const entry = MANIFEST[stem];
  if (!entry) {
    throw new Error(
      `assetUrl(${key}) found no manifest entry for stem "${stem}". ` +
        'Verify scripts/upload-assets-to-blob.ts produced public/asset_manifest.json ' +
        'and the stem in ASSET_PATHS matches a key in the manifest.',
    );
  }
  return entry.url;
}

// ============================================================================
// SPRITESHEET FRAME METADATA
// ============================================================================

/**
 * Spritesheet frame dimensions for the 5 character walk-cycle sheets.
 * Source files are 2048x2048 RGBA PNG, layout 4 rows x 4 columns = 16 frames.
 * Frame size 512x512. Phaser config:
 *
 *   this.load.spritesheet(
 *     ASSET_KEYS.characters.player_spritesheet,
 *     ASSET_PATHS.player_spritesheet,
 *     SPRITESHEET_FRAMES.player_spritesheet,
 *   );
 *
 * Runtime scale (e.g. setScale(0.0625) for 32px or 0.125 for 64px) is
 * scene-author choice and is not part of this metadata.
 */
export const SPRITESHEET_FRAMES = {
  player_spritesheet: { frameWidth: 512, frameHeight: 512 },
  apollo_spritesheet: { frameWidth: 512, frameHeight: 512 },
  caravan_vendor_spritesheet: { frameWidth: 512, frameHeight: 512 },
  synth_vendor_spritesheet: { frameWidth: 512, frameHeight: 512 },
  treasurer_spritesheet: { frameWidth: 512, frameHeight: 512 },
} as const;

export type SpritesheetKey = keyof typeof SPRITESHEET_FRAMES;

// ============================================================================
// TYPE UNION + HELPERS
// ============================================================================

/**
 * Recursive flattener: gather every leaf string value from a nested const
 * object into a string union type. Used to derive AssetKey from ASSET_KEYS.
 */
type Leaves<T> = T extends string
  ? T
  : T extends Record<string, unknown>
    ? { [K in keyof T]: Leaves<T[K]> }[keyof T]
    : never;

/**
 * Union of every Phaser texture key registered. Use as the parameter type for
 * any consumer that accepts an asset key:
 *
 *   function loadStaticImage(scene: Phaser.Scene, key: AssetKey): void { ... }
 */
export type AssetKey = Leaves<typeof ASSET_KEYS>;

/**
 * Flat list of every key in registration order. Used by the BootScene preload
 * loop and by the unit test for count assertion.
 */
export const ALL_ASSET_KEYS: readonly AssetKey[] = Object.freeze(
  Object.keys(ASSET_PATHS) as AssetKey[],
);

/**
 * Subset filter: keys that should be loaded with this.load.spritesheet rather
 * than this.load.image. Keys NOT in this set are loaded as static images.
 */
export const SPRITESHEET_KEYS: readonly SpritesheetKey[] = Object.freeze(
  Object.keys(SPRITESHEET_FRAMES) as SpritesheetKey[],
);

/**
 * Type guard: returns true if the given key should be loaded as a spritesheet.
 */
export function isSpritesheetKey(key: AssetKey): key is SpritesheetKey {
  return (SPRITESHEET_KEYS as readonly string[]).includes(key);
}
