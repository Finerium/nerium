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
// PATH REGISTRY (key -> Next.js public asset URL)
// ============================================================================

/**
 * Maps every asset key to its served URL under Next.js `public/`. The actual
 * files live at `_Reference/ai_generated_assets/...` and are mirrored to
 * `public/assets/ai/...` via per-category relative symlinks (created in S1).
 *
 * Format flexibility lock: extensions match the actual on-disk filename. Some
 * stems are .png (transparent), some are .jpg (full bg context). Do not
 * normalize extensions; consumers of `ASSET_PATHS` get the served URL.
 */
export const ASSET_PATHS: Readonly<Record<AssetKey, string>> = Object.freeze({
  // ---- backgrounds (13, all .jpg) ----
  apollo_village_bg: '/assets/ai/backgrounds/apollo_village_bg.jpg',
  apollo_marketplace_bazaar: '/assets/ai/backgrounds/apollo_marketplace_bazaar.jpg',
  apollo_oasis: '/assets/ai/backgrounds/apollo_oasis.jpg',
  apollo_temple_interior: '/assets/ai/backgrounds/apollo_temple_interior.jpg',
  caravan_road_bg: '/assets/ai/backgrounds/caravan_road_bg.jpg',
  caravan_forest_crossroad: '/assets/ai/backgrounds/caravan_forest_crossroad.jpg',
  caravan_mountain_pass: '/assets/ai/backgrounds/caravan_mountain_pass.jpg',
  caravan_wayhouse_interior: '/assets/ai/backgrounds/caravan_wayhouse_interior.jpg',
  cyberpunk_shanghai_bg: '/assets/ai/backgrounds/cyberpunk_shanghai_bg.jpg',
  cyber_underground_alley: '/assets/ai/backgrounds/cyber_underground_alley.jpg',
  cyber_rooftop: '/assets/ai/backgrounds/cyber_rooftop.jpg',
  cyber_skyscraper_lobby: '/assets/ai/backgrounds/cyber_skyscraper_lobby.jpg',
  cyber_server_room: '/assets/ai/backgrounds/cyber_server_room.jpg',

  // ---- characters (13, all .png; spritesheets handled by SPRITESHEET_FRAMES) ----
  player_portrait: '/assets/ai/characters/player_portrait.png',
  apollo: '/assets/ai/characters/apollo.png',
  apollo_portrait: '/assets/ai/characters/apollo_portrait.png',
  caravan_vendor: '/assets/ai/characters/caravan_vendor.png',
  synth_vendor: '/assets/ai/characters/synth_vendor.png',
  synth_vendor_portrait: '/assets/ai/characters/synth_vendor_portrait.png',
  treasurer: '/assets/ai/characters/treasurer.png',
  treasurer_portrait: '/assets/ai/characters/treasurer_portrait.png',
  player_spritesheet: '/assets/ai/characters/player_spritesheet.png',
  apollo_spritesheet: '/assets/ai/characters/apollo_spritesheet.png',
  caravan_vendor_spritesheet: '/assets/ai/characters/caravan_vendor_spritesheet.png',
  synth_vendor_spritesheet: '/assets/ai/characters/synth_vendor_spritesheet.png',
  treasurer_spritesheet: '/assets/ai/characters/treasurer_spritesheet.png',

  // ---- overlays (2, all .png) ----
  autumn_leaves: '/assets/ai/overlays/autumn_leaves.png',
  smog_wisps: '/assets/ai/overlays/smog_wisps.png',

  // ---- props apollo_village (16, all .png) ----
  apollo_house_filler: '/assets/ai/props/apollo_village/apollo_house_filler.png',
  apollo_ruined_shrine: '/assets/ai/props/apollo_village/apollo_ruined_shrine.png',
  apollo_temple_altar: '/assets/ai/props/apollo_village/apollo_temple_altar.png',
  builder_workshop_landmark: '/assets/ai/props/apollo_village/builder_workshop_landmark.png',
  cypress_tree: '/assets/ai/props/apollo_village/cypress_tree.png',
  date_palm_cluster: '/assets/ai/props/apollo_village/date_palm_cluster.png',
  hanging_lantern: '/assets/ai/props/apollo_village/hanging_lantern.png',
  market_stall: '/assets/ai/props/apollo_village/market_stall.png',
  marketplace_stall_landmark: '/assets/ai/props/apollo_village/marketplace_stall_landmark.png',
  registry_pillar_landmark: '/assets/ai/props/apollo_village/registry_pillar_landmark.png',
  stone_column: '/assets/ai/props/apollo_village/stone_column.png',
  stone_signpost: '/assets/ai/props/apollo_village/stone_signpost.png',
  stone_well: '/assets/ai/props/apollo_village/stone_well.png',
  temple_arch: '/assets/ai/props/apollo_village/temple_arch.png',
  trust_shrine_landmark: '/assets/ai/props/apollo_village/trust_shrine_landmark.png',
  wooden_cart: '/assets/ai/props/apollo_village/wooden_cart.png',

  // ---- props caravan_road (11; 10 .png + 1 .jpg cobblestone_tile) ----
  campfire_ring: '/assets/ai/props/caravan_road/campfire_ring.png',
  caravan_fireplace: '/assets/ai/props/caravan_road/caravan_fireplace.png',
  caravan_rope_bridge: '/assets/ai/props/caravan_road/caravan_rope_bridge.png',
  caravan_tavern_table: '/assets/ai/props/caravan_road/caravan_tavern_table.png',
  caravan_wayhouse_filler: '/assets/ai/props/caravan_road/caravan_wayhouse_filler.png',
  cobblestone_tile: '/assets/ai/props/caravan_road/cobblestone_tile.jpg',
  fallen_log: '/assets/ai/props/caravan_road/fallen_log.png',
  lantern_post: '/assets/ai/props/caravan_road/lantern_post.png',
  roadside_signpost: '/assets/ai/props/caravan_road/roadside_signpost.png',
  wooden_barrel: '/assets/ai/props/caravan_road/wooden_barrel.png',
  wooden_wagon: '/assets/ai/props/caravan_road/wooden_wagon.png',

  // ---- props cyberpunk_shanghai (26, all .png) ----
  admin_hall_landmark: '/assets/ai/props/cyberpunk_shanghai/admin_hall_landmark.png',
  bank_treasury_landmark: '/assets/ai/props/cyberpunk_shanghai/bank_treasury_landmark.png',
  crate_stack: '/assets/ai/props/cyberpunk_shanghai/crate_stack.png',
  cyber_apartment_filler: '/assets/ai/props/cyberpunk_shanghai/cyber_apartment_filler.png',
  cyber_billboard_closeup: '/assets/ai/props/cyberpunk_shanghai/cyber_billboard_closeup.png',
  cyber_chrome_sculpture: '/assets/ai/props/cyberpunk_shanghai/cyber_chrome_sculpture.png',
  cyber_data_terminal: '/assets/ai/props/cyberpunk_shanghai/cyber_data_terminal.png',
  cyber_elevator_door: '/assets/ai/props/cyberpunk_shanghai/cyber_elevator_door.png',
  cyber_industrial_pipe: '/assets/ai/props/cyberpunk_shanghai/cyber_industrial_pipe.png',
  cyber_lantern: '/assets/ai/props/cyberpunk_shanghai/cyber_lantern.png',
  cyber_marketplace_landmark: '/assets/ai/props/cyberpunk_shanghai/cyber_marketplace_landmark.png',
  cyber_reception_desk: '/assets/ai/props/cyberpunk_shanghai/cyber_reception_desk.png',
  cyber_server_rack: '/assets/ai/props/cyberpunk_shanghai/cyber_server_rack.png',
  drone: '/assets/ai/props/cyberpunk_shanghai/drone.png',
  holo_ad_panel: '/assets/ai/props/cyberpunk_shanghai/holo_ad_panel.png',
  hologram_glitch: '/assets/ai/props/cyberpunk_shanghai/hologram_glitch.png',
  laundry_line: '/assets/ai/props/cyberpunk_shanghai/laundry_line.png',
  neon_market_stall: '/assets/ai/props/cyberpunk_shanghai/neon_market_stall.png',
  neon_sign_vertical: '/assets/ai/props/cyberpunk_shanghai/neon_sign_vertical.png',
  protocol_gateway_landmark: '/assets/ai/props/cyberpunk_shanghai/protocol_gateway_landmark.png',
  refrigerator: '/assets/ai/props/cyberpunk_shanghai/refrigerator.png',
  steam_vent: '/assets/ai/props/cyberpunk_shanghai/steam_vent.png',
  synth_vendor_cart: '/assets/ai/props/cyberpunk_shanghai/synth_vendor_cart.png',
  trash_bin: '/assets/ai/props/cyberpunk_shanghai/trash_bin.png',
  vendor_cart_alt: '/assets/ai/props/cyberpunk_shanghai/vendor_cart_alt.png',
  wet_puddle: '/assets/ai/props/cyberpunk_shanghai/wet_puddle.png',

  // ---- ui icons (7, all .png) ----
  category_agent: '/assets/ai/ui/icons/category_agent.png',
  category_dataset: '/assets/ai/ui/icons/category_dataset.png',
  category_pipeline: '/assets/ai/ui/icons/category_pipeline.png',
  category_plugin: '/assets/ai/ui/icons/category_plugin.png',
  category_prompt_template: '/assets/ai/ui/icons/category_prompt_template.png',
  category_skill: '/assets/ai/ui/icons/category_skill.png',
  category_tileset: '/assets/ai/ui/icons/category_tileset.png',

  // ---- ui loading + transitions (3, all .jpg) ----
  loading_screen: '/assets/ai/ui/loading/loading_screen.jpg',
  transition_apollo_to_caravan: '/assets/ai/ui/loading/transition_apollo_to_caravan.jpg',
  transition_caravan_to_cyber: '/assets/ai/ui/loading/transition_caravan_to_cyber.jpg',

  // ---- ui marketplace (2; 1 .png + 1 .jpg) ----
  marketplace_empty_state: '/assets/ai/ui/marketplace/marketplace_empty_state.png',
  marketplace_hero_banner: '/assets/ai/ui/marketplace/marketplace_hero_banner.jpg',

  // ---- ui quest (2, all .png) ----
  quest_exclamation: '/assets/ai/ui/quest/quest_exclamation.png',
  quest_question: '/assets/ai/ui/quest/quest_question.png',

  // ---- ui title (1, .jpg) ----
  title_screen: '/assets/ai/ui/title/title_screen.jpg',
});

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
