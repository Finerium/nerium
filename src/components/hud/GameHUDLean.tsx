'use client';

//
// src/components/hud/GameHUDLean.tsx
//
// Helios-v2 W3 S11 (Gate 5 REVISED): minimal HUD layer for /play. Per Gate 5
// REVISED, the /play route is a full in-game pixel art experience with ZERO
// visible React HUD. The only React-side artifacts that ship on /play are:
//
//   1. BusBridge: NON-VISUAL. Translates Zustand store updates into game
//      event bus topics and vice versa. Required for Phaser <-> React state
//      sync (e.g. quest store, dialogue store, focus arbitration). Removing
//      this would break in-game UI scene coordination via Boreas.
//   2. TierBadge: P6 Marshall coordinate per S11 directive line "Boreas
//      tier badge HUD top-right verify P6 Marshall coordinate preserved".
//      This is an exception to "ZERO React HUD" because it is required for
//      cross-pillar visibility into the user's current pricing tier.
//
// Removed (preserved as files in src/components/hud/ for future reuse):
//   TopBar, SideBar, BottomBar, PromptInputChallenge, InventoryToast,
//   ShopModal, ApolloStream, QuestTracker, DialogueOverlay,
//   HeliosPipelineViz, ModelSelector, CurrencyDisplay.
//
// All in-game UI is now provided by the Phaser UIScene (Boreas chat) +
// landmark interactions + dialogue dispatched via the in-Phaser overlay
// system. The React HUD layer is no longer the source of HUD chrome.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import BusBridge from '../BusBridge';
import TierBadge from './TierBadge';

export default function GameHUDLean() {
  return (
    <>
      <BusBridge />
      {/* TierBadge anchored top-right via its own positioning; pointer-events
          flow through to canvas because TierBadge sets fixed-pos itself. */}
      <div
        className="pointer-events-none fixed inset-0 z-30"
        data-hud-role="game-hud-lean-root"
        aria-hidden="true"
      >
        <div className="pointer-events-auto absolute right-4 top-4">
          <TierBadge />
        </div>
      </div>
    </>
  );
}
