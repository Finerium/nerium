//
// cyberpunk_shanghai/palette.ts
//
// Conforms to: docs/contracts/world_aesthetic.contract.md v0.1.0 Section 3.
// Values mirror app/shared/design/tokens.ts cyberpunk_shanghai.colors.
//

import type { WorldPalette } from '../world_aesthetic_types';

export const cyberpunkShanghaiPalette: WorldPalette = {
  primary:    { l: 0.830, c: 0.150, h: 200.0 },
  secondary:  { l: 0.660, c: 0.270, h:   5.0 },
  accent:     { l: 0.620, c: 0.220, h: 295.0 },
  background: { l: 0.100, c: 0.020, h: 270.0 },
  foreground: { l: 0.940, c: 0.020, h: 265.0 },
  muted:      { l: 0.580, c: 0.030, h: 275.0 },
  success:    { l: 0.780, c: 0.220, h: 150.0 },
  warning:    { l: 0.820, c: 0.170, h:  80.0 },
  critical:   { l: 0.620, c: 0.280, h:  15.0 },
};
