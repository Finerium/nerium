//
// tests/apollo_village_scene.spec.ts
//
// Helios-v2 W3 S2 Playwright smoke + visual snapshot for ApolloVillageScene
// after the AI-asset PNG transplant.
//
// What is being verified
// ----------------------
// 1. Scene loads to ready (window.__NERIUM_TEST__.activeSceneKey === 'ApolloVillage'
//    and worldId === 'medieval_desert' and ready === true).
// 2. The 4 NERIUM-pillar landmark image keys are loaded into the Phaser
//    texture cache (marketplace_stall_landmark, builder_workshop_landmark,
//    registry_pillar_landmark, trust_shrine_landmark).
// 3. The 9 ambient prop image keys plus apollo_village_bg are loaded.
// 4. The 3 named character image keys are loaded (apollo, treasurer,
//    caravan_vendor).
// 5. Anti-regression: treasurer NPC dispatched dialogue still opens the
//    DialogueOverlay with dialogueId 'treasurer_greet' (Marshall P6 surface
//    preserved through sprite source swap).
// 6. Visual snapshot saved to tests/__screenshots__/apollo_village_s2.png
//    for /ultrareview Run #3 visual diff baseline.
//
// Pattern transplanted from tests/treasurer.spec.ts and
// tests/preload_ai_assets.spec.ts.
//

import { expect, test, type Page } from '@playwright/test';

const PLAY_ROUTE = '/play';
// Bumped 2026-04-26 by Nemea-RV-v2 Phase 1 Ferry 5a (W4 cleanup batch). The
// scene preloads ~30 MB of AI assets from Vercel Blob; cold-cache hydration
// regularly takes 60 s plus on slow CI runs. The previous 30 s ceiling tripped
// 4 of 5 tests pre-Phase-0 fix and 4 of 5 post-Phase-0 fix despite the visual
// regression being already resolved at commit 1a0c1e9. 240 s gives a 4x buffer
// for cold-cache plus container-startup variance without slowing the warm path
// (waitForFunction returns the moment ready=true is observed).
const READY_TIMEOUT_MS = 240_000;

// Window augmentation lives in tests/types/nerium-test-window.d.ts.

async function waitForApolloReady(page: Page) {
  await page.goto(PLAY_ROUTE);
  await page.waitForSelector('canvas', { timeout: READY_TIMEOUT_MS });
  await page.waitForFunction(
    () => window.__NERIUM_TEST__?.ready === true,
    { timeout: READY_TIMEOUT_MS },
  );
}

test.describe('Helios-v2 S2 Apollo Village scene revamp', () => {
  test.beforeEach(async ({ page }) => {
    // Reduced motion so the breathing tween snaps and the snapshot is
    // deterministic.
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('scene reaches ready with medieval_desert world id', async ({ page }) => {
    await waitForApolloReady(page);
    const hook = await page.evaluate(() => window.__NERIUM_TEST__);
    expect(hook?.ready).toBe(true);
    expect(hook?.activeSceneKey).toBe('ApolloVillage');
    expect(hook?.worldId).toBe('medieval_desert');
  });

  test('4 NERIUM-pillar landmark texture keys are loaded', async ({ page }) => {
    await waitForApolloReady(page);
    const present = await page.evaluate(() => {
      const w = window as unknown as {
        __nerium_phaser_game__?: {
          textures?: { exists: (key: string) => boolean };
        };
      };
      const game = w.__nerium_phaser_game__;
      if (!game?.textures) return null;
      return {
        marketplace: game.textures.exists('marketplace_stall_landmark'),
        builder: game.textures.exists('builder_workshop_landmark'),
        registry: game.textures.exists('registry_pillar_landmark'),
        trust: game.textures.exists('trust_shrine_landmark'),
      };
    });
    // The Phaser game ref is not exposed via window in the prod build; we
    // fall back to verifying through the network response set instead.
    if (present === null) {
      const responses: string[] = [];
      page.on('response', (response) => {
        const url = response.url();
        if (url.includes('/assets/ai/props/apollo_village/')) {
          responses.push(url);
        }
      });
      // Re-load to capture response window.
      await page.goto(PLAY_ROUTE);
      await page.waitForFunction(
        () => window.__NERIUM_TEST__?.ready === true,
        { timeout: READY_TIMEOUT_MS },
      );
      const landmarkKeys = [
        'marketplace_stall_landmark',
        'builder_workshop_landmark',
        'registry_pillar_landmark',
        'trust_shrine_landmark',
      ];
      for (const key of landmarkKeys) {
        const found = responses.some((r) => r.includes(key));
        expect(found, `landmark asset ${key} did not appear in network responses`).toBe(true);
      }
      return;
    }
    expect(present.marketplace).toBe(true);
    expect(present.builder).toBe(true);
    expect(present.registry).toBe(true);
    expect(present.trust).toBe(true);
  });

  test('apollo_village_bg + named character textures land via network', async ({ page }) => {
    const responses: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/assets/ai/')) {
        responses.push(url);
      }
    });
    await waitForApolloReady(page);
    // Critical asset stems for the Apollo scene visual.
    const requiredStems = [
      'apollo_village_bg',
      'apollo.png',
      'treasurer.png',
      'caravan_vendor.png',
      'stone_well',
      'date_palm_cluster',
      'cypress_tree',
      'market_stall',
      'wooden_cart',
      'apollo_house_filler',
      'stone_column',
      'stone_signpost',
      'hanging_lantern',
    ];
    for (const stem of requiredStems) {
      const found = responses.some((r) => r.includes(stem));
      expect(found, `apollo asset stem ${stem} did not appear in network responses`).toBe(true);
    }
  });

  test('treasurer dialogue contract still opens (Marshall P6 anti-regression)', async ({
    page,
  }) => {
    // Stub the flag + subscription routes so the dialogue branch is
    // deterministic.
    await page.route('**/v1/billing/subscription/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ subscription: null }),
      });
    });
    await page.route('**/v1/me/flags', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          flags: [
            { flag_name: 'pricing.page.live', value: true, kind: 'bool' },
          ],
          evaluated_at: new Date().toISOString(),
        }),
      });
    });
    await waitForApolloReady(page);
    // Allow the dialogue registry + treasurer bridge a beat to wire up.
    await page.waitForTimeout(200);
    // Dispatch the treasurer interact event via the test bridge.
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('__NERIUM_GAME_EVENT__', {
          detail: {
            topic: 'game.npc.interact',
            payload: { npcId: 'treasurer' },
          },
        }),
      );
    });
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => {
      const overlay = document.querySelector('.dialogue-overlay') as HTMLElement | null;
      if (!overlay) return { present: false, dialogueId: null, nodeId: null };
      return {
        present: true,
        dialogueId: overlay.getAttribute('data-dialogue-id'),
        nodeId: overlay.getAttribute('data-node-id'),
      };
    });
    expect(state.present, 'treasurer dialogue overlay did not open').toBe(true);
    expect(state.dialogueId).toBe('treasurer_greet');
    expect(state.nodeId).toBe('greet');
  });

  test('visual snapshot baseline (S2 revamp output)', async ({ page }) => {
    await waitForApolloReady(page);
    // Allow ambient FX particle warm-up.
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: 'tests/__screenshots__/apollo_village_s2.png',
      fullPage: false,
    });
    // No image-diff assertion in S2 baseline; this is the reference image
    // for /ultrareview Run #3. S7 polish + Nemea-RV-v2 W4 introduce diff
    // assertions against this baseline.
  });
});
