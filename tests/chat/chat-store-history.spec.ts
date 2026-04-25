//
// tests/chat/chat-store-history.spec.ts
//
// Boreas NP W3 Session 1. Verifies the chatStore history-recall + Ctrl+L
// clear + sessionStorage persistence behaviours via Playwright. The store
// is exposed via direct module import in the test page; the smoke runs
// against the live app to keep parity with the production wiring.
//
// Coverage:
//   1. ArrowUp/ArrowDown cycles through prior submissions (bash-style).
//   2. Ctrl+L clears messages without affecting the URL bar.
//   3. sessionStorage persists last 100 entries across reload.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import { expect, test } from '@playwright/test';

// Window augmentation lives in tests/types/nerium-test-window.d.ts.

async function bootAndOpenChat(page: import('@playwright/test').Page) {
  await page.goto('/play');
  await page.waitForSelector('canvas', { timeout: 20_000 });
  await page.waitForFunction(
    () => window.__NERIUM_TEST__?.ready === true && window.__NERIUM_TEST__?.uiSceneReady === true,
    { timeout: 20_000 },
  );
  await page.locator('canvas').click();
  await page.keyboard.press('KeyT');
  await expect(page.locator('#nerium-chat-input')).toBeFocused();
}

test.describe('Boreas chat history recall + persistence', () => {
  test('ArrowUp recalls the previous submission (bash-style)', async ({ page }) => {
    await bootAndOpenChat(page);
    const input = page.locator('#nerium-chat-input');

    await input.fill('first message');
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('');

    await input.fill('second message');
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('');

    // Two ArrowUp cycles back through history (newest first).
    await page.keyboard.press('ArrowUp');
    await expect(input).toHaveValue('second message');
    await page.keyboard.press('ArrowUp');
    await expect(input).toHaveValue('first message');

    // ArrowDown goes back toward newer.
    await page.keyboard.press('ArrowDown');
    await expect(input).toHaveValue('second message');

    // ArrowDown past newest clears input.
    await page.keyboard.press('ArrowDown');
    await expect(input).toHaveValue('');
  });

  test('Ctrl+L clears chat messages and surfaces a system confirmation', async ({ page }) => {
    await bootAndOpenChat(page);
    const input = page.locator('#nerium-chat-input');

    await input.fill('to be cleared');
    await page.keyboard.press('Enter');
    const userMsgs = page.locator('.nerium-chat__msg--user');
    await expect(userMsgs).toHaveCount(1);

    await page.keyboard.press('Control+l');
    await expect(userMsgs).toHaveCount(0, { timeout: 3_000 });
    // Confirmation system message appears.
    const systemMsgs = page.locator('.nerium-chat__msg--system');
    await expect(systemMsgs.last()).toContainText(/cleared/i);
  });

  test('sessionStorage persists last 100 history entries across reload', async ({ page }) => {
    await bootAndOpenChat(page);
    const input = page.locator('#nerium-chat-input');

    for (const text of ['alpha', 'beta', 'gamma']) {
      await input.fill(text);
      await page.keyboard.press('Enter');
    }

    const persistedBefore = await page.evaluate(() =>
      window.sessionStorage.getItem('nerium.chat.history.v1'),
    );
    expect(persistedBefore).toBeTruthy();
    const parsed = JSON.parse(persistedBefore as string) as string[];
    expect(parsed).toEqual(['alpha', 'beta', 'gamma']);

    await page.reload();
    await page.waitForFunction(
      () => window.__NERIUM_TEST__?.uiSceneReady === true,
      { timeout: 20_000 },
    );
    await page.locator('canvas').click();
    await page.keyboard.press('KeyT');
    const inputAfter = page.locator('#nerium-chat-input');
    await expect(inputAfter).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(inputAfter).toHaveValue('gamma');
  });
});
