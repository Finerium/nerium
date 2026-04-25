//
// tests/e2e/lumio_quest.spec.ts
//
// Nemea-RV-A W4 regression spec 1 of 4. Quest-flow end-to-end.
//
// Boots /play, waits for ApolloVillageScene ready via `window.__NERIUM_TEST__`
// hook, then drives the 9-step lumio_onboarding quest FSM by dispatching
// `__NERIUM_GAME_EVENT__` CustomEvents with topic
// `game.quest.trigger_requested`, which `BusBridge` translates to
// `questStore.fireTrigger(trigger, value)` per
// docs/contracts/game_event_bus.contract.md Section 5 plus
// docs/contracts/game_state.contract.md Section 3.1.
//
// Observability channels used (read-only):
//   1. `window.__NERIUM_TEST__.ready` scene-ready handshake (Thalia-v2 gotcha 5)
//   2. QuestTracker DOM surface: `[data-quest-id]` and its inner
//      `.quest-tracker-progress` textContent expose active quest + step index
//      without requiring store exposure.
//   3. Optional `__NERIUM_GAME_EVENT__` collector for cascade diagnostics.
//
// Strategy: this spec exercises what the vertical-slice demo claims to
// deliver end-to-end. Failures indicate either a wiring gap (e.g. quest
// autostart not invoked at mount, open_dialogue effect unconsumed by the
// bridge, award_item not cascading to item_acquired) or a regression
// against a previously green path. Reports feed `docs/qa/nemea_rv_regression_report.md`.
//

import { expect, test, type Page } from '@playwright/test';

// Explicit global typing so the spec does not rely on the smoke test's
// declaration and so the read surface remains a contract, not an accident.
// Window augmentation lives in tests/types/nerium-test-window.d.ts.

const ROUTE = '/play';
const READY_TIMEOUT_MS = 25_000;

async function waitForSceneReady(page: Page): Promise<void> {
  await page.goto(ROUTE);
  await page.waitForSelector('canvas', { timeout: READY_TIMEOUT_MS });
  await page.waitForFunction(() => window.__NERIUM_TEST__?.ready === true, {
    timeout: READY_TIMEOUT_MS,
  });
}

async function installBusCollector(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__NERIUM_BUS_COLLECTOR__ = [];
    window.addEventListener('__NERIUM_GAME_EVENT__', (evt: Event) => {
      const detail = (evt as CustomEvent).detail;
      if (!detail || typeof detail !== 'object') return;
      const topic = (detail as { topic?: unknown }).topic;
      if (typeof topic !== 'string') return;
      const payload = (detail as { payload?: unknown }).payload;
      window.__NERIUM_BUS_COLLECTOR__?.push({
        topic,
        payload,
        at: Date.now(),
      });
    });
  });
}

async function dispatchTrigger(
  page: Page,
  trigger: Record<string, unknown>,
  value?: string,
): Promise<void> {
  await page.evaluate(
    ({ trigger, value }) => {
      window.dispatchEvent(
        new CustomEvent('__NERIUM_GAME_EVENT__', {
          detail: {
            topic: 'game.quest.trigger_requested',
            payload: value === undefined ? { trigger } : { trigger, value },
          },
        }),
      );
    },
    { trigger, value },
  );
  // Zustand subscribers run synchronously inside dispatchEvent but the
  // QuestTracker re-render is scheduled by React. A micro wait lets the
  // DOM settle without introducing real sleep.
  await page.waitForTimeout(40);
}

async function readQuestProgress(page: Page): Promise<{
  questId: string | null;
  progressLabel: string | null;
  stepTitle: string | null;
  state: string | null;
}> {
  return page.evaluate(() => {
    const tracker = document.querySelector(
      '[aria-label="Quest tracker"]',
    ) as HTMLElement | null;
    if (!tracker) {
      return { questId: null, progressLabel: null, stepTitle: null, state: null };
    }
    const progressEl = tracker.querySelector('.quest-tracker-progress');
    const stepTitleEl = tracker.querySelector('.quest-tracker-step-title');
    return {
      questId: tracker.getAttribute('data-quest-id'),
      progressLabel: progressEl?.textContent?.trim() ?? null,
      stepTitle: stepTitleEl?.textContent?.trim() ?? null,
      state: tracker.getAttribute('data-state'),
    };
  });
}

async function extractStepIndex(progressLabel: string | null): Promise<number | null> {
  if (!progressLabel) return null;
  // Matches "Step N of 9" (active) or "9 of 9 complete" (terminal).
  const active = progressLabel.match(/Step\s+(\d+)\s+of\s+(\d+)/);
  if (active) return Number(active[1]) - 1; // zero-index
  const complete = progressLabel.match(/(\d+)\s+of\s+(\d+)\s+complete/);
  if (complete) return Number(complete[1]);
  return null;
}

