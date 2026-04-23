'use client';

//
// src/components/landing/CTASection.tsx
//
// Final CTA block + footer, aesthetic-fidelity port of Claude Design mockup
// final section. Two surfaces in one file:
//
//   1. #nl-final - dominant CTA "build production apps by playing a game."
//      with primary button routing to /play via Next.js Link (not the
//      alert() stub from the mockup, because by W3 the /play route is
//      actually live).
//   2. .nl-footer - credits, repo link, back-to-top anchor.
//
// Client Component only because of the #nl-final scroll-reveal. Footer is
// static content but hitches a ride on the same file to keep the landing
// component tree shallow (four section components registered in the M2
// Kalypso spec: Hero, MetaNarrative, Pillars, CTA).
//
// prefers-reduced-motion snaps the reveal to final state.
//
// MIT license + Discord handle + GitHub repo all preserved. These are V1 +
// V2 locks: CLAUDE.md Submission section, NarasiGhaisan Section 14.
//

import Link from 'next/link';
import { useEffect, useRef } from 'react';

export function CTASection() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const reveals = Array.from(root.querySelectorAll<HTMLElement>('.nl-reveal'));

    if (reduced) {
      reveals.forEach((el) => el.classList.add('in'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    reveals.forEach((el) => io.observe(el));

    return () => io.disconnect();
  }, []);

  return (
    <div ref={rootRef}>
      <section className="nl-final" id="nl-final" aria-label="Play the demo">
        <div className="nl-reveal" style={{ width: '100%' }}>
          <p className="nl-pretitle">&gt; press start</p>
          <h2>
            build production apps
            <br />
            by <span>playing a game</span>.
          </h2>
          <Link
            href="/play"
            prefetch={false}
            className="nl-btn nl-btn-primary"
            aria-label="Play the vertical slice"
          >
            <span className="nl-arrow">&gt;</span> play in browser
          </Link>
        </div>
      </section>

      <footer className="nl-footer">
        <div className="nl-credits">
          MIT license · built with Opus 4.7 for Cerebral Valley + Anthropic,
          April 2026 · pixel sprites and procedural backdrops by Opus 4.7,
          phosphor-green palette OKLCH, CC0 asset packs (Kenney, OpenGameArt)
          referenced in <code>public/assets/CREDITS.md</code>.
        </div>
        <div className="nl-foot-right">
          <a
            href="https://github.com/Finerium/nerium"
            target="_blank"
            rel="noopener noreferrer"
          >
            github.com/Finerium/nerium
          </a>
          <span>discord: nerium0leander</span>
          <a href="#nl-top">back to top</a>
        </div>
      </footer>
    </div>
  );
}
