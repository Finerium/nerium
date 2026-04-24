'use client';

//
// src/components/hud/GameHUD.tsx
//
// Aggregator for every React HUD element. Consumed by `GameShell` as the
// single mount point above / beside the `PhaserCanvas`. This file composes
// cross-pillar slots (Nyx QuestTracker, Linus DialogueOverlay, Helios
// pipeline viz) via slot props so no direct cross-pillar imports creep into
// TopBar / BottomBar / SideBar (translator_notes gotcha 16).
//
// Layering (Tailwind grid within GameShell):
//
//   row 1 (top):    <TopBar questTrackerSlot>
//   row 2 (center): Phaser canvas area <-> <SideBar>
//   row 3 (bottom): <BottomBar dialogueSlot promptInputSlot>
//
// Overlay elements (ShopModal, InventoryToast) are absolutely positioned
// over the whole viewport. BusBridge is rendered once, above the visible
// HUD, to own the window-level event translation.
//

import type { ReactNode } from 'react';

import BusBridge from '../BusBridge';
import TopBar from './TopBar';
import BottomBar from './BottomBar';
import SideBar from './SideBar';
import PromptInputChallenge from './PromptInputChallenge';
import InventoryToast from './InventoryToast';
import ShopModal from './ShopModal';
import ApolloStream from './ApolloStream';
import { HeliosPipelineViz } from './ported/HeliosPipelineViz';
import { QuestTracker } from '../game/QuestTracker';
import { DialogueOverlay } from '../game/DialogueOverlay';
import TierBadge from './TierBadge';

export interface GameHUDProps {
  volumeSliderSlot?: ReactNode;
  minimapSlot?: ReactNode;
}

export function GameHUD({ volumeSliderSlot, minimapSlot }: GameHUDProps) {
  return (
    <>
      <BusBridge />
      <div
        className="pointer-events-none absolute inset-0 z-30 grid grid-rows-[auto_1fr_auto] grid-cols-[1fr_auto]"
        data-hud-role="game-hud-root"
      >
        <div className="col-span-2 row-start-1 pointer-events-auto">
          <TopBar
            questTrackerSlot={<QuestTracker />}
            minimapSlot={minimapSlot}
            tierBadgeSlot={<TierBadge />}
          />
        </div>
        <div
          className="col-start-1 row-start-2 pointer-events-none"
          aria-hidden="true"
        />
        <div className="col-start-2 row-start-2 h-full pointer-events-auto">
          <SideBar
            pipelineVizSlot={
              <HeliosPipelineViz
                pipeline_run_id="hud-idle"
                nodes={[]}
                edges={[]}
                view_mode="compact"
                consoleDeepLinks={{}}
                showConfidenceOverlay={false}
                width={260}
                height={180}
              />
            }
            volumeSliderSlot={volumeSliderSlot}
            extraSlot={<ApolloStream />}
          />
        </div>
        <div className="col-span-2 row-start-3 pointer-events-auto">
          <BottomBar
            dialogueSlot={<DialogueOverlay />}
            promptInputSlot={<PromptInputChallenge />}
          />
        </div>
      </div>
      <InventoryToast />
      <ShopModal />
    </>
  );
}

export default GameHUD;
