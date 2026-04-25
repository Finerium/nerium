//
// tests/treasurer.spec.ts
//
// Owner: Marshall (W2 NP P6 S2). End-to-end coverage for the treasurer
// NPC + dialogue + pricing-redirect cross-pillar wiring.
//
// What is being regressed
// -----------------------
// 1. /play renders the Phaser game with the treasurer NPC spawned.
// 2. A `game.npc.interact` event with npcId='treasurer' opens the
//    Linus DialogueOverlay with dialogueId='treasurer_greet' at the
//    'greet' start node.
// 3. The greet node exposes the "Show me the tiers." choice when the
//    Hemera flag pricing.page.live is true (default).
// 4. Selecting the "Open the pricing scrolls." choice fires the
//    `nerium.pricing.open` emit_event, which the
//    treasurerDialogueBridge translates into a window.location.assign
//    to /pricing.
// 5. When pricing.page.live is false the treasurer dialogue surfaces
//    the "coming soon" branch instead of the upgrade choice.
// 6. Treasurer overlay carries role="dialog" + aria-live="polite"
//    inherited from DialogueOverlay so assistive tech announces it.
//
// The /v1/billing/subscription/me, /v1/me/flags backend routes are
// stubbed via Playwright route interception so the test does not
// require a live FastAPI process.
//

import { expect, test, type Page } from '@playwright/test';

const PLAY_ROUTE = '/play';
const READY_TIMEOUT_MS = 25_000;

interface FlagPayload {
  pricingLive: boolean;
}

// Window augmentation lives in tests/types/nerium-test-window.d.ts.

function setupBackendRoutes(page: Page, flag: FlagPayload, tier: string) {
  page.route('**/v1/billing/subscription/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        subscription:
          tier === 'free'
            ? null
            : {
                tier,
                status: 'active',
                current_period_start: '2026-04-01T00:00:00Z',
                current_period_end: '2026-05-01T00:00:00Z',
                cancel_at_period_end: false,
              },
      }),
    });
  });
  page.route('**/v1/me/flags', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        flags: [
          {
            flag_name: 'pricing.page.live',
            value: flag.pricingLive,
            kind: 'bool',
          },
        ],
        evaluated_at: new Date().toISOString(),
      }),
    });
  });
}

async function waitForSceneReady(page: Page) {
  await page.goto(PLAY_ROUTE);
  await page.waitForSelector('canvas', { timeout: READY_TIMEOUT_MS });
  await page.waitForFunction(() => window.__NERIUM_TEST__?.ready === true, {
    timeout: READY_TIMEOUT_MS,
  });
  // Give the dialogue registry + treasurer bridge a beat to wire from
  // QuestBootstrap useEffect.
  await page.waitForTimeout(200);
}

async function openTreasurerDialogue(page: Page) {
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
}

async function readDialogueState(page: Page) {
  return page.evaluate(() => {
    const overlay = document.querySelector('.dialogue-overlay') as HTMLElement | null;
    if (!overlay) {
      return {
        present: false,
        dialogueId: null,
        nodeId: null,
        choiceLabels: [] as string[],
        ariaLive: null as string | null,
        role: null as string | null,
      };
    }
    const choices = Array.from(
      overlay.querySelectorAll('.dialogue-overlay-choice'),
    ).map((el) => (el.textContent ?? '').trim());
    return {
      present: true,
      dialogueId: overlay.getAttribute('data-dialogue-id'),
      nodeId: overlay.getAttribute('data-node-id'),
      choiceLabels: choices,
      ariaLive: overlay.getAttribute('aria-live'),
      role: overlay.getAttribute('role'),
    };
  });
}

test.describe('Marshall treasurer NPC dialogue + pricing redirect', () => {
  test.beforeEach(async ({ page }) => {
    // DialogueOverlay typewriter honors prefers-reduced-motion and snaps
    // straight to the final state. That gives us deterministic choice
    // rendering without multi-second waits tied to characters-per-ms.
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('treasurer interact opens treasurer_greet dialogue at greet node', async ({
    page,
  }) => {
    setupBackendRoutes(page, { pricingLive: true }, 'free');
    await waitForSceneReady(page);
    await openTreasurerDialogue(page);
    const state = await readDialogueState(page);
    expect(state.present).toBe(true);
    expect(state.dialogueId).toBe('treasurer_greet');
    expect(state.nodeId).toBe('greet');
  });

  test('greet node exposes the upgrade choice when pricing flag is live', async ({
    page,
  }) => {
    setupBackendRoutes(page, { pricingLive: true }, 'free');
    await waitForSceneReady(page);
    await openTreasurerDialogue(page);
    const state = await readDialogueState(page);
    expect(state.choiceLabels).toContain('Show me the tiers.');
    expect(state.choiceLabels).not.toContain('The treasury is closed for now.');
  });

  test('greet node hides the upgrade choice when pricing flag is off', async ({
    page,
  }) => {
    setupBackendRoutes(page, { pricingLive: false }, 'free');
    await waitForSceneReady(page);
    // Force the bridge to await the flag fetch by waiting an extra beat
    // so the pricingLiveCache reflects the false value before the open.
    await page.waitForTimeout(250);
    await openTreasurerDialogue(page);
    const state = await readDialogueState(page);
    expect(state.choiceLabels).toContain('The treasury is closed for now.');
    expect(state.choiceLabels).not.toContain('Show me the tiers.');
  });

  test('upgrade choice triggers nerium.pricing.open and routes to /pricing', async ({
    page,
  }) => {
    setupBackendRoutes(page, { pricingLive: true }, 'free');
    await waitForSceneReady(page);
    await openTreasurerDialogue(page);

    // Click "Show me the tiers." to advance to pricing_explain.
    await page
      .locator('.dialogue-overlay-choice', { hasText: 'Show me the tiers.' })
      .click();
    await page.waitForTimeout(150);

    const nodeId = await page.evaluate(() => {
      const overlay = document.querySelector('.dialogue-overlay');
      return overlay?.getAttribute('data-node-id') ?? null;
    });
    expect(nodeId).toBe('pricing_explain');

    // Click "Open the pricing scrolls." to fire the emit_event that the
    // treasurer bridge translates into window.location.assign('/pricing').
    // The navigation completes because /pricing is the next-dev route;
    // we assert via page.url() rather than a window stub so the signal
    // matches the real user-facing behaviour.
    const navPromise = page.waitForURL('**/pricing', { timeout: 10_000 });
    await page
      .locator('.dialogue-overlay-choice', {
        hasText: 'Open the pricing scrolls.',
      })
      .click();
    await navPromise;
    expect(page.url()).toMatch(/\/pricing$/);
  });

  test('treasurer dialogue overlay has accessible role and live region', async ({
    page,
  }) => {
    setupBackendRoutes(page, { pricingLive: true }, 'free');
    await waitForSceneReady(page);
    await openTreasurerDialogue(page);
    const state = await readDialogueState(page);
    expect(state.role).toBe('dialog');
    expect(state.ariaLive).toBe('polite');
  });
});
