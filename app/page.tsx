//
// app/page.tsx
//
// NERIUM landing page. Server Component entry point for the `/` route per
// RV_PLAN.md RV.5 (landing minimal scope) and M2 Section 4.8 Kalypso spec.
//
// Architecture: this Server Component renders four composed landing
// sections. Each section is a Client Component because Framer Motion
// scroll-reveal animations need the browser runtime. The page itself stays
// a Server Component to keep TTFB fast and avoid shipping unnecessary
// client-side JS at the page boundary.
//
// Path audit: the active Next.js App Router lives at project root `app/`
// per `app/layout.tsx`, `app/play/page.tsx`, `tsconfig.json`, and
// `next.config.ts`. Session opening prompt referenced `src/app/page.tsx` as
// target, but per `_meta/translator_notes.md` gotcha 19 the route MUST sit
// at the actual active router to avoid silent 404. Components still live at
// `src/components/landing/*` per session spec. Decision logged in
// `docs/kalypso.decisions.md`.
//
// This file supersedes the Nemea-v1 Phase 5 QA emergency harness landing
// (pillar-card index page) per `docs/phase_rv/REUSE_REWRITE_MATRIX.md`
// Section 19 PORT decision (`app/page.tsx -> Kalypso landing page`).
//
// NO embedded Phaser canvas on this surface. NO 3D WebGL on this surface.
// Link to `/play` only (M2 Section 4.8 hard stops).
//

import type { Metadata } from 'next';
import { HeroSection } from '../src/components/landing/HeroSection';
import { MetaNarrativeSection } from '../src/components/landing/MetaNarrativeSection';
import { PillarsSection } from '../src/components/landing/PillarsSection';
import { CTASection } from '../src/components/landing/CTASection';

export const metadata: Metadata = {
  title: 'NERIUM. Infrastructure for the AI agent economy.',
  description:
    'NERIUM is a five-pillar platform for the AI agent economy. Builder is the flagship, a gamified agent orchestrator you play through in a browser. Marketplace, Banking, Registry, and Protocol round out the stack. Built with Opus 4.7 for the Cerebral Valley plus Anthropic hackathon, April 2026.',
  openGraph: {
    title: 'NERIUM. Infrastructure for the AI agent economy.',
    description:
      'A five-pillar platform. Built with Opus 4.7. Open source from day one.',
    url: 'https://github.com/Finerium/nerium',
    siteName: 'NERIUM',
    type: 'website',
  },
};

export default function LandingPage() {
  return (
    <main className="min-h-screen w-full bg-background text-foreground">
      <HeroSection />
      <MetaNarrativeSection />
      <PillarsSection />
      <CTASection />
    </main>
  );
}
