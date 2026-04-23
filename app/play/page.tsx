//
// app/play/page.tsx
//
// Server Component entry point for the full-viewport Phaser game takeover
// per RV.1 (Builder pivot: game beneran, bukan game-themed dashboard).
//
// Path audit per gotcha 19: the active Next.js App Router lives at project
// root `app/`, not `src/app/`. M2 Section 4.4 listed `src/app/play/page.tsx`
// as a convention guide, but the concrete router structure committed in V3
// scaffold places pages at project root. This page ships at the actual
// router location. Decision logged in docs/thalia-v2.decisions.md.
//
// This Server Component intentionally contains no Phaser or window access;
// GameShell is a Client Component and is the earliest file in the chain
// permitted to dynamic-import PhaserCanvas.
//

import GameShell from '../../src/components/game/GameShell';

export const metadata = {
  title: 'NERIUM | Apollo Village',
  description:
    'NERIUM Builder playable prototype. Apollo Village is the main lobby of the multi-world RPG that automates the manual agent-orchestration workflow NERIUM itself was built on.',
};

export default function PlayPage() {
  return <GameShell />;
}
