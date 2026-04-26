'use client';
//
// src/components/game/GameShell.tsx
//
// Client-side wrapper that hosts the dynamic PhaserCanvas import and the
// lean React HUD layer (Gate 5 REVISED per Helios-v2 W3 S11). Per Gate 5
// REVISED, `/play` is a full in-game pixel art experience with ZERO visible
// React HUD. The HUD chrome (chat, dialogue, quest tracker, inventory,
// shop, pipeline viz) now lives entirely inside the Phaser UIScene
// (Boreas chat) + per-scene landmark interactions + in-Phaser dialogue
// overlays.
//
// Mounted React-side artifacts on /play:
//   1. PhaserCanvas: the full-viewport Phaser game.
//   2. QuestBootstrap: NON-VISUAL hydration of quest store from session
//      storage on first paint.
//   3. GameHUDLean: BusBridge (non-visual event-bus translator) +
//      TierBadge (P6 Marshall pricing tier badge top-right).
//
// All other HUD components remain in src/components/hud/ as files for
// future re-use OR opt-in mount on non-/play routes; they are NOT mounted
// here.
//

import dynamic from 'next/dynamic';
import GameHUDLean from '../hud/GameHUDLean';
import QuestBootstrap from './QuestBootstrap';

const PhaserCanvas = dynamic(() => import('./PhaserCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-background text-sm text-foreground/60">
      Loading game engine...
    </div>
  ),
});

export default function GameShell() {
  return (
    <div
      className="relative h-dvh w-dvw overflow-hidden bg-background text-foreground"
      data-hud-role="game-shell"
    >
      <div className="absolute inset-0" data-hud-role="phaser-host">
        <PhaserCanvas />
      </div>
      <QuestBootstrap />
      <GameHUDLean />
    </div>
  );
}
