//
// SpriteAtlasRegistry.ts
//
// Conforms to: docs/contracts/sprite_atlas.contract.md v0.1.0 Section 4.
// Owner Agent: Thalia (Builder Worker, P3b, 2D pixel worlds).
//
// Atlases are statically authored TypeScript mirrors of atlas.json per
// world (see app/builder/worlds/{world_id}/atlas.ts). The registry keeps
// the async surface from the contract so future loaders (streaming, remote
// fetch, creator-authored atlases) can drop in without touching consumers.
//

import {
  AtlasLoadFailedError,
  UnknownSpriteError,
  validateAtlas,
  type AttributionReportEntry,
  type SpriteAtlas,
  type SpriteAtlasRegistry,
  type SpriteEntry,
} from './sprite_atlas_types';
import { medievalDesertAtlas } from './medieval_desert/atlas';
import { cyberpunkShanghaiAtlas } from './cyberpunk_shanghai/atlas';
import { steampunkVictorianAtlas } from './steampunk_victorian/atlas';

const ATLASES: Record<string, SpriteAtlas> = {
  [medievalDesertAtlas.atlas_id]: medievalDesertAtlas,
  [cyberpunkShanghaiAtlas.atlas_id]: cyberpunkShanghaiAtlas,
  [steampunkVictorianAtlas.atlas_id]: steampunkVictorianAtlas,
};

// Validate once at module load so a malformed license field surfaces at
// boot, not on the demo path.
for (const atlas of Object.values(ATLASES)) {
  validateAtlas(atlas);
}

function createSpriteAtlasRegistry(): SpriteAtlasRegistry {
  return {
    async loadAtlas(atlas_id: string): Promise<SpriteAtlas> {
      const atlas = ATLASES[atlas_id];
      if (!atlas) {
        throw new AtlasLoadFailedError(atlas_id, 'not registered');
      }
      return atlas;
    },
    async getSprite(atlas_id: string, sprite_id: string): Promise<SpriteEntry> {
      const atlas = await this.loadAtlas(atlas_id);
      const sprite = atlas.sprites.find((s) => s.sprite_id === sprite_id);
      if (!sprite) throw new UnknownSpriteError(atlas_id, sprite_id);
      return sprite;
    },
    async listByTag(atlas_id: string, tag: string): Promise<SpriteEntry[]> {
      const atlas = await this.loadAtlas(atlas_id);
      return atlas.sprites.filter((s) => s.tags.includes(tag));
    },
    async attributionReport(): Promise<AttributionReportEntry[]> {
      const report: AttributionReportEntry[] = [];
      for (const atlas of Object.values(ATLASES)) {
        const attributions: string[] = [];
        for (const sprite of atlas.sprites) {
          if (
            sprite.license.attribution_required &&
            sprite.license.attribution_text
          ) {
            attributions.push(sprite.license.attribution_text);
          }
        }
        report.push({ atlas_id: atlas.atlas_id, attributions });
      }
      return report;
    },
  };
}

export const spriteAtlasRegistry: SpriteAtlasRegistry =
  createSpriteAtlasRegistry();

export { createSpriteAtlasRegistry, ATLASES };
