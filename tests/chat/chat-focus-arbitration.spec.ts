//
// tests/chat/chat-focus-arbitration.spec.ts
//
// Boreas NP W3 Session 1. Verifies the focus arbitration FSM:
//   1. While chat is open (mode === 'chat'), world scenes have keyboard
//      input disabled (Phaser keyboard plugin enabled flag flipped).
//   2. Closing chat (Esc) re-enables world keyboard input.
//   3. UIScene itself stays enabled regardless of mode.
//   4. Slash commands (/help) dispatch + surface a system message.
//
// The world-keyboard state is checked via window.__nerium_game__ which the
// PhaserCanvas exposes for snapshot tests.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import { expect, test } from '@playwright/test';

// Window augmentation lives in tests/types/nerium-test-window.d.ts. The
// dev probe `__nerium_game__` is typed as `unknown` there to keep test
// types decoupled from Phaser internals; this helper narrows to the
// minimal shape this spec needs.

type ProbeScene = {
  scene: { key: string };
  input?: { keyboard?: { enabled?: boolean } };
};
type ProbeGame = { scene: { scenes: ProbeScene[] } };

async function readWorldKeyboardEnabled(page: import('@playwright/test').Page): Promise<Record<string, boolean>> {
  return await page.evaluate(() => {
    const game = window.__nerium_game__ as
      | { scene: { scenes: Array<{ scene: { key: string }; input?: { keyboard?: { enabled?: boolean } } }> } }
      | undefined;
    if (!game) return {};
    const out: Record<string, boolean> = {};
    for (const s of game.scene.scenes) {
      const kb = s.input?.keyboard;
      if (kb) out[s.scene.key] = !!kb.enabled;
    }
    return out;
  });
}

async function bootAndOpenChat(page: import('@playwright/test').Page) {
  await page.goto('/play');
  await page.waitForSelector('canvas', { timeout: 20_000 });
  await page.waitForFunction(
    () => window.__NERIUM_TEST__?.ready === true && window.__NERIUM_TEST__?.uiSceneReady === true,
    { timeout: 20_000 },
  );
}

test.describe('Boreas focus arbitration FSM', () => {
  test('opening chat disables world scene keyboard, closing re-enables', async ({ page }) => {
    await bootAndOpenChat(page);

    // Initial: movement mode, world keyboard enabled.
    const before = await readWorldKeyboardEnabled(page);
    expect(before['ApolloVillage']).toBe(true);
    expect(before['UIScene']).toBe(true);

    // Open chat with T.
    await page.locator('canvas').click();
    await page.keyboard.press('KeyT');
    await expect(page.locator('#nerium-chat-input')).toBeFocused();

    // World scene keyboard should be disabled while DOM input owns focus.
    await page.waitForFunction(() => {
      const game = window.__nerium_game__ as
        | { scene: { scenes: Array<{ scene: { key: string }; input?: { keyboard?: { enabled?: boolean } } }> } }
        | undefined;
      if (!game) return false;
      const apollo = game.scene.scenes.find((s) => s.scene.key === 'ApolloVillage');
      return !!apollo && apollo.input?.keyboard?.enabled === false;
    }, { timeout: 3_000 });

    const during = await readWorldKeyboardEnabled(page);
    expect(during['ApolloVillage']).toBe(false);
    expect(during['UIScene']).toBe(true); // UIScene exempt

    // Close chat with Esc.
    await page.keyboard.press('Escape');
    await expect(page.locator('#nerium-chat')).toHaveClass(/nerium-chat--hidden/, { timeout: 3_000 });

    await page.waitForFunction(() => {
      const game = window.__nerium_game__ as
        | { scene: { scenes: Array<{ scene: { key: string }; input?: { keyboard?: { enabled?: boolean } } }> } }
        | undefined;
      if (!game) return false;
      const apollo = game.scene.scenes.find((s) => s.scene.key === 'ApolloVillage');
      return !!apollo && apollo.input?.keyboard?.enabled === true;
    }, { timeout: 3_000 });

    const after = await readWorldKeyboardEnabled(page);
    expect(after['ApolloVillage']).toBe(true);
  });

  test('/help command surfaces a system message with command list', async ({ page }) => {
    await bootAndOpenChat(page);
    await page.locator('canvas').click();
    await page.keyboard.press('KeyT');
    const input = page.locator('#nerium-chat-input');
    await expect(input).toBeFocused();

    await input.fill('/help');
    await page.keyboard.press('Enter');

    const systemMsgs = page.locator('.nerium-chat__msg--system');
    await expect(systemMsgs.last()).toContainText(/Available commands/i, { timeout: 5_000 });
  });

  test('// escape sends literal slash content as user message', async ({ page }) => {
    await bootAndOpenChat(page);
    await page.locator('canvas').click();
    await page.keyboard.press('KeyT');
    const input = page.locator('#nerium-chat-input');
    await expect(input).toBeFocused();

    await input.fill('//hello slash');
    await page.keyboard.press('Enter');

    const userMsgs = page.locator('.nerium-chat__msg--user');
    await expect(userMsgs).toHaveCount(1, { timeout: 5_000 });
    await expect(userMsgs.first()).toContainText('/hello slash');
  });
});
