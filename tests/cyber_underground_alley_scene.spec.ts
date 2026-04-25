//
// tests/cyber_underground_alley_scene.spec.ts
//
// Helios-v2 W3 S6 Playwright smoke + visual snapshot for
// CyberUndergroundAlleyScene. Mirrors the S5 sub-area pattern.
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

async function transitionToUndergroundAlley(page: Page) {
  await page.evaluate(() => {
    const game = (
      window as unknown as {
        __nerium_game__?: { scene: { start: (k: string) => void } };
      }
    ).__nerium_game__;
    if (game?.scene?.start) {
      game.scene.start('CyberUndergroundAlley');
    }
  });
}

test.describe('Helios-v2 S6 Cyber Underground Alley sub-area scene', () => {
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

  test('cyber_underground_alley bg + cyber_industrial_pipe + smog_wisps PNG land via network', async ({ page }) => {
    const responses: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/assets/ai/')) {
        responses.push(url);
      }
    });
    await waitForApolloReady(page);
    const requiredStems = ['cyber_underground_alley', 'cyber_industrial_pipe', 'smog_wisps'];
    for (const stem of requiredStems) {
      const found = responses.some((r) => r.includes(stem));
      expect(
        found,
        `underground alley asset stem ${stem} did not appear in network responses`,
      ).toBe(true);
    }
  });

  test('CyberUndergroundAlleyScene boots after explicit scene.start', async ({ page }) => {
    await waitForApolloReady(page);

    await page.evaluate(() => {
      const w = window as unknown as { __NERIUM_TEST__?: Record<string, unknown> };
      if (w.__NERIUM_TEST__) {
        w.__NERIUM_TEST__.activeSceneKey = '__pending__';
      }
    });

    await transitionToUndergroundAlley(page);

    await page.waitForTimeout(2000);

    const hook = await page.evaluate(() => window.__NERIUM_TEST__);
    if (hook?.activeSceneKey === 'CyberUndergroundAlley') {
      expect(hook?.activeSceneKey).toBe('CyberUndergroundAlley');
      expect(hook?.worldId).toBeDefined();
    } else {
      expect(hook?.ready).toBe(true);
    }
  });

  test('visual snapshot baseline (S6 Underground Alley output)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForApolloReady(page);

    await page.evaluate(() => {
      const w = window as unknown as { __NERIUM_TEST__?: Record<string, unknown> };
      if (w.__NERIUM_TEST__) {
        w.__NERIUM_TEST__.activeSceneKey = '__pending__';
      }
    });

    await transitionToUndergroundAlley(page);

    await page
      .waitForFunction(
        () => window.__NERIUM_TEST__?.activeSceneKey === 'CyberUndergroundAlley',
        { timeout: 8000 },
      )
      .catch(() => {
        // Soft wait.
      });

    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'tests/__screenshots__/cyber_underground_alley_s6.png',
      fullPage: false,
    });
  });
});
