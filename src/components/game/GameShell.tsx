'use client';
//
// src/components/game/GameShell.tsx
//
// Client-side wrapper that hosts the dynamic PhaserCanvas import and leaves
// grid cells for Erato-v2 HUD siblings. GameShell is the only file that
// should consume dynamic(import) for PhaserCanvas because it carries the
// "use client" marker required by Next 15 for dynamic({ ssr: false }).
//
// Layout grid:
//   row 1: TopBar          (Erato-v2 ships currency, quest tracker, model select)
//   row 2: SideBar | Phaser canvas
//   row 3: BottomBar       (Erato-v2 ships dialogue overlay + prompt input)
//
// In Session A the HUD cells render a minimal placeholder so judges see a
// populated frame even before Erato-v2 W3 ships the full HUD.
//

import dynamic from 'next/dynamic';

const PhaserCanvas = dynamic(() => import('./PhaserCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
      Loading game engine...
    </div>
  ),
});

export default function GameShell() {
  return (
    <div className="grid h-dvh w-dvw grid-cols-[16rem_1fr] grid-rows-[3rem_1fr_4rem] bg-zinc-950 text-zinc-100">
      <header className="col-span-2 flex items-center justify-between border-b border-zinc-800 bg-zinc-900/90 px-4 text-sm">
        <span className="font-mono font-semibold tracking-wide">NERIUM</span>
        <span className="font-mono text-xs text-zinc-400">
          Apollo Village (vertical slice)
        </span>
        <span className="font-mono text-xs text-zinc-500">Built with Opus 4.7</span>
      </header>
      <aside className="row-span-1 border-r border-zinc-800 bg-zinc-900/60 p-3 text-xs leading-relaxed">
        <p className="mb-2 font-mono text-zinc-300">Controls</p>
        <ul className="space-y-1 font-mono text-zinc-500">
          <li>Arrow keys or WASD to move</li>
          <li>E to interact with NPC</li>
          <li>Click caravan when unlocked</li>
        </ul>
      </aside>
      <main className="relative overflow-hidden bg-black">
        <PhaserCanvas />
      </main>
      <footer className="col-span-2 flex items-center justify-between border-t border-zinc-800 bg-zinc-900/90 px-4 text-xs text-zinc-400">
        <span className="font-mono">Dialogue, prompt input, inventory: HUD ships in W3</span>
        <span className="font-mono text-zinc-500">
          React HUD boundary locked per game_state.contract.md
        </span>
      </footer>
    </div>
  );
}
