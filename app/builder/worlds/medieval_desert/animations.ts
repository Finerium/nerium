//
// medieval_desert/animations.ts
//
// Conforms to: docs/contracts/sprite_atlas.contract.md v0.1.0 Section 3
//              (SpriteAnimation shape).
// Torch flicker runs at 2 fps for a slow flame cadence; agent lifecycle is
// a non-looping 3-frame trigger stepped by ConstructionAnimation when a
// specialist emits pipeline.step.started / pipeline.step.completed.
//

import type { SpriteAnimation } from '../sprite_atlas_types';
import { slotFrame } from '../sprite_slots';

export const medievalDesertAnimations: SpriteAnimation[] = [
  {
    animation_id: 'ambient_flicker',
    frames: [slotFrame('ambient_on'), slotFrame('ambient_off')],
    fps: 2,
    loop: true,
  },
  {
    animation_id: 'agent_lifecycle',
    frames: [
      slotFrame('agent_idle'),
      slotFrame('agent_active'),
      slotFrame('agent_completed'),
    ],
    fps: 2,
    loop: false,
  },
  {
    animation_id: 'path_pulse',
    frames: [slotFrame('path_marker'), slotFrame('particle')],
    fps: 3,
    loop: true,
  },
];
