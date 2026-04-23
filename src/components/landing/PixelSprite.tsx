'use client';

//
// src/components/landing/PixelSprite.tsx
//
// Inline pixel sprite renderer, ported from the box-shadow grid technique in
// Claude Design mockup _skills_staging/claude_design_landing.html. Each
// sprite is a glyph-grid of ASCII palette codes; PixelSprite maps codes to
// OKLCH colors and composes them into a single element's box-shadow stack.
//
// Shipped as inline SVG would be possible too, but the box-shadow stack is
// exactly what the mockup does and we preserve that technique to keep the
// pixel grain identical. One seed span per sprite, one box-shadow value per
// colored pixel. React handles re-render only on prop change.
//
// Used by PillarsSection and HeroSection. No animation here; the parent
// animates transform + opacity on reveal.
//

import { useMemo } from 'react';

const PAL: Record<string, string | null> = {
  ' ': null,
  '.': 'oklch(0.14 0.012 250)',
  K: 'oklch(0.08 0.01 250)',
  W: 'oklch(0.95 0.01 85)',
  G: 'oklch(0.88 0.15 140)',
  g: 'oklch(0.55 0.12 140)',
  A: 'oklch(0.78 0.17 55)',
  R: 'oklch(0.72 0.18 20)',
  B: 'oklch(0.32 0.02 250)',
  S: 'oklch(0.72 0.02 250)',
};

export type SpriteName = 'walker' | 'builder' | 'market' | 'bank' | 'registry' | 'protocol';

const SPRITES: Record<SpriteName, readonly string[]> = {
  walker: [
    '  KKKK  ',
    ' KAAAAK ',
    ' KWAAWK ',
    ' KAAAAK ',
    '  KGGK  ',
    ' KGGGGK ',
    ' K K KK ',
    ' K   K  ',
  ],
  builder: [
    '       GG       ',
    '      GWWG      ',
    '      GWWG      ',
    '      GWWG      ',
    '     GGWWGG     ',
    '      GGGG      ',
    '       GG       ',
    '  K    GG    K  ',
    '  KK   GG   KK  ',
    '   KK  GG  KK   ',
    '    KK GG KK    ',
    '     KKGGKK     ',
    '      KGGK      ',
    '       GG       ',
    '    AAAAAAAA    ',
    '     A    A     ',
  ],
  market: [
    '   AAAAAA   ',
    '  AWWWWWWA  ',
    ' AWAAAAAAWA ',
    ' AWAWWWWAWA ',
    ' AWAAAAAAWA ',
    '  AWWWWWWA  ',
    '  AAAAAAAA  ',
    ' AWWWWWWWWA ',
    'AWAAAAAAAAWA',
    ' AWWWWWWWWA ',
    '  AAAAAAAA  ',
    '            ',
  ],
  bank: [
    'KKKKKKKKKKKK',
    'K          K',
    'K   KKKK   K',
    'K  KWWWWK  K',
    'K  KWGGWK  K',
    'K  KWGGWK  K',
    'K  KWWWWK  K',
    'K   KKKK   K',
    'K    KK    K',
    'K    KK    K',
    'K          K',
    'KKKKKKKKKKKK',
  ],
  registry: [
    '     GG     ',
    '    GWWG    ',
    '   GWGGWG   ',
    '  GWG  GWG  ',
    ' GWG    GWG ',
    'GWG  GG  GWG',
    'GWG  GG  GWG',
    ' GWG    GWG ',
    '  GWG  GWG  ',
    '   GWGGWG   ',
    '    GWWG    ',
    '     GG     ',
  ],
  protocol: [
    'G          G',
    'GG        GG',
    'GGG      GGG',
    ' GGG    GGG ',
    '  GGG  GGG  ',
    '   GGGGGG   ',
    '   AAAAAA   ',
    '  AAA  AAA  ',
    ' AAA    AAA ',
    'AAA      AAA',
    'AA        AA',
    'A          A',
  ],
};

export interface PixelSpriteProps {
  name: SpriteName;
  /** Overall pixel art box size in px. Actual per-pixel cell is computed from this over the grid height. */
  size: number;
  ariaLabel?: string;
}

export function PixelSprite({ name, size, ariaLabel }: PixelSpriteProps) {
  const { width, height, boxShadow } = useMemo(() => {
    const grid = SPRITES[name];
    const gh = grid.length;
    const gw = grid[0].length;
    const pxSize = Math.max(1, Math.floor(size / gh));
    const shadows: string[] = [];
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const code = grid[y][x];
        const color = PAL[code];
        if (!color) continue;
        shadows.push(`${x * pxSize}px ${y * pxSize}px 0 ${color}`);
      }
    }
    return {
      width: gw * pxSize,
      height: gh * pxSize,
      boxShadow: shadows.join(','),
    };
  }, [name, size]);

  return (
    <span
      className="nl-sprite"
      role={ariaLabel ? 'img' : 'presentation'}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : 'true'}
      style={{ display: 'inline-block', position: 'relative', width, height }}
    >
      <span
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: Math.max(1, Math.floor(size / SPRITES[name].length)),
          height: Math.max(1, Math.floor(size / SPRITES[name].length)),
          background: 'transparent',
          boxShadow,
        }}
      />
    </span>
  );
}
