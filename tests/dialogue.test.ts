//
// tests/dialogue.test.ts
//
// Unit tests for NERIUM RV dialogue runtime. Owner: Linus.
// Runs with node's built-in test runner via `node --test tests/dialogue.test.ts`
// (TypeScript is stripped natively in Node >=22.6 with --experimental-strip-types,
// or via `tsx --test tests/dialogue.test.ts`). Contract reference:
// docs/contracts/dialogue_schema.contract.md v0.1.0 Section 9.
//
// Zero test-framework dependency by design: no vitest, no jest. Asserts use
// `node:assert/strict`.
//

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  dialogueSchema,
  parseDialogue,
  type Dialogue,
} from '../src/data/dialogues/_schema';
import {
  availableChoices,
  evaluateCondition,
  initialDialogueState,
  interpolate,
  isTerminal,
  reducer,
  ExpressionParseError,
  type ConditionContext,
  type DialogueReducerState,
} from '../src/lib/dialogueRunner';

// ----- Fixture loader -----

const APOLLO_INTRO_PATH = resolve(process.cwd(), 'src/data/dialogues/apollo_intro.json');

function loadApolloIntro(): Dialogue {
  const raw = JSON.parse(readFileSync(APOLLO_INTRO_PATH, 'utf-8'));
  return parseDialogue(raw, 'apollo_intro');
}

function makeRegistry(d: Dialogue): Map<string, Dialogue> {
  const reg = new Map<string, Dialogue>();
  reg.set(d.id, d);
  return reg;
}

function makeCtx(overrides: Partial<ConditionContext> = {}): ConditionContext {
  return {
    vars: {},
    trust: {},
    questStepIndex: {},
    hasItem: () => false,
    ...overrides,
  };
}

// ----- Schema validation -----

describe('dialogueSchema', () => {
  it('parses apollo_intro.json without errors', () => {
    const d = loadApolloIntro();
    assert.equal(d.id, 'apollo_intro');
    assert.equal(d.source, 'custom');
    assert.equal(d.speaker, 'apollo');
    assert.equal(d.start, 'greet');
    assert.ok(d.nodes.greet);
    assert.ok(d.nodes.prompt_brief);
    assert.ok(d.nodes.builder_cinematic);
    assert.ok(d.nodes.post_cinematic);
    assert.ok(d.nodes.end);
  });

  it('rejects unknown challenge kind', () => {
    const bad = {
      id: 'bad_kind',
      source: 'custom',
      speaker: 'apollo',
      start: 'only',
      nodes: {
        only: {
          challenge: { kind: 'multiple_choice', slotId: 'x' },
        },
      },
    };
    const result = dialogueSchema.safeParse(bad);
    assert.equal(result.success, false);
  });

  it('rejects source `ink` at parseDialogue', () => {
    const inkish = {
      id: 'inkish',
      source: 'ink',
      speaker: 'apollo',
      start: 'n',
      nodes: { n: { lines: [{ text: 'hi' }] } },
    };
    assert.throws(() => parseDialogue(inkish), /not supported/);
  });

  it('rejects dialogue id with uppercase', () => {
    const bad = {
      id: 'BadId',
      source: 'custom',
      speaker: 'apollo',
      start: 'n',
      nodes: { n: {} },
    };
    const result = dialogueSchema.safeParse(bad);
    assert.equal(result.success, false);
  });

  it('rejects dialogue whose start node is missing', () => {
    const bad = {
      id: 'missing_start',
      source: 'custom',
      speaker: 'apollo',
      start: 'nowhere',
      nodes: { somewhere: { lines: [{ text: 'x' }] } },
    };
    assert.throws(() => parseDialogue(bad, 'missing_start'), /start node/);
  });

  it('apollo_intro vertical slice node count is exactly 7', () => {
    const d = loadApolloIntro();
    const keys = Object.keys(d.nodes);
    assert.equal(keys.length, 7);
  });
});

// ----- Reducer -----

