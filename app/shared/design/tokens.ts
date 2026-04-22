//
// tokens.ts
//
// Conforms to: docs/contracts/design_tokens.contract.md v0.1.0
//              docs/contracts/world_aesthetic.contract.md v0.1.0 (WorldId shape)
// Owner Agent: Harmonia (Cross-Cutting Worker, P4 base scope; Early-Harmonia
//              split session 1 of 2 emits the data surface. Full-Harmonia P4
//              extends typography.css, animations.ts, and cross-Worker diff
//              patches against hardcoded values.)
// Consumers:   Thalia (worlds), Urania (Prediction Layer surface), Dionysus
//              (audio theming), Triton (Protocol adapter UI), Morpheus
//              (translation demo), Erato (Builder components), Helios
//              (pipeline viz), Eos/Artemis/Coeus (Marketplace), Dike/Rhea
//              (Banking), Phoebe (Registry), Apollo (Advisor chat surface),
//              Nemea (regression reference).
//
// Single-file source of truth per Ghaisan Decision 3 (2026-04-22): three
// WorldTheme objects exported and consumed through the themes record. Runtime
// swap via applyWorld in theme_runtime.ts writes the flattened tokens as CSS
// custom properties on document.documentElement, so Tailwind v4 utility
// classes (bg-primary, p-4, rounded-md, text-lg) re-theme the whole UI
// without component remount.
//
// Palette derivation sources:
// - Medieval Desert: NarasiGhaisan Section 7 hint (terracotta, sand, stone,
//   shadow) expanded through a warm earthen Moroccan souk and Dune Arrakeen
//   reference loop.
// - Cyberpunk Shanghai: docs/phase_0/agent_flow_diagram.html M3 palette
//   (cyan #00f0ff, magenta #ff2e88, purple #8b5cf6, void #06060c) plus
//   Blade Runner 2049 and Ghost in the Shell reference. Translated to OKLCH.
// - Steampunk Victorian: V2 third-world proposal (brass, oxblood, walnut,
//   aged ivory) through a BioShock Columbia reference loop. Bridges warm
//   medieval with cold cyberpunk in chroma language.
//
// All color tokens are OKLCH CSS Color Module Level 4 strings per
// CLAUDE.md Tailwind v4 lock and design_tokens.contract.md Section 3.
//

import type { WorldId } from '../../builder/worlds/world_aesthetic_types';

// ---------- Interfaces ----------

/**
 * Eleven semantic color slots per design_tokens.contract.md v0.1.0 Section 3.
 * Every field stores a full oklch(...) CSS string so consumers may set the
 * value directly on a CSS custom property without further wrapping.
 */
export interface SemanticColorTokens {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  muted: string;
  success: string;
  warning: string;
  critical: string;
  border: string;
  ring: string;
}

/**
 * Nine-step spacing scale aligned with Tailwind v4 defaults.
 * All themes share the same scale for cross-world layout consistency.
 */
export interface SpacingTokens {
  space_0: string;
  space_1: string;
  space_2: string;
  space_3: string;
  space_4: string;
  space_6: string;
  space_8: string;
  space_12: string;
  space_16: string;
}

/**
 * Four-stop radius scale. Shared across worlds at v0.1.0 for a uniform
 * rounding rhythm; per-world deviation is a post-hackathon refactor item.
 */
export interface RadiusTokens {
  radius_sm: string;
  radius_md: string;
  radius_lg: string;
  radius_pill: string;
}

/**
 * Animation timing tokens. Duration values are the Harmonia hard-lock
 * 150 / 300 / 600 ms trio; easing curves vary per world to reinforce
 * aesthetic character without breaking the duration grid.
 */
export interface AnimationTokens {
  duration_fast: string;
  duration_medium: string;
  duration_slow: string;
  ease_standard: string;
  ease_entrance: string;
  ease_exit: string;
}

/**
 * Typography tokens. Font families vary per world; scale, weights, and
 * line heights are shared for cross-world readability consistency.
 */
export interface TypographyTokens {
  font_family_heading: string;
  font_family_body: string;
  font_family_mono: string;
  scale_xs: string;
  scale_sm: string;
  scale_base: string;
  scale_lg: string;
  scale_xl: string;
  scale_2xl: string;
  scale_3xl: string;
  weight_regular: number;
  weight_medium: number;
  weight_semibold: number;
  weight_bold: number;
  line_height_tight: string;
  line_height_normal: string;
  line_height_loose: string;
}

/**
 * Shadow tokens. Extension beyond design_tokens.contract.md v0.1.0 minimum
 * per Harmonia prompt creative-latitude clause (shadow, radius, z-index
 * allowed when beneficial). Each world ships a signature shadow_glow used
 * by hero surfaces (Advisor chat plate, Builder header, Marketplace
 * featured rail). Consumers that do not need shadows may ignore the field.
 */
export interface ShadowTokens {
  shadow_sm: string;
  shadow_md: string;
  shadow_lg: string;
  shadow_glow: string;
}

