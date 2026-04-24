//
// tests/tier_gating.spec.ts
//
// Owner: Marshall (W2 NP P6 S2). Cross-pillar tier-state propagation
// regression. Verifies that the Plutus subscription tier emitted by
// /v1/billing/subscription/me reaches:
//   1. The Marketplace ListingTierLock pill on every gated card.
//   2. The Builder BuilderTierGate badge on Guided + Express modes.
//   3. The in-game HUD TierBadge pill.
//
// Each surface mounts a Marshall S2 component that consumes the shared
// useSubscriptionTier hook + Marshall S1 useTierStore. The same Plutus
// snapshot drives all three; we assert the lock state matches the tier
// rank check end to end.
//

import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __NERIUM_TEST__?: {
      phaserMounted?: boolean;
      ready?: boolean;
      activeSceneKey?: string;
      worldId?: string;
    };
  }
}

function setupSubscriptionRoutes(page: Page, tier: string | null) {
  page.route('**/v1/billing/subscription/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        subscription:
          tier === null
            ? null
            : {
                tier,
                status: 'active',
                current_period_start: '2026-04-01T00:00:00Z',
                current_period_end: '2026-05-01T00:00:00Z',
                cancel_at_period_end: false,
              },
      }),
    });
  });
  page.route('**/v1/me/flags', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        flags: [
          { flag_name: 'pricing.page.live', value: true, kind: 'bool' },
        ],
        evaluated_at: new Date().toISOString(),
      }),
    });
  });
}

test.describe('Marshall cross-pillar tier-state propagation', () => {
  test('marketplace cards render lock pill for premium listings on free tier', async ({
    page,
  }) => {
    setupSubscriptionRoutes(page, null);
    await page.goto('/marketplace');
    // ListingCard renders one ListingTierLock per card; we filter for
    // the locked variant via the data attribute that the component
    // emits regardless of tier rank.
    const locks = page.locator(
      '[data-testid="listing-tier-lock"][data-meets-requirement="false"]',
    );
    await locks.first().waitFor({ state: 'attached', timeout: 15_000 });
    const count = await locks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('marketplace cards render unlocked pill for cheap listings on team tier', async ({
    page,
  }) => {
    setupSubscriptionRoutes(page, 'team');
    await page.goto('/marketplace');
    // Wait for the first locked pill to attach so the client-side hook
    // has had a chance to fetch + propagate the team-tier snapshot. The
    // useSubscriptionTier hook fires on mount; at steady state every
    // pill carries data-meets-requirement="true" for team subscribers.
    await page
      .locator('[data-testid="listing-tier-lock"]')
      .first()
      .waitFor({ state: 'attached', timeout: 15_000 });
    await expect
      .poll(
        async () =>
          page
            .locator(
              '[data-testid="listing-tier-lock"][data-meets-requirement="false"]',
            )
            .count(),
        { timeout: 15_000 },
      )
      .toBe(0);
  });

  test('builder page surfaces guided + express tier gates', async ({
    page,
  }) => {
    setupSubscriptionRoutes(page, null);
    await page.goto('/builder');
    const guided = page.locator(
      '[data-testid="builder-tier-gate"][data-feature="Guided mode"]',
    );
    const express = page.locator(
      '[data-testid="builder-tier-gate"][data-feature="Express mode"]',
    );
    await expect(guided).toBeVisible();
    await expect(express).toBeVisible();
    await expect(guided).toHaveAttribute('data-required-tier', 'team');
    await expect(express).toHaveAttribute('data-required-tier', 'pro');
    await expect(guided).toHaveAttribute('data-meets-requirement', 'false');
    await expect(express).toHaveAttribute('data-meets-requirement', 'false');
  });

  test('builder page reports unlocked guided gate for team subscribers', async ({
    page,
  }) => {
    setupSubscriptionRoutes(page, 'team');
    await page.goto('/builder');
    const guided = page.locator(
      '[data-testid="builder-tier-gate"][data-feature="Guided mode"]',
    );
    await expect(guided).toHaveAttribute('data-meets-requirement', 'true');
  });

  test('in-game HUD tier badge reflects backend subscription tier', async ({
    page,
  }) => {
    setupSubscriptionRoutes(page, 'pro');
    await page.goto('/play');
    await page.waitForSelector('canvas', { timeout: 25_000 });
    await page.waitForFunction(
      () => window.__NERIUM_TEST__?.ready === true,
      { timeout: 25_000 },
    );
    await page.waitForTimeout(400);
    const badge = page.locator('[data-hud-role="tier-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('data-tier', 'pro');
  });

  test('in-game HUD tier badge defaults to free when unauth', async ({
    page,
  }) => {
    setupSubscriptionRoutes(page, null);
    await page.goto('/play');
    await page.waitForSelector('canvas', { timeout: 25_000 });
    await page.waitForFunction(
      () => window.__NERIUM_TEST__?.ready === true,
      { timeout: 25_000 },
    );
    await page.waitForTimeout(400);
    const badge = page.locator('[data-hud-role="tier-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('data-tier', 'free');
  });
});
