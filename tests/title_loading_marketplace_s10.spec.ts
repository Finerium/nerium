//
// tests/title_loading_marketplace_s10.spec.ts
//
// Helios-v2 W3 S10 smoke tests: TitleScene + LoadingScene registered + reachable;
// Marketplace hero banner + empty state assets present in DOM.
//
// Per CLAUDE.md anti-patterns: no em dash, no emoji.
//

import { test, expect } from '@playwright/test';

test.describe('Helios-v2 S10 Title + Loading + Marketplace UI', () => {
  test('default boot remains BootScene -> Preload -> ApolloVillage', async ({ page }) => {
    await page.goto('/play');
    await page.waitForFunction(
      () => (window as unknown as { __NERIUM_TEST__?: { ready?: boolean } }).__NERIUM_TEST__?.ready === true,
      { timeout: 30_000 },
    );
    const sceneKey = await page.evaluate(() => {
      return (window as unknown as { __NERIUM_TEST__?: { activeSceneKey?: string } }).__NERIUM_TEST__?.activeSceneKey;
    });
    expect(sceneKey).toBe('ApolloVillage');
  });

  test('TitleScene + LoadingScene are registered in scene manager', async ({ page }) => {
    await page.goto('/play');
    await page.waitForFunction(
      () => (window as unknown as { __NERIUM_TEST__?: { ready?: boolean } }).__NERIUM_TEST__?.ready === true,
      { timeout: 30_000 },
    );

    const titleRegistered = await page.evaluate(() => {
      const game = (window as unknown as { __nerium_game__?: { scene?: { keys?: Record<string, unknown> } } }).__nerium_game__;
      return Boolean(game?.scene?.keys?.['Title']);
    });
    const loadingRegistered = await page.evaluate(() => {
      const game = (window as unknown as { __nerium_game__?: { scene?: { keys?: Record<string, unknown> } } }).__nerium_game__;
      return Boolean(game?.scene?.keys?.['Loading']);
    });

    expect(titleRegistered).toBe(true);
    expect(loadingRegistered).toBe(true);
  });

  test('Marketplace page renders hero banner element', async ({ page }) => {
    await page.goto('/marketplace');
    await page.waitForLoadState('networkidle');
    const banner = page.locator('[data-helios-s10="marketplace-hero-banner"]');
    await expect(banner).toBeVisible();
  });
});
