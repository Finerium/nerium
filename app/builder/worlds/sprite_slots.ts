//
// sprite_slots.ts
//
// Shared sprite slot layout so every world ships the same 16 semantic IDs
// on the same 4x4 grid. Consumers (ConstructionAnimation, Helios sprite
// reuse, Nemea regression) can resolve a sprite by slot index without
// knowing which world is active.
//
// Grid (row-major, 16x16 tiles on a 64x64 atlas):
//   0 floor_primary     1 floor_secondary    2 wall_solid       3 wall_accent
//   4 corner_outer      5 pillar             6 arch_opening     7 feature_decor
//   8 ambient_on        9 ambient_off       10 path_marker     11 particle
//  12 agent_idle       13 agent_active      14 agent_completed 15 sigil_world
//

export const TILE_PX = 16;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 4;
export const ATLAS_PX = TILE_PX * ATLAS_COLS;

export const SPRITE_SLOTS = [
  'floor_primary',
  'floor_secondary',
  'wall_solid',
  'wall_accent',
  'corner_outer',
  'pillar',
  'arch_opening',
  'feature_decor',
  'ambient_on',
  'ambient_off',
  'path_marker',
  'particle',
  'agent_idle',
  'agent_active',
  'agent_completed',
  'sigil_world',
] as const;

export type SpriteSlotId = (typeof SPRITE_SLOTS)[number];

export function slotIndex(id: SpriteSlotId): number {
  return SPRITE_SLOTS.indexOf(id);
}

export function slotFrame(id: SpriteSlotId): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const idx = slotIndex(id);
  const col = idx % ATLAS_COLS;
  const row = Math.floor(idx / ATLAS_COLS);
  return { x: col * TILE_PX, y: row * TILE_PX, w: TILE_PX, h: TILE_PX };
}
