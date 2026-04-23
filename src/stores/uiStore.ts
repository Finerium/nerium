//
// src/stores/uiStore.ts
//
// Erato-v2 authored module. Owner of the React HUD uiStore surface per
// docs/contracts/game_state.contract.md v0.1.0 Section 3.4.
//
// Two exports live here:
//
//   1. `useUIStore` re-exported from the contract-authoritative store
//      created by Thalia-v2 in `src/state/stores.ts`. The shape is locked
//      by Pythia-v2; Erato-v2 owns the consumer surface but does NOT
//      mutate the interface. Downstream HUD components import from this
//      path for symmetry with `useQuestStore` (Nyx) and `useDialogueStore`
//      (Linus) which also live under `src/stores/`.
//
//   2. `useUIPreferencesStore`, a separate non-contract Zustand store
//      that holds sticky user preferences: `sidebarCollapsed`, `language`,
//      and `modelChoice`. These fields are user-preference domain, not
//      game-state domain, and are therefore out-of-scope of
//      game_state.contract.md Section 4 "no sixth store" clause. The
//      contract governs the five game-state stores (quest, dialogue,
//      inventory, ui, audio). Preferences sit alongside.
//
// See docs/erato-v2.decisions.md ADR-0001 for the separation rationale.
//

'use client';

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export { useUIStore } from '../state/stores';
export type { UIStore } from '../state/stores';

// ---------- Preferences domain (out of game_state.contract.md scope) ----------

export type Locale = 'en-US' | 'id-ID';

/**
 * Model options are LIMITED to Opus 4.7 plus Sonnet 4.6 per CLAUDE.md
 * anti-pattern 7 amended. Multi-vendor strategies (Gemini, Higgsfield, Auto)
 * are a UI feature spec stubbed post-hackathon per NarasiGhaisan Section 3.
 * Adding a third option is a strategic hard stop (Erato-v2 Section
 * "Strategic Decision Hard Stops").
 */
export type ModelChoice = 'opus-4-7' | 'sonnet-4-6';

export interface UIPreferencesStore {
  sidebarCollapsed: boolean;
  language: Locale;
  modelChoice: ModelChoice;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setLanguage: (language: Locale) => void;
  toggleLanguage: () => void;
  setModelChoice: (choice: ModelChoice) => void;
}

const STORAGE_KEY = 'nerium:ui-preferences';

interface PersistedShape {
  sidebarCollapsed: boolean;
  language: Locale;
  modelChoice: ModelChoice;
}

function readPersisted(): Partial<PersistedShape> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed;
  } catch (err) {
    console.warn('[uiPreferences] localStorage read failed', err);
    return {};
  }
}

function writePersisted(shape: PersistedShape): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
  } catch (err) {
    console.warn('[uiPreferences] localStorage write failed', err);
  }
}

const persisted = readPersisted();

export const useUIPreferencesStore = create<UIPreferencesStore>()(
  subscribeWithSelector((set, get) => ({
    sidebarCollapsed: persisted.sidebarCollapsed ?? false,
    language: persisted.language ?? 'en-US',
    modelChoice: persisted.modelChoice ?? 'opus-4-7',
    setSidebarCollapsed: (collapsed) => {
      set({ sidebarCollapsed: collapsed });
      const s = get();
      writePersisted({
        sidebarCollapsed: collapsed,
        language: s.language,
        modelChoice: s.modelChoice,
      });
    },
    toggleSidebar: () => {
      const next = !get().sidebarCollapsed;
      get().setSidebarCollapsed(next);
    },
    setLanguage: (language) => {
      set({ language });
      const s = get();
      writePersisted({
        sidebarCollapsed: s.sidebarCollapsed,
        language,
        modelChoice: s.modelChoice,
      });
    },
    toggleLanguage: () => {
      const next: Locale = get().language === 'en-US' ? 'id-ID' : 'en-US';
      get().setLanguage(next);
    },
    setModelChoice: (modelChoice) => {
      set({ modelChoice });
      const s = get();
      writePersisted({
        sidebarCollapsed: s.sidebarCollapsed,
        language: s.language,
        modelChoice,
      });
    },
  })),
);
