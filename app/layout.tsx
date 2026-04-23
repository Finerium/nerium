//
// app/layout.tsx
//
// Nemea Phase 5 QA emergency routing harness (2026-04-22).
//
// Purpose: unblock dev-server rendering so judges can run `npm install && npm
// run dev` per README and see the pillar surfaces. Without a root layout and
// at least one page, Next.js 15 App Router serves 404 on every route.
//
// Scope boundary: this file is Nemea-authored harness, not a Worker canonical
// output. Post-hackathon refactor target: fold any useful patterns here into
// Apollo mount layer or a Hephaestus-authored canonical scaffold. The harness
// does nothing beyond HTML scaffold, theme hydration, and children render.
//
// Honest-claim: surfaces served through this harness are the same Worker
// components already committed. The harness adds no new content, no new data,
// and no new mock.
//

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ClientThemeBoot } from './_harness/ClientThemeBoot';
import './globals.css';
import './_harness/harness.css';

export const metadata: Metadata = {
  title: 'NERIUM. Infrastructure for the AI agent economy.',
  description:
    'NERIUM is a five-pillar platform for the AI agent economy: Builder, Marketplace, Banking, Registry, Protocol. Built with Opus 4.7 for the Cerebral Valley plus Anthropic hackathon, April 2026.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-world="cyberpunk_shanghai">
      <body>
        <ClientThemeBoot />
        {children}
      </body>
    </html>
  );
}
