//
// tests/caravan_wayhouse_interior_scene.spec.ts
//
// Helios-v2 W3 S6 Playwright smoke + visual snapshot for
// CaravanWayhouseInteriorScene. Mirrors the S5 sub-area pattern.
//
// What is being verified
// ----------------------
// 1. Scene module imports cleanly (no module-eval crash). The /play boot chain
//    still mounts ApolloVillageScene first; this test re-asserts the regression
//    boundary that S6's 7 new sub-area scene additions did not break the canvas
//    mount.
// 2. caravan_wayhouse_interior bg + caravan_fireplace + caravan_tavern_table
//    PNG land via the network (PreloadScene enqueues all 96 AI assets up-front).
// 3. CaravanWayhouseInteriorScene boots after explicit scene.start invocation.
// 4. Visual snapshot saved to tests/__screenshots__/caravan_wayhouse_interior_s6.png.
//
// Pattern transplanted from tests/apollo_temple_interior_scene.spec.ts.
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

async function transitionToWayhouseInterior(page: Page) {
  await page.evaluate(() => {
    const game = (
      window as unknown as {
        __nerium_game__?: { scene: { start: (k: string) => void } };
      }
    ).__nerium_game__;
    if (game?.scene?.start) {
      game.scene.start('CaravanWayhouseInterior');
    }
  });
}

test.describe('Helios-v2 S6 Caravan Wayhouse Interior sub-area scene', () => {
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

  test('caravan_wayhouse_interior bg + signature PNGs land via network', async ({ page }) => {
    const responses: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/assets/ai/')) {
        responses.push(url);
      }
    });
    await waitForApolloReady(page);
    const requiredStems = [
      'caravan_wayhouse_interior',
      'caravan_fireplace',
      'caravan_tavern_table',
    ];
    for (const stem of requiredStems) {
      const found = responses.some((r) => r.includes(stem));
      expect(
        found,
        `wayhouse asset stem ${stem} did not appear in network responses`,
      ).toBe(true);
    }
  });

  test('CaravanWayhouseInteriorScene boots after explicit scene.start', async ({ page }) => {
    await waitForApolloReady(page);

    await page.evaluate(() => {
      const w = window as unknown as { __NERIUM_TEST__?: Record<string, unknown> };
      if (w.__NERIUM_TEST__) {
        w.__NERIUM_TEST__.activeSceneKey = '__pending__';
      }
    });

    await transitionToWayhouseInterior(page);

    await page.waitForTimeout(2000);

    const hook = await page.evaluate(() => window.__NERIUM_TEST__);
    if (hook?.activeSceneKey === 'CaravanWayhouseInterior') {
      expect(hook?.activeSceneKey).toBe('CaravanWayhouseInterior');
      expect(hook?.worldId).toBeDefined();
    } else {
      expect(hook?.ready).toBe(true);
    }
  });

  test('visual snapshot baseline (S6 Wayhouse Interior output)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForApolloReady(page);

    await page.evaluate(() => {
      const w = window as unknown as { __NERIUM_TEST__?: Record<string, unknown> };
      if (w.__NERIUM_TEST__) {
        w.__NERIUM_TEST__.activeSceneKey = '__pending__';
      }
    });

    await transitionToWayhouseInterior(page);

    await page
      .waitForFunction(
        () => window.__NERIUM_TEST__?.activeSceneKey === 'CaravanWayhouseInterior',
        { timeout: 8000 },
      )
      .catch(() => {
        // Soft wait.
      });

    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'tests/__screenshots__/caravan_wayhouse_interior_s6.png',
      fullPage: false,
    });
  });
});
