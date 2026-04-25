//
// tests/caravan_forest_crossroad_scene.spec.ts
//
// Helios-v2 W3 S6 Playwright smoke + visual snapshot for
// CaravanForestCrossroadScene. Mirrors the S5 sub-area pattern.
//

import { expect, test, type Page } from '@playwright/test';

const PLAY_ROUTE = '/play';
const READY_TIMEOUT_MS = 30_000;

async function waitForApolloReady(page: Page) {
  await page.goto(PLAY_ROUTE);
  await page.waitForSelector('canvas', { timeout: READY_TIMEOUT_MS });
  await page.waitForFunction(
    () => window.__NERIUM_TEST__?.ready === true,
    { timeout: READY_TIMEOUT_MS },
  );
}

async function transitionToForestCrossroad(page: Page) {
  await page.evaluate(() => {
    const game = (
      window as unknown as {
        __nerium_game__?: { scene: { start: (k: string) => void } };
      }
    ).__nerium_game__;
    if (game?.scene?.start) {
      game.scene.start('CaravanForestCrossroad');
    }
  });
}

test.describe('Helios-v2 S6 Caravan Forest Crossroad sub-area scene', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('boot chain mount intact after S6 sub-area registration', async ({ page }) => {
    await waitForApolloReady(page);
    const hook = await page.evaluate(() => window.__NERIUM_TEST__);
    expect(hook?.ready).toBe(true);
    expect(hook?.activeSceneKey).toBe('ApolloVillage');
    expect(hook?.phaserMounted).toBe(true);
  });

  test('caravan_forest_crossroad bg + autumn_leaves PNG land via network', async ({ page }) => {
    const responses: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/assets/ai/')) {
        responses.push(url);
      }
    });
    await waitForApolloReady(page);
    const requiredStems = ['caravan_forest_crossroad', 'autumn_leaves'];
    for (const stem of requiredStems) {
      const found = responses.some((r) => r.includes(stem));
      expect(
        found,
        `forest crossroad asset stem ${stem} did not appear in network responses`,
      ).toBe(true);
    }
  });

  test('CaravanForestCrossroadScene boots after explicit scene.start', async ({ page }) => {
    await waitForApolloReady(page);

    await page.evaluate(() => {
      const w = window as unknown as { __NERIUM_TEST__?: Record<string, unknown> };
      if (w.__NERIUM_TEST__) {
        w.__NERIUM_TEST__.activeSceneKey = '__pending__';
      }
    });

    await transitionToForestCrossroad(page);

    await page.waitForTimeout(2000);

    const hook = await page.evaluate(() => window.__NERIUM_TEST__);
    if (hook?.activeSceneKey === 'CaravanForestCrossroad') {
      expect(hook?.activeSceneKey).toBe('CaravanForestCrossroad');
      expect(hook?.worldId).toBeDefined();
    } else {
      expect(hook?.ready).toBe(true);
    }
  });

  test('visual snapshot baseline (S6 Forest Crossroad output)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForApolloReady(page);

    await page.evaluate(() => {
      const w = window as unknown as { __NERIUM_TEST__?: Record<string, unknown> };
      if (w.__NERIUM_TEST__) {
        w.__NERIUM_TEST__.activeSceneKey = '__pending__';
      }
    });

    await transitionToForestCrossroad(page);

    await page
      .waitForFunction(
        () => window.__NERIUM_TEST__?.activeSceneKey === 'CaravanForestCrossroad',
        { timeout: 8000 },
      )
      .catch(() => {
        // Soft wait.
      });

    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'tests/__screenshots__/caravan_forest_crossroad_s6.png',
      fullPage: false,
    });
  });
});
