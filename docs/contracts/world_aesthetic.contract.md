# World Aesthetic

**Contract Version:** 0.1.0
**Owner Agent(s):** Thalia (world visuals author)
**Consumer Agent(s):** Harmonia (derives canonical design tokens from world palettes), Apollo (world switcher integrated via Erato), Erato (world aesthetic picker), Helios (pipeline viz adapts to active world), Nemea (visual regression per world)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the canonical set of three world aesthetics (Medieval Desert, Cyberpunk Shanghai, Steampunk Victorian) with palette, typography, and motif descriptors so all downstream UI can honor a single aesthetic language per NarasiGhaisan Section 7 three-world preference.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 7 three-world preference and Section 8 polish discipline)
- `CLAUDE.md` (root)
- `docs/contracts/design_tokens.contract.md` (consumes these descriptors)
- `docs/contracts/sprite_atlas.contract.md` (sprite referencing per world)

## 3. Schema Definition

```typescript
// app/builder/worlds/world_aesthetic_types.ts

export type WorldId = 'medieval_desert' | 'cyberpunk_shanghai' | 'steampunk_victorian';

export interface OKLCHColor {
  l: number;    // 0.0 to 1.0 lightness
  c: number;    // 0.0 to 0.4 approximate chroma range
  h: number;    // 0 to 360 hue
  alpha?: number; // 0.0 to 1.0
}

export interface WorldPalette {
  primary: OKLCHColor;
  secondary: OKLCHColor;
  accent: OKLCHColor;
  background: OKLCHColor;
  foreground: OKLCHColor;
  muted: OKLCHColor;
  success: OKLCHColor;
  warning: OKLCHColor;
  critical: OKLCHColor;
}

export interface WorldTypography {
  heading_font_family: string;        // CSS font stack
  body_font_family: string;
  mono_font_family: string;
  heading_weight: number;             // 400..800
  body_weight: number;
  scale_ratio: number;                // e.g., 1.25 perfect fourth
}

export interface WorldMotif {
  silhouette_style: 'low_poly' | 'pixel' | 'line_engraving' | 'neon_outline';
  default_animation_duration_ms: number;
  audio_theme_id?: string;            // reference to Howler preloaded track
  description: string;                // plain text, human-friendly
}

export interface WorldDescriptor {
  world_id: WorldId;
  display_name: string;
  palette: WorldPalette;
  typography: WorldTypography;
  motif: WorldMotif;
  sprite_atlas_id: string;            // foreign key to sprite_atlas.contract.md
}
```

## 4. Interface / API Contract

```typescript
export interface WorldAestheticRegistry {
  list(): WorldDescriptor[];
  get(world_id: WorldId): WorldDescriptor;
  setActiveForSession(session_id: string, world_id: WorldId): Promise<void>;
  getActiveForSession(session_id: string): Promise<WorldId>;
}
```

- Default world on first session: `cyberpunk_shanghai` per Thalia strategic_decision (locked default, still overridable).
- Descriptors are static compile-time imports; runtime world switching is a UI concern handled by reading `getActiveForSession`.
- Palettes are authored in OKLCH (per CLAUDE.md Tailwind v4 lock) and rendered via CSS custom properties.

## 5. Event Signatures

- `world.active.changed` payload: `{ session_id, previous: WorldId, next: WorldId }`
- Propagates to every subscriber that needs to re-render with the new palette (Harmonia tokens file re-emits via design_tokens bus).

## 6. File Path Convention

- Types: `app/builder/worlds/world_aesthetic_types.ts`
- Descriptors: `app/builder/worlds/medieval_desert/descriptor.ts`, `app/builder/worlds/cyberpunk_shanghai/descriptor.ts`, `app/builder/worlds/steampunk_victorian/descriptor.ts`
- Registry: `app/builder/worlds/WorldAestheticRegistry.ts`

## 7. Naming Convention

- World IDs: lowercase `snake_case`, two underscored tokens.
- Color component keys: single lowercase character (`l`, `c`, `h`, `alpha`).
- Typography field names: `snake_case`.
- Motif silhouette styles: lowercase single word or `snake_case`.

## 8. Error Handling

- Unknown `world_id` on `get`: throws `UnknownWorldError`.
- Session without active world configured: falls back to `cyberpunk_shanghai` and logs warning.
- Invalid OKLCH values (out of range): clamps to valid range, logs warning.
- Font family unavailable at runtime (font load failure): CSS fallback in each descriptor is used automatically.

## 9. Testing Surface

- Registry `list()` returns 3 descriptors in deterministic order.
- Each descriptor: palette keys complete (9 required), typography keys complete (6 required), motif keys complete.
- Switching world: call `setActiveForSession`, call `getActiveForSession`, assert persistence.
- Invalid world: throws as specified.
- OKLCH clamping: construct a palette with `l: 2.5`, assert clamped to `1.0` with warning.

## 10. Open Questions

- None at contract draft. Steampunk Victorian is the V2-proposed third world pending Ghaisan final confirm per NarasiGhaisan Section 7 table; contract ships it as descriptor scaffold, palette-fillable post-confirm.

## 11. Post-Hackathon Refactor Notes

- Support user-custom worlds: user authors palette plus motif, saves as a descriptor, optionally publishes to Marketplace.
- Add per-world audio atmospheres (ambient loops, specialist-completion chimes) beyond the single theme_id placeholder.
- Extend palette with semantic slots (info, link, visited, focus ring) as UI complexity grows.
- Formalize theme-switching spec for light plus dark intra-world variants post-hackathon.
- Cross-reference with Tailwind v4 OKLCH conversion: ensure runtime swap via CSS custom properties remains performant under frequent switches.
