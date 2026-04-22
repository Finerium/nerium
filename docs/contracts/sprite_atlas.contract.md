# Sprite Atlas

**Contract Version:** 0.1.0
**Owner Agent(s):** Thalia (atlas and sprite author)
**Consumer Agent(s):** Harmonia (aesthetic enforcement across atlases), Helios (uses sprites for agent nodes), Urania (reuses for Blueprint Moment reveal), Nemea (visual regression)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the sprite atlas schema per world (tile set, character sprites, animation frames, license records) so Pixi.js-based rendering and any downstream visualizer can look up sprites by semantic name rather than hardcoded asset paths.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 7 pixel-art baseline, Section 8 polish)
- `CLAUDE.md` (root)
- `docs/contracts/world_aesthetic.contract.md` (atlas bound to WorldId)

## 3. Schema Definition

```typescript
// app/builder/worlds/sprite_atlas_types.ts

import type { WorldId } from '@/builder/worlds/world_aesthetic_types';

export interface SpriteFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  anchor_x?: number;                  // 0.0 to 1.0 relative pivot
  anchor_y?: number;
}

export interface SpriteAnimation {
  animation_id: string;
  frames: SpriteFrame[];
  fps: number;
  loop: boolean;
}

export interface SpriteEntry {
  sprite_id: string;                  // semantic e.g., 'builder_floor_tile', 'agent_node_active'
  kind: 'tile' | 'character' | 'prop' | 'ui_icon' | 'animation';
  frame?: SpriteFrame;                // for static kinds
  animation?: SpriteAnimation;        // for animation kind
  tags: string[];                     // e.g., ['floor', 'construction', 'medieval']
  license: {
    source: 'kenney_nl' | 'opengameart' | 'claude_design_generated' | 'opus_procedural' | 'original';
    url?: string;
    license_id: 'cc0' | 'cc_by' | 'cc_by_sa' | 'mit' | 'custom';
    attribution_required: boolean;
    attribution_text?: string;
  };
}

export interface SpriteAtlas {
  atlas_id: string;
  world_id: WorldId;
  image_path: string;                 // relative to /public
  image_format: 'png' | 'webp';
  width_px: number;
  height_px: number;
  sprites: SpriteEntry[];
  created_at: string;
}
```

## 4. Interface / API Contract

```typescript
export interface SpriteAtlasRegistry {
  loadAtlas(atlas_id: string): Promise<SpriteAtlas>;
  getSprite(atlas_id: string, sprite_id: string): Promise<SpriteEntry>;
  listByTag(atlas_id: string, tag: string): Promise<SpriteEntry[]>;
  attributionReport(): Promise<Array<{ atlas_id: string; attributions: string[] }>>;
}
```

- Atlases load lazily (image + JSON) on first world activation; cached in memory thereafter.
- `attributionReport` aggregates all sprites requiring attribution across atlases for a single copy-paste into the README credits section.
- Hackathon shipping rule: prefer CC0 packs (Kenney.nl, OpenGameArt) per NarasiGhaisan Section 7 and CLAUDE.md locked decision; Opus procedural SVG or Canvas used where no CC0 asset fits.

## 5. Event Signatures

- `sprite.atlas.loaded` payload: `{ atlas_id, world_id }`
- `sprite.atlas.load_failed` payload: `{ atlas_id, reason }`

## 6. File Path Convention

- Types: `app/builder/worlds/sprite_atlas_types.ts`
- Per-world atlas directory: `app/builder/worlds/{world_id}/` with `atlas.json` and `atlas.png` (or `.webp`).
- Registry: `app/builder/worlds/SpriteAtlasRegistry.ts`
- Attribution file: `public/assets/attributions.md` auto-generated from `attributionReport`.

## 7. Naming Convention

- Atlas IDs: `{world_id}_atlas_v{N}` (e.g., `medieval_desert_atlas_v1`).
- Sprite IDs: `snake_case`, semantic prefix by domain (`builder_`, `agent_`, `ui_`).
- License IDs: lowercase, SPDX-flavored (`cc0`, `mit`, `cc_by`).
- Image format values: lowercase extensions without dot.

## 8. Error Handling

- Atlas image load failure (404, CORS): `loadAtlas` throws `AtlasLoadFailedError`; UI falls back to SVG primitives for affected nodes.
- Unknown `sprite_id`: `getSprite` throws `UnknownSpriteError`.
- License source without `license_id`: validator rejects atlas at load-time with `LicenseMetadataMissing`.
- Attribution required but `attribution_text` absent: rejects at load-time.

## 9. Testing Surface

- Load round trip: register an atlas, fetch it, assert all sprites present.
- Tag filter: list by tag `'floor'`, assert only entries with the tag returned.
- License enforcement: construct an atlas with `attribution_required: true` but no attribution text, assert load throws.
- Attribution report: aggregate across 3 atlases, assert report includes every required attribution.
- Missing sprite: request an unknown sprite_id, assert throws.

## 10. Open Questions

- None at contract draft. Asset budget expansion via Claude Design generation is a Thalia strategic_decision handled outside the atlas schema.

## 11. Post-Hackathon Refactor Notes

- Support texture atlas packing at build time (script that consolidates multiple source sprites into a single image) for better GPU performance.
- Add animation compression: delta frames vs full frames for long animations.
- Allow streaming atlas loading for very large worlds (progressively load tile regions as the viewport scrolls).
- Add per-sprite metadata for accessibility (alt text for screen readers when sprites serve semantic meaning).
- Provide a sprite authoring UI inside NERIUM Builder so creators can ship custom sprites tied to their Marketplace listings.
