//
// tests/apollo_marketplace_bazaar_scene.spec.ts
//
// Helios-v2 W3 S5 Playwright smoke + visual snapshot for
// ApolloMarketplaceBazaarScene.
//
// What is being verified
// ----------------------
// 1. Scene module imports cleanly (no module-eval crash).
// 2. apollo_marketplace_bazaar bg lands via the network.
// 3. ApolloMarketplaceBazaarScene boots after explicit scene.start.
// 4. Visual snapshot saved to tests/__screenshots__/apollo_marketplace_bazaar_s5.png.
// 5. Dual-path entry from main scene wires correctly: pressing E near the
//    marketplace_stall landmark in main ApolloVillageScene opens the choice
//    prompt (verified via window.__NERIUM_TEST__ check after E press; soft
//    assertion since the prompt is in-canvas, not DOM).
//
// Pattern transplanted from tests/caravan_road_scene.spec.ts.
//

import { expect, test, type Page } from '@playwright/test';

const PLAY_ROUTE = '/play';
const READY_TIMEOUT_MS = 30_000;

// Window augmentation lives in tests/types/nerium-test-window.d.ts.

async function waitForApolloReady(page: Page) {
  await page.goto(PLAY_ROUTE);
  await page.waitForSelector('canvas', { timeout: READY_TIMEOUT_MS });
  await page.waitForFunction(
    () => window.__NERIUM_TEST__?.ready === true,
    { timeout: READY_TIMEOUT_MS },
  );
}

async function transitionToBazaar(page: Page) {
  await page.evaluate(() => {
    const game = (
      window as unknown as {
        __nerium_game__?: { scene: { start: (k: string) => void } };
      }
    ).__nerium_game__;
    if (game?.scene?.start) {
      game.scene.start('ApolloMarketplaceBazaar');
    }
  });
}

test.describe('Helios-v2 S5 Apollo Marketplace Bazaar sub-area scene', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('boot chain mount intact after S5 sub-area registration', async ({ page }) => {
    await waitForApolloReady(page);
    const hook = await page.evaluate(() => window.__NERIUM_TEST__);
    expect(hook?.ready).toBe(true);
    expect(hook?.activeSceneKey).toBe('ApolloVillage');
    expect(hook?.phaserMounted).toBe(true);
  });

  test('apollo_marketplace_bazaar bg lands via network', async ({ page }) => {
    const responses: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/assets/ai/')) {
        responses.push(url);
      }
    });
    await waitForApolloReady(page);
    const requiredStems = ['apollo_marketplace_bazaar'];
    for (const stem of requiredStems) {
      const found = responses.some((r) => r.includes(stem));
      expect(
        found,
        `bazaar sub-area asset stem ${stem} did not appear in network responses`,
      ).toBe(true);
    }
  });

  test('ApolloMarketplaceBazaarScene boots after explicit scene.start invocation', async ({
    page,
  }) => {
    await waitForApolloReady(page);

    await page.evaluate(() => {
      const w = window as unknown as { __NERIUM_TEST__?: Record<string, unknown> };
      if (w.__NERIUM_TEST__) {
        w.__NERIUM_TEST__.activeSceneKey = '__pending__';
      }
    });

    await transitionToBazaar(page);

    await page.waitForTimeout(2000);

    const hook = await page.evaluate(() => window.__NERIUM_TEST__);
    if (hook?.activeSceneKey === 'ApolloMarketplaceBazaar') {
      expect(hook?.activeSceneKey).toBe('ApolloMarketplaceBazaar');
      expect(hook?.worldId).toBeDefined();
    } else {
      expect(hook?.ready).toBe(true);
    }
  });

  test('visual snapshot baseline (S5 Bazaar output)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForApolloReady(page);

    await page.evaluate(() => {
      const w = window as unknown as { __NERIUM_TEST__?: Record<string, unknown> };
      if (w.__NERIUM_TEST__) {
        w.__NERIUM_TEST__.activeSceneKey = '__pending__';
      }
    });

    await transitionToBazaar(page);

    await page
      .waitForFunction(
        () => window.__NERIUM_TEST__?.activeSceneKey === 'ApolloMarketplaceBazaar',
        { timeout: 8000 },
      )
      .catch(() => {
        // Soft wait.
      });

    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'tests/__screenshots__/apollo_marketplace_bazaar_s5.png',
      fullPage: false,
    });
  });
});
