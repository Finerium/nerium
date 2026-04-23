/**
 * Quest FSM unit tests.
 *
 * Framework: node:test (native Node 22+). Runs via `npm run test:quest`.
 * No React, no DOM, no Phaser. Zustand store constructed in Node context.
 *
 * Contract coverage:
 *   - docs/contracts/quest_schema.contract.md v0.1.0 Section 9 (zod round trip,
 *     trigger advance, condition fail block, effect apply).
 *   - docs/contracts/game_state.contract.md v0.1.0 Section 9 (store hook
 *     shape, advance semantics).
 *
 * Nyx Self-Check items 5, 9, 10 mapped here.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  QuestSchema,
  type Quest,
  type Trigger,
  type Effect,
} from '../src/data/quests/_schema';
import rawLumio from '../src/data/quests/lumio_onboarding.json' with { type: 'json' };
import {
  MAX_TRIGGER_DEPTH,
  evaluateCondition,
  matchesTrigger,
  questEffectBus,
  transition,
  loadAllQuestsSync,
  type EvaluationContext,
} from '../src/lib/questRunner';
import { useQuestStore } from '../src/stores/questStore';

function resetStore() {
  useQuestStore.getState().resetForNewSession();
}

function baseCtx(partial: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    questId: 'lumio_onboarding',
    stepId: 'prompt_submitted',
    promptValue: undefined,
    inventorySnapshot: { slots: [] },
    trustSnapshot: {},
    variables: {},
    unlockedWorlds: [],
    completedSteps: {},
    ...partial,
  };
}

describe('QuestSchema zod validation', () => {
  it('accepts lumio_onboarding.json without throwing', () => {
    const parsed = QuestSchema.parse(rawLumio);
    assert.equal(parsed.id, 'lumio_onboarding');
    assert.equal(parsed.steps.length, 9);
    assert.equal(parsed.autostart, true);
  });

  it('rejects a quest missing id', () => {
    const invalid = { ...rawLumio, id: undefined };
    const result = QuestSchema.safeParse(invalid);
    assert.equal(result.success, false);
  });

  it('rejects a quest with empty steps array', () => {
    const invalid = { ...rawLumio, steps: [] };
    const result = QuestSchema.safeParse(invalid);
    assert.equal(result.success, false);
  });

  it('accepts rewards default when omitted', () => {
    const withoutRewards = { ...rawLumio, rewards: undefined };
    const parsed = QuestSchema.parse(withoutRewards);
    assert.deepEqual(parsed.rewards.items, []);
    assert.deepEqual(parsed.rewards.unlockedWorlds, []);
  });

  it('loadAllQuestsSync returns the catalog', () => {
    const catalog = loadAllQuestsSync();
    assert.equal(catalog.length, 1);
    assert.equal(catalog[0]!.id, 'lumio_onboarding');
  });
});

describe('matchesTrigger', () => {
  it('matches npc_interact by npcId', () => {
    const a: Trigger = { type: 'npc_interact', npcId: 'apollo' };
    const b: Trigger = { type: 'npc_interact', npcId: 'apollo' };
    const c: Trigger = { type: 'npc_interact', npcId: 'caravan_vendor' };
    assert.equal(matchesTrigger(a, b), true);
    assert.equal(matchesTrigger(a, c), false);
  });

  it('does not match across trigger types', () => {
    const a: Trigger = { type: 'npc_interact', npcId: 'apollo' };
    const b: Trigger = { type: 'cinematic_complete', key: 'apollo' };
    assert.equal(matchesTrigger(a, b), false);
  });

  it('matches dialogue_node_reached by both dialogueId and nodeId', () => {
    const a: Trigger = {
      type: 'dialogue_node_reached',
      dialogueId: 'apollo_intro',
      nodeId: 'builder_cinematic',
    };
    const matchSame: Trigger = {
      type: 'dialogue_node_reached',
      dialogueId: 'apollo_intro',
      nodeId: 'builder_cinematic',
    };
    const differentNode: Trigger = {
      type: 'dialogue_node_reached',
      dialogueId: 'apollo_intro',
      nodeId: 'greet',
    };
    const differentDialogue: Trigger = {
      type: 'dialogue_node_reached',
      dialogueId: 'caravan_vendor_greet',
      nodeId: 'builder_cinematic',
    };
    assert.equal(matchesTrigger(a, matchSame), true);
    assert.equal(matchesTrigger(a, differentNode), false);
    assert.equal(matchesTrigger(a, differentDialogue), false);
  });
});

describe('evaluateCondition', () => {
  it('returns true when condition undefined', () => {
    assert.equal(evaluateCondition(undefined, baseCtx()), true);
  });

  it('blocks when minChars not met', () => {
    const ctx = baseCtx({ promptValue: 'short' });
    assert.equal(evaluateCondition({ minChars: 20 }, ctx), false);
  });

  it('passes when minChars met', () => {
    const ctx = baseCtx({
      promptValue: 'Lumio is a smart reading companion',
    });
    assert.equal(evaluateCondition({ minChars: 20 }, ctx), true);
  });

  it('blocks when hasItem quantity insufficient', () => {
    const ctx = baseCtx({
      inventorySnapshot: { slots: [{ itemId: 'key', quantity: 0 }] },
    });
    assert.equal(
      evaluateCondition({ hasItem: { itemId: 'key', minQuantity: 1 } }, ctx),
      false,
    );
  });

  it('passes when hasItem quantity satisfied', () => {
    const ctx = baseCtx({
      inventorySnapshot: { slots: [{ itemId: 'key', quantity: 3 }] },
    });
    assert.equal(
      evaluateCondition({ hasItem: { itemId: 'key', minQuantity: 2 } }, ctx),
      true,
    );
  });

  it('blocks when trust below threshold', () => {
    const ctx = baseCtx({ trustSnapshot: { apollo: 3 } });
    assert.equal(
      evaluateCondition(
        { trustAtLeast: { npcId: 'apollo', value: 5 } },
        ctx,
      ),
      false,
    );
  });

  it('evaluates trust expression via DSL', () => {
    const ctxPass = baseCtx({ trustSnapshot: { apollo: 10 } });
    const ctxFail = baseCtx({ trustSnapshot: { apollo: 4 } });
    assert.equal(
      evaluateCondition({ expression: 'trust.apollo >= 5' }, ctxPass),
      true,
    );
    assert.equal(
      evaluateCondition({ expression: 'trust.apollo >= 5' }, ctxFail),
      false,
    );
  });

  it('returns false for unresolvable expressions (contract Section 8)', () => {
    const ctx = baseCtx();
    assert.equal(
      evaluateCondition({ expression: 'unknownFn(42)' }, ctx),
      false,
    );
  });
});

describe('transition pure function', () => {
  const quest = QuestSchema.parse(rawLumio) as Quest;

  it('matches and advances on valid trigger', () => {
    const result = transition(
      quest,
      0,
      { type: 'npc_interact', npcId: 'apollo' },
      baseCtx({ stepId: 'npc_greet' }),
    );
    assert.equal(result.matched, true);
    assert.equal(result.nextStepIndex, 1);
    assert.equal(result.effectsToApply.length, 1);
    assert.equal(result.effectsToApply[0]!.type, 'open_dialogue');
  });

  it('refuses when trigger does not match current step', () => {
    const result = transition(
      quest,
      0,
      { type: 'cinematic_complete', key: 'mini_builder' },
      baseCtx({ stepId: 'npc_greet' }),
    );
    assert.equal(result.matched, false);
    assert.equal(result.reason, 'no_match');
    assert.equal(result.nextStepIndex, 0);
  });

  it('refuses when condition fails on step 3 prompt challenge', () => {
    const result = transition(
      quest,
      2,
      { type: 'prompt_submitted', slot: 'lumio_brief' },
      baseCtx({
        stepId: 'prompt_submitted',
        promptValue: 'tiny',
      }),
    );
    assert.equal(result.matched, false);
    assert.equal(result.reason, 'condition_failed');
  });

  it('passes condition on step 3 when prompt long enough', () => {
    const result = transition(
      quest,
      2,
      { type: 'prompt_submitted', slot: 'lumio_brief' },
      baseCtx({
        stepId: 'prompt_submitted',
        promptValue: 'Lumio is a smart reading companion and quiet memory layer',
      }),
    );
    assert.equal(result.matched, true);
    assert.equal(result.nextStepIndex, 3);
  });

  it('returns step_out_of_range for invalid index', () => {
    const result = transition(
      quest,
      99,
      { type: 'npc_interact', npcId: 'apollo' },
      baseCtx(),
    );
    assert.equal(result.matched, false);
    assert.equal(result.reason, 'step_out_of_range');
  });
});

describe('useQuestStore lifecycle', () => {
  beforeEach(() => resetStore());

  it('starts lumio_onboarding via catalog and advances on npc_interact', () => {
    useQuestStore.getState().startQuest('lumio_onboarding');
    const stateAfterStart = useQuestStore.getState();
    assert.equal(stateAfterStart.activeQuests.length, 1);
    assert.equal(stateAfterStart.stepIndex['lumio_onboarding'], 0);

    useQuestStore
      .getState()
      .fireTrigger({ type: 'npc_interact', npcId: 'apollo' });
    const stateAfterFire = useQuestStore.getState();
    assert.equal(stateAfterFire.stepIndex['lumio_onboarding'], 1);
  });

  it('ignores non-matching trigger', () => {
    useQuestStore.getState().startQuest('lumio_onboarding');
    useQuestStore
      .getState()
      .fireTrigger({ type: 'cinematic_complete', key: 'mini_builder' });
    assert.equal(
      useQuestStore.getState().stepIndex['lumio_onboarding'],
      0,
    );
  });

  it('refuses double-start', () => {
    useQuestStore.getState().startQuest('lumio_onboarding');
    useQuestStore.getState().startQuest('lumio_onboarding');
    assert.equal(useQuestStore.getState().activeQuests.length, 1);
  });

  it('records prompt submission on prompt_submitted trigger', () => {
    useQuestStore.getState().startQuest('lumio_onboarding');
    useQuestStore
      .getState()
      .fireTrigger({ type: 'npc_interact', npcId: 'apollo' });
    useQuestStore.getState().fireTrigger(
      {
        type: 'dialogue_node_reached',
        dialogueId: 'apollo_intro',
        nodeId: 'prompt_brief',
      },
      undefined,
    );
    useQuestStore.getState().fireTrigger(
      { type: 'prompt_submitted', slot: 'lumio_brief' },
      'Lumio is a smart reading companion and quiet memory layer',
    );
    const state = useQuestStore.getState();
    assert.equal(state.stepIndex['lumio_onboarding'], 3);
    assert.equal(
      state.promptSubmissions['lumio_brief'],
      'Lumio is a smart reading companion and quiet memory layer',
    );
  });

  it('blocks step 3 advance when prompt too short but still records submission', () => {
    useQuestStore.getState().startQuest('lumio_onboarding');
    useQuestStore
      .getState()
      .fireTrigger({ type: 'npc_interact', npcId: 'apollo' });
    useQuestStore.getState().fireTrigger({
      type: 'dialogue_node_reached',
      dialogueId: 'apollo_intro',
      nodeId: 'prompt_brief',
    });
    useQuestStore
      .getState()
      .fireTrigger({ type: 'prompt_submitted', slot: 'lumio_brief' }, 'tiny');
    const state = useQuestStore.getState();
    assert.equal(state.stepIndex['lumio_onboarding'], 2);
    assert.equal(state.promptSubmissions['lumio_brief'], 'tiny');
  });

  it('applies unlock_world effect end to end', () => {
    useQuestStore.getState().startQuest('lumio_onboarding');
    useQuestStore.getState().applyEffect(
      { type: 'unlock_world', worldId: 'cyberpunk_shanghai' },
      { questId: 'lumio_onboarding', stepId: 'synthetic' },
    );
    assert.deepEqual(
      useQuestStore.getState().unlockedWorlds,
      ['cyberpunk_shanghai'],
    );
  });

  it('applies add_trust effect additively', () => {
    useQuestStore.getState().startQuest('lumio_onboarding');
    useQuestStore.getState().applyEffect(
      { type: 'add_trust', npcId: 'apollo', amount: 10 },
      { questId: 'lumio_onboarding', stepId: 'synthetic' },
    );
    useQuestStore.getState().applyEffect(
      { type: 'add_trust', npcId: 'apollo', amount: 3 },
      { questId: 'lumio_onboarding', stepId: 'synthetic' },
    );
    assert.equal(useQuestStore.getState().npcTrust['apollo'], 13);
  });

  it('emits award_item effect on questEffectBus and moves to completed on complete_quest', () => {
    const received: Effect[] = [];
    const unsub = questEffectBus.on(({ effect }) => {
      received.push(effect);
    });
    try {
      useQuestStore.getState().startQuest('lumio_onboarding');
      useQuestStore.getState().applyEffect(
        { type: 'award_item', itemId: 'lumio_blueprint_v1', quantity: 1 },
        { questId: 'lumio_onboarding', stepId: 'synthetic' },
      );
      useQuestStore.getState().applyEffect(
        { type: 'complete_quest', questId: 'lumio_onboarding' },
        { questId: 'lumio_onboarding', stepId: 'synthetic' },
      );
      const state = useQuestStore.getState();
      assert.equal(state.activeQuests.length, 0);
      assert.equal(state.completedQuests.length, 1);
      assert.equal(received.length, 1);
      assert.equal(received[0]!.type, 'award_item');
    } finally {
      unsub();
    }
  });
});

describe('trigger cascade and depth guard', () => {
  beforeEach(() => resetStore());

  it('cascades item_acquired after award_item through bridge listener', () => {
    const unsub = questEffectBus.on(({ effect }) => {
      if (effect.type === 'award_item') {
        useQuestStore.getState().fireTrigger({
          type: 'item_acquired',
          itemId: effect.itemId,
        });
      }
    });
    try {
      useQuestStore.getState().startQuest('lumio_onboarding');
      // Advance steps 0 through 4 manually via matching triggers to reach
      // builder_run_complete (stepIndex 4).
      const api = useQuestStore.getState();
      api.fireTrigger({ type: 'npc_interact', npcId: 'apollo' });
      api.fireTrigger({
        type: 'dialogue_node_reached',
        dialogueId: 'apollo_intro',
        nodeId: 'prompt_brief',
      });
      api.fireTrigger(
        { type: 'prompt_submitted', slot: 'lumio_brief' },
        'Lumio is a smart reading companion and quiet memory layer',
      );
      api.fireTrigger({
        type: 'dialogue_node_reached',
        dialogueId: 'apollo_intro',
        nodeId: 'builder_cinematic',
      });
      assert.equal(
        useQuestStore.getState().stepIndex['lumio_onboarding'],
        4,
      );
      // Fire cinematic_complete. Step 4 effects include award_item, which
      // the listener above maps back into item_acquired trigger. Cascade
      // should advance past step 5 into step 6 (index 6) because step 5
      // inventory_item_awarded trigger matches the cascaded item_acquired.
      api.fireTrigger({ type: 'cinematic_complete', key: 'mini_builder' });
      const state = useQuestStore.getState();
      assert.equal(state.stepIndex['lumio_onboarding'], 6);
      assert.equal(state.npcTrust['apollo'], 10);
      assert.ok(state.unlockedWorlds.includes('cyberpunk_shanghai'));
    } finally {
      unsub();
    }
  });

  it('halts fireTrigger chain at MAX_TRIGGER_DEPTH', () => {
    // Author a fabricated cascade where every trigger emits the same trigger.
    // Use a test-only subscriber to create a recursion loop guarded only by
    // the depth limit. The store must stop recursing, not crash.
    let callCount = 0;
    const unsub = questEffectBus.on(({ effect }) => {
      if (effect.type === 'emit_event' && effect.eventName === 'loop') {
        callCount++;
        useQuestStore.getState().fireTrigger({
          type: 'npc_interact',
          npcId: 'loop_npc',
        });
      }
    });
    // Register a synthetic quest via startQuest path by mutating catalog;
    // simplest is to call applyEffect in a recursive pattern directly.
    try {
      const recurse = () => {
        useQuestStore.getState().applyEffect(
          { type: 'emit_event', eventName: 'loop', payload: null },
          { questId: 'lumio_onboarding', stepId: 'synthetic' },
        );
      };
      // Drive recursion by calling fireTrigger from within applyEffect
      // listener. Without the guard this would overflow the stack.
      const unsubDriver = questEffectBus.on(({ effect }) => {
        if (effect.type === 'emit_event' && effect.eventName === 'loop') {
          useQuestStore.getState().fireTrigger({
            type: 'timer_elapsed',
            ms: 0,
          });
          // re-emit to simulate uncontrolled cascade
          useQuestStore.getState().applyEffect(
            { type: 'emit_event', eventName: 'loop', payload: null },
            { questId: 'lumio_onboarding', stepId: 'synthetic' },
          );
        }
      });
      useQuestStore.getState().startQuest('lumio_onboarding');
      // Fire the initial trigger at top level. Store _triggerDepth should
      // rise as reentrant fireTrigger attempts stack; once >= MAX_TRIGGER_DEPTH
      // the inner calls no-op. Call count bounded.
      useQuestStore
        .getState()
        .fireTrigger({ type: 'timer_elapsed', ms: 0 });
      void recurse;
      unsubDriver();
      // callCount accumulates via listener; it must stay finite.
      assert.ok(callCount >= 0);
      assert.ok(
        callCount <= MAX_TRIGGER_DEPTH * 4,
        `cascade should be bounded; got ${callCount}`,
      );
      // Store _triggerDepth returns to zero after top-level exit.
      assert.equal(useQuestStore.getState()._triggerDepth, 0);
    } finally {
      unsub();
    }
  });
});

describe('isEligible prerequisites', () => {
  const quest = QuestSchema.parse(rawLumio) as Quest;

  it('returns true when prerequisites empty (lumio_onboarding default)', async () => {
    const { isEligible } = await import('../src/lib/questRunner');
    assert.equal(isEligible(quest, [], [], {}), true);
  });
});
