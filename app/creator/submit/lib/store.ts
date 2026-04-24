//
// store.ts
//
// Zustand store for the creator submission wizard. Owns:
// - current step index + step navigation rules
// - draft shape (category, subtype, basics, pricing, license, metadata, assets)
// - server listing id (null until first POST lands)
// - autosave indicator state (idle | saving | saved | error)
// - per-field validation issues from the latest safeParse
//
// LocalStorage persistence is namespaced per user so switching accounts on
// the same browser does not leak drafts across sessions. The persist key
// also embeds the listing id once the draft has been posted, letting the
// user come back to an in-progress edit by URL.
//

import { create } from 'zustand';

import {
  createEmptyDraft,
  STEP_IDS,
  type DraftShape,
  type StepId,
} from './schema';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

export interface WizardStoreState {
  // --- Identity / persistence ---
  user_id: string | null;
  listing_id: string | null;

  // --- Wizard progression ---
  step: StepId;
  draft: DraftShape;
  last_edited_at: number;
  save_state: SaveState;
  save_error: string | null;

  // --- Validation scratchpad ---
  // Field path -> message. Keeps the latest per-step safeParse errors so
  // inputs can surface messages on blur. Cleared when the step advances.
  field_errors: Record<string, string>;

  // --- Actions ---
  hydrate: (args: { user_id: string; listing_id?: string | null }) => void;
  setStep: (step: StepId) => void;
  advance: () => void;
  retreat: () => void;
  patchDraft: (patch: Partial<DraftShape>) => void;
  patchBasics: (patch: Partial<DraftShape['basics']>) => void;
  setListingId: (id: string) => void;
  setSaveState: (s: SaveState, error?: string | null) => void;
  setFieldErrors: (errs: Record<string, string>) => void;
  reset: () => void;
}

function storageKey(user_id: string, listing_id: string | null): string {
  return `nerium.creator.submit.draft.${user_id}.${listing_id ?? 'new'}`;
}

function loadPersisted(
  user_id: string,
  listing_id: string | null,
): Partial<WizardStoreState> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(user_id, listing_id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WizardStoreState>;
    // Only restore the fields the store actually owns; the action slots
    // are set fresh on creation.
    return {
      step: parsed.step,
      draft: parsed.draft as DraftShape,
      last_edited_at: parsed.last_edited_at ?? 0,
      listing_id: parsed.listing_id ?? listing_id,
    };
  } catch {
    return null;
  }
}

function writePersisted(s: WizardStoreState): void {
  if (typeof window === 'undefined' || !s.user_id) return;
  try {
    window.localStorage.setItem(
      storageKey(s.user_id, s.listing_id),
      JSON.stringify({
        step: s.step,
        draft: s.draft,
        last_edited_at: s.last_edited_at,
        listing_id: s.listing_id,
      }),
    );
  } catch {
    // Quota exceeded or disabled; autosave still runs so nothing is lost.
  }
}

export function clearPersisted(
  user_id: string,
  listing_id: string | null,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey(user_id, listing_id));
  } catch {
    /* no-op */
  }
}

function neighbourStep(current: StepId, delta: 1 | -1): StepId {
  const idx = STEP_IDS.indexOf(current);
  const next = Math.max(0, Math.min(STEP_IDS.length - 1, idx + delta));
  return STEP_IDS[next];
}

export const useWizardStore = create<WizardStoreState>()((set, get) => ({
  user_id: null,
  listing_id: null,
  step: 'category',
  draft: createEmptyDraft(),
  last_edited_at: 0,
  save_state: 'idle',
  save_error: null,
  field_errors: {},

  hydrate: ({ user_id, listing_id = null }) => {
    const persisted = loadPersisted(user_id, listing_id ?? null);
    const base: WizardStoreState = {
      ...get(),
      user_id,
      listing_id: listing_id ?? null,
      step: persisted?.step ?? 'category',
      draft: (persisted?.draft as DraftShape | undefined) ?? createEmptyDraft(),
      last_edited_at: persisted?.last_edited_at ?? 0,
      save_state: 'idle',
      save_error: null,
      field_errors: {},
    };
    set(base);
  },

  setStep: (step) =>
    set((s) => {
      const next: WizardStoreState = {
        ...s,
        step,
        field_errors: {},
        last_edited_at: Date.now(),
      };
      writePersisted(next);
      return next;
    }),

  advance: () =>
    set((s) => {
      const next: WizardStoreState = {
        ...s,
        step: neighbourStep(s.step, 1),
        field_errors: {},
        last_edited_at: Date.now(),
      };
      writePersisted(next);
      return next;
    }),

  retreat: () =>
    set((s) => {
      const next: WizardStoreState = {
        ...s,
        step: neighbourStep(s.step, -1),
        field_errors: {},
        last_edited_at: Date.now(),
      };
      writePersisted(next);
      return next;
    }),

  patchDraft: (patch) =>
    set((s) => {
      const next: WizardStoreState = {
        ...s,
        draft: { ...s.draft, ...patch },
        last_edited_at: Date.now(),
        save_state: 'idle',
        save_error: null,
      };
      writePersisted(next);
      return next;
    }),

  patchBasics: (patch) =>
    set((s) => {
      const next: WizardStoreState = {
        ...s,
        draft: { ...s.draft, basics: { ...s.draft.basics, ...patch } },
        last_edited_at: Date.now(),
        save_state: 'idle',
        save_error: null,
      };
      writePersisted(next);
      return next;
    }),

  setListingId: (id) =>
    set((s) => {
      const next: WizardStoreState = {
        ...s,
        listing_id: id,
        last_edited_at: Date.now(),
      };
      writePersisted(next);
      return next;
    }),

  setSaveState: (save_state, save_error = null) =>
    set({ save_state, save_error }),

  setFieldErrors: (field_errors) => set({ field_errors }),

  reset: () =>
    set((s) => {
      if (s.user_id) clearPersisted(s.user_id, s.listing_id);
      return {
        ...s,
        listing_id: null,
        step: 'category',
        draft: createEmptyDraft(),
        last_edited_at: 0,
        save_state: 'idle',
        save_error: null,
        field_errors: {},
      };
    }),
}));

// Exported for the autosave helper + unit tests.
export const __internal = {
  storageKey,
  loadPersisted,
  writePersisted,
  neighbourStep,
};
