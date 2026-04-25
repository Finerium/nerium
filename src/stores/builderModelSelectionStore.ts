//
// src/stores/builderModelSelectionStore.ts
//
// Lu specialist (W3 T3) authored Zustand store. Holds Modal open state +
// the user-selected vendor configuration for the Builder
// ModelSelectionModal flow.
//
// SCOPED OUT of game_state.contract.md: Section 4 of that contract
// freezes five game-state stores (quest, dialogue, inventory, ui, audio).
// Adding a sixth in that family requires a Pythia-v2 contract amendment.
// Builder model selection is a Builder-domain preference store, not a
// game-state store; it sits alongside, mirroring the Erato-v2 pattern
// established for `useUIPreferencesStore` per ADR-0001.
//
// Honest-claim discipline: this store is purely a CHOICE BUFFER. Confirm
// emits a `nerium.builder.model_selection_confirmed` bus event with the
// selected config; nothing in this store invokes any vendor at runtime.
// Per CLAUDE.md anti-pattern 7 amended, shipped runtime is Anthropic-only.
//
// No em dash, no emoji.
//

'use client';

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type {
  SekuriClaudeExecutionMode,
  SekuriComplexity,
} from '../lib/sekuriTemplate';

export type BuilderVendorId =
  | 'anthropic'
  | 'google'
  | 'openai'
  | 'higgsfield'
  | 'seedance'
  | 'meta'
  | 'mistral'
  | 'auto';

export interface BuilderModelSelectionConfig {
  primaryVendor: BuilderVendorId;
  claudeExecutionMode: SekuriClaudeExecutionMode;
  multiVendorRoutingEnabled: boolean;
  selectedVendorIds: BuilderVendorId[];
  complexity: SekuriComplexity | null;
}

export interface BuilderModelSelectionStore extends BuilderModelSelectionConfig {
  open: boolean;
  openModal: (complexity: SekuriComplexity) => void;
  closeModal: () => void;
  setPrimaryVendor: (vendor: BuilderVendorId) => void;
  setClaudeExecutionMode: (mode: SekuriClaudeExecutionMode) => void;
  setMultiVendorRoutingEnabled: (enabled: boolean) => void;
  toggleVendor: (vendor: BuilderVendorId) => void;
  reset: () => void;
}

const INITIAL: BuilderModelSelectionConfig = {
  primaryVendor: 'anthropic',
  claudeExecutionMode: 'terminal_spawn',
  multiVendorRoutingEnabled: false,
  selectedVendorIds: ['anthropic'],
  complexity: null,
};

export const useBuilderModelSelectionStore = create<BuilderModelSelectionStore>()(
  subscribeWithSelector((set, get) => ({
    ...INITIAL,
    open: false,
    openModal: (complexity) =>
      set({
        open: true,
        complexity,
        // Re-seed selectedVendorIds with anthropic as default primary,
        // honoring the locked Anthropic-only shipped runtime invariant.
        primaryVendor: 'anthropic',
        selectedVendorIds: ['anthropic'],
      }),
    closeModal: () => set({ open: false }),
    setPrimaryVendor: (vendor) => {
      const { selectedVendorIds, multiVendorRoutingEnabled } = get();
      const next = new Set(selectedVendorIds);
      next.add(vendor);
      // When routing is single-vendor, primary replaces the whole set.
      const arr = multiVendorRoutingEnabled
        ? Array.from(next)
        : [vendor];
      set({ primaryVendor: vendor, selectedVendorIds: arr });
    },
    setClaudeExecutionMode: (mode) => set({ claudeExecutionMode: mode }),
    setMultiVendorRoutingEnabled: (enabled) => {
      if (enabled) {
        set({ multiVendorRoutingEnabled: true });
        return;
      }
      // Collapse selection back to primary when routing turns off.
      const { primaryVendor } = get();
      set({
        multiVendorRoutingEnabled: false,
        selectedVendorIds: [primaryVendor],
      });
    },
    toggleVendor: (vendor) => {
      const {
        selectedVendorIds,
        multiVendorRoutingEnabled,
        primaryVendor,
      } = get();
      if (!multiVendorRoutingEnabled) return;
      // Primary vendor cannot be removed from the selected set.
      if (vendor === primaryVendor) return;
      const present = selectedVendorIds.includes(vendor);
      const next = present
        ? selectedVendorIds.filter((id) => id !== vendor)
        : [...selectedVendorIds, vendor];
      set({ selectedVendorIds: next });
    },
    reset: () => set({ ...INITIAL, open: false }),
  })),
);
