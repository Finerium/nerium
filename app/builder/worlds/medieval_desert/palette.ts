//
// medieval_desert/palette.ts
//
// Conforms to: docs/contracts/world_aesthetic.contract.md v0.1.0 Section 3
//              (WorldPalette OKLCH primitive shape).
// Values mirror app/shared/design/tokens.ts medieval_desert.colors; this
// file exposes them as OKLCHColor primitives for non-CSS consumers (Pixi
// sprite tinting, Framer Motion color interpolation, procedural rendering).
//

import type { WorldPalette } from '../world_aesthetic_types';

export const medievalDesertPalette: WorldPalette = {
  primary:    { l: 0.620, c: 0.140, h:  45.0 },
  secondary:  { l: 0.820, c: 0.100, h:  85.0 },
  accent:     { l: 0.750, c: 0.180, h:  70.0 },
  background: { l: 0.920, c: 0.030, h:  80.0 },
  foreground: { l: 0.220, c: 0.030, h:  50.0 },
  muted:      { l: 0.700, c: 0.040, h:  75.0 },
  success:    { l: 0.580, c: 0.100, h: 135.0 },
  warning:    { l: 0.720, c: 0.160, h:  70.0 },
  critical:   { l: 0.480, c: 0.160, h:  25.0 },
};
