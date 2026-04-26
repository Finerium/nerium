//
// tests/e2e/play_phaser_smoke.spec.ts
//
// Authored 2026-04-26 by Nemea-RV-v2 W4 Ferry 4+5b (Option c retire + smoke + ADR).
//
// Replacement smoke suite for the four retired e2e specs (lumio_quest,
// dialogue_flow, inventory_award, caravan_unlock) which asserted against
// React HUD DOM nodes removed by Helios-v2 S11 (commit 8fadf4b "React HUD
// cleanup on /play"). The shipped /play surface is now pure Phaser canvas
// (UIScene + DialogueOverlay + Quest tracker rendered in-Phaser).
//
// Coverage scope: smoke only. Verifies that /play boots, the Phaser scene
// chain reaches ready, and the active scene is ApolloVillage. NOT a feature
// regression suite; full feature coverage will return post-submit via the
// observability seams roadmap in
// docs/adr/ADR-S11-react-hud-removal-test-obsolescence.md.
//
// Hooks consumed (read-only):
//   - window.__NERIUM_TEST__.ready : scene-ready handshake (set by
//     ApolloVillageScene.create on completion)
//   - window.__NERIUM_TEST__.activeSceneKey : current Phaser scene key
//   - window.__NERIUM_TEST__.worldId : world atlas id
//   - window.__NERIUM_TEST__.phaserMounted : set by PhaserCanvas mount
//   - window.__nerium_game__ : Phaser.Game handle exposed for cross-cutting
//     diagnostics (apollo_village_scene.spec.ts pattern)
//
// Anti-pattern hygiene per CLAUDE.md: no em dash, no emoji.
//

import { expect, test, type Page } from '@playwright/test';

// Window augmentation lives in tests/types/nerium-test-window.d.ts.

const ROUTE = '/play';

// Aligns with apollo_village_scene.spec.ts READY_TIMEOUT_MS (240 s) per
// Phase 1 Ferry 5a. The /play route preloads roughly 30 MB of AI assets
// from Vercel Blob; cold-cache hydration regularly exceeds 60 s on slow
// runners. waitForFunction returns immediately once ready=true is observed
// so the warm path stays fast.
const READY_TIMEOUT_MS = 240_000;

async function waitForPlayReady(page: Page): Promise<void> {
  await page.goto(ROUTE);
  await page.waitForSelector('canvas', { timeout: READY_TIMEOUT_MS });
  await page.waitForFunction(
    () => window.__NERIUM_TEST__?.ready === true,
    { timeout: READY_TIMEOUT_MS },
  );
}

test.describe('Nemea-RV-v2 W4 | /play Phaser smoke (post-S11 React HUD removal)', () => {
  test.beforeEach(async ({ page }) => {
    // Reduced motion so any in-Phaser breathing tween snaps deterministic.
    // Mirrors apollo_village_scene.spec.ts beforeEach pattern.
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('/play boots and Phaser scene reaches ready with canvas mounted', async ({ page }) => {
    await waitForPlayReady(page);

    // Canvas element must be present in the DOM (Phaser renders into it).
    const canvasCount = await page.locator('canvas').count();
    expect(canvasCount).toBe(1);

    // Test hook surface confirms Phaser game is mounted and the scene
    // chain reached ready. These are the post-S11 contract.
    const hook = await page.evaluate(() => window.__NERIUM_TEST__);
    expect(hook?.phaserMounted).toBe(true);
    expect(hook?.ready).toBe(true);
  });

  test('/play exposes ApolloVillage as the active scene at boot', async ({ page }) => {
    await waitForPlayReady(page);

    const hook = await page.evaluate(() => window.__NERIUM_TEST__);
    // ApolloVillageScene.create writes activeSceneKey and worldId to the
    // hook on the same tick as ready=true. The values are the post-S11
    // shipped boot target per BootScene -> Preload -> ApolloVillage chain
    // (see Helios-v2 S11 commit body: "/play boot chain unchanged").
    expect(hook?.activeSceneKey).toBe('ApolloVillage');
    expect(hook?.worldId).toBe('medieval_desert');
  });

  test('/play does not mount the legacy React HUD root (S11 contract)', async ({ page }) => {
    await waitForPlayReady(page);

    // Post-S11 GameShell mounts GameHUDLean (BusBridge + TierBadge only).
    // The legacy GameHUD root marker must be absent; the lean root marker
    // must be present exactly once. This locks the architectural contract
    // that motivated the smoke replacement: if the lean HUD ever regresses
    // back to the full GameHUD, the four retired specs become re-runnable
    // and this assertion flips red as the canary.
    const legacyRoot = await page.locator('[data-hud-role="game-hud-root"]').count();
    expect(legacyRoot).toBe(0);

    const leanRoot = await page.locator('[data-hud-role="game-hud-lean-root"]').count();
    expect(leanRoot).toBe(1);
  });
});
