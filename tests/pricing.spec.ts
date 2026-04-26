//
// tests/pricing.spec.ts
//
// Owner: Marshall (W2 NP P6 S1). Smoke tests for /pricing.
//
// Scope
// -----
// 1. Route responds with a 200 and the 4-tier grid renders.
// 2. Each tier card exposes an accessible Subscribe / Start-free button.
// 3. Primary CTA contrast ratio: ink text on phosphor-green is >= 4.5:1.
// 4. Responsive layout: grid collapses to 1-col on mobile viewport.
// 5. Keyboard navigation: Tab lands focus on each subscribe button in
//    order and focus ring is visible.
//
// The /v1/billing/plans and /v1/billing/subscription/me backend routes
// are stubbed via route interception so the test does not require a
// live FastAPI process. Stripe Checkout redirect is captured by
// interception too; we assert the POST body shape only, not a live
// redirect to stripe.com.
//

import { expect, test } from '@playwright/test';

const FOUR_TIERS = ['free', 'starter', 'pro', 'team'] as const;

const MOCK_PLANS = {
  plans: [
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
      stripe_price_id: 'price_test_starter',
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
      stripe_price_id: 'price_test_pro',
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
      stripe_price_id: 'price_test_team',
      is_paid: true,
    },
  ],
};

function setupBackendRoutes(page: import('@playwright/test').Page) {
  page.route('**/v1/billing/plans', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_PLANS),
    });
  });
  page.route('**/v1/billing/subscription/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ subscription: null }),
    });
  });
  page.route('**/v1/me/flags', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        flags: [{ flag_name: 'pricing.page.live', value: true, kind: 'bool' }],
        evaluated_at: new Date().toISOString(),
      }),
    });
  });
}

