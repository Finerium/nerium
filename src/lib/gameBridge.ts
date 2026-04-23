//
// src/lib/gameBridge.ts
//
// Re-export shim so callers using the M2 Section 4.4 `@/lib/gameBridge`
// convention resolve to the Pythia-v2 contract-authoritative bridge module
// at src/state/gameBridge.ts (contract file path wins per
// docs/contracts/zustand_bridge.contract.md Section 6).
//

'use client';

export { wireBridge, BridgeAlreadyWiredError } from '../state/gameBridge';
export type { GameBridge } from '../state/gameBridge';
