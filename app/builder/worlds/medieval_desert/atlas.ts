//
// medieval_desert/atlas.ts
//
// Conforms to: docs/contracts/sprite_atlas.contract.md v0.1.0 Section 3.
// Typed mirror of atlas.json so consumers can import the SpriteAtlas object
// directly without a JSON module resolver. atlas.json remains the human-
// authored source of truth; this file must stay in lockstep.
//

import type { SpriteAtlas } from '../sprite_atlas_types';
import atlasData from './atlas.json';

export const medievalDesertAtlas: SpriteAtlas = atlasData as SpriteAtlas;
