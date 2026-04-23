'use client';
//
// src/components/game/GameShell.tsx
//
// Client-side wrapper that hosts the dynamic PhaserCanvas import and layers
// Erato-v2's React HUD over the canvas. The Phaser container fills the
// entire viewport; HUD siblings are absolute overlays managed by
// `GameHUD` (TopBar, SideBar, BottomBar, overlays, toasts, BusBridge).
//
// The HUD component uses `pointer-events-none` on the outer wrapper and
// `pointer-events-auto` on individual chrome so game input (mouse,
// keyboard) continues to reach the Phaser canvas through empty HUD gaps.
//
// React HUD boundary (hard stop per Erato-v2 Section "Strategic Decision
// Hard Stops"): NO React component is rendered inside the Phaser canvas.
// Every HUD element sits in this layer, not inside scenes.
//

import dynamic from 'next/dynamic';
import GameHUD from '../hud/GameHUD';

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
      <GameHUD />
    </div>
  );
}
