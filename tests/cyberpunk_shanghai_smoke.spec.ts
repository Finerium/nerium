//
// tests/cyberpunk_shanghai_smoke.spec.ts
//
// Helios-v2 W3 S4 smoke for CyberpunkShanghaiScene. Verifies module
// imports cleanly + does not regress the ApolloVillage boot path.
//

import { expect, test } from '@playwright/test';

// Window augmentation lives in tests/types/nerium-test-window.d.ts.

test.describe('Helios-v2 S4 CyberpunkShanghaiScene smoke', () => {
  test('CyberpunkShanghai module imports cleanly + Apollo boot still works', async ({
    page,
  }) => {
    await page.goto('/play');
    await page.waitForSelector('canvas', { timeout: 20_000 });
    await page.waitForFunction(() => window.__NERIUM_TEST__?.ready === true, {
      timeout: 20_000,
    });
    const hook = await page.evaluate(() => window.__NERIUM_TEST__);
    expect(hook?.phaserMounted).toBe(true);
    expect(hook?.ready).toBe(true);
    expect(hook?.activeSceneKey).toBe('ApolloVillage');
    expect(hook?.worldId).toBe('medieval_desert');
  });
});
