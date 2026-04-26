//
// tests/play_lean_hud_s11.spec.ts
//
// Helios-v2 W3 S11 smoke tests: /play renders ONLY Phaser canvas + lean HUD;
// no React HUD chrome from previous waves leaks onto the route. Texture
// memory peak below 200 MB.
//
// Per CLAUDE.md anti-patterns: no em dash, no emoji.
//

import { test, expect } from '@playwright/test';

test.describe('Helios-v2 S11 lean HUD + texture memory budget', () => {
  test('/play renders the lean HUD root only (no TopBar/SideBar/BottomBar)', async ({ page }) => {
    await page.goto('/play');
    await page.waitForFunction(
      () => (window as unknown as { __NERIUM_TEST__?: { ready?: boolean } }).__NERIUM_TEST__?.ready === true,
      { timeout: 30_000 },
    );
    const leanRoot = await page.locator('[data-hud-role="game-hud-lean-root"]').count();
    expect(leanRoot).toBe(1);
    // Old GameHUD root marker should be absent.
    const oldRoot = await page.locator('[data-hud-role="game-hud-root"]').count();
    expect(oldRoot).toBe(0);
  });

  test('texture memory peak under 200 MB target', async ({ page }) => {
    await page.goto('/play');
    await page.waitForFunction(
      () => (window as unknown as { __NERIUM_TEST__?: { ready?: boolean } }).__NERIUM_TEST__?.ready === true,
      { timeout: 30_000 },
    );
    // Wait a moment for late-loading textures to finalize.
    await page.waitForTimeout(2000);
    const report = await page.evaluate(() => {
      type Probe = {
        inspectTextureMemory?: () => { estimatedMB: number; textureCount: number };
      };
      const probe = (window as unknown as { __NERIUM_TEST__?: Probe }).__NERIUM_TEST__;
      return probe?.inspectTextureMemory?.();
    });
    expect(report).toBeTruthy();
    if (report) {
      console.log(
        `[s11 texture memory] ${report.estimatedMB} MB across ${report.textureCount} textures`,
      );
      expect(report.estimatedMB).toBeLessThan(200);
    }
  });
});
