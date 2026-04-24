'use client';

//
// src/components/builder/BuilderTierGate.tsx
//
// Owner: Marshall (W2 NP P6 S2).
//
// Cross-pillar tier-state consumer for the Builder hero. Renders a
// gated-feature notice for Builder modes that require a paid tier.
// Today the only gate is "Guided mode = Team tier" per Marshall S1
// limits map (Team is the only tier with protocol_multi_vendor + the
// highest seat count, which makes it the natural Guided-mode home).
//
// The component is shaped as a status surface, not an action button,
// so it can be embedded inline alongside the existing Builder section
// headers without breaking the harness layout. When the caller's tier
// already meets the requirement we render a soft "Unlocked" pill so
// Pro / Team users still see the feature surfaced (but not occluded).
//
// Click-through navigates to /pricing.
//
// No em dash, no emoji.
//

import Link from 'next/link';
import {
  useSubscriptionTier,
  type Tier,
} from '../../hooks/useSubscriptionTier';

const TIER_RANK: Record<Tier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  team: 3,
};

const TIER_LABEL: Record<Tier, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  team: 'Team',
};

export interface BuilderTierGateProps {
  feature: string;
  requiredTier: Tier;
  description?: string;
}

export function BuilderTierGate({
  feature,
  requiredTier,
  description,
}: BuilderTierGateProps) {
  const { tier, loading } = useSubscriptionTier();
  const meets = TIER_RANK[tier] >= TIER_RANK[requiredTier];

  return (
    <Link
      href="/pricing"
      data-testid="builder-tier-gate"
      data-feature={feature}
      data-required-tier={requiredTier}
      data-meets-requirement={meets ? 'true' : 'false'}
      data-loading={loading ? 'true' : undefined}
      role="status"
      aria-label={
        meets
          ? `${feature} unlocked on your ${TIER_LABEL[tier]} tier.`
          : `${feature} requires the ${TIER_LABEL[requiredTier]} tier. Click to upgrade.`
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.4rem 0.75rem',
        borderRadius: '0.4rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        textDecoration: 'none',
        background: meets
          ? 'color-mix(in oklch, oklch(0.88 0.15 140) 16%, transparent)'
          : 'color-mix(in oklch, oklch(0.78 0.17 55) 18%, transparent)',
        color: meets ? 'oklch(0.88 0.15 140)' : 'oklch(0.78 0.17 55)',
        border: meets
          ? '1px solid color-mix(in oklch, oklch(0.88 0.15 140) 35%, transparent)'
          : '1px solid color-mix(in oklch, oklch(0.78 0.17 55) 45%, transparent)',
      }}
    >
      <span aria-hidden="true">{meets ? 'OK' : 'LOCK'}</span>
      <span>
        {feature}
        {meets ? '' : ` requires ${TIER_LABEL[requiredTier]}`}
      </span>
      {description ? (
        <span
          style={{
            opacity: 0.75,
            fontWeight: 400,
            letterSpacing: '0.02em',
            marginLeft: '0.4rem',
          }}
        >
          {description}
        </span>
      ) : null}
    </Link>
  );
}

export default BuilderTierGate;
