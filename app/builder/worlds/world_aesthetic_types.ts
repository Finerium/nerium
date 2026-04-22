/**
 * World aesthetic types.
 *
 * Contract: docs/contracts/world_aesthetic.contract.md v0.1.0.
 * Authoring path: Early-Harmonia seeded the minimum surface (WorldId + OKLCHColor)
 * required for design_tokens.contract.md v0.1.0 imports. Thalia extends this file
 * during P3b wave 2 with the full WorldPalette, WorldTypography, WorldMotif, and
 * WorldDescriptor shapes per the world_aesthetic contract.
 */

export type WorldId =
  | 'medieval_desert'
  | 'cyberpunk_shanghai'
  | 'steampunk_victorian';

export const WORLD_IDS: readonly WorldId[] = [
  'medieval_desert',
  'cyberpunk_shanghai',
  'steampunk_victorian',
] as const;

/**
 * OKLCH color expressed as primitive components.
 *
 * l: lightness 0.0 to 1.0
 * c: chroma, approximate useful range 0.0 to 0.4
 * h: hue in degrees 0 to 360
 * alpha: optional opacity 0.0 to 1.0
 */
export interface OKLCHColor {
  l: number;
  c: number;
  h: number;
  alpha?: number;
}

export function isWorldId(value: string): value is WorldId {
  return (WORLD_IDS as readonly string[]).includes(value);
}

export function clampOKLCH(color: OKLCHColor): OKLCHColor {
  const l = Math.min(1, Math.max(0, color.l));
  const c = Math.min(0.4, Math.max(0, color.c));
  const h = ((color.h % 360) + 360) % 360;
  const alpha =
    color.alpha === undefined
      ? undefined
      : Math.min(1, Math.max(0, color.alpha));
  return alpha === undefined ? { l, c, h } : { l, c, h, alpha };
}

export function formatOKLCH(color: OKLCHColor): string {
  const { l, c, h, alpha } = clampOKLCH(color);
  const lStr = l.toFixed(3);
  const cStr = c.toFixed(3);
  const hStr = h.toFixed(1);
  if (alpha === undefined || alpha >= 1) {
    return `oklch(${lStr} ${cStr} ${hStr})`;
  }
  return `oklch(${lStr} ${cStr} ${hStr} / ${alpha.toFixed(3)})`;
}
