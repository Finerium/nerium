//
// tests/creator_submit_autosave.test.ts
//
// Debounced autosave behaviour: first edit POSTs, subsequent edits PATCH
// against the previously returned listing_id. Node's built-in mock timers
// drive the debounce without sleeping.
//

import { describe, it, mock } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  createAutosaveController,
  isDraftSavable,
  saveNow,
  AUTOSAVE_DEBOUNCE_MS,
} from '../app/creator/submit/lib/autosave';
import { createEmptyDraft, type DraftShape } from '../app/creator/submit/lib/schema';

function validDraft(): DraftShape {
  const d = createEmptyDraft();
  d.category = 'content';
  d.subtype = 'prompt';
  d.basics.title = 'My Prompt';
  return d;
}

describe('isDraftSavable', () => {
  it('rejects drafts without a category', () => {
    const d = createEmptyDraft();
    d.basics.title = 'X';
    assert.equal(isDraftSavable(d), false);
  });
  it('rejects drafts without a title', () => {
    const d = createEmptyDraft();
    d.category = 'content';
    d.subtype = 'prompt';
    assert.equal(isDraftSavable(d), false);
  });
  it('accepts a draft with category, subtype, and title', () => {
    assert.equal(isDraftSavable(validDraft()), true);
  });
});

describe('saveNow', () => {
  it('creates a new listing when listing_id is null', async () => {
    const draft = validDraft();
    let stored_id: string | null = null;
    const states: string[] = [];
    const create = mock.fn(async () => ({ id: 'listing-new' }));
    const update = mock.fn(async () => ({ id: 'listing-new' }));
    const ok = await saveNow({
      getDraft: () => draft,
      getListingId: () => stored_id,
      setListingId: (id) => {
        stored_id = id;
      },
      setSaveState: (s) => {
        states.push(s);
      },
      create,
      update,
    });
    assert.equal(ok, true);
    assert.equal(create.mock.callCount(), 1);
    assert.equal(update.mock.callCount(), 0);
    assert.equal(stored_id, 'listing-new');
    assert.deepEqual(states, ['saving', 'saved']);
  });

  it('patches an existing listing when listing_id is set', async () => {
    const draft = validDraft();
    let stored_id: string | null = 'listing-existing';
    const create = mock.fn(async () => ({ id: 'x' }));
    const update = mock.fn(async () => ({ id: 'listing-existing' }));
    const ok = await saveNow({
      getDraft: () => draft,
      getListingId: () => stored_id,
      setListingId: (id) => {
        stored_id = id;
      },
      setSaveState: () => undefined,
      create,
      update,
    });
    assert.equal(ok, true);
    assert.equal(update.mock.callCount(), 1);
    assert.equal(create.mock.callCount(), 0);
  });

  it('surfaces errors via setSaveState', async () => {
    const draft = validDraft();
    let err: string | null = null;
    const failing = mock.fn(async () => {
      throw new Error('server_down');
    });
    const ok = await saveNow({
      getDraft: () => draft,
      getListingId: () => null,
      setListingId: () => undefined,
      setSaveState: (s, e) => {
        if (s === 'error') err = e ?? null;
      },
      create: failing,
    });
    assert.equal(ok, false);
    assert.equal(err, 'server_down');
  });

  it('skips save for a non-savable draft', async () => {
    const draft = createEmptyDraft();
    const create = mock.fn(async () => ({ id: 'x' }));
    const states: string[] = [];
    const ok = await saveNow({
      getDraft: () => draft,
      getListingId: () => null,
      setListingId: () => undefined,
      setSaveState: (s) => states.push(s),
      create,
    });
    assert.equal(ok, false);
    assert.equal(create.mock.callCount(), 0);
    assert.deepEqual(states, ['idle']);
  });
});

describe('createAutosaveController', () => {
  it('trigger schedules a save after the debounce delay', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const draft = validDraft();
      const create = mock.fn(async () => ({ id: 'listing-new' }));
      const controller = createAutosaveController(
        {
          getDraft: () => draft,
          getListingId: () => null,
          setListingId: () => undefined,
          setSaveState: () => undefined,
          create,
        },
        100,
      );
      controller.trigger();
      // Before the delay elapses the save must not have fired.
      assert.equal(create.mock.callCount(), 0);
      mock.timers.tick(100);
      // Let the microtask queue drain (saveNow is async).
      await new Promise((r) => setImmediate(r));
      assert.equal(create.mock.callCount(), 1);
    } finally {
      mock.timers.reset();
    }
  });

  it('flush runs the save immediately', async () => {
    const draft = validDraft();
    const create = mock.fn(async () => ({ id: 'listing-new' }));
    const controller = createAutosaveController(
      {
        getDraft: () => draft,
        getListingId: () => null,
        setListingId: () => undefined,
        setSaveState: () => undefined,
        create,
      },
      AUTOSAVE_DEBOUNCE_MS,
    );
    await controller.flush();
    assert.equal(create.mock.callCount(), 1);
  });

  it('cancel aborts a pending save', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const draft = validDraft();
      const create = mock.fn(async () => ({ id: 'listing-new' }));
      const controller = createAutosaveController(
        {
          getDraft: () => draft,
          getListingId: () => null,
          setListingId: () => undefined,
          setSaveState: () => undefined,
          create,
        },
        100,
      );
      controller.trigger();
      controller.cancel();
      mock.timers.tick(200);
      await new Promise((r) => setImmediate(r));
      assert.equal(create.mock.callCount(), 0);
    } finally {
      mock.timers.reset();
    }
  });
});
