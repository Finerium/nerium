//
// src/lib/marketplace/pixel_art_assets.ts
//
// T7 (2026-04-26). Manifest of 15 Apollo Village night-themed pixel-art
// assets newly generated for Builder + Marketplace web routes. Sourced
// from `_Reference/ai_generated_assets/marketplace/` then downsized via
// macOS sips during the T7 commit (5504x3072 originals to 1600px max
// dimension at JPEG quality 70 to 86) so total bundle impact stays under
// 2 MB. Every asset is referenced from CSS background-image declarations
// in `src/styles/marketplace-pixel-art.css` and `src/styles/builder-pixel-art.css`.
//
// Brand consistency anchor: matches the in-game `/play` JRPG aesthetic
// shipped by Helios-v2 (Apollo Village night ambiance, warm fire glow,
// deep blue night, earth tones). NOT cyberpunk Shanghai. The web routes
// share visual DNA with the game world so the meta-narrative (web
// companion view + primary product surface in-game) reads as one product.
//
// All paths absolute from public/. Vercel CDN serves direct.
//

export const MARKETPLACE_PIXEL_ART = {
  shop_interior_bg: '/marketplace-assets/marketplace_shop_interior_bg.jpg',
  listing_card_frame: '/marketplace-assets/marketplace_listing_card_frame.jpg',
  buy_button_normal: '/marketplace-assets/marketplace_buy_button_normal.jpg',
  buy_button_hover: '/marketplace-assets/marketplace_buy_button_hover.jpg',
  category_tab_skill: '/marketplace-assets/marketplace_category_tab_skill.jpg',
  category_tab_agent: '/marketplace-assets/marketplace_category_tab_agent.jpg',
  category_tab_dataset:
    '/marketplace-assets/marketplace_category_tab_dataset.jpg',
  search_bar_frame: '/marketplace-assets/marketplace_search_bar_frame.jpg',
} as const;

export const BUILDER_PIXEL_ART = {
  workshop_interior_bg: '/marketplace-assets/builder_workshop_interior_bg.jpg',
  agent_node_frame: '/marketplace-assets/builder_agent_node_frame.jpg',
  agent_structure_graph_bg:
    '/marketplace-assets/builder_agent_structure_graph_bg.jpg',
  vendor_badge_anthropic:
    '/marketplace-assets/builder_vendor_badge_anthropic.jpg',
  vendor_badge_google: '/marketplace-assets/builder_vendor_badge_google.jpg',
  spawn_terminal_frame: '/marketplace-assets/builder_spawn_terminal_frame.jpg',
  complete_celebration_overlay:
    '/marketplace-assets/builder_complete_celebration_overlay.jpg',
} as const;

export type MarketplacePixelArtKey = keyof typeof MARKETPLACE_PIXEL_ART;
export type BuilderPixelArtKey = keyof typeof BUILDER_PIXEL_ART;

//
// Vendor badge fallback table for the 6 vendors without dedicated assets.
// Anthropic + Google have hand-crafted brass medallion badges. The remaining
// six render the Anthropic medallion as a base layer with a CSS hue-rotate
// + tint blend so each vendor reads distinct without requiring 6 additional
// asset generations during the hackathon time budget.
//
// Time discipline rationale: NarasiGhaisan Section 8 demo philosophy puts
// visual + business priority above per-asset perfection. The brass medallion
// silhouette already communicates "vendor badge" semantically; tinted
// variants preserve the read at zero asset cost.
//

export interface VendorBadgeStyle {
  readonly base_image: string;
  readonly tint_hue_deg: number;
  readonly tint_color: string;
  readonly label: string;
}

export const VENDOR_BADGE_STYLES: Record<string, VendorBadgeStyle> = {
  anthropic: {
    base_image: BUILDER_PIXEL_ART.vendor_badge_anthropic,
    tint_hue_deg: 0,
    tint_color: 'transparent',
    label: 'Anthropic',
  },
  google: {
    base_image: BUILDER_PIXEL_ART.vendor_badge_google,
    tint_hue_deg: 0,
    tint_color: 'transparent',
    label: 'Google',
  },
  openai: {
    base_image: BUILDER_PIXEL_ART.vendor_badge_anthropic,
    tint_hue_deg: 30,
    tint_color: 'oklch(0.95 0.01 85 / 0.35)',
    label: 'OpenAI',
  },
  higgsfield: {
    base_image: BUILDER_PIXEL_ART.vendor_badge_anthropic,
    tint_hue_deg: 280,
    tint_color: 'oklch(0.65 0.27 330 / 0.42)',
    label: 'Higgsfield',
  },
  seedance: {
    base_image: BUILDER_PIXEL_ART.vendor_badge_anthropic,
    tint_hue_deg: 250,
    tint_color: 'oklch(0.55 0.22 295 / 0.42)',
    label: 'Seedance',
  },
  meta: {
    base_image: BUILDER_PIXEL_ART.vendor_badge_anthropic,
    tint_hue_deg: 200,
    tint_color: 'oklch(0.45 0.18 260 / 0.45)',
    label: 'Meta',
  },
  mistral: {
    base_image: BUILDER_PIXEL_ART.vendor_badge_anthropic,
    tint_hue_deg: 50,
    tint_color: 'oklch(0.78 0.17 55 / 0.38)',
    label: 'Mistral',
  },
  auto: {
    base_image: BUILDER_PIXEL_ART.vendor_badge_anthropic,
    tint_hue_deg: 140,
    tint_color: 'oklch(0.85 0.18 140 / 0.32)',
    label: 'Auto',
  },
};
