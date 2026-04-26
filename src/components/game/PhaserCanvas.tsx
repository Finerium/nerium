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

import { useCallback, useEffect, useRef } from 'react';
import * as Phaser from 'phaser';
import { BootScene } from '../../game/scenes/BootScene';
import { PreloadScene } from '../../game/scenes/PreloadScene';
import { TitleScene } from '../../game/scenes/TitleScene';
import { LoadingScene } from '../../game/scenes/LoadingScene';
import { ApolloVillageScene } from '../../game/scenes/ApolloVillageScene';
import { ApolloTempleInteriorScene } from '../../game/scenes/ApolloTempleInteriorScene';
import { ApolloMarketplaceBazaarScene } from '../../game/scenes/ApolloMarketplaceBazaarScene';
import { ApolloOasisScene } from '../../game/scenes/ApolloOasisScene';
import { CaravanRoadScene } from '../../game/scenes/CaravanRoadScene';
import { CaravanWayhouseInteriorScene } from '../../game/scenes/CaravanWayhouseInteriorScene';
import { CaravanForestCrossroadScene } from '../../game/scenes/CaravanForestCrossroadScene';
import { CaravanMountainPassScene } from '../../game/scenes/CaravanMountainPassScene';
import { CyberpunkShanghaiScene } from '../../game/scenes/CyberpunkShanghaiScene';
import { CyberSkyscraperLobbyScene } from '../../game/scenes/CyberSkyscraperLobbyScene';
import { CyberRooftopScene } from '../../game/scenes/CyberRooftopScene';
import { CyberUndergroundAlleyScene } from '../../game/scenes/CyberUndergroundAlleyScene';
import { CyberServerRoomScene } from '../../game/scenes/CyberServerRoomScene';
import { MiniBuilderCinematicScene } from '../../game/scenes/MiniBuilderCinematicScene';
import { UIScene } from '../../game/scenes/UIScene';
import { wireBridge, type GameBridge } from '../../state/gameBridge';
import { useFocusArbitration } from '../../lib/focusArbitration';

