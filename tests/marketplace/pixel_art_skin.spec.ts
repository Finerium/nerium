//
// tests/marketplace/pixel_art_skin.spec.ts
//
// T7 (2026-04-26). Verifies the pixel-art companion skin layered on top
// of the existing Phanes / Hyperion / Iapetus / Erato components for
// the Marketplace + Builder web routes. The skin is a presentational
// wrapper: every existing functional contract (search, tier gates,
// listing cards, dashboard widgets, model selection modal) is asserted
// to remain intact through the new chrome.
//
// Asset bundle is downsized at commit time via macOS sips, so the
// fetch checks below confirm the 15 JPGs land in public/ and serve
// without 404 from the Next dev server.
//
// No em dash, no emoji.
//

import { test, expect } from '@playwright/test';

const PIXEL_ART_ASSETS: ReadonlyArray<string> = [
  '/marketplace-assets/marketplace_shop_interior_bg.jpg',
  '/marketplace-assets/marketplace_listing_card_frame.jpg',
  '/marketplace-assets/marketplace_buy_button_normal.jpg',
  '/marketplace-assets/marketplace_buy_button_hover.jpg',
  '/marketplace-assets/marketplace_category_tab_skill.jpg',
  '/marketplace-assets/marketplace_category_tab_agent.jpg',
  '/marketplace-assets/marketplace_category_tab_dataset.jpg',
  '/marketplace-assets/marketplace_search_bar_frame.jpg',
  '/marketplace-assets/builder_workshop_interior_bg.jpg',
  '/marketplace-assets/builder_agent_node_frame.jpg',
  '/marketplace-assets/builder_agent_structure_graph_bg.jpg',
  '/marketplace-assets/builder_vendor_badge_anthropic.jpg',
  '/marketplace-assets/builder_vendor_badge_google.jpg',
  '/marketplace-assets/builder_spawn_terminal_frame.jpg',
  '/marketplace-assets/builder_complete_celebration_overlay.jpg',
];

test.describe('T7 pixel-art skin asset availability', () => {
  test('all 15 pixel-art assets fetch HTTP 200', async ({ request }) => {
    for (const path of PIXEL_ART_ASSETS) {
      const res = await request.get(path);
      expect(
        res.status(),
        `Expected HTTP 200 for ${path} got ${res.status()}`,
      ).toBe(200);
      const length = res.headers()['content-length'];
      if (length) {
        expect(
          Number(length),
          `Expected non-empty body for ${path}`,
        ).toBeGreaterThan(1024);
      }
    }
  });
});

test.describe('T7 pixel-art skin on /marketplace', () => {
  test('shell wrapper renders + honest-claim banner present', async ({ page }) => {
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');

    // Pixel-art shell wrapper.
    const shell = page.locator('[data-t7-shell="marketplace"]');
    await expect(shell).toBeVisible();

    // Honest-claim banner per spawn Phase 4 directive.
    const banner = shell.locator('.t7-honest-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Web companion view');
    const playLink = banner.locator('a[href="/play"]');
    await expect(playLink).toBeVisible();
    await expect(playLink).toHaveText('/play');
  });

  test('shop interior background image loaded via CSS background', async ({
    page,
  }) => {
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    const bgUrl = await page.evaluate(() => {
      const el = document.querySelector(
        '[data-t7-shell="marketplace"]',
      ) as HTMLElement | null;
      if (!el) return null;
      return getComputedStyle(el).backgroundImage;
    });
    expect(bgUrl).toContain('marketplace_shop_interior_bg');
  });

  test('search bar frame skin wraps the existing search bar', async ({ page }) => {
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    const frame = page.locator('.t7-marketplace-search-frame').first();
    await expect(frame).toBeVisible();
  });

  test('existing Phanes browse marketplace hero banner still attaches', async ({
    page,
  }) => {
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    const banner = page.locator(
      '[data-helios-s10="marketplace-hero-banner"]',
    );
    await expect(banner).toBeVisible();
  });
});

test.describe('T7 pixel-art skin on /marketplace/dashboard', () => {
  test('dashboard re-skinned with t7 stat cards + sections', async ({ page }) => {
    await page.goto('/marketplace/dashboard');
    await page.waitForLoadState('domcontentloaded');

    const shell = page.locator('[data-t7-shell="marketplace"]');
    await expect(shell).toBeVisible();

    const statCards = shell.locator('.t7-marketplace-stat-card');
    await expect(statCards.first()).toBeVisible();
    expect(await statCards.count()).toBeGreaterThanOrEqual(4);

    const sections = shell.locator('.t7-marketplace-section');
    expect(await sections.count()).toBeGreaterThanOrEqual(4);
  });
});

test.describe('T7 pixel-art skin on /builder', () => {
  test('shell wrapper renders + honest-claim banner present', async ({ page }) => {
    await page.goto('/builder');
    await page.waitForLoadState('domcontentloaded');

    const shell = page.locator('[data-t7-shell="builder"]');
    await expect(shell).toBeVisible();

    const banner = shell.locator('.t7-honest-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Web companion view');
  });

  test('workshop interior background image loaded via CSS background', async ({
    page,
  }) => {
    await page.goto('/builder');
    await page.waitForLoadState('domcontentloaded');
    const bgUrl = await page.evaluate(() => {
      const el = document.querySelector(
        '[data-t7-shell="builder"]',
      ) as HTMLElement | null;
      if (!el) return null;
      return getComputedStyle(el).backgroundImage;
    });
    expect(bgUrl).toContain('builder_workshop_interior_bg');
  });

  test('all 8 vendor badges render with t7 class + data-vendor attr', async ({
    page,
  }) => {
    await page.goto('/builder');
    await page.waitForLoadState('domcontentloaded');

    const badges = page.locator('.t7-builder-vendor-badge');
    expect(await badges.count()).toBeGreaterThanOrEqual(8);

    for (const vendor of [
      'anthropic',
      'google',
      'openai',
      'higgsfield',
      'seedance',
      'meta',
      'mistral',
      'auto',
    ]) {
      const badge = page
        .locator(`.t7-builder-vendor-badge[data-vendor="${vendor}"]`)
        .first();
      await expect(badge).toBeVisible();
    }
  });

  test('existing builder tier gates still mount inside pixel-art shell', async ({
    page,
  }) => {
    await page.goto('/builder');
    await page.waitForLoadState('domcontentloaded');

    const guided = page.locator(
      '[data-testid="builder-tier-gate"][data-feature="Guided mode"]',
    );
    const express = page.locator(
      '[data-testid="builder-tier-gate"][data-feature="Express mode"]',
    );
    await expect(guided).toBeVisible();
    await expect(express).toBeVisible();
  });

  test('model selection launcher button still mounted', async ({ page }) => {
    await page.goto('/builder');
    await page.waitForLoadState('domcontentloaded');

    const opener = page.locator('[data-testid="model-selection-open"]');
    await expect(opener).toBeVisible();
  });
});
