//
// src/stores/apolloBuilderDialogueStore.ts
//
// Sekuri integration: Zustand state machine for the Apollo Builder Workshop
// theatrical dialogue. Triggered by `game.landmark.interact` with payload
// landmarkName === 'builder_workshop' (Helios W3 S7 emission contract).
//
// State machine phases:
//
//   closed                   overlay hidden, listener idle
//   greeting                 Apollo NPC greets, input field accepts user prompt
//   classifying              "yapping" placeholder text + 2-3s thinking animation
//   template_summary         Sekuri template card displayed, model selection
//                            modal opens via openModal(tier) on transition
//   structure_proposal       agent roster + parallel groups + per-vendor cost
//                            breakdown rendered, Accept/Revise CTAs visible
//   awaiting_runtime_choice  Aether-Vercel T6 Phase 1.5: BYOK gate. Inserted
//                            between structure_proposal accept and spawning so
//                            the user explicitly opts in to Theatrical (default)
//                            vs Live (BYOK) runtime. ApiKeyModal mounts here.
//   spawning                 theatrical terminal spawn animation playing.
//                            Live mode runs the same theatrical visuals in
//                            parallel with a real SSE Anthropic call, fallback
//                            to canned response on any error.
//   complete                 "BUILD COMPLETE" final state, deployable app icon
//   revising                 JSON-editable structure (drop agents, swap vendors)
//
// Hard constraints:
//   - NO live invocation by default: classifier runs deterministic regex,
//     template loads from /public/sekuri/builder_templates/{tier}.json static
//     path. Live runtime is BYOK opt-in only.
//   - Honest-claim caption rendered at every phase that surfaces template
//     content so judges never read the flow as live billing.
//   - BYOK keys (`userApiKey`) are stored in sessionStorage NEVER localStorage.
//     Cleared when the tab closes. Never logged, never sent to NERIUM
//     persistence layer (no DB row, no Redis key).
//
// No em dash, no emoji.
//

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type {
  SekuriClassification,
  SekuriComplexity,
  SekuriTemplate,
} from '../lib/sekuri';
import type { ConfirmedModelSelection } from '../components/builder/ModelSelectionModal';

export type ApolloBuilderDialoguePhase =
  | 'closed'
  | 'greeting'
  | 'classifying'
  | 'template_summary'
  | 'structure_proposal'
  | 'awaiting_runtime_choice'
  | 'spawning'
  | 'complete'
  | 'revising';

export type BuilderRuntimeMode = 'theatrical' | 'live';

// sessionStorage keys for BYOK persistence within a single tab session.
// Cleared automatically by the browser on tab close. Use sessionStorage
// NOT localStorage so a refreshed tab DOES persist (good UX) but a closed
// tab forgets the key (security).
const SS_KEY_API_KEY = 'nerium.builder.byok_api_key';
const SS_KEY_RUNS_REMAINING = 'nerium.builder.live_runs_remaining';
const DEFAULT_RUNS_PER_SESSION = 5;

function safeReadSessionStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteSessionStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // sessionStorage can be disabled (private browsing). Silent ignore.
  }
}

function safeRemoveSessionStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function readInitialApiKey(): string | null {
  return safeReadSessionStorage(SS_KEY_API_KEY);
}

function readInitialRunsRemaining(): number {
  const raw = safeReadSessionStorage(SS_KEY_RUNS_REMAINING);
  if (raw === null) return DEFAULT_RUNS_PER_SESSION;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) return DEFAULT_RUNS_PER_SESSION;
  if (parsed > DEFAULT_RUNS_PER_SESSION) return DEFAULT_RUNS_PER_SESSION;
  return parsed;
}

export interface ApolloBuilderDialogueState {
  phase: ApolloBuilderDialoguePhase;
  userPrompt: string;
  classification: SekuriClassification | null;
  template: SekuriTemplate | null;
  templateError: string | null;
  modelConfig: ConfirmedModelSelection | null;
  reviseDraftJson: string | null;
  // Optional: hold a synthetic hint for the spawn animation about which
  // terminal sprite to emphasize (per ModelSelectionModal accent palette).
  perAgentVendorOverridesPreview: Record<string, string>;
  // Aether-Vercel T6 Phase 1.5: BYOK runtime mode + key + rate limit counter.
  runtimeMode: BuilderRuntimeMode;
  userApiKey: string | null;
  liveRunsRemaining: number;
}

export interface ApolloBuilderDialogueActions {
  openWorkshop(): void;
  close(): void;
  setUserPrompt(text: string): void;
  submitPrompt(): void;
  setClassification(c: SekuriClassification): void;
  setTemplate(t: SekuriTemplate, perAgentOverrides: Record<string, string>): void;
  setTemplateError(err: string): void;
  goTemplateSummary(): void;
  goStructureProposal(): void;
  setModelConfig(cfg: ConfirmedModelSelection): void;
  // Aether-Vercel T6 Phase 1.5: gate transition. Replaces the previous direct
  // structure_proposal -> spawning advance with a runtime choice gate.
  goAwaitingRuntimeChoice(): void;
  selectTheatrical(): void;
  selectLive(apiKey: string): void;
  clearApiKey(): void;
  decrementLiveRuns(): void;
  goSpawning(): void;
  goComplete(): void;
  goRevising(initialJson: string): void;
  setReviseDraftJson(json: string): void;
  acceptRevisedDraft(): void;
  cancelRevise(): void;
  reset(): void;
}

type Store = ApolloBuilderDialogueState & ApolloBuilderDialogueActions;

