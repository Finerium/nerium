// Nemea-RV-v2 W4 Phase 0 visual iteration helper.
//
// Standalone Playwright script. Navigates to /play, waits for Phaser scene
// ready signal, takes a full-page screenshot, and writes scene sprite
// inventory JSON via window.__NERIUM_TEST__ + scene.children.list dump.
//
// Usage:
//   node tests/scripts/nemea_phase0_visual_iter.mjs <scene> <iter_n>
// Where:
//   <scene>  one of: apollo | caravan | cyber
//   <iter_n> integer iteration number, used in output filename
//
// Outputs:
//   _skills_staging/nemea_phase0_iterations/<scene>_iter<N>.png
//   _skills_staging/nemea_phase0_iterations/<scene>_iter<N>.json
//
// Assumes a dev server is already running on http://localhost:3100.

import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SCENE_KEY_MAP = {
  apollo: 'ApolloVillage',
  caravan: 'CaravanRoad',
  cyber: 'CyberpunkShanghai',
};

// The /play route opens TitleScene first; we need to drive the player into
// the requested main scene. For now we use the bootstrap path: /play with a
// query parameter ?scene=<key> if supported, else default landing on
// ApolloVillage from the title flow.
async function navigateToScene(page, sceneKey) {
  // /play default boots TitleScene which transitions into ApolloVillage on
  // user input. For non-Apollo scenes we use the in-game caravan flow; but
  // for visual iteration we shortcut via window.__NERIUM_TEST__.startScene.
  // Skip intro narrative scene to ensure deterministic boot to ApolloVillage.
  await page.goto('http://localhost:3100/play?intro=0', {
    waitUntil: 'domcontentloaded',
  });

  // Wait for Phaser game to be available + initial scene ready. Allow extra
  // time because PreloadScene loads ~106 JPG/PNG assets via Vercel Blob CDN
  // (~30 MB combined, bandwidth-bound on cold-cache first run).
  await page.waitForFunction(
    () => {
      const w = /** @type {any} */ (window);
      return w.__NERIUM_TEST__ && w.__NERIUM_TEST__.ready === true;
    },
    { timeout: 240_000 },
  );

  // If we want a non-default scene, use the dev shortcut to start it.
  if (sceneKey !== 'ApolloVillage') {
    await page.evaluate((targetKey) => {
      const w = /** @type {any} */ (window);
      const game = w.__nerium_game__ ?? w.__NERIUM_TEST__?.game ?? w.__NERIUM__?.game;
      if (!game) return;
      const scene = game.scene;
      const active = scene.getScenes(true);
      for (const s of active) {
        if (s.scene.key !== 'UIScene' && s.scene.key !== targetKey) {
          scene.stop(s.scene.key);
        }
      }
      scene.start(targetKey, { worldId: targetKey === 'CyberpunkShanghai' ? 'cyberpunk_shanghai' : targetKey === 'CaravanRoad' ? 'caravan_road' : 'medieval_desert' });
    }, sceneKey);

    // Wait for the new scene's ready signal.
    await page.waitForFunction(
      (targetKey) => {
        const w = /** @type {any} */ (window);
        return w.__NERIUM_TEST__?.activeSceneKey === targetKey;
      },
      sceneKey,
      { timeout: 15_000 },
    );
  }

  // Settle: let tweens + lights initialize.
  await page.waitForTimeout(1500);
}

async function dumpSceneInventory(page, sceneKey) {
  return await page.evaluate((targetKey) => {
    const w = /** @type {any} */ (window);
    const game = w.__nerium_game__ ?? w.__NERIUM_TEST__?.game ?? w.__NERIUM__?.game;
    if (!game) return { error: 'no game handle' };
    const scene = game.scene.getScene(targetKey);
    if (!scene) return { error: 'scene not found', targetKey };

    const children = scene.children?.list ?? [];
    const inventory = children.map((c, idx) => {
      const out = {
        idx,
        type: c.type,
        x: c.x,
        y: c.y,
      };
      if (c.texture && c.texture.key) out.textureKey = c.texture.key;
      if ('scale' in c) out.scale = c.scale;
      if ('scaleX' in c) out.scaleX = c.scaleX;
      if ('scaleY' in c) out.scaleY = c.scaleY;
      if ('depth' in c) out.depth = c.depth;
      if ('alpha' in c) out.alpha = c.alpha;
      if ('width' in c) out.width = c.width;
      if ('height' in c) out.height = c.height;
      if ('displayWidth' in c) out.displayWidth = c.displayWidth;
      if ('displayHeight' in c) out.displayHeight = c.displayHeight;
      if ('visible' in c) out.visible = c.visible;
      return out;
    });
    return { sceneKey: targetKey, count: children.length, inventory };
  }, sceneKey);
}

async function main() {
  const scene = process.argv[2] ?? 'apollo';
  const iterN = process.argv[3] ?? '1';
  const sceneKey = SCENE_KEY_MAP[scene];
  if (!sceneKey) {
    console.error('unknown scene', scene);
    process.exit(1);
  }

  const outDir = resolve(
    process.cwd(),
    '_skills_staging/nemea_phase0_iterations',
  );
  const pngPath = resolve(outDir, `${scene}_iter${iterN}.png`);
  const jsonPath = resolve(outDir, `${scene}_iter${iterN}.json`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1408, height: 800 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(240_000);
  page.setDefaultNavigationTimeout(60_000);

  page.on('pageerror', (err) => console.error('PAGE ERROR:', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('CONSOLE ERROR:', msg.text());
  });
  page.on('response', (resp) => {
    if (resp.status() >= 400) {
      console.error('HTTP', resp.status(), resp.url());
    }
  });

  try {
    await navigateToScene(page, sceneKey);

    const inventory = await dumpSceneInventory(page, sceneKey);
    await writeFile(jsonPath, JSON.stringify(inventory, null, 2));
    console.log('inventory written', jsonPath, 'count', inventory.count);

    await page.screenshot({ path: pngPath, fullPage: true });
    console.log('screenshot written', pngPath);
  } catch (e) {
    console.error('iter failed', e);
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
}

main();
