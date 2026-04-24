'use client';

//
// src/components/pricing/PricingClient.tsx
//
// Owner: Marshall (W2 NP P6 S1).
//
// Client Component wrapping the 4-tier grid. Receives the server-fetched
// plans + current-subscription snapshot from app/pricing/page.tsx, hosts
// the Subscribe -> POST /v1/billing/checkout handler, and renders the
// recommended-tier highlight logic (Pro is the default highlight).
//
// Stripe integration
// ------------------
// - Paid tiers (starter, pro, team) fire POST /v1/billing/checkout with
//   { tier } body. Backend returns { checkout_url, session_id } per
//   src/backend/routers/v1/billing/checkout.py. We redirect the browser
//   via window.location.href so the user lands on Stripe's hosted
//   Checkout page.
// - Free tier has no Stripe flow. When the user is unauth we route to
//   /signup; when already authed we emit a soft confirm that they are on
//   Free. No POST fires.
// - Any non-2xx surfaces via a toast line inside .mp-cta-error.
//
// Reveal choreography
// -------------------
// Each tier card has a .nl-reveal class; an IntersectionObserver toggles
// .in once the card enters the viewport. prefers-reduced-motion snaps to
// final state. The pattern matches CTASection + other landing surfaces.
//

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Plan, Tier } from './TierCard';
import { TierCard } from './TierCard';

// Stripe + subscription shapes are intentionally narrow; the backend
// may emit additional fields we ignore for forward-compat.
interface CheckoutSuccess {
  checkout_url: string;
  session_id: string;
}

interface SubscriptionSnapshot {
  tier: Tier;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

interface SubscriptionMeResponse {
  subscription: SubscriptionSnapshot | null;
}

export interface PricingClientProps {
  plans: Plan[];
  initialSubscription: SubscriptionSnapshot | null;
  isAuthed: boolean;
}

const RECOMMENDED_TIER: Tier = 'pro';

export function PricingClient({
  plans,
  initialSubscription,
  isAuthed,
}: PricingClientProps) {
  const [subscription] = useState<SubscriptionSnapshot | null>(
    initialSubscription,
  );
  const [subscribingTier, setSubscribingTier] = useState<Tier | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentTier: Tier | null = useMemo(() => {
    if (subscription && isActiveStatus(subscription.status)) {
      return subscription.tier;
    }
    return null;
  }, [subscription]);

  const handleSubscribe = useCallback(
    async (tier: Tier) => {
      if (tier === 'free') return;
      if (!isAuthed) {
        // Unauth subscribe attempt routes to /signup with a return
        // target so the post-signup flow lands on pricing again.
        const next = encodeURIComponent(`/pricing?tier=${tier}`);
        window.location.href = `/signup?next=${next}`;
        return;
      }
      setErrorMessage(null);
      setSubscribingTier(tier);
      try {
        const resp = await fetch('/v1/billing/checkout', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tier }),
        });
        if (!resp.ok) {
          const problem = await parseProblem(resp);
          throw new Error(problem);
        }
        const data = (await resp.json()) as CheckoutSuccess;
        if (!data.checkout_url) {
          throw new Error('Empty checkout URL from server.');
        }
        // Redirect to Stripe-hosted Checkout. Test harnesses stub
        // window.location via the Playwright page.evaluate hook.
        window.location.href = data.checkout_url;
      } catch (err) {
        const msg =
          err instanceof Error && err.message
            ? err.message
            : 'Could not start checkout. Try again or contact support.';
        setErrorMessage(msg);
        setSubscribingTier(null);
      }
    },
    [isAuthed],
  );

  const handleFreeCta = useCallback(() => {
    if (!isAuthed) {
      window.location.href = '/signup?next=%2Fpricing';
      return;
    }
    // Authed free user: soft confirm via the error pane (green-styled).
    setErrorMessage("You are already on the Free tier. No action needed.");
  }, [isAuthed]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reveals = Array.from(
      root.querySelectorAll<HTMLElement>('.nl-reveal'),
    );
    if (reduced) {
      reveals.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    reveals.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div ref={rootRef}>
      <div className="mp-grid" role="list">
        {plans.map((plan) => (
          <div className="nl-reveal mp-grid-cell" role="listitem" key={plan.tier}>
            <TierCard
              plan={plan}
              currentTier={currentTier}
              highlighted={plan.tier === RECOMMENDED_TIER}
              onSubscribe={handleSubscribe}
              onFreeCta={handleFreeCta}
              subscribingTier={subscribingTier}
            />
          </div>
        ))}
      </div>

      {errorMessage ? (
        <div className="mp-cta-error" role="alert">
          {errorMessage}
        </div>
      ) : null}

      <p className="mp-fineprint">
        Prices shown in USD. Billed monthly. Cancel anytime from the Banking
        dashboard. Invoices issued through Stripe. Team tier SSO ships in a
        follow-up release.
      </p>
    </div>
  );
}

function isActiveStatus(status: string): boolean {
  // Stripe subscription statuses: incomplete, incomplete_expired, trialing,
  // active, past_due, canceled, unpaid, paused. Treat everything except the
  // explicit inactive set as "has a current plan" so the badge renders.
  return !['canceled', 'incomplete_expired', 'unpaid'].includes(status);
}

async function parseProblem(resp: Response): Promise<string> {
  try {
    const body = await resp.json();
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      const detail = typeof b.detail === 'string' ? b.detail : null;
      const title = typeof b.title === 'string' ? b.title : null;
      return (
        detail ??
        title ??
        `Checkout failed (${resp.status} ${resp.statusText})`
      );
    }
  } catch {
    // fall through
  }
  return `Checkout failed (${resp.status} ${resp.statusText})`;
}
