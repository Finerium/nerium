# Design Tokens

**Contract Version:** 0.1.0
**Owner Agent(s):** Harmonia (canonical token file producer)
**Consumer Agent(s):** Every UI-producing Worker (Erato, Helios, Urania, Dionysus, Thalia, Eos, Artemis, Coeus, Dike, Rhea, Phoebe, Triton, Morpheus), Nemea (regression reference), Apollo (strategy selectors consume tokens)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the unified design token schema per Ghaisan Decision 3 (2026-04-22): a single `design-tokens.ts` file is the source of truth that exports three world theme objects (`medieval_desert`, `cyberpunk_shanghai`, `steampunk_victorian`), runtime-swappable via Tailwind v4 OKLCH CSS custom properties bound to a single toggle.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 7 three worlds, Section 8 polish)
- `CLAUDE.md` (root, Tailwind v4 OKLCH lock)
- `docs/contracts/world_aesthetic.contract.md` (descriptor source)
- `docs/contracts/advisor_interaction.contract.md` (session-level active world binding)

## 3. Schema Definition

```typescript
// app/shared/design/tokens.ts

import type { WorldId, OKLCHColor } from '@/builder/worlds/world_aesthetic_types';

export interface SemanticColorTokens {
  primary: string;                    // oklch(...) CSS string
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

export interface SpacingTokens {
  space_0: string;                    // '0rem'
  space_1: string;                    // '0.25rem'
  space_2: string;                    // '0.5rem'
  space_3: string;                    // '0.75rem'
  space_4: string;                    // '1rem'
  space_6: string;                    // '1.5rem'
  space_8: string;                    // '2rem'
  space_12: string;                   // '3rem'
  space_16: string;                   // '4rem'
}

export interface RadiusTokens {
  radius_sm: string;
  radius_md: string;
  radius_lg: string;
  radius_pill: string;
}

export interface AnimationTokens {
  duration_fast: string;              // '150ms'
  duration_medium: string;            // '300ms'
  duration_slow: string;              // '600ms'
  ease_standard: string;              // 'cubic-bezier(0.4, 0, 0.2, 1)'
  ease_entrance: string;
  ease_exit: string;
}

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

export interface WorldTheme {
  world_id: WorldId;
  colors: SemanticColorTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  animation: AnimationTokens;
  typography: TypographyTokens;
}

// Ghaisan Decision 3 shape: single file exports all three themes.
export const medieval_desert: WorldTheme;
export const cyberpunk_shanghai: WorldTheme;
export const steampunk_victorian: WorldTheme;

export const themes: Record<WorldId, WorldTheme> = {
  medieval_desert,
  cyberpunk_shanghai,
  steampunk_victorian,
};
```

## 4. Interface / API Contract

```typescript
// app/shared/design/theme_runtime.ts

export interface ThemeRuntime {
  applyWorld(world_id: WorldId): void;            // sets CSS custom properties on :root
  getActive(): WorldId;
  onChange(handler: (world_id: WorldId) => void): () => void;
}
```

- `applyWorld` iterates `themes[world_id]` and sets every leaf token as a CSS custom property on `document.documentElement` (e.g., `--color-primary`, `--space-4`, `--duration-fast`).
- Tailwind v4 config references these custom properties via `theme({ colors: { primary: 'oklch(var(--color-primary))' } })` pattern, so a single `applyWorld` call re-themes the entire UI without remount.
- Components must consume tokens via Tailwind utility classes (`bg-primary`, `p-4`, `rounded-md`) or via `var(--token-name)` CSS references; hardcoded colors and spacings trigger Nemea regression failure.

## 5. Event Signatures

- `design.theme.applied` payload: `{ world_id, previous_world_id }`
- No schema change events in hackathon scope; tokens file is hand-edited and rebuilt.

## 6. File Path Convention

- Unified tokens file: `app/shared/design/tokens.ts` (Ghaisan Decision 3 single file).
- Runtime helpers: `app/shared/design/theme_runtime.ts`.
- Tailwind config integration: `tailwind.config.ts` imports from `tokens.ts`.
- CSS custom property definitions on `:root`: generated at runtime by `applyWorld`, not hand-written.

## 7. Naming Convention

- Theme export names match `WorldId` values exactly (`medieval_desert`, `cyberpunk_shanghai`, `steampunk_victorian`).
- Token key names: `snake_case` within the schema, translated to kebab-case for CSS custom property names (`space_4` becomes `--space-4`).
- Color tokens use semantic names (`primary`, `accent`) not raw color names (`red`, `cyan`).
- OKLCH strings: `oklch(L C H / alpha)` per CSS Color Module Level 4 syntax.

## 8. Error Handling

- `applyWorld` called with unknown `world_id`: logs error and no-ops to avoid visual breakage.
- Theme token missing at runtime (schema drift): Tailwind fallback color kicks in; developer warning logged.
- OKLCH unsupported in a target browser: Tailwind v4 bundles a graceful sRGB fallback layer automatically.
- Consuming component using a non-canonical token name: Nemea regression flags it; not a contract-layer throw.

## 9. Testing Surface

- Single-file export shape: import `tokens.ts`, assert exactly three named exports plus the `themes` record.
- Token completeness: every `WorldTheme` object contains every field in `SemanticColorTokens`, `SpacingTokens`, `RadiusTokens`, `AnimationTokens`, `TypographyTokens`. Missing field fails the test.
- Runtime swap: call `applyWorld('cyberpunk_shanghai')`, assert `getComputedStyle(document.documentElement).getPropertyValue('--color-primary')` equals `cyberpunk_shanghai.colors.primary`.
- OKLCH syntax: every color field matches regex `^oklch\(`.
- Persistence: set active world, reload, assert persists (via localStorage in hackathon).

## 10. Open Questions

- None at contract draft. Theme-switching axis orthogonality (light vs dark on top of world swap) is a Harmonia strategic_decision; Ghaisan Decision 3 locks the single-file shape but does not mandate light/dark in hackathon scope.

## 11. Post-Hackathon Refactor Notes

- Add light/dark axis on top of the world axis if production users request it; schema extends to `themes[world_id].light` and `themes[world_id].dark`.
- User-custom theme editor as a Builder feature: non-technical users choose tokens via UI and export a `WorldTheme` object.
- Integrate with Marketplace: creators ship themed Lumio variants tied to specific world tokens.
- Add high-contrast accessibility variant per world for WCAG AAA compliance.
- Per Ghaisan Decision 3 locked-in 2026-04-22, do not split tokens across multiple files post-hackathon without explicit re-litigation; the unified file is the canonical source of truth for the lifetime of NERIUM.