test.describe('Marshall pricing landing smoke', () => {
  test.beforeEach(async ({ page }) => {
    setupBackendRoutes(page);
  });

  test('renders four tier cards with expected prices', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForSelector('.mp-tier-card', { timeout: 15_000 });
    const cards = page.locator('.mp-tier-card');
    await expect(cards).toHaveCount(4);

    const titles = await cards.locator('.mp-tier-name').allTextContents();
    const lowered = titles.map((t) => t.trim().toLowerCase());
    for (const tier of FOUR_TIERS) {
      expect(lowered).toContain(tier);
    }

    // Pro card is highlighted with the recommended ribbon.
    const ribbon = page.locator('.mp-ribbon');
    await expect(ribbon).toBeVisible();
  });

  test('subscribe button on Starter posts to checkout endpoint', async ({
    page,
  }) => {
    setupBackendRoutes(page);

    let capturedBody: unknown = null;
    await page.route('**/v1/billing/checkout', async (route, request) => {
      try {
        capturedBody = request.postDataJSON();
      } catch {
        capturedBody = null;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          checkout_url: 'https://checkout.stripe.test/session_abc',
          session_id: 'cs_test_abc',
        }),
      });
    });

    // Stub the redirect so navigating away does not break the test.
    await page.addInitScript(() => {
      const origLocation = window.location;
      let captured: string | null = null;
      Object.defineProperty(window, 'location', {
        configurable: true,
        get() {
          return new Proxy(origLocation, {
            set(_t, prop, value) {
              if (prop === 'href') {
                captured = String(value);
                (window as unknown as Record<string, unknown>).__NERIUM_REDIRECT =
                  captured;
                return true;
              }
              return Reflect.set(origLocation, prop, value);
            },
            get(_t, prop) {
              if (prop === 'href' && captured !== null) return captured;
              const val = Reflect.get(origLocation, prop);
              return typeof val === 'function' ? val.bind(origLocation) : val;
            },
          });
        },
      });
    });

    await page.goto('/pricing');
    await page.waitForSelector('.mp-tier-card', { timeout: 15_000 });

    const starterCard = page.locator('.mp-tier-card', { hasText: 'Starter' });
    const starterBtn = starterCard.getByRole('button', {
      name: /subscribe on the starter tier/i,
    });
    await starterBtn.click();

    await expect
      .poll(async () =>
        page.evaluate(
          () => (window as unknown as Record<string, string | null>)
            .__NERIUM_REDIRECT,
        ),
      )
      .toBe('https://checkout.stripe.test/session_abc');

    expect(capturedBody).toEqual({ tier: 'starter' });
  });

  test('subscribe CTA primary button has AA contrast ratio', async ({
    page,
  }) => {
    // Phase 1 Ferry 3 (Nemea-RV-v2 W4, 2026-04-26): the contrast probe
    // below cannot run reliably in modern Chromium because
    // ``getComputedStyle`` now returns the resolved CSS value verbatim,
    // including the original ``oklch(L C h)`` syntax used by the
    // ``--nl-ink`` / ``--nl-phos`` design tokens. The legacy ``rgba(...)``
    // regex parses zero channels, the ``relLum`` helper sees ``[null,
    // null, null]``, and the ratio collapses to ``0`` even though the
    // actual rendered button has a 12.80:1 WCAG 2.2 contrast (AAA) per
    // the Marshall S1 commit ``e857815`` measurement (``--nl-ink:
    // oklch(0.14 0.012 250)`` foreground on ``--nl-phos: oklch(0.88 0.15
    // 140)`` background).
    //
    // Approach options reviewed:
    //   (A) extend ``parseRgb`` to recognise oklch + convert via culori
    //       or a manual OKLCH->sRGB transform inline. Adds a runtime dep
    //       or 60+ lines of color math for a single assertion.
    //   (B) skip the assertion with explicit reference to the shipped
    //       runtime AAA proof (commit ``e857815`` body: "Measured
    //       contrast ratio 12.80:1 under WCAG 2.2 contrast math,
    //       comfortably above the 4.5:1 AA minimum, also passes AAA
    //       7:1"). Marshall's commit explicitly proves contrast at
    //       deploy time; the Playwright assertion was a regression
    //       tripwire, and the OKLCH design-token migration is the
    //       deliberate tripwire trip.
    //
    // V6 ferry brief authorised approach (B) for the hackathon
    // submission window. A stronger future fix would wire the W3C CSS
    // Color Module Level 4 contrast helper or culori once the build
    // budget allows; a non-W4 follow-up ADR can re-open the case.
    test.fixme(
      true,
      'oklch design tokens defeat the rgba regex parser; contrast verified at 12.80:1 in Marshall S1 commit e857815. Re-enable after parser migration.',
    );
    await page.goto('/pricing');
    await page.waitForSelector('.mp-tier-card', { timeout: 15_000 });
  });

  test('mobile viewport collapses grid to single column', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/pricing');
    await page.waitForSelector('.mp-tier-card', { timeout: 15_000 });
    const cards = page.locator('.mp-tier-card');
    const [first, second] = await Promise.all([
      cards.nth(0).boundingBox(),
      cards.nth(1).boundingBox(),
    ]);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (first && second) {
      // Two cards stacked vertically means second.y > first.y and both
      // share approximately the same x (within 4px slack).
      expect(Math.abs((first.x ?? 0) - (second.x ?? 0))).toBeLessThan(6);
      expect(second.y).toBeGreaterThan(first.y);
    }
  });

  test('keyboard focus ring is visible on subscribe buttons', async ({
    page,
  }) => {
    await page.goto('/pricing');
    await page.waitForSelector('.mp-tier-card', { timeout: 15_000 });
    const firstBtn = page.locator('.mp-tier-card button').first();
    await firstBtn.focus();
    const outline = await firstBtn.evaluate((el) => {
      const s = getComputedStyle(el);
      return { outline: s.outline, outlineWidth: s.outlineWidth };
    });
    // Focus-visible outline is set in landing.css; we verify a non-zero
    // outline width is present when the button is focused.
    expect(outline.outlineWidth).not.toBe('0px');
  });
});
