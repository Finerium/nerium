'use client';

//
// src/components/marketplace/ListingTierLock.tsx
//
// Owner: Marshall (W2 NP P6 S2).
//
// Cross-pillar tier-state consumer for the Marketplace browse surface.
// Renders a "locked" pill + upgrade tooltip on listings whose
// pricing_tier requires a subscription tier above the caller's current
// tier. The mapping below is the single Marshall-defined translation
// from listing.pricing_tier (free|cheap|mid|premium) to the Plutus
// subscription tier enum (free|starter|pro|team).
//
// Mapping rationale:
//   free     -> always reachable
//   cheap    -> any paid tier (starter+)
//   mid      -> pro+ subscribers
//   premium  -> team subscribers (highest catalog tier)
//
// The component is a pure overlay; clicking the pill routes the user
// to /pricing without unmounting the parent card. The tooltip text is
// available for screen readers via aria-label so the lock state is
// announced even without hover.
//
// No em dash, no emoji.
//

import Link from 'next/link';
import {
  useSubscriptionTier,
  type Tier,
} from '../../hooks/useSubscriptionTier';

export type ListingPricingTier = 'free' | 'cheap' | 'mid' | 'premium';

const PRICING_TO_REQUIRED: Record<ListingPricingTier, Tier> = {
  free: 'free',
  cheap: 'starter',
  mid: 'pro',
  premium: 'team',
};

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

export function tierMeetsRequirement(current: Tier, required: Tier): boolean {
  return TIER_RANK[current] >= TIER_RANK[required];
}

export function requiredTierFor(
  pricingTier: ListingPricingTier,
): Tier {
  return PRICING_TO_REQUIRED[pricingTier];
}

export interface ListingTierLockProps {
  pricingTier: ListingPricingTier;
  className?: string;
  // When true the pill renders even for "free" listings as a debug
  // affordance. Default false: free listings render no pill.
  showWhenUnlocked?: boolean;
}

export function ListingTierLock({
  pricingTier,
  className,
  showWhenUnlocked = false,
}: ListingTierLockProps) {
  const { tier: currentTier, loading } = useSubscriptionTier();
  const requiredTier = PRICING_TO_REQUIRED[pricingTier];
  const meets = tierMeetsRequirement(currentTier, requiredTier);

  if (loading && !showWhenUnlocked) return null;
  if (meets && !showWhenUnlocked) return null;

  const label = meets
    ? `${TIER_LABEL[requiredTier]} unlocked`
    : `Locked: requires ${TIER_LABEL[requiredTier]} tier`;

  // Stop propagation so clicking the pill does not also fire the parent
  // card's onClick (which navigates into the listing detail).
  return (
    <Link
      href="/pricing"
      className={className}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
        }
      }}
      role="status"
      aria-label={label}
      data-testid="listing-tier-lock"
      data-required-tier={requiredTier}
      data-meets-requirement={meets ? 'true' : 'false'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.125rem 0.5rem',
        borderRadius: '999px',
        fontSize: '0.7rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        textDecoration: 'none',
        background: meets
          ? 'color-mix(in oklch, oklch(0.88 0.15 140) 22%, transparent)'
          : 'color-mix(in oklch, oklch(0.78 0.17 55) 22%, transparent)',
        color: meets ? 'oklch(0.88 0.15 140)' : 'oklch(0.78 0.17 55)',
        border: meets
          ? '1px solid color-mix(in oklch, oklch(0.88 0.15 140) 35%, transparent)'
          : '1px solid color-mix(in oklch, oklch(0.78 0.17 55) 45%, transparent)',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
      }}
    >
      <span aria-hidden="true">{meets ? '>' : '*'}</span>
      <span>
        {meets ? TIER_LABEL[requiredTier] : `Upgrade to ${TIER_LABEL[requiredTier]}`}
      </span>
    </Link>
  );
}

export default ListingTierLock;
