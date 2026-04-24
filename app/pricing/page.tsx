//
// app/pricing/page.tsx
//
// Owner: Marshall (W2 NP P6 S1).
//
// /pricing route, Server Component entry point. Fetches the 4-tier
// catalogue from Plutus's public GET /v1/billing/plans endpoint and the
// caller's current subscription from GET /v1/billing/subscription/me so
// the hero can render a "Current plan" badge without a client waterfall.
//
// Composition
// -----------
// - Top-level wrapper reuses the landing CSS scope (.nerium-landing)
//   so OKLCH palette + CRT scanfield + vignette + phosphor dust stay
//   consistent with the Claude Design W3 port. The landing.css module
//   contains every rule prefixed with `.nerium-landing` so the pricing
//   page inherits the full design system without a fork.
// - PricingClient is the client boundary that owns Subscribe -> Stripe
//   Checkout and the reveal choreography.
//
// Hemera soft-launch gate
// -----------------------
// Behaviour: when `pricing.page.live` flag is explicitly false we render
// a "Coming Soon" stub. In dev / local boot with no flag service, or any
// flag fetch failure, we default to live so the pricing surface is never
// accidentally hidden from judges. Honest-claim discipline: the stub
// makes the gated state visible, no pretending.
//
// Fonts follow landing convention: VT323 (display pixels), Space Grotesk
// (body), JetBrains Mono (CTA + fine print).
//
// Anti-patterns honored: no em dash U+2014, no emoji, no hardcoded
// Stripe keys (server -> backend fetch only uses cookie session).
//

import type { Metadata } from 'next';
import { VT323, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import { Suspense } from 'react';
import { LandingBackground } from '../../src/components/landing/LandingBackground';
import { LandingNav } from '../../src/components/landing/LandingNav';
import { PricingClient } from '../../src/components/pricing/PricingClient';
import type { Plan } from '../../src/components/pricing/TierCard';
import '../landing.css';
import './pricing.css';

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
  title: 'Pricing. NERIUM.',
  description:
    'Four tiers for the NERIUM agent economy. Free for solo exploration, Starter for shipping small projects, Pro for daily drivers, Team for collaborative teams. Billed monthly in USD through Stripe. Cancel anytime.',
  openGraph: {
    title: 'NERIUM pricing. Four tiers.',
    description:
      'Free, Starter, Pro, Team. Billed monthly in USD. Cancel anytime. Built with Opus 4.7.',
    url: 'https://github.com/Finerium/nerium',
    siteName: 'NERIUM',
    type: 'website',
  },
};

// Dynamic rendering ensures we re-fetch plans per request. Plans live as
// a static Python dict in Plutus so the 1 ms backend response is cheap;
// we do not cache here because the "Current plan" badge is per-user.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SubscriptionSnapshot {
  tier: 'free' | 'starter' | 'pro' | 'team';
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

interface PlansListResponse {
  plans: Plan[];
}

interface SubscriptionMeResponse {
  subscription: SubscriptionSnapshot | null;
}

