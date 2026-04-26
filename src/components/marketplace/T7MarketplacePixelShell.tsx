//
// src/components/marketplace/T7MarketplacePixelShell.tsx
//
// T7 (2026-04-26). Pixel-art skin shell for the Marketplace web routes
// (/marketplace, /marketplace/search, /marketplace/dashboard). Provides
// the Apollo Village night-themed shop interior background, the
// honest-claim banner pointing judges back to the canonical in-game
// surface at /play, and a centered content slot that the existing
// Phanes / Hyperion / Iapetus components render into.
//
// Design language matches `src/styles/marketplace-pixel-art.css`. The
// component is purely presentational: no state, no effects, no event
// listeners. All children render inside `.t7-marketplace-pixel-content`
// so existing inline styles cascade through unmolested.
//

import Link from 'next/link';
import type { ReactNode } from 'react';

export interface T7MarketplacePixelShellProps {
  readonly eyebrow?: string;
  readonly heading?: string;
  readonly tagline?: string;
  readonly children: ReactNode;
}

export function T7MarketplacePixelShell({
  eyebrow = 'Marketplace',
  heading,
  tagline,
  children,
}: T7MarketplacePixelShellProps) {
  return (
    <div className="t7-marketplace-pixel" data-t7-shell="marketplace">
      <div className="t7-marketplace-pixel-content">
        <p className="t7-honest-banner" role="note">
          Web companion view. Primary product surface is the in-game world at
          <Link href="/play" prefetch={false}>
            /play
          </Link>
        </p>
        {(heading ?? tagline ?? eyebrow) ? (
          <header className="t7-marketplace-header">
            {eyebrow ? <div className="t7-eyebrow">{eyebrow}</div> : null}
            {heading ? <h1>{heading}</h1> : null}
            {tagline ? <p>{tagline}</p> : null}
          </header>
        ) : null}
        {children}
      </div>
    </div>
  );
}
