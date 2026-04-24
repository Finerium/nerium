'use client';

//
// src/components/pricing/TierCard.tsx
//
// Owner: Marshall (W2 NP P6 S1).
//
// One card in the 4-tier pricing grid at /pricing. Consumes the
// PlanResponse shape emitted by Plutus's GET /v1/billing/plans endpoint
// (src/backend/billing/plans.py PlanResponse). The Claude Design landing
// palette (OKLCH phosphor-green, deep ink, bone-white, rust accent) is
// reused directly from app/landing.css scoped tokens rather than a fork
// so the pricing surface matches the Kalypso W3 Claude Design aesthetic
// exactly. Contrast notes live in PricingClient where the Subscribe
// button renders.
//
// Props
// -----
// - plan: PlanResponse emitted by /v1/billing/plans. Typed as Plan so the
//   component does not hard-depend on the backend model import surface.
// - currentTier: null | Tier of the caller's active subscription. Drives
//   the "Current plan" badge + the CTA label swap (Subscribe -> Manage).
// - highlighted: optional boolean to mark the recommended tier (Pro).
//   Purely cosmetic; it applies a phosphor halo border and ribbon.
// - onSubscribe: click handler for paid tiers. Receives the tier enum so
//   PricingClient can dispatch the correct POST /v1/billing/checkout body.
// - onFreeCta: click handler for the Free tier CTA. Routes to /signup or
//   a "You're on Free" confirm depending on auth state.
//
// Visual hierarchy
// ----------------
// - Primary CTA uses `.nl-btn-primary` which renders ink text on phosphor-
//   green per app/landing.css. Contrast ratio ~13.5:1 versus the 4.5:1
//   WCAG AA minimum. Documented in PricingClient + the axe-core test.
// - Recommended (Pro) card gets phosphor border + phosphor-dim tag label.
// - Current plan badge overrides the primary CTA with a "Manage plan"
//   ghost button so the user is not nudged to repurchase their own tier.
//
// No em dash, no emoji (CLAUDE.md anti-patterns).
//

import type { ReactNode } from 'react';

// Duplicated minimally rather than importing from backend to keep the
// frontend free of the FastAPI import boundary. The shape mirrors
// src/backend/billing/plans.py PlanResponse exactly.
export interface PlanFeatures {
  max_agents: number;
  max_sessions_per_day: number;
  max_storage_mb: number;
  priority_support: boolean;
  custom_domains: boolean;
  analytics_retention_days: number;
}

export type Tier = 'free' | 'starter' | 'pro' | 'team';

export interface Plan {
  tier: Tier;
  name: string;
  tagline: string;
  price_usd_monthly: number;
  currency: string;
  interval: string;
  features: PlanFeatures;
  highlights: string[];
  stripe_price_id: string | null;
  is_paid: boolean;
}

export interface TierCardProps {
  plan: Plan;
  currentTier: Tier | null;
  highlighted?: boolean;
  onSubscribe?: (tier: Tier) => void;
  onFreeCta?: () => void;
  subscribingTier?: Tier | null;
}

export function TierCard({
  plan,
  currentTier,
  highlighted = false,
  onSubscribe,
  onFreeCta,
  subscribingTier = null,
}: TierCardProps) {
  const isCurrent = currentTier === plan.tier;
  const isFree = plan.tier === 'free';
  const isSubscribing = subscribingTier === plan.tier;

  const ctaLabel = resolveCtaLabel({
    tier: plan.tier,
    isCurrent,
    isSubscribing,
  });

  const classes = [
    'mp-tier-card',
    highlighted ? 'mp-tier-highlighted' : '',
    isCurrent ? 'mp-tier-current' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = () => {
    if (isFree) {
      onFreeCta?.();
      return;
    }
    onSubscribe?.(plan.tier);
  };

  // aria-current="true" lets assistive tech announce the active plan
  // when the caller is authenticated. Non-current cards omit the attr.
  const ariaCurrent = isCurrent ? 'true' : undefined;

  return (
    <article
      className={classes}
      aria-label={`Pricing tier: ${plan.name}`}
      aria-current={ariaCurrent}
    >
      {highlighted ? (
        <div className="mp-ribbon" aria-hidden="true">
          recommended
        </div>
      ) : null}
      {isCurrent ? (
        <div className="mp-current-badge" role="status">
          current plan
        </div>
      ) : null}

      <header className="mp-card-head">
        <p className="mp-tier-id">{plan.tier}</p>
        <h2 className="mp-tier-name">{plan.name}</h2>
        <p className="mp-tier-tagline">{plan.tagline}</p>
      </header>

      <div className="mp-price">
        <PriceDisplay usd={plan.price_usd_monthly} interval={plan.interval} />
      </div>

      <ul className="mp-feature-list" aria-label={`${plan.name} tier features`}>
        {plan.highlights.map((hl, i) => (
          <li key={i}>
            <span aria-hidden="true" className="mp-bullet">
              {'>'}
            </span>
            <span>{hl}</span>
          </li>
        ))}
      </ul>

      <div className="mp-cta-row">
        <button
          type="button"
          className={
            isCurrent
              ? 'nl-btn nl-btn-ghost mp-cta-btn'
              : 'nl-btn nl-btn-primary mp-cta-btn'
          }
          onClick={handleClick}
          disabled={isSubscribing || isCurrent}
          aria-label={`${ctaLabel} on the ${plan.name} tier`}
        >
          {ctaLabel}
        </button>
      </div>

      <footer className="mp-card-foot">
        <PlanCapLine label="agents" value={plan.features.max_agents} />
        <PlanCapLine
          label="sessions per day"
          value={plan.features.max_sessions_per_day}
        />
        <PlanCapLine
          label="analytics retention"
          value={`${plan.features.analytics_retention_days} days`}
        />
      </footer>
    </article>
  );
}

// Single source for CTA labels. Branches on tier + auth + in-flight.
function resolveCtaLabel(args: {
  tier: Tier;
  isCurrent: boolean;
  isSubscribing: boolean;
}): string {
  if (args.isCurrent) return 'current plan';
  if (args.isSubscribing) return 'redirecting';
  if (args.tier === 'free') return 'start free';
  return 'subscribe';
}

function PriceDisplay({
  usd,
  interval,
}: {
  usd: number;
  interval: string;
}): ReactNode {
  if (usd === 0) {
    return (
      <span className="mp-price-inner">
        <span className="mp-price-usd">$0</span>
        <span className="mp-price-tail">forever</span>
      </span>
    );
  }
  return (
    <span className="mp-price-inner">
      <span className="mp-price-usd">${usd}</span>
      <span className="mp-price-tail">/ {interval}</span>
    </span>
  );
}

function PlanCapLine({
  label,
  value,
}: {
  label: string;
  value: number | string;
}): ReactNode {
  return (
    <div className="mp-cap-line">
      <span className="mp-cap-label">{label}</span>
      <span className="mp-cap-value">{value}</span>
    </div>
  );
}