describe('reducer', () => {
  it('OPEN sets active dialogue and seeds start node', () => {
    const d = loadApolloIntro();
    const reg = makeRegistry(d);
    const next = reducer(initialDialogueState(), { type: 'OPEN', dialogueId: d.id }, reg);
    assert.equal(next.activeDialogueId, 'apollo_intro');
    assert.equal(next.currentNodeId, 'greet');
    assert.equal(next.streaming, false);
    assert.equal(next.streamBuffer, '');
    assert.deepEqual(next.pendingEffects, []);
  });

  it('OPEN on unknown dialogue returns state unchanged', () => {
    const reg = new Map<string, Dialogue>();
    const start = initialDialogueState();
    const next = reducer(start, { type: 'OPEN', dialogueId: 'nope' }, reg);
    assert.deepEqual(next, start);
  });

  it('SELECT_CHOICE advances to next node', () => {
    const d = loadApolloIntro();
    const reg = makeRegistry(d);
    const opened = reducer(initialDialogueState(), { type: 'OPEN', dialogueId: d.id }, reg);
    const chosen = reducer(opened, { type: 'SELECT_CHOICE', index: 0 }, reg);
    assert.equal(chosen.currentNodeId, 'prompt_brief');
    assert.equal(chosen.lastChoiceIndex, 0);
  });

  it('SELECT_CHOICE with out-of-range index is a no-op', () => {
    const d = loadApolloIntro();
    const reg = makeRegistry(d);
    const opened = reducer(initialDialogueState(), { type: 'OPEN', dialogueId: d.id }, reg);
    const oob = reducer(opened, { type: 'SELECT_CHOICE', index: 99 }, reg);
    assert.equal(oob.currentNodeId, 'greet');
  });

  it('SUBMIT_CHALLENGE with minChars violation does not advance', () => {
    const d = loadApolloIntro();
    const reg = makeRegistry(d);
    const opened = reducer(initialDialogueState(), { type: 'OPEN', dialogueId: d.id }, reg);
    const atPrompt = reducer(opened, { type: 'SELECT_CHOICE', index: 0 }, reg);
    const tooShort = reducer(atPrompt, { type: 'SUBMIT_CHALLENGE', value: 'short' }, reg);
    assert.equal(tooShort.currentNodeId, 'prompt_brief');
    assert.equal(tooShort.lastSubmission, null);
  });

  it('SUBMIT_CHALLENGE with valid value advances per onSubmit.next', () => {
    const d = loadApolloIntro();
    const reg = makeRegistry(d);
    const opened = reducer(initialDialogueState(), { type: 'OPEN', dialogueId: d.id }, reg);
    const atPrompt = reducer(opened, { type: 'SELECT_CHOICE', index: 0 }, reg);
    const value = 'A smart reading SaaS that summarizes long articles.';
    const submitted = reducer(atPrompt, { type: 'SUBMIT_CHALLENGE', value }, reg);
    assert.equal(submitted.currentNodeId, 'builder_cinematic');
    assert.ok(submitted.lastSubmission);
    assert.equal(submitted.lastSubmission?.slotId, 'lumio_brief');
    assert.equal(submitted.lastSubmission?.value, value);
    const hasFireTrigger = submitted.pendingEffects.some(
      (e) => e.type === 'fire_trigger',
    );
    assert.ok(hasFireTrigger, 'onSubmit fire_trigger effect should be present');
  });

  it('STREAM_CHUNK followed by STREAM_COMPLETE buffers then clears streaming', () => {
    const d = loadApolloIntro();
    const reg = makeRegistry(d);
    const opened = reducer(initialDialogueState(), { type: 'OPEN', dialogueId: d.id }, reg);
    const chunked = reducer(opened, { type: 'STREAM_CHUNK', chunk: 'hello ' }, reg);
    const more = reducer(chunked, { type: 'STREAM_CHUNK', chunk: 'world' }, reg);
    assert.equal(more.streaming, true);
    assert.equal(more.streamBuffer, 'hello world');
    const done = reducer(more, { type: 'STREAM_COMPLETE' }, reg);
    assert.equal(done.streaming, false);
  });

  it('PHASER_RESUMED with matching event advances from cinematic node', () => {
    const d = loadApolloIntro();
    const reg = makeRegistry(d);
    let state = reducer(initialDialogueState(), { type: 'OPEN', dialogueId: d.id }, reg);
    state = reducer(state, { type: 'SELECT_CHOICE', index: 0 }, reg);
    const submitted = reducer(
      state,
      { type: 'SUBMIT_CHALLENGE', value: 'A smart reading SaaS summarizing long articles.' },
      reg,
    );
    assert.equal(submitted.currentNodeId, 'builder_cinematic');
    const resumed = reducer(submitted, { type: 'PHASER_RESUMED', event: 'cinematic_complete' }, reg);
    assert.equal(resumed.currentNodeId, 'post_cinematic');
  });

  it('CLOSE resets to closed state', () => {
    const d = loadApolloIntro();
    const reg = makeRegistry(d);
    const opened = reducer(initialDialogueState(), { type: 'OPEN', dialogueId: d.id }, reg);
    const closed = reducer(opened, { type: 'CLOSE' }, reg);
    assert.equal(closed.activeDialogueId, null);
    assert.equal(closed.currentNodeId, null);
    assert.equal(closed.closed, true);
  });

  it('unknown action type returns state unchanged', () => {
    const d = loadApolloIntro();
    const reg = makeRegistry(d);
    const opened = reducer(initialDialogueState(), { type: 'OPEN', dialogueId: d.id }, reg);
    // @ts-expect-error intentional unknown action for defensive default test
    const weird = reducer(opened, { type: 'DOES_NOT_EXIST' }, reg);
    assert.deepEqual(weird, opened);
  });
});