/**
 * A complete world theme. The contract defines colors, spacing, radius,
 * animation, and typography. ShadowTokens is an Early-Harmonia extension
 * preserving backwards compatibility: future consumers that only read the
 * v0.1.0 surface ignore the shadow field safely.
 */
export interface WorldTheme {
  world_id: WorldId;
  colors: SemanticColorTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  animation: AnimationTokens;
  typography: TypographyTokens;
  shadow: ShadowTokens;
}

// ---------- Shared primitives ----------

const SHARED_SPACING: SpacingTokens = {
  space_0: '0rem',
  space_1: '0.25rem',
  space_2: '0.5rem',
  space_3: '0.75rem',
  space_4: '1rem',
  space_6: '1.5rem',
  space_8: '2rem',
  space_12: '3rem',
  space_16: '4rem',
};

const SHARED_RADIUS: RadiusTokens = {
  radius_sm: '0.125rem',
  radius_md: '0.375rem',
  radius_lg: '0.625rem',
  radius_pill: '9999px',
};

const SHARED_DURATION = {
  duration_fast: '150ms',
  duration_medium: '300ms',
  duration_slow: '600ms',
} as const;

const SHARED_TYPE_SCALE = {
  scale_xs: '0.75rem',
  scale_sm: '0.875rem',
  scale_base: '1rem',
  scale_lg: '1.125rem',
  scale_xl: '1.25rem',
  scale_2xl: '1.5rem',
  scale_3xl: '1.875rem',
  weight_regular: 400,
  weight_medium: 500,
  weight_semibold: 600,
  weight_bold: 700,
  line_height_tight: '1.2',
  line_height_normal: '1.5',
  line_height_loose: '1.75',
} as const;

// ---------- Medieval Desert ----------
//
// Terracotta + sand + saffron on sandstone parchment. Light-bg world in the
// spirit of Moroccan souk daylight and Dune Arrakeen noon. Foreground is a
// deep inkstone brown; oxblood critical red grounds the warning palette in
// the same family as the primary.

const MEDIEVAL_COLORS: SemanticColorTokens = {
  primary: 'oklch(0.620 0.140 45.0)',
  secondary: 'oklch(0.820 0.100 85.0)',
  accent: 'oklch(0.750 0.180 70.0)',
  background: 'oklch(0.920 0.030 80.0)',
  foreground: 'oklch(0.220 0.030 50.0)',
  muted: 'oklch(0.700 0.040 75.0)',
  success: 'oklch(0.580 0.100 135.0)',
  warning: 'oklch(0.720 0.160 70.0)',
  critical: 'oklch(0.480 0.160 25.0)',
  border: 'oklch(0.780 0.020 75.0)',
  ring: 'oklch(0.650 0.120 55.0)',
};

const MEDIEVAL_SHADOW: ShadowTokens = {
  shadow_sm: '0 1px 2px rgba(61, 40, 23, 0.14)',
  shadow_md:
    '0 4px 10px rgba(61, 40, 23, 0.18), 0 1px 3px rgba(61, 40, 23, 0.10)',
  shadow_lg:
    '0 12px 30px rgba(61, 40, 23, 0.22), 0 4px 10px rgba(61, 40, 23, 0.12)',
  shadow_glow: '0 0 18px oklch(0.750 0.180 70.0 / 0.40)',
};

export const medieval_desert: WorldTheme = {
  world_id: 'medieval_desert',
  colors: MEDIEVAL_COLORS,
  spacing: SHARED_SPACING,
  radius: SHARED_RADIUS,
  animation: {
    ...SHARED_DURATION,
    ease_standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    ease_entrance: 'cubic-bezier(0.0, 0, 0.2, 1)',
    ease_exit: 'cubic-bezier(0.4, 0, 1, 1)',
  },
  typography: {
    font_family_heading:
      '"Cormorant Garamond", "Cormorant", "Trajan Pro", "Iowan Old Style", Georgia, serif',
    font_family_body:
      '"Spectral", "Cormorant", "Iowan Old Style", Georgia, serif',
    font_family_mono:
      '"JetBrains Mono", "Fira Code", Menlo, "Courier New", monospace',
    ...SHARED_TYPE_SCALE,
  },
  shadow: MEDIEVAL_SHADOW,
};

// ---------- Cyberpunk Shanghai ----------
//
// M3 palette translated to OKLCH. Dark-bg world with high-chroma cyan +
// magenta + neon purple triad. Signature shadow_glow is the magenta hero
// glow used on Advisor hero plate and Builder header in the M3 reference.

const CYBERPUNK_COLORS: SemanticColorTokens = {
  primary: 'oklch(0.830 0.150 200.0)',
  secondary: 'oklch(0.660 0.270 5.0)',
  accent: 'oklch(0.620 0.220 295.0)',
  background: 'oklch(0.100 0.020 270.0)',
  foreground: 'oklch(0.940 0.020 265.0)',
  muted: 'oklch(0.580 0.030 275.0)',
  success: 'oklch(0.780 0.220 150.0)',
  warning: 'oklch(0.820 0.170 80.0)',
  critical: 'oklch(0.620 0.280 15.0)',
  border: 'oklch(0.320 0.070 290.0)',
  ring: 'oklch(0.830 0.150 200.0)',
};

