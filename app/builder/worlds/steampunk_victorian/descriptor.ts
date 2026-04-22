//
// steampunk_victorian/descriptor.ts
//
// Conforms to: docs/contracts/world_aesthetic.contract.md v0.1.0 Section 3.
// Inspirations per V2 proposal Section 7: BioShock Columbia aerial
// promenade, polished brass, oxblood upholstery, walnut wainscoting.
// Line-engraving silhouette bridges medieval warmth and cyberpunk chroma
// discipline. 450 ms default duration sits between the two.
//

import type { WorldDescriptor } from '../world_aesthetic_types';
import { steampunkVictorianPalette } from './palette';

export const steampunkVictorianDescriptor: WorldDescriptor = {
  world_id: 'steampunk_victorian',
  display_name: 'Steampunk Victorian',
  palette: steampunkVictorianPalette,
  typography: {
    heading_font_family:
      '"Cinzel", "IM Fell English SC", "Trajan Pro", "Iowan Old Style", Georgia, serif',
    body_font_family:
      '"Lora", "Libre Baskerville", "Iowan Old Style", Georgia, serif',
    mono_font_family:
      '"IBM Plex Mono", "Courier New", Menlo, monospace',
    heading_weight: 600,
    body_weight: 400,
    scale_ratio: 1.25,
  },
  motif: {
    silhouette_style: 'line_engraving',
    default_animation_duration_ms: 450,
    audio_theme_id: 'steampunk_clockwork',
    description:
      'BioShock Columbia aerial promenade, gas-lamp brass, oxblood upholstery, walnut wainscoting. Engraved line silhouettes.',
  },
  sprite_atlas_id: 'steampunk_victorian_atlas_v1',
};
