//
// tests/creator_submit_store.test.ts
//
// Zustand wizard store transitions: category select, step advance,
// draft patching, listing_id binding, reset. Uses a jsdom-free pattern:
// the store reads localStorage behind a guarded window check, so a
// minimal in-memory stub keeps the store deterministic under node:test.
//

import { describe, it, before, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';

// Install a minimal window/localStorage shim so the store's persistence
// path runs without a DOM. Must happen before the store module loads.
before(() => {
  const mem = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string): string | null => (mem.has(k) ? (mem.get(k) as string) : null),
      setItem: (k: string, v: string) => mem.set(k, v),
      removeItem: (k: string) => mem.delete(k),
    },
  } as unknown as Window;
});

// Defer import to after the shim is installed.
let storeModule: typeof import('../app/creator/submit/lib/store');
let schemaModule: typeof import('../app/creator/submit/lib/schema');

before(async () => {
  storeModule = await import('../app/creator/submit/lib/store');
  schemaModule = await import('../app/creator/submit/lib/schema');
});

beforeEach(() => {
  // Clear localStorage between tests to avoid cross-test bleed.
  const w = (globalThis as unknown as { window?: { localStorage?: { clear?: () => void } } }).window;
  const ls = w?.localStorage as { [k: string]: unknown } | undefined;
  if (ls && typeof (ls as { clear?: () => void }).clear === 'function') {
    (ls as { clear: () => void }).clear();
  } else {
    // Our shim stores keys in a closure; reset via re-hydration only.
  }
  storeModule.useWizardStore.setState({
    user_id: null,
    listing_id: null,
    step: 'category',
    draft: schemaModule.createEmptyDraft(),
    last_edited_at: 0,
    save_state: 'idle',
    save_error: null,
    field_errors: {},
  });
});

describe('useWizardStore', () => {
  it('hydrate sets user_id and defaults to category step', () => {
    storeModule.useWizardStore.getState().hydrate({ user_id: 'u-1' });
    const s = storeModule.useWizardStore.getState();
    assert.equal(s.user_id, 'u-1');
    assert.equal(s.step, 'category');
    assert.equal(s.listing_id, null);
  });

  it('advance / retreat walks the 7-step pipeline', () => {
    const s = storeModule.useWizardStore;
    s.getState().hydrate({ user_id: 'u-2' });
    const steps = [
      'category',
      'basics',
      'metadata',
      'pricing',
      'assets',
      'preview',
      'submit',
    ];
    for (let i = 0; i < steps.length; i++) {
      assert.equal(s.getState().step, steps[i]);
      if (i < steps.length - 1) s.getState().advance();
    }
    // Can't advance past the last step.
    s.getState().advance();
    assert.equal(s.getState().step, 'submit');

    // Retreat walks back.
    s.getState().retreat();
    assert.equal(s.getState().step, 'preview');
  });

  it('patchDraft merges into the draft shape', () => {
    const s = storeModule.useWizardStore;
    s.getState().hydrate({ user_id: 'u-3' });
    s.getState().patchDraft({ category: 'content', subtype: 'prompt' });
    const d = s.getState().draft;
    assert.equal(d.category, 'content');
    assert.equal(d.subtype, 'prompt');
  });

  it('patchBasics updates basics sub-object without wiping other fields', () => {
    const s = storeModule.useWizardStore;
    s.getState().hydrate({ user_id: 'u-4' });
    s.getState().patchBasics({ title: 'My Agent' });
    const d = s.getState().draft;
    assert.equal(d.basics.title, 'My Agent');
    assert.equal(d.basics.slug, '');
  });

  it('setListingId pins the server id', () => {
    const s = storeModule.useWizardStore;
    s.getState().hydrate({ user_id: 'u-5' });
    s.getState().setListingId('listing-1');
    assert.equal(s.getState().listing_id, 'listing-1');
  });

  it('reset returns to a fresh draft', () => {
    const s = storeModule.useWizardStore;
    s.getState().hydrate({ user_id: 'u-6' });
    s.getState().patchDraft({ category: 'assets', subtype: 'sprite_pack' });
    s.getState().setListingId('listing-x');
    s.getState().reset();
    const d = s.getState().draft;
    assert.equal(d.category, null);
    assert.equal(d.subtype, null);
    assert.equal(s.getState().listing_id, null);
    assert.equal(s.getState().step, 'category');
  });

  it('setSaveState / setFieldErrors are isolated from draft', () => {
    const s = storeModule.useWizardStore;
    s.getState().hydrate({ user_id: 'u-7' });
    s.getState().setSaveState('saving');
    assert.equal(s.getState().save_state, 'saving');
    s.getState().setFieldErrors({ title: 'required' });
    assert.deepEqual(s.getState().field_errors, { title: 'required' });
  });
});
