//
// tests/chat/chat-command-parser.spec.ts
//
// Boreas NP W3 Session 2 Playwright. Verifies command parser dispatch:
//   1. /model opus-4.7 records preference + surfaces system message.
//   2. /model sonnet-4.6 transitions preference.
//   3. Unknown command surfaces "Unknown command" + does not dispatch
//      to MA session.
//   4. /clear empties chat history.
//   5. /builder echoes "Spawning Builder session..." even when the
//      backend is unreachable (fetch will fail in test env, error path
//      still surfaces a system message rather than crashing the scene).
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import { expect, test } from '@playwright/test';

// Window augmentation lives in tests/types/nerium-test-window.d.ts.

async function bootAndOpenChat(page: import('@playwright/test').Page) {
  await page.goto('/play');
  await page.waitForSelector('canvas', { timeout: 20_000 });
  await page.waitForFunction(
    () => window.__NERIUM_TEST__?.uiSceneReady === true,
    { timeout: 20_000 },
  );
  await page.locator('canvas').click();
  await page.keyboard.press('KeyT');
  await expect(page.locator('#nerium-chat-input')).toBeFocused();
}

test.describe('Boreas command parser dispatch', () => {
  test('/model opus-4.7 records preference and surfaces confirmation', async ({ page }) => {
    await bootAndOpenChat(page);
    const input = page.locator('#nerium-chat-input');
    await input.fill('/model opus-4.7');
    await page.keyboard.press('Enter');

    const systemMsgs = page.locator('.nerium-chat__msg--system');
    await expect(systemMsgs.last()).toContainText(/Model preference set to opus-4.7/i, {
      timeout: 5_000,
    });

    const pref = await page.evaluate(() => window.__NERIUM_MODEL_PREF__);
    expect(pref).toBe('opus-4.7');
  });

  test('/model sonnet-4.6 transitions preference', async ({ page }) => {
    await bootAndOpenChat(page);
    const input = page.locator('#nerium-chat-input');
    await input.fill('/model sonnet-4.6');
    await page.keyboard.press('Enter');

    const pref = await page.evaluate(() => window.__NERIUM_MODEL_PREF__);
    expect(pref).toBe('sonnet-4.6');
  });

  test('Unknown command surfaces system message without crashing', async ({ page }) => {
    await bootAndOpenChat(page);
    const input = page.locator('#nerium-chat-input');
    await input.fill('/xyzzy');
    await page.keyboard.press('Enter');

    const systemMsgs = page.locator('.nerium-chat__msg--system');
    await expect(systemMsgs.last()).toContainText(/Unknown command/i, { timeout: 5_000 });
    // No user message should appear (it was a slash command, not text).
    const userMsgs = page.locator('.nerium-chat__msg--user');
    await expect(userMsgs).toHaveCount(0);
  });

  test('/clear empties chat history', async ({ page }) => {
    await bootAndOpenChat(page);
    const input = page.locator('#nerium-chat-input');
    await input.fill('first');
    await page.keyboard.press('Enter');
    await input.fill('second');
    await page.keyboard.press('Enter');
    const userMsgs = page.locator('.nerium-chat__msg--user');
    await expect(userMsgs).toHaveCount(2);

    await input.fill('/clear');
    await page.keyboard.press('Enter');
    await expect(userMsgs).toHaveCount(0, { timeout: 3_000 });
  });

  test('/builder surfaces spawning message even when backend unreachable', async ({ page }) => {
    await bootAndOpenChat(page);
    const input = page.locator('#nerium-chat-input');
    await input.fill('/builder write a hello world');
    await page.keyboard.press('Enter');

    const systemMsgs = page.locator('.nerium-chat__msg--system');
    // First system message announces the spawn intent.
    await expect(systemMsgs.first()).toContainText(/Spawning Builder/i, { timeout: 5_000 });
  });
});
