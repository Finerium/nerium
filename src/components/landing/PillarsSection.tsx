'use client';

//
// src/components/landing/PillarsSection.tsx
//
// 5-pillar brief per V1 lock full-5-pillar scope + RV.3 in-game integration
// direction. Builder is the hero pillar; Marketplace, Banking, Registry, and
// Protocol integrate as in-game systems within the Apollo Village main lobby
// per RV_PLAN.md Section 1.
//
// Honest-claim discipline per CLAUDE.md Section 7 anti-patterns: each pillar
// card includes a scope note that mentions what ships in the RV vertical
// slice versus what is prototype surface only. Ghaisan's directive (V1
// locked decision) is that all 5 pillars are buildable as prototype; the
// landing page respects that by calling out the prototype framing honestly
// rather than claiming live product features.
//
// Scroll-reveal via Framer Motion staggered children. No 3D, no WebGL.
//

import { motion, useReducedMotion } from 'framer-motion';

type Pillar = {
  name: string;
  tagline: string;
  scope: string;
  scopeLabel: 'vertical slice' | 'prototype surface';
  roleHint: string;
};

const PILLARS: ReadonlyArray<Pillar> = [
  {
    name: 'Builder',
    tagline:
      'Gamified agent orchestrator. Describe what you want, a team of agents plans and ships it.',
    scope:
      'Vertical slice ships as a Phaser 3 browser game at /play. Apollo Village lobby, Lumio onboarding quest, cached mini Builder cinematic, inventory reward on completion.',
    scopeLabel: 'vertical slice',
    roleHint: 'Hero pillar. Deepest implementation.',
  },
  {
    name: 'Marketplace',
    tagline:
      'Neutral cross-vendor storefront for agents, MCP servers, automation workflows.',
    scope:
      'Prototype surface. Integrated as in-game shop inside Apollo Village. Mock catalog of 18 listings, honest-claim annotations on vendor origin. Full neutral marketplace ships post-hackathon.',
    scopeLabel: 'prototype surface',
    roleHint: 'Where restaurant automation creators finally have a home.',
  },
  {
    name: 'Banking',
    tagline:
      'Usage-based metering. Stripe for the agent economy. Charge per execution the way utilities charge per kilowatt-hour.',
    scope:
      'Prototype surface. Integrated as in-game currency HUD plus transaction pulse. Cost meter uses dual-locale formatting (USD and IDR). Real payment rails ship post-hackathon.',
    scopeLabel: 'prototype surface',
    roleHint: 'Tagihan listrik buat agent lu.',
  },
  {
    name: 'Registry',
    tagline:
      'Identity, trust score, and audit trail per agent. The DNS of the AI agent layer.',
    scope:
      'Prototype surface. Integrated as in-game NPC trust meter overlay. Mock identity cards with audit trail expand. Real cryptographic identity ships post-hackathon.',
    scopeLabel: 'prototype surface',
    roleHint: 'Trust, verified.',
  },
  {
    name: 'Protocol',
    tagline:
      'Cross-model translation. Claude keeps its XML tags, Gemini speaks native, the glue preserves each.',
    scope:
      'Prototype surface. Integrated as in-game caravan faction NPC demo. Claude adapter live, Gemini adapter serialize-only mock with honest-claim annotation. Full multi-vendor unlock post-hackathon.',
    scopeLabel: 'prototype surface',
    roleHint: 'Infrastructure agnostic, not vendor partisan.',
  },
];

export function PillarsSection() {
  const reduceMotion = useReducedMotion();

  const containerReveal = reduceMotion
    ? { initial: {}, whileInView: {}, viewport: {}, transition: {} }
    : {
        initial: { opacity: 0, y: 24 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.15 },
        transition: { duration: 0.6, ease: 'easeOut' as const },
      };

  const cardReveal = (index: number) =>
    reduceMotion
      ? { initial: {}, whileInView: {}, viewport: {}, transition: {} }
      : {
          initial: { opacity: 0, y: 24 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, amount: 0.2 },
          transition: {
            duration: 0.5,
            delay: 0.1 + index * 0.08,
            ease: 'easeOut' as const,
          },
        };

  return (
    <section
      id="pillars"
      aria-label="NERIUM five pillars"
      className="w-full bg-background px-6 py-24 text-foreground sm:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <motion.div {...containerReveal} className="mb-16">
          <p className="mb-4 font-mono text-sm uppercase tracking-[0.3em] text-primary">
            Five pillars
          </p>
          <h2 className="max-w-3xl font-serif text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl">
            AWS plus Stripe plus DNS plus HTTP for the agent economy.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            The agent economy already exists in fragments. The missing layer is
            infrastructure. Builder is the flagship; the other four pillars
            round out the stack as prototype surfaces that integrate into the
            Apollo Village lobby.
          </p>
        </motion.div>

        <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((pillar, index) => {
            const isHero = pillar.name === 'Builder';
            return (
              <motion.li
                key={pillar.name}
                {...cardReveal(index)}
                className={
                  'group relative flex flex-col rounded-lg border p-6 transition-colors duration-150 motion-reduce:transition-none ' +
                  (isHero
                    ? 'border-primary bg-[oklch(0.13_0.05_270)] lg:col-span-3'
                    : 'border-border bg-[oklch(0.12_0.02_270)] hover:border-primary')
                }
              >
                <div className="mb-3 flex items-center gap-3">
                  <h3 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
                    {pillar.name}
                  </h3>
                  {isHero ? (
                    <span className="rounded-pill bg-primary px-2.5 py-0.5 font-mono text-xs uppercase tracking-widest text-background">
                      hero
                    </span>
                  ) : null}
                  <span
                    className={
                      'rounded-pill border px-2.5 py-0.5 font-mono text-xs uppercase tracking-widest ' +
                      (pillar.scopeLabel === 'vertical slice'
                        ? 'border-success text-success'
                        : 'border-warning text-warning')
                    }
                  >
                    {pillar.scopeLabel}
                  </span>
                </div>

                <p className="mb-4 text-base leading-relaxed text-foreground">
                  {pillar.tagline}
                </p>

                <p className="mb-4 font-mono text-sm text-muted">
                  {pillar.roleHint}
                </p>

                <p className="mt-auto text-sm leading-relaxed text-muted">
                  {pillar.scope}
                </p>
              </motion.li>
            );
          })}
        </ul>

        <motion.p
          {...containerReveal}
          className="mt-12 max-w-3xl text-sm leading-relaxed text-muted"
        >
          Shipped with CC0 (Kenney plus OpenGameArt Warped City plus
          OpenGameArt Steampunk 32x32) plus Opus 4.7 procedural SVG and Canvas
          assets only. The fal.ai Nano Banana 2 multi-vendor asset pipeline
          ships as dormant infrastructure via skill transplant; reactivation
          would require a superseding ADR.
        </motion.p>
      </div>
    </section>
  );
}
