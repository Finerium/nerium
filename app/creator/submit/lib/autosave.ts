//
// autosave.ts
//
// Debounced draft sync. Spec: every 2 seconds after the last edit, if the
// draft passes the current step's schema, POST (first edit) or PATCH
// (subsequent edits) against /v1/marketplace/listings.
//
// The autosave entry point is framework-agnostic - it accepts the store
// interface plus the API client fns as arguments so unit tests can drive
// it deterministically with fake timers and mocked fetches.
//

import {
  createListing,
  updateListing,
  type CreateListingRequest,
  type UpdateListingRequest,
} from './api';
import {
  basicsStepSchema,
  categoryStepSchema,
  toCreateBody,
  toUpdateBody,
  type DraftShape,
} from './schema';

export const AUTOSAVE_DEBOUNCE_MS = 2000;

// A draft is "savable" once the creator has picked a category/subtype and
// typed at least a title. Earlier states POST nothing; there is not yet a
// meaningful row to store.
export function isDraftSavable(draft: DraftShape): boolean {
  const cat = categoryStepSchema.safeParse({
    category: draft.category,
    subtype: draft.subtype,
  });
  if (!cat.success) return false;
  const basics = basicsStepSchema.safeParse(draft.basics);
  if (!basics.success) return false;
  return true;
}

export interface AutosaveDeps {
  getDraft(): DraftShape;
  getListingId(): string | null;
  setListingId(id: string): void;
  setSaveState(s: 'idle' | 'saving' | 'saved' | 'error', err?: string | null): void;
  create?: (body: CreateListingRequest) => Promise<{ id: string }>;
  update?: (id: string, body: UpdateListingRequest) => Promise<{ id: string }>;
}

const defaultDeps = {
  create: async (body: CreateListingRequest) => {
    const row = await createListing(body);
    return { id: row.id };
  },
  update: async (id: string, body: UpdateListingRequest) => {
    const row = await updateListing(id, body);
    return { id: row.id };
  },
};

// Core save: compute body, call create-or-update, mark state.
export async function saveNow(deps: AutosaveDeps): Promise<boolean> {
  const draft = deps.getDraft();
  if (!isDraftSavable(draft)) {
    deps.setSaveState('idle');
    return false;
  }
  const create = deps.create ?? defaultDeps.create;
  const update = deps.update ?? defaultDeps.update;
  const existing = deps.getListingId();
  deps.setSaveState('saving');
  try {
    if (existing) {
      await update(existing, toUpdateBody(draft));
    } else {
      const body = toCreateBody(draft);
      const row = await create(body);
      deps.setListingId(row.id);
    }
    deps.setSaveState('saved');
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    deps.setSaveState('error', msg);
    return false;
  }
}

// Factory for a debounced save trigger. Each call resets the timer; when
// `flush` is invoked the pending save runs immediately (e.g. on unmount
// or when the user clicks Next).
export interface AutosaveController {
  trigger(): void;
  flush(): Promise<void>;
  cancel(): void;
}

export function createAutosaveController(
  deps: AutosaveDeps,
  delay_ms: number = AUTOSAVE_DEBOUNCE_MS,
): AutosaveController {
  let handle: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<unknown> | null = null;

  const clear = () => {
    if (handle !== null) {
      clearTimeout(handle);
      handle = null;
    }
  };

  const runNow = async () => {
    clear();
    if (inflight) await inflight.catch(() => undefined);
    inflight = saveNow(deps);
    try {
      await inflight;
    } finally {
      inflight = null;
    }
  };

  return {
    trigger() {
      clear();
      handle = setTimeout(() => {
        void runNow();
      }, delay_ms);
    },
    async flush() {
      clear();
      await runNow();
    },
    cancel() {
      clear();
    },
  };
}
