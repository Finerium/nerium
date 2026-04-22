//
// sprite_atlas_types.ts
//
// Conforms to: docs/contracts/sprite_atlas.contract.md v0.1.0 Section 3.
// Owner Agent: Thalia (Builder Worker, P3b, 2D pixel worlds).
// Consumers:   Harmonia (aesthetic sweep), Helios (agent-node sprites),
//              Urania (Blueprint Moment reveal reuses sprites), Nemea
//              (visual regression).
//
// Atlases load lazily on first world activation and cache in memory. The
// attribution report aggregates every sprite whose license requires public
// credit so README + /assets/attributions.md stay in sync without manual
// bookkeeping.
//

import type { WorldId } from './world_aesthetic_types';

export interface SpriteFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  anchor_x?: number;
  anchor_y?: number;
}

export interface SpriteAnimation {
  animation_id: string;
  frames: SpriteFrame[];
  fps: number;
  loop: boolean;
}

export type SpriteKind = 'tile' | 'character' | 'prop' | 'ui_icon' | 'animation';

export type SpriteLicenseSource =
  | 'kenney_nl'
  | 'opengameart'
  | 'claude_design_generated'
  | 'opus_procedural'
  | 'original';

export type SpriteLicenseId =
  | 'cc0'
  | 'cc_by'
  | 'cc_by_sa'
  | 'mit'
  | 'custom';

export interface SpriteLicense {
  source: SpriteLicenseSource;
  url?: string;
  license_id: SpriteLicenseId;
  attribution_required: boolean;
  attribution_text?: string;
}

export interface SpriteEntry {
  sprite_id: string;
  kind: SpriteKind;
  frame?: SpriteFrame;
  animation?: SpriteAnimation;
  tags: string[];
  license: SpriteLicense;
}

export type AtlasImageFormat = 'png' | 'webp';

export interface SpriteAtlas {
  atlas_id: string;
  world_id: WorldId;
  image_path: string;
  image_format: AtlasImageFormat;
  width_px: number;
  height_px: number;
  sprites: SpriteEntry[];
  created_at: string;
}

export interface AttributionReportEntry {
  atlas_id: string;
  attributions: string[];
}

export interface SpriteAtlasRegistry {
  loadAtlas(atlas_id: string): Promise<SpriteAtlas>;
  getSprite(atlas_id: string, sprite_id: string): Promise<SpriteEntry>;
  listByTag(atlas_id: string, tag: string): Promise<SpriteEntry[]>;
  attributionReport(): Promise<AttributionReportEntry[]>;
}

export class AtlasLoadFailedError extends Error {
  constructor(
    public readonly atlas_id: string,
    public readonly reason: string,
  ) {
    super(`Atlas load failed (${atlas_id}): ${reason}`);
    this.name = 'AtlasLoadFailedError';
  }
}

export class UnknownSpriteError extends Error {
  constructor(
    public readonly atlas_id: string,
    public readonly sprite_id: string,
  ) {
    super(`Unknown sprite ${sprite_id} in atlas ${atlas_id}`);
    this.name = 'UnknownSpriteError';
  }
}

export class LicenseMetadataMissingError extends Error {
  constructor(
    public readonly atlas_id: string,
    public readonly sprite_id: string,
    public readonly detail: string,
  ) {
    super(
      `License metadata missing for sprite ${sprite_id} in atlas ${atlas_id}: ${detail}`,
    );
    this.name = 'LicenseMetadataMissingError';
  }
}

export function validateAtlas(atlas: SpriteAtlas): void {
  for (const sprite of atlas.sprites) {
    if (sprite.license.attribution_required && !sprite.license.attribution_text) {
      throw new LicenseMetadataMissingError(
        atlas.atlas_id,
        sprite.sprite_id,
        'attribution_required=true but attribution_text missing',
      );
    }
    if (!sprite.license.license_id) {
      throw new LicenseMetadataMissingError(
        atlas.atlas_id,
        sprite.sprite_id,
        'license_id missing',
      );
    }
  }
}
