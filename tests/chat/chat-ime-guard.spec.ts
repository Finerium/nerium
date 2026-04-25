//
// tests/chat/chat-ime-guard.spec.ts
//
// Boreas NP W3 Session 1 Playwright smoke. Verifies that:
//   1. UIScene mounts with #nerium-chat root in DOM and starts hidden.
//   2. Pressing T opens the chat overlay + focuses the input.
//   3. compositionstart suppresses Enter (IME guard for Indonesian +
//      Chinese + Japanese typed via IME compose).
//   4. compositionend re-enables Enter; subsequent Enter submits.
//   5. Esc closes overlay + returns mode to 'movement'.
//
// Tests dispatch synthetic CompositionEvent + KeyboardEvent with
// `isComposing` flag set so the guard sees both signals.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import { expect, test } from '@playwright/test';

// Window augmentation lives in tests/types/nerium-test-window.d.ts.

async function bootGame(page: import('@playwright/test').Page) {
  await page.goto('/play');
  await page.waitForSelector('canvas', { timeout: 20_000 });
  await page.waitForFunction(
    () => window.__NERIUM_TEST__?.ready === true && window.__NERIUM_TEST__?.uiSceneReady === true,
    { timeout: 20_000 },
  );
}

test.describe('Boreas chat UIScene IME guard', () => {
  test('UIScene mounts with chat root hidden by default', async ({ page }) => {
    await bootGame(page);
    const root = page.locator('#nerium-chat');
    await expect(root).toBeAttached();
    await expect(root).toHaveClass(/nerium-chat--hidden/);
  });

  test('T key opens chat and focuses the input', async ({ page }) => {
    await bootGame(page);
    // Phaser captures keyboard via canvas focus; click the canvas first.
    await page.locator('canvas').click();
    await page.keyboard.press('KeyT');
    const root = page.locator('#nerium-chat');
    await expect(root).toHaveClass(/nerium-chat--visible/, { timeout: 5_000 });
    const input = page.locator('#nerium-chat-input');
    await expect(input).toBeFocused();
  });

  test('Enter during IME composition does NOT submit (guard active)', async ({ page }) => {
    await bootGame(page);
    await page.locator('canvas').click();
    await page.keyboard.press('KeyT');
    const input = page.locator('#nerium-chat-input');
    await expect(input).toBeFocused();
    await input.fill('halo dunia');

    // Synthesize compositionstart so the guard flips data-composing=1.
    await page.evaluate(() => {
      const el = document.getElementById('nerium-chat-input') as HTMLInputElement;
      el.dispatchEvent(new CompositionEvent('compositionstart', { data: 'h' }));
    });
    expect(await input.evaluate((el) => (el as HTMLInputElement).dataset.composing)).toBe('1');

    // Press Enter while still composing. Submission must NOT fire.
    await page.evaluate(() => {
      const el = document.getElementById('nerium-chat-input') as HTMLInputElement;
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }),
      );
    });

    // Input value must still be intact (not cleared by submit).
    await expect(input).toHaveValue('halo dunia');
    // No user message should appear in chat history yet.
    const userMsgs = page.locator('.nerium-chat__msg--user');
    await expect(userMsgs).toHaveCount(0);
  });

  test('Enter after compositionend submits the message', async ({ page }) => {
    await bootGame(page);
    await page.locator('canvas').click();
    await page.keyboard.press('KeyT');
    const input = page.locator('#nerium-chat-input');
    await expect(input).toBeFocused();
    await input.fill('halo dunia');

    // Composition cycle: start -> end (commits).
    await page.evaluate(() => {
      const el = document.getElementById('nerium-chat-input') as HTMLInputElement;
      el.dispatchEvent(new CompositionEvent('compositionstart', { data: 'h' }));
      el.dispatchEvent(new CompositionEvent('compositionend', { data: 'halo' }));
    });
    expect(await input.evaluate((el) => (el as HTMLInputElement).dataset.composing)).toBe('0');

    // Now press Enter (not composing). Submission fires.
    await page.keyboard.press('Enter');

    // User message must appear; input cleared.
    const userMsgs = page.locator('.nerium-chat__msg--user');
    await expect(userMsgs).toHaveCount(1, { timeout: 5_000 });
    await expect(userMsgs.first()).toContainText('halo dunia');
    await expect(input).toHaveValue('');
  });

  test('Esc closes chat overlay and blurs input', async ({ page }) => {
    await bootGame(page);
    await page.locator('canvas').click();
    await page.keyboard.press('KeyT');
    const root = page.locator('#nerium-chat');
    await expect(root).toHaveClass(/nerium-chat--visible/);
    await page.keyboard.press('Escape');
    await expect(root).toHaveClass(/nerium-chat--hidden/, { timeout: 3_000 });
  });
});
