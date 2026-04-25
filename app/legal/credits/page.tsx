//
// app/legal/credits/page.tsx
//
// Credits and Acknowledgments page for NERIUM, Cerebral Valley plus
// Anthropic hackathon submission, April 2026.
//
// Authored by Eunomia W2 T4 S2 (Admin ops, deferred legal scope) on
// 2026-04-26. Unlike the Terms and Privacy placeholders, this page IS
// substantive and ships in research-preview form. It enumerates: the
// model the product was built with (Anthropic Claude Opus 4.7), the
// hackathon submission target (Cerebral Valley plus Anthropic, April
// 2026), generative AI assets (Nano Banana Pro / Gemini 3 Pro Image
// Preview), open source dependencies, and CC0 / CC-BY asset licenses.
//
// Architecture. Server Component. Mounts the same `.nerium-landing`
// wrapper as `app/page.tsx` so the OKLCH phosphor-green palette tokens
// declared in `app/landing.css` cascade naturally. Three Google fonts
// (VT323, Space Grotesk, JetBrains Mono) are loaded via next/font/google
// and projected as CSS variables on the wrapper, identical to the
// landing page font wiring. Page-specific layout rules live in the
// scoped `app/legal/legal.css` stylesheet.
//

import type { Metadata } from 'next';
import Link from 'next/link';
import { VT323, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import '../../landing.css';
import '../legal.css';

const vt323 = VT323({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-vt323',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-space-grotesk',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'Credits | NERIUM',
  description:
    'Credits and acknowledgments for NERIUM. Built with Anthropic Claude Opus 4.7 for the Cerebral Valley plus Anthropic hackathon, April 2026.',
};

export default function CreditsPage() {
  return (
    <div
      className={`nerium-landing ${vt323.variable} ${spaceGrotesk.variable} ${jetBrainsMono.variable}`}
    >
      <main className="nl-legal">
        <article className="nl-legal-article">
          <Link
            href="/"
            prefetch={false}
            className="nl-legal-back"
            aria-label="Return to NERIUM landing page"
          >
            &lt; back to landing
          </Link>

          <p className="nl-legal-pretitle">&gt; legal</p>
          <h1>Credits and Acknowledgments</h1>
          <p className="nl-legal-updated">
            Last updated: 2026-04-26
          </p>

          <section className="nl-legal-section" aria-labelledby="credits-built">
            <h2 id="credits-built">Built With</h2>
            <p>Anthropic Claude Opus 4.7.</p>
          </section>

          <section className="nl-legal-section" aria-labelledby="credits-submitted">
            <h2 id="credits-submitted">Submitted To</h2>
            <p>Cerebral Valley plus Anthropic Hackathon, April 2026.</p>
          </section>

          <section className="nl-legal-section" aria-labelledby="credits-assets">
            <h2 id="credits-assets">Generative Assets</h2>
            <p>
              AI image assets generated via Nano Banana Pro (Gemini 3 Pro
              Image Preview).
            </p>
          </section>

          <section
            className="nl-legal-section"
            aria-labelledby="credits-dependencies"
          >
            <h2 id="credits-dependencies">Open Source Dependencies</h2>
            <ul>
              <li>Phaser 3</li>
              <li>Next.js 15</li>
              <li>Tailwind CSS v4</li>
              <li>Recharts</li>
              <li>FastAPI</li>
              <li>Pydantic v2</li>
              <li>Postgres 16</li>
              <li>Redis 7</li>
              <li>Arq</li>
              <li>Howler.js</li>
              <li>Zustand</li>
              <li>Framer Motion</li>
              <li>GSAP</li>
              <li>Three.js r128</li>
            </ul>
          </section>

          <section
            className="nl-legal-section"
            aria-labelledby="credits-licenses"
          >
            <h2 id="credits-licenses">Asset Licenses</h2>
            <ul>
              <li>Brullov Oak Woods (CC-BY attribution)</li>
              <li>Kenney.nl (CC0)</li>
              <li>OpenGameArt (mixed CC0 plus CC-BY where attributed)</li>
              <li>Warped City (CC0)</li>
            </ul>
          </section>
        </article>
      </main>
    </div>
  );
}
