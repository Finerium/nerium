//
// draft_store.ts (Eos P3a).
//
// Conforms to:
// - docs/contracts/listing_submission.contract.md v0.1.0 (Section 4 Interface, Section 8 Error Handling)
//
// localStorage-backed persistence for SubmissionDraft. Per Eos ADR-02, we ship
// localStorage in the hackathon prototype because the SQLite-backed
// draft_store referenced in the contract belongs behind the Marketplace API
// surface which is stubbed for demo. Reload resume, tab restore, and
// accidental navigation recovery all work offline; no network dependency.
//
// Post-hackathon refactor swaps the implementation to call a server action
// that writes to SQLite (per contract Section 6). The public interface here
// matches the contract so the swap is a single-file change.
//

import type { SubmissionDraft, SubmissionStep } from './submission_types';

const NAMESPACE = 'nerium.marketplace.listing.draft';
const INDEX_KEY = `${NAMESPACE}.index`;

function storageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const probe = `${NAMESPACE}.__probe__`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function storageKey(draft_id: string): string {
  return `${NAMESPACE}.${draft_id}`;
}

function readIndex(): string[] {
  if (!storageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

function writeIndex(ids: string[]): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(Array.from(new Set(ids))));
  } catch {
    /* disk full / quota; caller sees false from saveDraft */
  }
}

export function newDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `draft_${time}_${rand}`;
}

export function createEmptyDraft(creator_identity_id: string): SubmissionDraft {
  const now = new Date().toISOString();
  return {
    draft_id: newDraftId(),
    creator_identity_id,
    current_step: 'identity_check',
    partial_listing: {
      creator_identity_id,
      visibility: 'draft',
      capability_tags: [],
      usage_cost_hint: {
        per_execution_unit: 'task',
        estimate_range: { low_usd: 0, high_usd: 0 },
      },
    },
    validation_errors: {},
    saved_at: now,
  };
}

export interface DraftStore {
  save(draft: SubmissionDraft): boolean;
  load(draft_id: string): SubmissionDraft | null;
  list(): SubmissionDraft[];
  remove(draft_id: string): void;
  clear(): void;
}

export function createLocalDraftStore(): DraftStore {
  return {
    save(draft: SubmissionDraft): boolean {
      if (!storageAvailable()) return false;
      try {
        const stamped: SubmissionDraft = {
          ...draft,
          saved_at: new Date().toISOString(),
        };
        window.localStorage.setItem(storageKey(draft.draft_id), JSON.stringify(stamped));
        const ids = readIndex();
        if (!ids.includes(draft.draft_id)) {
          ids.push(draft.draft_id);
          writeIndex(ids);
        }
        return true;
      } catch {
        return false;
      }
    },
    load(draft_id: string): SubmissionDraft | null {
      if (!storageAvailable()) return null;
      try {
        const raw = window.localStorage.getItem(storageKey(draft_id));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as SubmissionDraft;
        return isSubmissionDraft(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    list(): SubmissionDraft[] {
      if (!storageAvailable()) return [];
      const ids = readIndex();
      const drafts: SubmissionDraft[] = [];
      for (const id of ids) {
        const loaded = this.load(id);
        if (loaded) drafts.push(loaded);
      }
      drafts.sort((a, b) => (a.saved_at < b.saved_at ? 1 : -1));
      return drafts;
    },
    remove(draft_id: string): void {
      if (!storageAvailable()) return;
      try {
        window.localStorage.removeItem(storageKey(draft_id));
        writeIndex(readIndex().filter((id) => id !== draft_id));
      } catch {
        /* noop */
      }
    },
    clear(): void {
      if (!storageAvailable()) return;
      const ids = readIndex();
      for (const id of ids) {
        try {
          window.localStorage.removeItem(storageKey(id));
        } catch {
          /* noop */
        }
      }
      writeIndex([]);
    },
  };
}

function isSubmissionDraft(value: unknown): value is SubmissionDraft {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const step_ok = typeof v.current_step === 'string' && isSubmissionStep(v.current_step);
  return (
    typeof v.draft_id === 'string' &&
    typeof v.creator_identity_id === 'string' &&
    step_ok &&
    typeof v.partial_listing === 'object' &&
    typeof v.validation_errors === 'object' &&
    typeof v.saved_at === 'string'
  );
}

function isSubmissionStep(value: string): value is SubmissionStep {
  return (
    value === 'identity_check' ||
    value === 'metadata_entry' ||
    value === 'capability_selection' ||
    value === 'pricing_configuration' ||
    value === 'living_template_definition' ||
    value === 'preview_confirm' ||
    value === 'publish_result'
  );
}

export function emitDraftEvent(
  topic: 'marketplace.submission.draft_saved' | 'marketplace.submission.cancelled',
  payload: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(`nerium:${topic}`, { detail: payload }));
  } catch {
    /* older browsers; silent */
  }
}