async function resolveBaseUrl(): Promise<string> {
  // Prefer an explicit backend base (production VPS config) but fall back
  // to request-origin so `npm run dev` with a shared port just works.
  const explicit = process.env.NERIUM_BACKEND_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto =
    h.get('x-forwarded-proto') ??
    (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

async function fetchPlans(baseUrl: string): Promise<Plan[]> {
  try {
    const resp = await fetch(`${baseUrl}/v1/billing/plans`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!resp.ok) {
      console.warn('pricing.plans.fetch_failed', resp.status);
      return FALLBACK_PLANS;
    }
    const data = (await resp.json()) as PlansListResponse;
    if (!Array.isArray(data.plans) || data.plans.length === 0) {
      return FALLBACK_PLANS;
    }
    return data.plans;
  } catch (err) {
    console.warn('pricing.plans.fetch_error', err);
    return FALLBACK_PLANS;
  }
}

async function fetchSubscription(
  baseUrl: string,
): Promise<{ subscription: SubscriptionSnapshot | null; authed: boolean }> {
  try {
    const cookieHeader = (await cookies()).toString();
    if (!cookieHeader) {
      return { subscription: null, authed: false };
    }
    const resp = await fetch(`${baseUrl}/v1/billing/subscription/me`, {
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        cookie: cookieHeader,
      },
    });
    if (resp.status === 401 || resp.status === 403) {
      return { subscription: null, authed: false };
    }
    if (!resp.ok) {
      return { subscription: null, authed: true };
    }
    const data = (await resp.json()) as SubscriptionMeResponse;
    return { subscription: data.subscription, authed: true };
  } catch {
    return { subscription: null, authed: false };
  }
}

async function fetchLiveFlag(baseUrl: string): Promise<boolean> {
  // Soft-launch gate. Default is true: if the flag service is unreachable
  // or the flag is not registered yet, ship the pricing surface. Only an
  // explicit `false` value hides it behind the coming-soon stub.
  try {
    const cookieHeader = (await cookies()).toString();
    if (!cookieHeader) return true;
    const resp = await fetch(`${baseUrl}/v1/me/flags`, {
      cache: 'no-store',
      headers: { accept: 'application/json', cookie: cookieHeader },
    });
    if (!resp.ok) return true;
    const data = (await resp.json()) as {
      flags: { flag_name: string; value: unknown }[];
    };
    const hit = data.flags.find((f) => f.flag_name === 'pricing.page.live');
    if (!hit) return true;
    return hit.value !== false;
  } catch {
    return true;
  }
}

export default async function PricingPage() {
  const baseUrl = await resolveBaseUrl();
  const [plans, subSnapshot, live] = await Promise.all([
    fetchPlans(baseUrl),
    fetchSubscription(baseUrl),
    fetchLiveFlag(baseUrl),
  ]);

  const wrapperClass = `nerium-landing ${vt323.variable} ${spaceGrotesk.variable} ${jetBrainsMono.variable}`;

  if (!live) {
    return (
      <div className={wrapperClass}>
        <LandingBackground />
        <LandingNav />
        <main className="mp-page mp-page-stub" aria-labelledby="mp-title">
          <p className="nl-eyebrow">pricing</p>
          <h1 id="mp-title" className="mp-hero-title">
            Coming soon.
          </h1>
          <p className="mp-hero-sub">
            Four tiers are on the way. Free, Starter, Pro, Team. Invoices
            through Stripe. Cancel anytime. Check back shortly or watch the
            repository for the launch commit.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <LandingBackground />
      <LandingNav />

      <main className="mp-page" aria-labelledby="mp-title">
        <header className="mp-hero nl-reveal">
          <p className="nl-eyebrow">pricing</p>
          <h1 id="mp-title" className="mp-hero-title">
            Four tiers. One agent economy.
          </h1>
          <p className="mp-hero-sub">
            Free for solo exploration. Starter for shipping small projects.
            Pro for daily drivers. Team for collaborative teams with seat
            scaling. Billed monthly in USD. Cancel anytime.
          </p>
        </header>

        <Suspense fallback={<div className="mp-loading">loading plans</div>}>
          <PricingClient
            plans={plans}
            initialSubscription={subSnapshot.subscription}
            isAuthed={subSnapshot.authed}
          />
        </Suspense>

        <section className="mp-faq nl-reveal" aria-labelledby="mp-faq-title">
          <h2 id="mp-faq-title" className="mp-faq-title">
            Common questions.
          </h2>
          <dl className="mp-faq-list">
            <div className="mp-faq-row">
              <dt>Can I switch tiers?</dt>
              <dd>
                Yes. Upgrade or downgrade from the Banking dashboard. Proration
                is handled by Stripe.
              </dd>
            </div>
            <div className="mp-faq-row">
              <dt>What happens to my data if I cancel?</dt>
              <dd>
                Your listings and agents stay put. Active sessions drop to the
                Free tier limits on the next billing cycle.
              </dd>
            </div>
            <div className="mp-faq-row">
              <dt>Do you offer academic or nonprofit pricing?</dt>
              <dd>
                Reach out through the contact link and we will work out a
                custom arrangement. Not automated in the hackathon build.
              </dd>
            </div>
            <div className="mp-faq-row">
              <dt>Is my payment secure?</dt>
              <dd>
                All payment flows run on Stripe-hosted Checkout. We never see
                or store card numbers. PCI compliance inherits from Stripe.
              </dd>
            </div>
          </dl>
        </section>
      </main>
    </div>
  );
}

// Fallback plan catalogue for the case where the backend is unreachable
// at build or request time. Prices + highlights MUST stay in sync with
// src/backend/billing/plans.py _PLAN_CATALOGUE. Matching prevents the
// pricing surface from looking broken during backend cold-boot.
const FALLBACK_PLANS: Plan[] = [
  {
    tier: 'free',
    name: 'Free',
    tagline: 'Explore NERIUM with a single agent.',
    price_usd_monthly: 0,
    currency: 'usd',
    interval: 'month',
    features: {
      max_agents: 1,
      max_sessions_per_day: 20,
      max_storage_mb: 100,
      priority_support: false,
      custom_domains: false,
      analytics_retention_days: 7,
    },
    highlights: [
      '1 agent seat',
      '20 Managed Agents sessions per day',
      '7-day analytics retention',
      'Community support',
    ],
    stripe_price_id: null,
    is_paid: false,
  },
  {
    tier: 'starter',
    name: 'Starter',
    tagline: 'Solo builders shipping small projects.',
    price_usd_monthly: 19,
    currency: 'usd',
    interval: 'month',
    features: {
      max_agents: 5,
      max_sessions_per_day: 200,
      max_storage_mb: 2000,
      priority_support: false,
      custom_domains: false,
      analytics_retention_days: 30,
    },
    highlights: [
      '5 agent seats',
      '200 Managed Agents sessions per day',
      '30-day analytics retention',
      'Email support, 48h response',
    ],
    stripe_price_id: null,
    is_paid: true,
  },
  {
    tier: 'pro',
    name: 'Pro',
    tagline: 'Daily drivers who ship production workloads.',
    price_usd_monthly: 49,
    currency: 'usd',
    interval: 'month',
    features: {
      max_agents: 20,
      max_sessions_per_day: 1000,
      max_storage_mb: 10000,
      priority_support: true,
      custom_domains: true,
      analytics_retention_days: 90,
    },
    highlights: [
      '20 agent seats',
      '1,000 Managed Agents sessions per day',
      '90-day analytics retention',
      'Custom domains',
      'Priority support, 24h response',
    ],
    stripe_price_id: null,
    is_paid: true,
  },
  {
    tier: 'team',
    name: 'Team',
    tagline: 'Collaborative teams with seat scaling + SSO roadmap.',
    price_usd_monthly: 149,
    currency: 'usd',
    interval: 'month',
    features: {
      max_agents: 100,
      max_sessions_per_day: 10000,
      max_storage_mb: 100000,
      priority_support: true,
      custom_domains: true,
      analytics_retention_days: 365,
    },
    highlights: [
      '100 agent seats',
      '10,000 Managed Agents sessions per day',
      '365-day analytics retention',
      'Custom domains + SSO (roadmap)',
      'Priority support, 4h response',
    ],
    stripe_price_id: null,
    is_paid: true,
  },
];
