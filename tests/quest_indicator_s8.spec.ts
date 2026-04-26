//
// tests/quest_indicator_s8.spec.ts
//
// Helios-v2 W3 S8 Playwright smoke + visual snapshot for the quest
// indicator (quest_exclamation PNG bobbing above Apollo + Treasurer NPCs)
// + the ChatInput setAvatarPng() hook surface.
//
// What is being verified
// ----------------------
// 1. Boot chain mount intact after S8 wiring.
// 2. quest_exclamation PNG asset lands via the network at boot.
// 3. ChatInput root mounts a hidden avatar slot (visibility 'none' by
//    default; setAvatarPng toggles).
// 4. Visual snapshot of Apollo Village shows the quest_exclamation
//    indicators floating above Apollo + Treasurer NPC sprites.
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

test.describe('Helios-v2 S8 quest indicator + chat avatar surface', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('boot chain mount intact after S8 quest indicator + avatar wiring', async ({ page }) => {
    await waitForApolloReady(page);
    const hook = await page.evaluate(() => window.__NERIUM_TEST__);
    expect(hook?.ready).toBe(true);
    expect(hook?.activeSceneKey).toBe('ApolloVillage');
    expect(hook?.phaserMounted).toBe(true);
  });

  test('quest_exclamation PNG asset lands via network at preload', async ({ page }) => {
    const responses: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/assets/ai/')) {
        responses.push(url);
      }
    });
    await waitForApolloReady(page);
    const found = responses.some((r) => r.includes('quest_exclamation'));
    expect(
      found,
      'quest_exclamation asset did not appear in network responses',
    ).toBe(true);
  });

  test('chat avatar slot renders hidden by default in DOM tree', async ({ page }) => {
    await waitForApolloReady(page);
    // Wait for UIScene to mount the chat root. Use state 'attached' since
    // the chat root has class nerium-chat--hidden (display: none) until
    // the user presses T to open the chat surface; the avatar element
    // exists in the DOM tree regardless of visibility.
    await page.waitForSelector('#nerium-chat .nerium-chat__avatar', {
      state: 'attached',
      timeout: 10_000,
    });
    const avatarState = await page.evaluate(() => {
      const el = document.querySelector('.nerium-chat__avatar') as HTMLImageElement | null;
      if (!el) return null;
      return {
        // Read inline style.display because the chat root has its own
        // display: none from the --hidden class; we want to assert the
        // avatar's own setAvatarPng-controlled display state.
        inlineDisplay: el.style.display,
        hasSrc: el.hasAttribute('src') && el.src.length > 0,
      };
    });
    // Avatar exists; setAvatarPng has not been called so inline display
    // remains 'none' and src is empty.
    expect(avatarState).not.toBe(null);
    expect(avatarState?.inlineDisplay).toBe('none');
    expect(avatarState?.hasSrc).toBe(false);
  });

  test('visual snapshot baseline (S8 quest indicators above Apollo + Treasurer)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForApolloReady(page);
    // Wait for the bob tween to settle into a representative phase.
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'tests/__screenshots__/apollo_village_s8_quest_indicators.png',
      fullPage: false,
    });
  });
});