export default function PhaserCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const bridgeRef = useRef<GameBridge | null>(null);

  // Boreas NP W3 Session 1: focus arbitration hook reads the live Phaser.Game
  // instance through this getter. The hook is called unconditionally on every
  // render; the getter lets it observe gameRef.current after it is assigned in
  // useEffect below, avoiding a useEffect-inside-useEffect chain.
  const getGame = useCallback(() => gameRef.current, []);
  useFocusArbitration(getGame);

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
      // Boreas NP W3 Session 1: enable Phaser DOMElement container so the
      // chat UIScene can mount native <input type="text"> elements above
      // the canvas. Without this flag, scene.add.dom() returns a no-op and
      // the Minecraft chat surface cannot host its IME-aware input.
      // Cross-ref: docs/contracts/chat_ui.contract.md Section 4.2.
      dom: {
        createContainer: true,
      },
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
      // CaravanRoadScene + CyberpunkShanghaiScene + MiniBuilderCinematicScene
      // are registered at construction but do not auto-start: BootScene ->
      // PreloadScene -> ApolloVillageScene is the normal boot chain.
      // CaravanRoad and CyberpunkShanghai are started by the scene transition
      // manager (Helios-v2 S7 wiring) when the quest engine fires the
      // scene_transition effect; the cinematic launches on play_cinematic.
      //
      // Helios-v2 W3 S5: ApolloTempleInteriorScene + ApolloMarketplaceBazaarScene
      // + ApolloOasisScene are sub-area scenes reachable from
      // ApolloVillageScene via the dual-path landmark choice prompt
      // (Marketplace Stall, Trust Shrine) or future S7 landmark interaction
      // (Temple Interior). Registered here so scene.start() can resolve them
      // at sub-area entry. They do not auto-start.
      //
      // Helios-v2 W3 S6: 7 additional sub-area scenes (3 Caravan + 4 Cyber)
      // ship for narrative depth. Caravan Wayhouse Interior + Caravan Forest
      // Crossroad + Caravan Mountain Pass extend the Caravan world; Cyber
      // Skyscraper Lobby + Cyber Rooftop + Cyber Underground Alley + Cyber
      // Server Room extend the Cyberpunk Shanghai world. Sub-area scenes
      // register here so scene.start() can resolve them; main-scene wire-up
      // (E-key proximity entry triggers + dual-path prompts) ships in S7.
      // For S6 testability the new scenes are reachable via debug-only
      // __nerium_game__.scene.start mirroring the S5 ApolloTempleInterior
      // precedent.
      //
      // UIScene is the persistent overlay that hosts the Minecraft chat-style
      // chrome (Boreas NP W3). BootScene launches it (scene.launch + bringToTop)
      // post-preload; it survives every world scene transition.
      scene: [
        BootScene,
        PreloadScene,
        // Helios-v2 W3 S10: TitleScene + LoadingScene registered here for
        // demo entry + inter-world transitions. Neither auto-starts; the
        // default boot chain remains BootScene -> PreloadScene -> ApolloVillage.
        // TitleScene is reached via /play?title=1 OR scene.start('Title').
        // LoadingScene is invoked via scene.start('Loading', { nextSceneKey,
        // transitionImageKey?, ... }) for cinematic inter-world fade.
        TitleScene,
        LoadingScene,
        ApolloVillageScene,
        ApolloTempleInteriorScene,
        ApolloMarketplaceBazaarScene,
        ApolloOasisScene,
        CaravanRoadScene,
        CaravanWayhouseInteriorScene,
        CaravanForestCrossroadScene,
        CaravanMountainPassScene,
        CyberpunkShanghaiScene,
        CyberSkyscraperLobbyScene,
        CyberRooftopScene,
        CyberUndergroundAlleyScene,
        CyberServerRoomScene,
        MiniBuilderCinematicScene,
        UIScene,
      ],
    });

    gameRef.current = game;
    const bridge = wireBridge(game);
    bridgeRef.current = bridge;

    // Helios-v2 W3 S10: optional TitleScene entry via /play?title=1 query
    // string OR window flag __NERIUM_TITLE_SCREEN__ === true. When set, the
    // game starts with TitleScene; on Press Start, it transitions to Preload
    // -> ApolloVillage as usual. Default boot chain unchanged.
    if (typeof window !== 'undefined') {
      const search =
        typeof window.location?.search === 'string'
          ? window.location.search
          : '';
      const wantsTitle =
        search.includes('title=1') ||
        (window as unknown as { __NERIUM_TITLE_SCREEN__?: boolean }).__NERIUM_TITLE_SCREEN__ === true;
      if (wantsTitle) {
        // Defer to next tick so the Phaser internal scene queue is ready;
        // BootScene preload may emit COMPLETE before this hook runs.
        setTimeout(() => {
          if (game.scene.isActive('Boot')) {
            // BootScene still in preload; it will start Preload itself.
            // Override its handoff target by stopping Preload and starting
            // Title. The simplest robust path is to wait until Preload is
            // active, stop it, and start Title.
          }
          // Force-start Title (Phaser's scene.start replaces the active set).
          try {
            game.scene.start('Title');
          } catch (err) {
            console.warn('[PhaserCanvas] TitleScene start failed', err);
          }
        }, 0);
      }
    }

    // Expose for Playwright smoke test per gotcha 5 (__NERIUM_TEST_* hook).
    // Also expose the Phaser game itself under __nerium_game__ so the
    // snapshot tests can jump scenes (caravan_road_smoke pattern), behind
    // a Helios-v2 W3 correction comment so production builds can scrub it
    // via the standard window-handle review.
    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>;
      const existing = (w.__NERIUM_TEST__ ?? {}) as Record<string, unknown>;
      w.__NERIUM_TEST__ = {
        ...existing,
        phaserMounted: true,
      };
      w.__nerium_game__ = game;
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
        delete w.__nerium_game__;
      }
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 overflow-hidden" />;
}
