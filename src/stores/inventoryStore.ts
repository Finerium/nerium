//
// src/stores/inventoryStore.ts
//
// Erato-v2 authored module. Re-exports the contract-authoritative
// `useInventoryStore` from `src/state/stores.ts` so HUD components under
// `src/components/hud/*` can import via the `src/stores/` convention used
// by Nyx (`questStore`) and Linus (`dialogueStore`).
//
// Contract: docs/contracts/game_state.contract.md v0.1.0 Section 3.3.
// Per-store authority: Erato-v2 (surface). Shape authority: Pythia-v2.
//

'use client';

export { useInventoryStore } from '../state/stores';
export type { InventoryStore } from '../state/stores';
