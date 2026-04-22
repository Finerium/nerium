//
// cyberpunk_shanghai/animations.ts
//
// Conforms to: docs/contracts/sprite_atlas.contract.md v0.1.0 Section 3.
// Neon flicker runs at 6 fps for a tight pulse matching the shorter world
// animation duration (300 ms). Rain particle pulse overlays on the path
// marker for ambient movement during idle pipeline state.
//

import type { SpriteAnimation } from '../sprite_atlas_types';
import { slotFrame } from '../sprite_slots';

export const cyberpunkShanghaiAnimations: SpriteAnimation[] = [
  {
    animation_id: 'ambient_flicker',
    frames: [slotFrame('ambient_on'), slotFrame('ambient_off')],
    fps: 6,
    loop: true,
  },
  {
    animation_id: 'agent_lifecycle',
    frames: [
      slotFrame('agent_idle'),
      slotFrame('agent_active'),
      slotFrame('agent_completed'),
    ],
    fps: 4,
    loop: false,
  },
  {
    animation_id: 'path_pulse',
    frames: [slotFrame('path_marker'), slotFrame('particle')],
    fps: 8,
    loop: true,
  },
];
