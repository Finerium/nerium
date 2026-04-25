//
// app/legal/terms/page.tsx
//
// Terms of Service placeholder for the NERIUM research preview.
//
// Authored by Eunomia W2 T4 S2 (Admin ops, deferred legal scope) on
// 2026-04-26. This is a research-preview placeholder, NOT final legal
// text. The full Terms of Service will be populated via a Termly template
// before public launch. The page carries an honest "draft, pending Termly
// template paste" banner per NarasiGhaisan honest-claim discipline
// (Section 16) and CLAUDE.md anti-pattern 1.
//
// Architecture. Server Component. Mounts the same `.nerium-landing`
// wrapper as `app/page.tsx` so the OKLCH phosphor-green palette tokens
// declared in `app/landing.css` cascade naturally. Three Google fonts
// (VT323, Space Grotesk, JetBrains Mono) are loaded via next/font/google
// and projected as CSS variables on the wrapper, identical to the
// landing page font wiring. Page-specific layout rules live in the
// scoped `app/legal/legal.css` stylesheet.
//
// Honest-claim. Body copy explicitly says "placeholder" and references
// the pending Termly template paste. The amber banner repeats this above
// the fold so judges and research-preview users cannot mistake this for
// a finalised legal document.
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
  title: 'Terms of Service | NERIUM',
  description:
    'Research-preview placeholder for NERIUM Terms of Service. Final terms will be populated via Termly template before public launch.',
};

export default function TermsPage() {
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
          <h1>Terms of Service</h1>
          <p className="nl-legal-updated">
            Last updated: 2026-04-26 (placeholder, pending Termly template paste)
          </p>

          <div className="nl-legal-banner" role="note">
            <strong>Draft, pending legal review</strong>
            This page is a research-preview placeholder. The final Terms of
            Service will be populated via a Termly template before public
            launch. Do not treat this surface as a binding legal document.
          </div>

          <section className="nl-legal-section" aria-labelledby="terms-overview">
            <h2 id="terms-overview">Overview</h2>
            <p>
              This page will be populated with the full Terms of Service via
              Termly template before launch. For inquiries during research
              preview, contact{' '}
              <a href="mailto:privacy@nerium.com">privacy@nerium.com</a>.
            </p>
            <p>
              NERIUM is research-preview infrastructure for the AI agent
              economy. Use of the preview implies acceptance of reasonable
              caveats: services may change, data may be reset, features may
              be added or removed without notice during the preview window.
            </p>
          </section>

          <section className="nl-legal-section" aria-labelledby="terms-contact">
            <h2 id="terms-contact">Contact</h2>
            <p className="nl-legal-contact">
              For terms-related inquiries during the research preview, reach
              the team at{' '}
              <a href="mailto:privacy@nerium.com">privacy@nerium.com</a>.
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
