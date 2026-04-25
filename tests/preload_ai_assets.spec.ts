//
// tests/preload_ai_assets.spec.ts
//
// Helios-v2 W3 S1 Playwright smoke test: PreloadScene preload of all 96
// AI-generated assets completes with zero 404. Captures network responses
// for any /assets/ai/* request and asserts every response status is 200.
//
// Pattern transplanted from tests/phaser-smoke.spec.ts. Uses the existing
// window.__NERIUM_TEST__ hook to gate test completion on
// ApolloVillageScene.create() (which fires only after PreloadScene 'complete'
// has flushed all queued loads).
//

import { expect, test } from '@playwright/test';

test.describe('Helios-v2 S1 AI asset preload smoke', () => {
  test('every /assets/ai/* request resolves with 200', async ({ page }) => {
    const failed: Array<{ url: string; status: number }> = [];
    const responses: string[] = [];

    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/assets/ai/')) {
        responses.push(url);
        const status = response.status();
        if (status !== 200) {
          failed.push({ url, status });
        }
      }
    });

    await page.goto('/play');
    await page.waitForSelector('canvas', { timeout: 30_000 });

    // ApolloVillageScene.create() fires only after all preloaded assets land.
    // 96 assets + legacy pack will take longer than the default 20s smoke;
    // bump to 30s for headroom on dev cold start.
    await page.waitForFunction(
      () => window.__NERIUM_TEST__?.ready === true,
      { timeout: 30_000 },
    );

    // Verify zero 404 across all AI asset requests.
    expect(failed, `failed AI asset loads: ${JSON.stringify(failed)}`).toHaveLength(0);

    // Verify a meaningful number of AI asset requests fired (the registry
    // declares 96 unique URLs; Phaser may resolve a few via cache hits in
    // dev hot-reload so we use a lower bound rather than strict equality).
    expect(
      responses.length,
      `expected at least 80 AI asset responses observed, got ${responses.length}`,
    ).toBeGreaterThanOrEqual(80);
  });

  test('PreloadScene console reports image + spritesheet enqueue counts', async ({
    page,
  }) => {
    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'info' || msg.type() === 'log') {
        consoleMessages.push(msg.text());
      }
    });

    await page.goto('/play');
    await page.waitForFunction(
      () => window.__NERIUM_TEST__?.ready === true,
      { timeout: 30_000 },
    );

    const enqueueLog = consoleMessages.find((m) =>
      m.includes('[PreloadScene] enqueued'),
    );
    expect(
      enqueueLog,
      `PreloadScene enqueue log not observed; saw: ${consoleMessages.slice(0, 5).join(' | ')}`,
    ).toBeTruthy();

    // Expected breakdown: 91 static images + 5 spritesheets = 96
    expect(enqueueLog).toContain('91 AI images');
    expect(enqueueLog).toContain('5 spritesheets');
    expect(enqueueLog).toContain('96 total');
  });
});