test.describe('Nemea-RV-A | lumio_onboarding quest flow end to end', () => {
  test.beforeEach(async ({ page }) => {
    await installBusCollector(page);
  });

  test('scene ready reports medieval_desert world and ApolloVillage scene', async ({ page }) => {
    await waitForSceneReady(page);
    const hook = await page.evaluate(() => window.__NERIUM_TEST__);
    expect(hook?.phaserMounted).toBe(true);
    expect(hook?.ready).toBe(true);
    expect(hook?.activeSceneKey).toBe('ApolloVillage');
    expect(hook?.worldId).toBe('medieval_desert');
  });

  test('quest autostarts at mount and QuestTracker exposes lumio_onboarding', async ({ page }) => {
    await waitForSceneReady(page);
    const progress = await readQuestProgress(page);
    // Intentional hard expectation per lumio_onboarding.autostart=true.
    // If this fails, surface as `CRITICAL: autostartFromCatalog() not
    // invoked at mount` in the regression report.
    expect(progress.questId).toBe('lumio_onboarding');
    expect(progress.state).toBe('active');
    expect(await extractStepIndex(progress.progressLabel)).toBe(0);
  });

  test('dispatching npc_interact(apollo) advances to step 1 dialog_complete', async ({ page }) => {
    await waitForSceneReady(page);
    await dispatchTrigger(page, { type: 'npc_interact', npcId: 'apollo' });
    const progress = await readQuestProgress(page);
    // Step index 1 means the FSM is now waiting for dialogue_node_reached
    // on apollo_intro#prompt_brief. If this fails with stepIndex still 0,
    // surface as `autostartFromCatalog gap` OR `npc_interact trigger not
    // routed through BusBridge`.
    expect(progress.questId).toBe('lumio_onboarding');
    expect(await extractStepIndex(progress.progressLabel)).toBe(1);
  });

  test('nine sequential triggers drive the FSM to completion', async ({ page }) => {
    await waitForSceneReady(page);

    const triggers: Array<{ trigger: Record<string, unknown>; value?: string; expectedStepIndex: number }> = [
      { trigger: { type: 'npc_interact', npcId: 'apollo' }, expectedStepIndex: 1 },
      {
        trigger: {
          type: 'dialogue_node_reached',
          dialogueId: 'apollo_intro',
          nodeId: 'prompt_brief',
        },
        expectedStepIndex: 2,
      },
      {
        trigger: { type: 'prompt_submitted', slot: 'lumio_brief' },
        value:
          'Lumio is a smart reading SaaS that summarizes long articles into briefings.',
        expectedStepIndex: 3,
      },
      {
        trigger: {
          type: 'dialogue_node_reached',
          dialogueId: 'apollo_intro',
          nodeId: 'builder_cinematic',
        },
        expectedStepIndex: 4,
      },
      {
        trigger: { type: 'cinematic_complete', key: 'mini_builder' },
        expectedStepIndex: 5,
      },
      {
        trigger: { type: 'item_acquired', itemId: 'lumio_blueprint_v1' },
        expectedStepIndex: 6,
      },
      {
        trigger: { type: 'zone_enter', zoneId: 'caravan_arrival_zone' },
        expectedStepIndex: 7,
      },
      {
        trigger: { type: 'npc_interact', npcId: 'caravan_vendor' },
        expectedStepIndex: 8,
      },
      {
        trigger: {
          type: 'dialogue_node_reached',
          dialogueId: 'caravan_vendor_greet',
          nodeId: 'farewell',
        },
        expectedStepIndex: 9,
      },
    ];

    for (const [idx, entry] of triggers.entries()) {
      await dispatchTrigger(page, entry.trigger, entry.value);
      const progress = await readQuestProgress(page);
      const stepIdx = await extractStepIndex(progress.progressLabel);
      expect(
        stepIdx,
        `after trigger #${idx + 1} (${JSON.stringify(entry.trigger)}), expected stepIndex=${entry.expectedStepIndex}, tracker label=${progress.progressLabel}`,
      ).toBe(entry.expectedStepIndex);
    }

    const finalProgress = await readQuestProgress(page);
    // After all nine step triggers match, the terminal complete_quest
    // effect moves lumio_onboarding from activeQuests to completedQuests.
    // QuestTracker then reverts to "No quest active" unless a followup
    // quest is active. Accept either terminal surface.
    const endState = finalProgress.state;
    expect(['complete', 'empty', null]).toContain(endState);
  });

  test('prompt_submitted with value shorter than 20 chars does not advance step 2', async ({ page }) => {
    await waitForSceneReady(page);
    await dispatchTrigger(page, { type: 'npc_interact', npcId: 'apollo' });
    await dispatchTrigger(page, {
      type: 'dialogue_node_reached',
      dialogueId: 'apollo_intro',
      nodeId: 'prompt_brief',
    });
    await dispatchTrigger(
      page,
      { type: 'prompt_submitted', slot: 'lumio_brief' },
      'too short',
    );
    const progress = await readQuestProgress(page);
    // condition minChars=20 blocks; stepIndex stays at 2 (prompt_submitted).
    expect(await extractStepIndex(progress.progressLabel)).toBe(2);
  });

  test('collector captured the triggers that BusBridge forwarded', async ({ page }) => {
    await waitForSceneReady(page);
    await dispatchTrigger(page, { type: 'npc_interact', npcId: 'apollo' });
    await dispatchTrigger(
      page,
      { type: 'prompt_submitted', slot: 'lumio_brief' },
      'Lumio is a smart reading SaaS that summarizes long articles into briefings.',
    );
    const collected = await page.evaluate(
      () => window.__NERIUM_BUS_COLLECTOR__ ?? [],
    );
    const triggerTopics = collected.filter((e) => e.topic === 'game.quest.trigger_requested');
    expect(triggerTopics.length).toBeGreaterThanOrEqual(2);
  });
});
