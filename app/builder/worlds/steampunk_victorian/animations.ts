//
// steampunk_victorian/animations.ts
//
// Conforms to: docs/contracts/sprite_atlas.contract.md v0.1.0 Section 3.
// Gas lamp flicker runs at 3 fps for a steady but perceptible pulse. Steam
// puff overlays the path marker; both sit between medieval slowness and
// cyberpunk pulse speed.
//

import type { SpriteAnimation } from '../sprite_atlas_types';
import { slotFrame } from '../sprite_slots';

export const steampunkVictorianAnimations: SpriteAnimation[] = [
  {
    animation_id: 'ambient_flicker',
    frames: [slotFrame('ambient_on'), slotFrame('ambient_off')],
    fps: 3,
    loop: true,
  },
  {
    animation_id: 'agent_lifecycle',
    frames: [
      slotFrame('agent_idle'),
      slotFrame('agent_active'),
      slotFrame('agent_completed'),
    ],
    fps: 3,
    loop: false,
  },
  {
    animation_id: 'path_pulse',
    frames: [slotFrame('path_marker'), slotFrame('particle')],
    fps: 4,
    loop: true,
  },
];
