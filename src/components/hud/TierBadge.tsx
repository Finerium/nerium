'use client';

//
// src/components/hud/TierBadge.tsx
//
// Owner: Marshall (W2 NP P6 S2).
//
// Live subscription-tier indicator for the in-game HUD top bar. Reads
// from the Marshall S1 useSubscriptionTier hook so the value matches
// every other cross-pillar consumer (TreasurerNPC dialogue, marketplace
// lock icons, builder gate badge).
//
// Visual contract: phosphor-green pill matching the Claude Design
// landing palette so the badge reads as continuous with the /pricing
// surface. Hover state shifts to a brighter phosphor border without
// changing background colour so contrast stays AA. The pill is
// intentionally compact (single line, label-only) so the TopBar quest
// tracker slot keeps centerline weight.
//
// Accessibility:
//   - role="status" + aria-live="polite" so screen readers announce
//     tier changes (e.g. after a Stripe checkout completes and the
//     useTierStore.refresh() fires).
//   - aria-label includes the upgrade cue when the user is on a tier
//     below pro.
//   - The whole pill is a Link to /pricing so keyboard users can Tab
//     into it and Enter to land on the pricing page.
//
// React HUD boundary: rendered through the GameHUD slot pattern, never
// inside Phaser per Erato-v2 invariant.
//
// No em dash, no emoji.
//

import Link from 'next/link';
import { useSubscriptionTier, type Tier } from '../../hooks/useSubscriptionTier';

const TIER_LABEL: Record<Tier, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  team: 'Team',
};

const TIER_ARIA: Record<Tier, string> = {
  free: 'Subscription tier Free. Click to view pricing and upgrade.',
  starter: 'Subscription tier Starter. Click to manage or upgrade.',
  pro: 'Subscription tier Pro. Click to manage your plan.',
  team: 'Subscription tier Team. Click to manage your plan.',
};

export interface TierBadgeProps {
  className?: string;
  hideOnUnauth?: boolean;
}

export function TierBadge({ className, hideOnUnauth = false }: TierBadgeProps) {
  const { tier, isAuthed, loading } = useSubscriptionTier();

  if (hideOnUnauth && !isAuthed && !loading) {
    return null;
  }

  const label = TIER_LABEL[tier];
  const aria = TIER_ARIA[tier];

  // Inline styles use the same OKLCH tokens declared in app/landing.css
  // (--nl-phos, --nl-ink, --nl-line) so the pill matches the pricing +
  // landing surfaces exactly without forking the palette.
  return (
    <Link
      href="/pricing"
      role="status"
      aria-live="polite"
      aria-label={aria}
      data-hud-role="tier-badge"
      data-tier={tier}
      data-loading={loading ? 'true' : undefined}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.2rem 0.65rem',
        borderRadius: '999px',
        background: 'oklch(0.88 0.15 140)',
        color: 'oklch(0.14 0.012 250)',
        border: '1px solid oklch(0.45 0.12 140)',
        fontFamily:
          'var(--font-jetbrains-mono, "JetBrains Mono", "Courier New", monospace)',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        textDecoration: 'none',
        boxShadow: '0 0 8px rgba(130, 240, 160, 0.35)',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: '8px', opacity: 0.85 }}>
        TIER
      </span>
      <span>{label}</span>
    </Link>
  );
}

export default TierBadge;
