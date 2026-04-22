//
// steampunk_victorian/palette.ts
//
// Conforms to: docs/contracts/world_aesthetic.contract.md v0.1.0 Section 3.
// Values mirror app/shared/design/tokens.ts steampunk_victorian.colors.
//

import type { WorldPalette } from '../world_aesthetic_types';

export const steampunkVictorianPalette: WorldPalette = {
  primary:    { l: 0.680, c: 0.110, h:  78.0 },
  secondary:  { l: 0.380, c: 0.130, h:  25.0 },
  accent:     { l: 0.580, c: 0.120, h:  48.0 },
  background: { l: 0.900, c: 0.030, h:  85.0 },
  foreground: { l: 0.280, c: 0.040, h:  55.0 },
  muted:      { l: 0.720, c: 0.040, h:  80.0 },
  success:    { l: 0.580, c: 0.090, h: 160.0 },
  warning:    { l: 0.700, c: 0.140, h:  70.0 },
  critical:   { l: 0.320, c: 0.140, h:  20.0 },
};
