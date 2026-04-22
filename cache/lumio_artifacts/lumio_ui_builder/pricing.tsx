import Link from 'next/link';
import { PricingCard } from '@/components/pricing_card';

const tiers = [
  {
    id: 'reader',
    name: 'Reader',
    sub: 'For the curious habit.',
    price: '$0',
    period: '/month',
    ctaLabel: 'Start free',
    ctaHref: '/signup?plan=reader',
    bullets: [
      '25 saved articles per month',
      'Auto summary, Brief mode',
      'Daily recall, 2 cards',
      'Export to Markdown',
    ],
  },
  {
    id: 'deep',
    name: 'Deep Reader',
    sub: 'For the regular reader who wants it to stick.',
    price: '$8',
    period: '/month',
    featured: true,
    ctaLabel: 'Start 14 day trial',
    ctaHref: '/signup?plan=deep',
    bullets: [
      'Unlimited saves and summaries',
      'Reading Atlas, cross-source links',
      'Spaced recall, all modes',
      'Weekly reading letter',
      'Obsidian and Notion sync',
    ],
  },
  {
    id: 'studio',
    name: 'Studio',
    sub: 'For teams that read together.',
    price: '$24',
    period: '/seat / month',
    ctaLabel: 'Start a Studio',
    ctaHref: '/signup?plan=studio',
    bullets: [
      'Everything in Deep Reader',
      'Shared Atlases and reading circles',
      'SSO, audit log, admin roles',
      'Weekly digest for the whole team',
    ],
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="max-w-6xl mx-auto px-6 py-24">
      <div className="max-w-2xl">
        <p className="text-xs uppercase tracking-wider text-accent font-semibold">Pricing</p>
        <h2 className="font-display text-4xl md:text-5xl font-semibold mt-3 tracking-tight">
          Start free. Upgrade when it earns its keep.
        </h2>
        <p className="mt-4 ink-soft text-lg">
          No seat minimums, no onboarding call, cancel from the settings page in a single click.
        </p>
      </div>
      <div className="mt-12 grid md:grid-cols-3 gap-6">
        {tiers.map((tier) => (
          <PricingCard key={tier.id} {...tier} />
        ))}
      </div>
    </section>
  );
}
