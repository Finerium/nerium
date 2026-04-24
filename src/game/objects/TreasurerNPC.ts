//
// src/game/objects/TreasurerNPC.ts
//
// Treasurer NPC. Owner: Marshall (W2 NP P6 S2).
//
// Thin subclass of the generic Thalia-v2 NPC class. The base class already
// owns proximity detection, press-E key binding, and game.npc.interact
// emission, so the only delta here is identity (npcId, displayName,
// interactRadius) plus a slightly larger interact radius so the treasurer
// reads as an obvious second beat in the trade district cluster.
//
// Coordinate convention is set by the consumer scene; this class never
// hard-codes a position so the same TreasurerNPC can be re-spawned in
// future scenes (post-hackathon) without a rewrite. The Oak-Woods style
// ground-aligned origin is delegated to the parent class which calls
// setOrigin(0.5, 0.5); the underlying medieval_desert atlas frames are
// authored 32x32 with the avatar centered, so a 0.5/0.5 origin matches
// the spawn coordinate the scene picks for the tile center.
//
// Sprite asset: placeholder reuses the medieval_desert atlas
// `agent_active` frame so the treasurer renders alongside the Apollo +
// caravan vendor NPCs without a Helios-v2 manifest commit. When Helios-v2
// ships a polished treasurer revamp the texture key + frame will swap
// here without touching the scene placement.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import { NPC, type NpcOptions } from './NPC';

export interface TreasurerNpcOptions
  extends Omit<NpcOptions, 'npcId' | 'displayName'> {
  npcIdOverride?: string;
  displayNameOverride?: string;
}

export const TREASURER_NPC_ID = 'treasurer';
const TREASURER_DISPLAY_NAME = 'Treasurer';
const TREASURER_INTERACT_RADIUS = 56;

export class TreasurerNPC extends NPC {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    options: TreasurerNpcOptions,
  ) {
    super(scene, x, y, {
      npcId: options.npcIdOverride ?? TREASURER_NPC_ID,
      displayName: options.displayNameOverride ?? TREASURER_DISPLAY_NAME,
      textureKey: options.textureKey,
      frame: options.frame ?? 'agent_active',
      interactRadius: options.interactRadius ?? TREASURER_INTERACT_RADIUS,
    });
  }
}