const INITIAL: ApolloBuilderDialogueState = {
  phase: 'closed',
  userPrompt: '',
  classification: null,
  template: null,
  templateError: null,
  modelConfig: null,
  reviseDraftJson: null,
  perAgentVendorOverridesPreview: {},
  // BYOK defaults: theatrical mode, no key, full rate budget. The
  // store re-hydrates from sessionStorage on first import in the
  // browser so a refreshed tab keeps the previous opt-in state.
  runtimeMode: 'theatrical',
  userApiKey: null,
  liveRunsRemaining: DEFAULT_RUNS_PER_SESSION,
};

function buildInitialWithSessionStorage(): ApolloBuilderDialogueState {
  const persistedKey = readInitialApiKey();
  const persistedRuns = readInitialRunsRemaining();
  return {
    ...INITIAL,
    runtimeMode: persistedKey ? 'live' : 'theatrical',
    userApiKey: persistedKey,
    liveRunsRemaining: persistedRuns,
  };
}

export const useApolloBuilderDialogueStore = create<Store>()(
  subscribeWithSelector((set, get) => ({
    ...buildInitialWithSessionStorage(),

    openWorkshop() {
      // Idempotent: do not re-open if already open in any non-closed phase.
      const current = get().phase;
      if (current !== 'closed') return;
      // Preserve BYOK opt-in across workshop sessions; reset only the
      // dialogue-flow fields. The user does not want to re-enter their
      // key after every dialogue close.
      const persistedKey = get().userApiKey;
      const persistedRuns = get().liveRunsRemaining;
      const persistedRuntimeMode = get().runtimeMode;
      set({
        ...INITIAL,
        phase: 'greeting',
        userApiKey: persistedKey,
        liveRunsRemaining: persistedRuns,
        runtimeMode: persistedRuntimeMode,
      });
    },

    close() {
      const persistedKey = get().userApiKey;
      const persistedRuns = get().liveRunsRemaining;
      const persistedRuntimeMode = get().runtimeMode;
      set({
        ...INITIAL,
        phase: 'closed',
        userApiKey: persistedKey,
        liveRunsRemaining: persistedRuns,
        runtimeMode: persistedRuntimeMode,
      });
    },

    setUserPrompt(text) {
      set({ userPrompt: text });
    },

    submitPrompt() {
      const text = (get().userPrompt ?? '').trim();
      if (text.length === 0) return;
      set({ phase: 'classifying' });
    },

    setClassification(c) {
      set({ classification: c });
    },

    setTemplate(t, perAgentOverrides) {
      set({
        template: t,
        templateError: null,
        perAgentVendorOverridesPreview: perAgentOverrides,
      });
    },

    setTemplateError(err) {
      set({ templateError: err, template: null });
    },

    goTemplateSummary() {
      set({ phase: 'template_summary' });
    },

    goStructureProposal() {
      set({ phase: 'structure_proposal' });
    },

    setModelConfig(cfg) {
      set({ modelConfig: cfg });
    },

    goAwaitingRuntimeChoice() {
      set({ phase: 'awaiting_runtime_choice' });
    },

    selectTheatrical() {
      set({ runtimeMode: 'theatrical' });
    },

    selectLive(apiKey) {
      const trimmed = apiKey.trim();
      if (trimmed.length === 0) return;
      // Persist sessionStorage NOT localStorage so the key clears on tab
      // close. NEVER send this key to NERIUM logs/DB/Redis.
      safeWriteSessionStorage(SS_KEY_API_KEY, trimmed);
      set({ runtimeMode: 'live', userApiKey: trimmed });
    },

    clearApiKey() {
      safeRemoveSessionStorage(SS_KEY_API_KEY);
      set({ runtimeMode: 'theatrical', userApiKey: null });
    },

    decrementLiveRuns() {
      const current = get().liveRunsRemaining;
      const next = Math.max(0, current - 1);
      safeWriteSessionStorage(SS_KEY_RUNS_REMAINING, String(next));
      set({ liveRunsRemaining: next });
    },

    goSpawning() {
      set({ phase: 'spawning' });
    },

    goComplete() {
      set({ phase: 'complete' });
    },

    goRevising(initialJson) {
      set({ phase: 'revising', reviseDraftJson: initialJson });
    },

    setReviseDraftJson(json) {
      set({ reviseDraftJson: json });
    },

    acceptRevisedDraft() {
      // Caller is responsible for parsing reviseDraftJson and applying any
      // template/per-agent override edits before invoking. We just shuttle
      // the phase back to structure_proposal so the user can review.
      set({ phase: 'structure_proposal' });
    },

    cancelRevise() {
      set({ phase: 'structure_proposal', reviseDraftJson: null });
    },

    reset() {
      // Hard reset does NOT clear BYOK key (sessionStorage is the source
      // of truth and the user explicitly chose Live mode). Use clearApiKey
      // to wipe BYOK state.
      const persistedKey = get().userApiKey;
      const persistedRuns = get().liveRunsRemaining;
      const persistedRuntimeMode = get().runtimeMode;
      set({
        ...INITIAL,
        userApiKey: persistedKey,
        liveRunsRemaining: persistedRuns,
        runtimeMode: persistedRuntimeMode,
      });
    },
  })),
);

// Convenience selector: dialogue is "active" whenever phase != 'closed'.
// HUD components subscribe to this to know whether to render the overlay.
export function selectApolloBuilderDialogueOpen(s: Store): boolean {
  return s.phase !== 'closed';
}
