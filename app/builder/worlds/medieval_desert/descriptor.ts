//
// medieval_desert/descriptor.ts
//
// Conforms to: docs/contracts/world_aesthetic.contract.md v0.1.0 Section 3.
// Inspirations per NarasiGhaisan Section 7: warm terracotta Moroccan souk,
// Dune Arrakeen noon, Mos Eisley dusk. Pixel silhouette category; longest
// default animation duration of the three worlds (600 ms) evokes the slow
// solar cadence of a desert afternoon.
//

import type { WorldDescriptor } from '../world_aesthetic_types';
import { medievalDesertPalette } from './palette';

export const medievalDesertDescriptor: WorldDescriptor = {
  world_id: 'medieval_desert',
  display_name: 'Medieval Desert',
  palette: medievalDesertPalette,
  typography: {
    heading_font_family:
      '"Cormorant Garamond", "Cormorant", "Trajan Pro", "Iowan Old Style", Georgia, serif',
    body_font_family:
      '"Spectral", "Cormorant", "Iowan Old Style", Georgia, serif',
    mono_font_family:
      '"JetBrains Mono", "Fira Code", Menlo, "Courier New", monospace',
    heading_weight: 600,
    body_weight: 400,
    scale_ratio: 1.25,
  },
  motif: {
    silhouette_style: 'pixel',
    default_animation_duration_ms: 600,
    audio_theme_id: 'medieval_souk_ambient',
    description:
      'Moroccan souk at noon, Dune Arrakeen terracotta, Mos Eisley dust. Warm earthen palette, slow cadence.',
  },
  sprite_atlas_id: 'medieval_desert_atlas_v1',
};
