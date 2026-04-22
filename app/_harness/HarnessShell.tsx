//
// HarnessShell.tsx
//
// Nemea Phase 5 QA emergency harness shared chrome (2026-04-22). Wraps every
// pillar demo route with:
//
//   - Honest-claim banner (NarasiGhaisan Section 16)
//   - Sticky pillar navigation
//   - Consistent section scaffolding
//
// Server component. No state, no effects. Accepts children for the pillar's
// demo body.
//

import Link from 'next/link';
import type { ReactNode } from 'react';

export interface HarnessShellProps {
  readonly heading: string;
  readonly sub: string;
  readonly children: ReactNode;
}

const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/', label: 'Home' },
  { href: '/builder', label: 'Builder' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/banking', label: 'Banking' },
  { href: '/registry', label: 'Registry' },
  { href: '/protocol', label: 'Protocol' },
  { href: '/advisor', label: 'Advisor' },
];

export function HarnessShell({ heading, sub, children }: HarnessShellProps) {
  return (
    <div className="nemea-harness-shell">
      <div className="nemea-harness-banner" role="note">
        <strong>Demo harness.</strong>
        <span style={{ marginLeft: '0.5rem' }}>
          Worker components rendered against cached or seed data. Multi-vendor
          lanes stubbed. Banking transactions mock. No live Stripe, no live
          Gemini, no live MA session.
        </span>
      </div>
      <nav className="nemea-harness-nav" aria-label="Pillar navigation">
        <span className="nemea-harness-nav-title">NERIUM</span>
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="nemea-harness-nav-link"
            prefetch={false}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <main className="nemea-harness-main">
        <section className="nemea-harness-section">
          <h1 className="nemea-harness-section-heading">{heading}</h1>
          <p className="nemea-harness-section-meta">{sub}</p>
          {children}
        </section>
      </main>
    </div>
  );
}
