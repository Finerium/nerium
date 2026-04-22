//
// cyberpunk_shanghai/descriptor.ts
//
// Conforms to: docs/contracts/world_aesthetic.contract.md v0.1.0 Section 3.
// Inspirations per NarasiGhaisan Section 7: Blade Runner 2049 rain, Ghost
// in the Shell neon, Shanghai pagoda skyline with holographic overlays.
// Neon outline silhouette, shortest default duration (300 ms) evokes the
// quick pulse of a dense neon grid.
//

import type { WorldDescriptor } from '../world_aesthetic_types';
import { cyberpunkShanghaiPalette } from './palette';

export const cyberpunkShanghaiDescriptor: WorldDescriptor = {
  world_id: 'cyberpunk_shanghai',
  display_name: 'Cyberpunk Shanghai',
  palette: cyberpunkShanghaiPalette,
  typography: {
    heading_font_family:
      '"Orbitron", "Exo 2", "Rajdhani", "Inter", system-ui, sans-serif',
    body_font_family:
      '"Inter", system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    mono_font_family:
      '"Share Tech Mono", "JetBrains Mono", "Courier New", monospace',
    heading_weight: 700,
    body_weight: 400,
    scale_ratio: 1.25,
  },
  motif: {
    silhouette_style: 'neon_outline',
    default_animation_duration_ms: 300,
    audio_theme_id: 'cyberpunk_neon_rain',
    description:
      'Blade Runner 2049 rain, Ghost in the Shell holograms, Shanghai skyline at night. Cyan and magenta on void.',
  },
  sprite_atlas_id: 'cyberpunk_shanghai_atlas_v1',
};
