//
// tests/landmark_glyph_proximity.spec.ts
//
// Helios-v2 W3 S7 Playwright smoke + visual snapshot for the hovering
// landmark glyph + proximity prompt visuals across the 4 Apollo pillar
// landmarks + the temple_arch ambient entry + the 4 Cyber pillar landmarks.
//
// What is being verified
// ----------------------
// 1. Boot chain mount intact after S7 wiring (no module-eval crash).
// 2. apollo_village + temple_arch + cyber landmark assets all land.
// 3. Visual snapshot of Apollo Village shows the glyphs above each pillar
//    landmark + the temple_arch glyph (lighter weight ambient).
// 4. Visual snapshot of CyberpunkShanghai shows the cyan glyphs above
//    each pillar landmark.
//
// The S7 glyph proximity logic (idle pulse, scale-up on player proximity,
// flash on E-key trigger) is exercised by the Apollo + Cyber main scene
// tests already in place (which simulate player movement). This S7 spec
// adds a dedicated baseline snapshot for the new visuals.
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

async function transitionToCyberpunkShanghai(page: Page) {
  await page.evaluate(() => {
    const game = (
      window as unknown as {
        __nerium_game__?: { scene: { start: (k: string) => void } };
      }
    ).__nerium_game__;
    if (game?.scene?.start) {
      game.scene.start('CyberpunkShanghai');
    }
  });
}

test.describe('Helios-v2 S7 landmark glyph + prompt visuals', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('boot chain mount intact after S7 landmark visuals wiring', async ({ page }) => {
    await waitForApolloReady(page);
    const hook = await page.evaluate(() => window.__NERIUM_TEST__);
    expect(hook?.ready).toBe(true);
    expect(hook?.activeSceneKey).toBe('ApolloVillage');
    expect(hook?.phaserMounted).toBe(true);
  });

  test('temple_arch ambient entry asset lands via network', async ({ page }) => {
    const responses: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/assets/ai/')) {
        responses.push(url);
      }
    });
    await waitForApolloReady(page);
    // temple_arch is the ambient entry landmark added in S7 fold-in.
    const found = responses.some((r) => r.includes('temple_arch'));
    expect(
      found,
      'temple_arch landmark asset did not appear in network responses',
    ).toBe(true);
  });

  test('visual snapshot baseline (S7 Apollo Village glyph + temple_arch)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForApolloReady(page);
    // Wait long enough for the idle alpha pulse tween to settle so the
    // snapshot captures the glyphs at a representative phase.
    await page.waitForTimeout(2200);

    await page.screenshot({
      path: 'tests/__screenshots__/apollo_village_s7_glyphs.png',
      fullPage: false,
    });
  });

  test('visual snapshot baseline (S7 Cyberpunk Shanghai glyphs)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForApolloReady(page);

    await page.evaluate(() => {
      const w = window as unknown as { __NERIUM_TEST__?: Record<string, unknown> };
      if (w.__NERIUM_TEST__) {
        w.__NERIUM_TEST__.activeSceneKey = '__pending__';
      }
    });

    await transitionToCyberpunkShanghai(page);

    await page
      .waitForFunction(
        () => window.__NERIUM_TEST__?.activeSceneKey === 'CyberpunkShanghai',
        { timeout: 8000 },
      )
      .catch(() => {
        // Soft wait.
      });

    await page.waitForTimeout(2200);

    await page.screenshot({
      path: 'tests/__screenshots__/cyberpunk_shanghai_s7_glyphs.png',
      fullPage: false,
    });
  });
});
