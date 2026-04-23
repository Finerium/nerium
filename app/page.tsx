//
// app/page.tsx
//
// NERIUM landing page. Server Component entry point for the `/` route per
// RV_PLAN.md RV.5 (landing minimal scope) and M2 Section 4.8 Kalypso spec.
// Aesthetic-fidelity port of Claude Design mockup at
// _skills_staging/claude_design_landing.html (Kalypso W3, 2026-04-23).
//
// Architecture. This Server Component renders:
//   - Three next/font/google font loaders (VT323, Space Grotesk,
//     JetBrains Mono), projected as CSS variables on the landing wrapper
//     element. The wrapper class `.nerium-landing` scopes every landing
//     style in `./landing.css` so nothing leaks into the `/play` route.
//   - LandingBackground (Client): 6 parallax scenes, CRT scanfield,
//     vignette, phosphor dust, flickers, pipeline procession, scene-swap.
//   - LandingNav (Server): top nav band.
//   - HeroSection (Client): terminal boot, NERIUM logotype char stagger,
//     walker sprite, tagline, meta-narrative hook, 2 CTAs, hero video.
//   - MetaNarrativeSection (Client): "what / pain / manifesto" triple
//     section including counter rollup and "replaces" list.
//   - PillarsSection (Client): 5-pillar board with Builder hero card.
//   - CTASection (Client): final CTA + footer.
//
// Path audit. The active Next.js App Router lives at project root `app/`
// per `app/layout.tsx`, `app/play/page.tsx`, `tsconfig.json`, and
// `next.config.ts`. Session opening prompt referenced `src/app/page.tsx` as
// target, but per `_meta/translator_notes.md` gotcha 19 the route MUST sit
// at the actual active router to avoid silent 404. Components still live at
// `src/components/landing/*` per session spec. Decision logged in
// `docs/kalypso.decisions.md` D1.
//
// NO embedded Phaser canvas on this surface. NO 3D WebGL, NO Three.js
// import. Tailwind + Framer Motion + Canvas 2D only; scene-swap and boot
// choreography use Web Animations API + IntersectionObserver.
//
// The layout.tsx at project root still applies its theme-boot harness
// globally. The landing page renders underneath the harness chrome but
// every visual rule on this route is anchored to `.nerium-landing` so the
// harness defaults are harmlessly overridden.
//

import type { Metadata } from 'next';
import { VT323, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { HeroSection } from '../src/components/landing/HeroSection';
import { MetaNarrativeSection } from '../src/components/landing/MetaNarrativeSection';
import { PillarsSection } from '../src/components/landing/PillarsSection';
import { CTASection } from '../src/components/landing/CTASection';
import { LandingBackground } from '../src/components/landing/LandingBackground';
import { LandingNav } from '../src/components/landing/LandingNav';
import './landing.css';

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
  title: 'NERIUM. Infrastructure for the AI agent economy.',
  description:
    'NERIUM is a five-pillar platform for the AI agent economy. Builder is the flagship, a playable 2D RPG that ships production apps. Marketplace, Banking, Registry, and Protocol round out the stack. Built with Opus 4.7 for the Cerebral Valley plus Anthropic hackathon, April 2026.',
  openGraph: {
    title: 'NERIUM. Infrastructure for the AI agent economy.',
    description:
      'A five-pillar platform. Builder is a game. Built with Opus 4.7. Open source from day one.',
    url: 'https://github.com/Finerium/nerium',
    siteName: 'NERIUM',
    type: 'website',
  },
};

export default function LandingPage() {
  return (
    <div
      className={`nerium-landing ${vt323.variable} ${spaceGrotesk.variable} ${jetBrainsMono.variable}`}
    >
      <LandingBackground />
      <LandingNav />
      <HeroSection />
      <MetaNarrativeSection />
      <PillarsSection />
      <CTASection />
    </div>
  );
}
