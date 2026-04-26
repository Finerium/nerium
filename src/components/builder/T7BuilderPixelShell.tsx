//
// src/components/builder/T7BuilderPixelShell.tsx
//
// T7 (2026-04-26). Pixel-art skin shell for the Builder web route
// (/builder). Provides the Apollo Village night-themed workshop interior
// background, the honest-claim banner pointing judges back to the
// canonical in-game surface at /play, and a centered content slot that
// the existing Erato HUD components render into.
//
// Design language matches `src/styles/builder-pixel-art.css`. The
// component is purely presentational: no state, no effects, no event
// listeners. Phase 1.5 BYOK ApiKeyModal, Wave A T3 ModelSelectionModal,
// and Phase 1.5 TheatricalSpawnAnimation render unmodified inside this
// shell per T7 anti-collision discipline.
//

import Link from 'next/link';
import type { ReactNode } from 'react';

export interface T7BuilderPixelShellProps {
  readonly eyebrow?: string;
  readonly heading?: string;
  readonly tagline?: string;
  readonly children: ReactNode;
}

export function T7BuilderPixelShell({
  eyebrow = 'Builder',
  heading,
  tagline,
  children,
}: T7BuilderPixelShellProps) {
  return (
    <div className="t7-builder-pixel" data-t7-shell="builder">
      <div className="t7-builder-pixel-content">
        <p className="t7-honest-banner" role="note">
          Web companion view. Primary product surface is the in-game world at
          <Link href="/play" prefetch={false}>
            /play
          </Link>
        </p>
        {(heading ?? tagline ?? eyebrow) ? (
          <header className="t7-builder-header">
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
