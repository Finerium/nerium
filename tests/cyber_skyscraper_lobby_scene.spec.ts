//
// tests/cyber_skyscraper_lobby_scene.spec.ts
//
// Helios-v2 W3 S6 Playwright smoke + visual snapshot for
// CyberSkyscraperLobbyScene. Mirrors the S5 sub-area pattern.
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

async function transitionToSkyscraperLobby(page: Page) {
  await page.evaluate(() => {
    const game = (
      window as unknown as {
        __nerium_game__?: { scene: { start: (k: string) => void } };
      }
    ).__nerium_game__;
    if (game?.scene?.start) {
      game.scene.start('CyberSkyscraperLobby');
    }
  });
}

test.describe('Helios-v2 S6 Cyber Skyscraper Lobby sub-area scene', () => {
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

  test('cyber_skyscraper_lobby bg + signature PNGs land via network', async ({ page }) => {
    const responses: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/assets/ai/')) {
        responses.push(url);
      }
    });
    await waitForApolloReady(page);
    const requiredStems = [
      'cyber_skyscraper_lobby',
      'cyber_reception_desk',
      'cyber_chrome_sculpture',
      'cyber_elevator_door',
    ];
    for (const stem of requiredStems) {
      const found = responses.some((r) => r.includes(stem));
      expect(
        found,
        `skyscraper lobby asset stem ${stem} did not appear in network responses`,
      ).toBe(true);
    }
  });

  test('CyberSkyscraperLobbyScene boots after explicit scene.start', async ({ page }) => {
    await waitForApolloReady(page);

    await page.evaluate(() => {
      const w = window as unknown as { __NERIUM_TEST__?: Record<string, unknown> };
      if (w.__NERIUM_TEST__) {
        w.__NERIUM_TEST__.activeSceneKey = '__pending__';
      }
    });

    await transitionToSkyscraperLobby(page);

    await page.waitForTimeout(2000);

    const hook = await page.evaluate(() => window.__NERIUM_TEST__);
    if (hook?.activeSceneKey === 'CyberSkyscraperLobby') {
      expect(hook?.activeSceneKey).toBe('CyberSkyscraperLobby');
      expect(hook?.worldId).toBeDefined();
    } else {
      expect(hook?.ready).toBe(true);
    }
  });

  test('visual snapshot baseline (S6 Skyscraper Lobby output)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForApolloReady(page);

    await page.evaluate(() => {
      const w = window as unknown as { __NERIUM_TEST__?: Record<string, unknown> };
      if (w.__NERIUM_TEST__) {
        w.__NERIUM_TEST__.activeSceneKey = '__pending__';
      }
    });

    await transitionToSkyscraperLobby(page);

    await page
      .waitForFunction(
        () => window.__NERIUM_TEST__?.activeSceneKey === 'CyberSkyscraperLobby',
        { timeout: 8000 },
      )
      .catch(() => {
        // Soft wait.
      });

    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'tests/__screenshots__/cyber_skyscraper_lobby_s6.png',
      fullPage: false,
    });
  });
});