// ----- availableChoices with `if` filter -----

describe('availableChoices', () => {
  it('hides choices whose if evaluates false', () => {
    const d = loadApolloIntro();
    const greet = d.nodes.greet;
    const allShown = availableChoices(greet, makeCtx({ trust: { apollo: 0 } }));
    assert.equal(allShown.length, 2);
    const onlyFirst = availableChoices(greet, makeCtx({ trust: { apollo: 10 } }));
    assert.equal(onlyFirst.length, 1);
    assert.equal(onlyFirst[0].next, 'prompt_brief');
  });

  it('returns empty for node with no choices', () => {
    const d = loadApolloIntro();
    const cinematic = d.nodes.builder_cinematic;
    const out = availableChoices(cinematic, makeCtx());
    assert.equal(out.length, 0);
  });
});

// ----- Condition DSL -----

describe('evaluateCondition', () => {
  it('evaluates numeric comparisons on trust', () => {
    const ctx = makeCtx({ trust: { apollo: 6 } });
    assert.equal(evaluateCondition('trust.apollo >= 5', ctx), true);
    assert.equal(evaluateCondition('trust.apollo < 5', ctx), false);
  });

  it('treats missing trust as zero', () => {
    const ctx = makeCtx();
    assert.equal(evaluateCondition('trust.apollo < 5', ctx), true);
    assert.equal(evaluateCondition('trust.apollo >= 5', ctx), false);
  });

  it('evaluates inventory.hasItem calls', () => {
    const ctx = makeCtx({
      hasItem: (id) => id === 'lumio_blueprint_v1',
    });
    assert.equal(evaluateCondition('inventory.hasItem("lumio_blueprint_v1")', ctx), true);
    assert.equal(evaluateCondition('inventory.hasItem("nope")', ctx), false);
  });

  it('short-circuits && and ||', () => {
    const ctx = makeCtx({ trust: { apollo: 6 } });
    assert.equal(evaluateCondition('trust.apollo >= 5 && trust.apollo < 10', ctx), true);
    assert.equal(evaluateCondition('trust.apollo < 5 || trust.apollo >= 5', ctx), true);
  });

  it('evaluates vars lookups', () => {
    const ctx = makeCtx({ vars: { playerName: 'ghaisan' } });
    assert.equal(evaluateCondition('vars.playerName === "ghaisan"', ctx), true);
    assert.equal(evaluateCondition('vars.playerName !== "ghaisan"', ctx), false);
  });

  it('evaluates quest.stepIndex reads', () => {
    const ctx = makeCtx({ questStepIndex: { lumio_onboarding: 3 } });
    assert.equal(evaluateCondition('quest.lumio_onboarding.stepIndex >= 2', ctx), true);
  });

  it('empty expression is truthy (vacuously)', () => {
    assert.equal(evaluateCondition('', makeCtx()), true);
    assert.equal(evaluateCondition('   ', makeCtx()), true);
  });

  it('throws ExpressionParseError on invalid syntax', () => {
    assert.throws(
      () => evaluateCondition('trust.apollo >=', makeCtx()),
      ExpressionParseError,
    );
    assert.throws(
      () => evaluateCondition('@@', makeCtx()),
      ExpressionParseError,
    );
  });

  it('handles parentheses and negation', () => {
    const ctx = makeCtx({ trust: { apollo: 3 } });
    assert.equal(evaluateCondition('!(trust.apollo >= 5)', ctx), true);
    assert.equal(evaluateCondition('(trust.apollo + 2) >= 5', ctx), true);
  });
});

// ----- Interpolation -----

describe('interpolate', () => {
  it('substitutes var placeholders', () => {
    const text = 'Welcome, {playerName}.';
    assert.equal(interpolate(text, { playerName: 'ghaisan' }), 'Welcome, ghaisan.');
  });

  it('replaces unknown placeholders with empty string', () => {
    assert.equal(interpolate('hello {missing}!', {}), 'hello !');
  });

  it('leaves non-placeholder braces alone', () => {
    assert.equal(interpolate('plain text', {}), 'plain text');
  });
});

// ----- Terminal detection -----

describe('isTerminal', () => {
  it('recognises the `end` node as terminal', () => {
    const d = loadApolloIntro();
    const reg = makeRegistry(d);
    const s: DialogueReducerState = {
      ...initialDialogueState(),
      activeDialogueId: d.id,
      currentNodeId: 'end',
    };
    assert.equal(isTerminal(s, reg), true);
  });

  it('non-terminal node is not terminal', () => {
    const d = loadApolloIntro();
    const reg = makeRegistry(d);
    const s: DialogueReducerState = {
      ...initialDialogueState(),
      activeDialogueId: d.id,
      currentNodeId: 'greet',
    };
    assert.equal(isTerminal(s, reg), false);
  });
});
