//
// tests/visual_snapshot.spec.ts
//
// Helios-v2 W3 S4 visual snapshot capture for /ultrareview Run #1.
// Captures one screenshot per scene at standard viewport so Ghaisan can
// /ultrareview the visual revamp output across the 3 active scenes.
//
// Output PNGs saved under test-results/. Each snapshot waits for the
// canvas + scene ready signal, then takes a full-canvas screenshot.
//

import { test } from '@playwright/test';

declare global {
  interface Window {
    __NERIUM_TEST__?: {
      phaserMounted?: boolean;
      ready?: boolean;
      activeSceneKey?: string;
      worldId?: string;
    };
  }
}

test.describe('Helios-v2 visual snapshot capture for /ultrareview', () => {
  test('capture ApolloVillage snapshot', async ({ page }) => {
    await page.goto('/play');
    await page.waitForSelector('canvas', { timeout: 20_000 });
    await page.waitForFunction(() => window.__NERIUM_TEST__?.ready === true, {
      timeout: 20_000,
    });
    // Allow ambient FX particles to populate
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: 'test-results/helios_v2_s4_apollo_village.png',
      fullPage: false,
    });
  });
});
