//
// app/page.tsx
//
// Nemea Phase 5 QA emergency harness landing (2026-04-22). Renders an index
// of the five pillar demo pages plus the Advisor surface. Non-technical
// framing first (the five pillars and their pitch), pillar links second.
//

import Link from 'next/link';
import { HarnessShell } from './_harness/HarnessShell';

const PILLAR_CARDS: ReadonlyArray<{
  href: string;
  title: string;
  sub: string;
}> = [
  {
    href: '/builder',
    title: 'Builder',
    sub:
      'Hero pillar. Pipeline visualizer, Blueprint Moment reveal, Lumio cached replay, and 2D pixel worlds.',
  },
  {
    href: '/marketplace',
    title: 'Marketplace',
    sub:
      'Cross-vendor storefront. Browse listings curated across every major agent build tool.',
  },
  {
    href: '/banking',
    title: 'Banking',
    sub:
      'Usage-based billing. Wallet, live cost meter, and synthetic transaction pulse.',
  },
  {
    href: '/registry',
    title: 'Registry',
    sub:
      'Agent identity card with trust band, vendor origin, and audit trail.',
  },
  {
    href: '/protocol',
    title: 'Protocol',
    sub:
      'Cross-model translation. Claude and Gemini panels from the same AgentIntent.',
  },
  {
    href: '/advisor',
    title: 'Advisor',
    sub:
      'The single conversational surface that sits above every pillar.',
  },
];

export default function HomePage() {
  return (
    <HarnessShell
      heading="NERIUM"
      sub="Infrastructure for the AI agent economy. Built with Opus 4.7 for the Cerebral Valley plus Anthropic hackathon, April 2026."
    >
      <section className="nemea-harness-hero">
        <h1>Five pillars. One conversational surface.</h1>
        <p>
          Builder (hero) replaces the manual meta-orchestration that sits
          above every current AI coding tool. Marketplace gives creators a
          neutral storefront and buyers a single account. Banking charges per
          execution the way utilities charge per kilowatt-hour. Registry is
          the DNS of the agent layer. Protocol preserves the uniqueness of
          each model rather than forcing a single universal dialect.
        </p>
        <p>
          Positioning: AWS plus Stripe plus DNS plus HTTP for the agent
          economy.
        </p>
      </section>
      <div className="nemea-harness-pillar-grid">
        {PILLAR_CARDS.map((pillar) => (
          <Link
            key={pillar.href}
            href={pillar.href}
            className="nemea-harness-pillar-card"
            prefetch={false}
          >
            <span className="nemea-harness-pillar-card-title">
              {pillar.title}
            </span>
            <span className="nemea-harness-pillar-card-sub">{pillar.sub}</span>
          </Link>
        ))}
      </div>
    </HarnessShell>
  );
}
