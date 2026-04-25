//
// tests/phaser-smoke.spec.ts
//
// Playwright smoke test for the /play route. Verifies:
//   1. PhaserCanvas mounts (window.__NERIUM_TEST__.phaserMounted === true)
//   2. ApolloVillageScene reaches create() and publishes its scene key
//   3. worldId lands on medieval_desert
//   4. Strict Mode double-mount guard holds (only one active game)
//
// Hook namespace: window.__NERIUM_TEST__ per gotcha 5 (no unscoped __TEST__).
//

import { expect, test } from '@playwright/test';

// Window augmentation lives in tests/types/nerium-test-window.d.ts.

test.describe('Thalia-v2 Phaser scenes core smoke', () => {
  test('PhaserCanvas mounts and ApolloVillageScene announces ready', async ({ page }) => {
    await page.goto('/play');

    // Wait for the canvas element itself to attach.
    await page.waitForSelector('canvas', { timeout: 20_000 });

    // Bridge + ApolloVillageScene.create() populate the test hook.
    await page.waitForFunction(
      () => window.__NERIUM_TEST__?.ready === true,
      { timeout: 20_000 },
    );

    const hook = await page.evaluate(() => window.__NERIUM_TEST__);
    expect(hook?.phaserMounted).toBe(true);
    expect(hook?.ready).toBe(true);
    expect(hook?.activeSceneKey).toBe('ApolloVillage');
    expect(hook?.worldId).toBe('medieval_desert');
  });

  test('only one Phaser canvas element survives Strict Mode double mount', async ({ page }) => {
    await page.goto('/play');
    await page.waitForSelector('canvas', { timeout: 20_000 });
    await page.waitForFunction(() => window.__NERIUM_TEST__?.ready === true, {
      timeout: 20_000,
    });

    const canvasCount = await page.locator('canvas').count();
    expect(canvasCount).toBe(1);
  });
});
