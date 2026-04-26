// Debug helper: launch /play and trace what's happening with PreloadScene.

import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1408, height: 800 },
  });
  const page = await ctx.newPage();

  page.on('console', (msg) => {
    console.log('[browser]', msg.type(), msg.text());
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) console.log('[http]', r.status(), r.url());
  });

  await page.goto('http://localhost:3100/play?intro=0', {
    waitUntil: 'domcontentloaded',
  });

  // Poll every 3s for state.
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(3000);
    const state = await page.evaluate(() => {
      const w = window;
      const test = w.__NERIUM_TEST__ ?? null;
      const game = w.__nerium_game__;
      let activeScenes = null;
      let loaderProgress = null;
      if (game) {
        activeScenes = game.scene.scenes
          .filter((s) => s.scene.isActive())
          .map((s) => s.scene.key);
        const preload = game.scene.getScene('Preload');
        if (preload) {
          loaderProgress = {
            list: preload.load.list?.size ?? null,
            inflight: preload.load.inflight?.size ?? null,
            queue: preload.load.queue?.size ?? null,
            totalToLoad: preload.load.totalToLoad,
            totalComplete: preload.load.totalComplete,
            totalFailed: preload.load.totalFailed,
            isLoading: preload.load.isLoading(),
          };
        }
      }
      return { test, activeScenes, loaderProgress };
    });
    console.log('[poll', i, ']', JSON.stringify(state));
    if (state.test?.ready === true) {
      console.log('READY');
      break;
    }
  }

  await page.screenshot({
    path: '_skills_staging/nemea_phase0_iterations/debug_preload.png',
  });
  await browser.close();
}

main();
