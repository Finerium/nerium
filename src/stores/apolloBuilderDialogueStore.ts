//
// src/stores/apolloBuilderDialogueStore.ts
//
// Sekuri integration: Zustand state machine for the Apollo Builder Workshop
// theatrical dialogue. Triggered by `game.landmark.interact` with payload
// landmarkName === 'builder_workshop' (Helios W3 S7 emission contract).
//
// State machine phases:
//
//   closed             -> overlay hidden, listener idle
//   greeting           -> Apollo NPC greets, input field accepts user prompt
//   classifying        -> "yapping" placeholder text + 2-3s thinking animation
//   template_summary   -> Sekuri template card displayed, model selection
//                         modal opens via openModal(tier) on transition
//   structure_proposal -> agent roster + parallel groups + per-vendor cost
//                         breakdown rendered, Accept/Revise CTAs visible
//   spawning           -> theatrical terminal spawn animation playing
//   complete           -> "BUILD COMPLETE" final state, deployable app icon
//   revising           -> JSON-editable structure (drop agents, swap vendors)
//
// Hard constraints:
//   - NO live invocation: classifier runs deterministic regex, template
//     loads from /public/sekuri/builder_templates/{tier}.json static path.
//   - Honest-claim caption rendered at every phase that surfaces template
//     content so judges never read the flow as live billing.
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
  | 'spawning'
  | 'complete'
  | 'revising';

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
};

export const useApolloBuilderDialogueStore = create<Store>()(
  subscribeWithSelector((set, get) => ({
    ...INITIAL,

    openWorkshop() {
      // Idempotent: do not re-open if already open in any non-closed phase.
      const current = get().phase;
      if (current !== 'closed') return;
      set({ ...INITIAL, phase: 'greeting' });
    },

    close() {
      set({ ...INITIAL, phase: 'closed' });
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
      set({ ...INITIAL });
    },
  })),
);

// Convenience selector: dialogue is "active" whenever phase != 'closed'.
// HUD components subscribe to this to know whether to render the overlay.
export function selectApolloBuilderDialogueOpen(s: Store): boolean {
  return s.phase !== 'closed';
}
