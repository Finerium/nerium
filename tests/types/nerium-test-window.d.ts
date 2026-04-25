// tests/types/nerium-test-window.d.ts
//
// Centralized augmentation of `Window.__NERIUM_TEST__` (plus a handful of
// dev probes such as `__nerium_chatStore__`, `__nerium_game__`, the
// `__NERIUM_MODEL_PREF__` mirror, and the `__NERIUM_BUS_COLLECTOR__` bus
// trace consumed by the e2e suite) for the Playwright surface. Authored
// by Boreas W3 to consolidate the per-spec `declare global` blocks that
// were drifting across the test surface (phaser-smoke baseline,
// lumio_quest cinematic fields, chat scaffold uiSceneReady, etc.).
//
// All Playwright specs reference this superset via the project tsconfig
// include glob, so they no longer redeclare Window in their own files.
// New cross-cutting probe surface should be added here rather than
// per-spec to keep the merge contract clean.

export {};

declare global {
  interface Window {
    __NERIUM_TEST__?: {
      phaserMounted?: boolean;
      ready?: boolean;
      uiSceneReady?: boolean;
      activeSceneKey?: string;
      worldId?: string;
      cinematicPlaying?: boolean;
      cinematicKey?: string;
      cinematicLastCompletedKey?: string;
      cinematicLastDurationMs?: number;
    };

    // Dev probes exposed by the chat scaffold (Boreas W3) and consumed by
    // Playwright tests under tests/chat/. Typed as unknown to avoid leaking
    // implementation details into the test surface.
    __nerium_chatStore__?: unknown;
    __nerium_game__?: unknown;
    __NERIUM_MODEL_PREF__?: string;

    // Bus trace collector populated by the e2e BusBridge probe and
    // consumed by tests/e2e/* assertions on dialogue / quest / inventory
    // events.
    __NERIUM_BUS_COLLECTOR__?: Array<{ topic: string; payload?: unknown; at: number }>;
  }
}
