'use client';
//
// src/components/game/PhaserCanvas.tsx
//
// The single place Phaser is imported at top level. This file is reached
// exclusively through a dynamic import with { ssr: false } inside the
// Client-Component wrapper GameShell. Any attempt to import PhaserCanvas
// from a Server Component or top-level layout will crash at build because
// Phaser touches window synchronously on import.
//
// Lifecycle contract per zustand_bridge.contract.md and M1 Section 5.2:
//   1. useEffect gates on gameRef.current to neutralize React 18/19 Strict
//      Mode double mount.
//   2. wireBridge runs after game construction and before scene start.
//   3. Cleanup runs teardown() then game.destroy(true) in that order; the
//      bridge disposes Zustand subscriptions BEFORE Phaser tears down its
//      event emitter, preserving handler unregistration.
//
// Strict Mode guarantee: only one Phaser.Game instance exists at any time.
//

import { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';
import { BootScene } from '../../game/scenes/BootScene';
import { PreloadScene } from '../../game/scenes/PreloadScene';
import { ApolloVillageScene } from '../../game/scenes/ApolloVillageScene';
import { MiniBuilderCinematicScene } from '../../game/scenes/MiniBuilderCinematicScene';
import { wireBridge, type GameBridge } from '../../state/gameBridge';

export default function PhaserCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const bridgeRef = useRef<GameBridge | null>(null);

  useEffect(() => {
    // Strict Mode double-mount guard: if a Phaser.Game instance is already
    // alive for this mount slot, the second Strict Mode invocation must
    // NOT construct a second one.
    if (gameRef.current || !containerRef.current) return;

    const container = containerRef.current;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      backgroundColor: '#0b0f19',
      pixelArt: true,
      antialias: false,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: '100%',
        height: '100%',
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false,
        },
      },
      // MiniBuilderCinematicScene is registered at construction but does
      // not auto-start: BootScene -> PreloadScene -> ApolloVillageScene is
      // the normal boot chain. The cinematic is launched on demand by
      // gameBridge in response to the quest effect `play_cinematic`.
      scene: [BootScene, PreloadScene, ApolloVillageScene, MiniBuilderCinematicScene],
    });

    gameRef.current = game;
    const bridge = wireBridge(game);
    bridgeRef.current = bridge;

    // Expose for Playwright smoke test per gotcha 5 (__NERIUM_TEST_* hook).
    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>;
      const existing = (w.__NERIUM_TEST__ ?? {}) as Record<string, unknown>;
      w.__NERIUM_TEST__ = {
        ...existing,
        phaserMounted: true,
      };
    }

    return () => {
      // Disposal order matters: tear down bridge subscriptions first so
      // Zustand does not fire into a half-destroyed game; then destroy the
      // Phaser game which clears its EventEmitter and WebGL context.
      try {
        bridgeRef.current?.teardown();
      } catch (err) {
        console.error('[PhaserCanvas] bridge teardown threw', err);
      }
      bridgeRef.current = null;

      try {
        game.destroy(true);
      } catch (err) {
        console.error('[PhaserCanvas] game.destroy(true) threw', err);
      }
      gameRef.current = null;

      if (typeof window !== 'undefined') {
        const w = window as unknown as Record<string, unknown>;
        const existing = (w.__NERIUM_TEST__ ?? {}) as Record<string, unknown>;
        w.__NERIUM_TEST__ = { ...existing, phaserMounted: false };
      }
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 overflow-hidden" />;
}