const CYBERPUNK_SHADOW: ShadowTokens = {
  shadow_sm:
    '0 0 6px oklch(0.830 0.150 200.0 / 0.35), 0 1px 2px rgba(0, 0, 0, 0.45)',
  shadow_md:
    '0 0 14px oklch(0.830 0.150 200.0 / 0.40), 0 0 2px oklch(0.830 0.150 200.0 / 0.55), 0 4px 12px rgba(0, 0, 0, 0.55)',
  shadow_lg:
    '0 0 40px oklch(0.830 0.150 200.0 / 0.32), 0 0 18px oklch(0.620 0.220 295.0 / 0.22), 0 14px 44px rgba(0, 0, 0, 0.60)',
  shadow_glow:
    '0 0 28px oklch(0.660 0.270 5.0 / 0.55), 0 0 48px oklch(0.660 0.270 5.0 / 0.30)',
};

export const cyberpunk_shanghai: WorldTheme = {
  world_id: 'cyberpunk_shanghai',
  colors: CYBERPUNK_COLORS,
  spacing: SHARED_SPACING,
  radius: SHARED_RADIUS,
  animation: {
    ...SHARED_DURATION,
    ease_standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    ease_entrance: 'cubic-bezier(0.16, 1, 0.3, 1)',
    ease_exit: 'cubic-bezier(0.7, 0, 0.84, 0)',
  },
  typography: {
    font_family_heading:
      '"Orbitron", "Exo 2", "Rajdhani", "Inter", system-ui, sans-serif',
    font_family_body:
      '"Inter", system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    font_family_mono:
      '"Share Tech Mono", "JetBrains Mono", "Courier New", monospace',
    ...SHARED_TYPE_SCALE,
  },
  shadow: CYBERPUNK_SHADOW,
};

// ---------- Steampunk Victorian ----------
//
// Polished brass + oxblood + walnut on aged ivory. Mid-light-bg world that
// bridges medieval warmth with cyberpunk chroma discipline. Signature
// shadow_md uses an inset highlight to evoke engraved brass plate; gas-lamp
// brass warmth drives the shadow_glow.

const STEAMPUNK_COLORS: SemanticColorTokens = {
  primary: 'oklch(0.680 0.110 78.0)',
  secondary: 'oklch(0.380 0.130 25.0)',
  accent: 'oklch(0.580 0.120 48.0)',
  background: 'oklch(0.900 0.030 85.0)',
  foreground: 'oklch(0.280 0.040 55.0)',
  muted: 'oklch(0.720 0.040 80.0)',
  success: 'oklch(0.580 0.090 160.0)',
  warning: 'oklch(0.700 0.140 70.0)',
  critical: 'oklch(0.320 0.140 20.0)',
  border: 'oklch(0.520 0.060 50.0)',
  ring: 'oklch(0.740 0.120 80.0)',
};

const STEAMPUNK_SHADOW: ShadowTokens = {
  shadow_sm: '0 1px 2px rgba(40, 28, 18, 0.18)',
  shadow_md:
    'inset 0 1px 0 rgba(255, 236, 196, 0.35), 0 4px 10px rgba(40, 28, 18, 0.22), 0 1px 3px rgba(40, 28, 18, 0.14)',
  shadow_lg:
    'inset 0 1px 0 rgba(255, 236, 196, 0.40), 0 12px 32px rgba(40, 28, 18, 0.30), 0 2px 6px rgba(40, 28, 18, 0.18)',
  shadow_glow: '0 0 16px oklch(0.740 0.120 80.0 / 0.48)',
};

export const steampunk_victorian: WorldTheme = {
  world_id: 'steampunk_victorian',
  colors: STEAMPUNK_COLORS,
  spacing: SHARED_SPACING,
  radius: SHARED_RADIUS,
  animation: {
    ...SHARED_DURATION,
    ease_standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    ease_entrance: 'cubic-bezier(0.5, 0, 0.5, 1)',
    ease_exit: 'cubic-bezier(0.5, 0, 0.7, 0.2)',
  },
  typography: {
    font_family_heading:
      '"Cinzel", "IM Fell English SC", "Trajan Pro", "Iowan Old Style", Georgia, serif',
    font_family_body:
      '"Lora", "Libre Baskerville", "Iowan Old Style", Georgia, serif',
    font_family_mono:
      '"IBM Plex Mono", "Courier New", Menlo, monospace',
    ...SHARED_TYPE_SCALE,
  },
  shadow: STEAMPUNK_SHADOW,
};

// ---------- Themes record ----------

export const themes: Record<WorldId, WorldTheme> = {
  medieval_desert,
  cyberpunk_shanghai,
  steampunk_victorian,
};

export const DEFAULT_WORLD: WorldId = 'cyberpunk_shanghai';

export function getTheme(world_id: WorldId): WorldTheme {
  return themes[world_id];
}
