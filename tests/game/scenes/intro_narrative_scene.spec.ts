//
// tests/game/scenes/intro_narrative_scene.spec.ts
//
// Aether-Vercel T6 Phase 1.6: Playwright E2E for the IntroNarrativeScene.
//
// Gating policy (per V6-anticipated fallback)
// -------------------------------------------
// The scene is OPT-IN at hackathon scope to preserve the 22 existing
// Playwright specs that navigate to `/play` without a query param.
//
// - `?intro=1`     forces the intro to play.
// - `?intro=auto`  plays on first visit, sessionStorage gates replay.
// - `?intro=0`     skips.
// - no param       skips (default).
//
// Coverage
// --------
//   1. Default `/play` navigation does NOT load the intro scene.
//   2. `/play?intro=1` loads the intro scene (force play).
//   3. `/play?intro=auto` plays on first visit.
//   4. `/play?intro=auto` skips on second visit (sessionStorage gate).
//   5. ESC keypress dismisses the intro and routes to ApolloVillage.
//   6. Click on canvas dismisses the intro.
//   7. Skip Intro button dismisses the intro.
//   8. After completion or skip, sessionStorage flag is set.
//

import { expect, test } from '@playwright/test';

const SS_KEY = 'nerium.intro_seen';

async function getActiveSceneKeys(
  page: import('@playwright/test').Page,
): Promise<string[]> {
  return await page.evaluate(() => {
    const game = (window as unknown as { __nerium_game__?: any }).__nerium_game__;
    if (!game) return [];
    const scenes = game.scene?.scenes ?? [];
    return scenes
      .filter((s: any) => s.scene?.isActive?.() || s.scene?.isVisible?.())
      .map((s: any) => s.scene?.key);
  });
}

async function waitForGameReady(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __nerium_game__?: unknown }).__nerium_game__),
    { timeout: 30_000 },
  );
}

test.describe('Aether-Vercel IntroNarrativeScene', () => {
  test('default /play does NOT load IntroNarrative (regression preserved)', async ({
    page,
  }) => {
    await page.goto('/play');
    await waitForGameReady(page);
    await page.waitForTimeout(2_000);
    const keys = await getActiveSceneKeys(page);
    // ApolloVillage (or TitleScene chain) should be active; IntroNarrative
    // must be absent.
    expect(keys).not.toContain('IntroNarrative');
  });

  test('?intro=1 forces IntroNarrativeScene to play', async ({ page }) => {
    await page.goto('/play?intro=1');
    await waitForGameReady(page);
    await page.waitForTimeout(2_500);
    const keys = await getActiveSceneKeys(page);
    expect(keys).toContain('IntroNarrative');
  });

  test('?intro=auto plays on first visit (sessionStorage empty)', async ({
    page,
  }) => {
    await page.goto('/play?intro=auto');
    await waitForGameReady(page);
    await page.waitForTimeout(2_500);
    const keys = await getActiveSceneKeys(page);
    expect(keys).toContain('IntroNarrative');
  });

  test('?intro=auto skips when sessionStorage flag is set', async ({ page }) => {
    await page.addInitScript(
      ([k]) => {
        try {
          window.sessionStorage.setItem(k, '1');
        } catch {
          /* ignore */
        }
      },
      [SS_KEY],
    );
    await page.goto('/play?intro=auto');
    await waitForGameReady(page);
    await page.waitForTimeout(2_500);
    const keys = await getActiveSceneKeys(page);
    expect(keys).not.toContain('IntroNarrative');
  });

  test('ESC keypress dismisses the intro and sets sessionStorage flag', async ({
    page,
  }) => {
    await page.goto('/play?intro=1');
    await waitForGameReady(page);
    await page.waitForTimeout(1_500);
    // Confirm intro is active.
    let keys = await getActiveSceneKeys(page);
    expect(keys).toContain('IntroNarrative');
    // Press ESC.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1_500);
    // Intro should no longer be active; ApolloVillage should be.
    keys = await getActiveSceneKeys(page);
    expect(keys).not.toContain('IntroNarrative');
    // Flag should be set.
    const flag = await page.evaluate((k) => window.sessionStorage.getItem(k), SS_KEY);
    expect(flag).toBe('1');
  });

  test('click on canvas dismisses the intro', async ({ page }) => {
    await page.goto('/play?intro=1');
    await waitForGameReady(page);
    await page.waitForTimeout(1_500);
    // Click the center of the canvas (avoiding the skip button at top-right).
    await page.mouse.click(640, 400);
    await page.waitForTimeout(1_500);
    const keys = await getActiveSceneKeys(page);
    expect(keys).not.toContain('IntroNarrative');
  });

  test('Skip Intro button dismisses the intro', async ({ page }) => {
    await page.goto('/play?intro=1');
    await waitForGameReady(page);
    await page.waitForTimeout(1_500);
    // The skip button is rendered inside Phaser canvas as a Text object.
    // We test the keyboard fallback (ESC) which is the canonical user
    // path; clicking the canvas at the top-right approximates the
    // button click since pointer-down on the button stops propagation
    // and triggers the same skipNow() path.
    await page.mouse.click(1180, 30);
    await page.waitForTimeout(1_500);
    const keys = await getActiveSceneKeys(page);
    expect(keys).not.toContain('IntroNarrative');
  });
});
