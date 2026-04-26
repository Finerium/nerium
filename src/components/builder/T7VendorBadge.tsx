//
// src/components/builder/T7VendorBadge.tsx
//
// T7 (2026-04-26). Pixel-art vendor badge component used inside the
// Builder route. Anthropic + Google have hand-crafted brass medallion
// assets generated for the hackathon (see
// `src/lib/marketplace/pixel_art_assets.ts` BUILDER_PIXEL_ART). The
// remaining 6 vendors (OpenAI, Higgsfield, Seedance, Meta, Mistral, Auto)
// render the Anthropic medallion as the base layer with a per-vendor
// CSS tint overlay declared in `src/styles/builder-pixel-art.css`.
//
// Honest-claim per spawn directive: "Anthropic + Google badges
// hand-crafted, others tinted via brass medallion base for time
// discipline." The first letter of the vendor name renders centered
// for visual differentiation when only the tint is the variant signal.
//

import { VENDOR_BADGE_STYLES } from '../../lib/marketplace/pixel_art_assets';

export type T7VendorId = keyof typeof VENDOR_BADGE_STYLES;

export interface T7VendorBadgeProps {
  readonly vendor: T7VendorId;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly label?: string;
}

export function T7VendorBadge({ vendor, size = 'md', label }: T7VendorBadgeProps) {
  const style = VENDOR_BADGE_STYLES[vendor];
  const ariaLabel = label ?? `Vendor: ${style.label}`;
  const letter = style.label.charAt(0).toUpperCase();

  return (
    <span
      className="t7-builder-vendor-badge"
      data-vendor={vendor}
      data-size={size}
      role="img"
      aria-label={ariaLabel}
      title={style.label}
    >
      <span className="t7-vendor-letter" aria-hidden="true">
        {letter}
      </span>
    </span>
  );
}

export const T7_VENDOR_IDS: readonly T7VendorId[] = [
  'anthropic',
  'google',
  'openai',
  'higgsfield',
  'seedance',
  'meta',
  'mistral',
  'auto',
] as const;
