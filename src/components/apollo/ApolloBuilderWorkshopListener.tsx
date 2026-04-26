'use client';

//
// src/components/apollo/ApolloBuilderWorkshopListener.tsx
//
// Sekuri integration: bus event listener that bridges the Helios W3 S7
// `game.landmark.interact` emission (with landmarkName ===
// 'builder_workshop') from the Phaser scene side onto the React-side
// Apollo Builder Workshop dialogue overlay.
//
// Listener strategy (defensive, two paths):
//
//   1. Window event path. Subscribes to `__NERIUM_GAME_EVENT__` window
//      CustomEvent. The hudBus -> bus -> window dispatch fallback path
//      already works for HUD-originated events. Phaser-originated bus
//      events are forwarded via the gameBridge mirror added below.
//   2. Bus polling path. On mount, polls for `window.__NERIUM_GAME_BUS__`
//      to be exposed (gameBridge handoff). When found, subscribes
//      directly via bus.on('game.landmark.interact', ...). Polling stops
//      after first hit OR after 5 seconds of no bus.
//
// On match, calls `useApolloBuilderDialogueStore.openWorkshop()`. The
// store is idempotent on already-open phases per its state machine.
//
// This component renders nothing. Mount once near the root of the /play
// route HUD (GameHUDLean).
//
// No em dash, no emoji.
//

import { useEffect } from 'react';

import { useApolloBuilderDialogueStore } from '../../stores/apolloBuilderDialogueStore';

interface BusLike {
  on?: (
    topic: string,
    handler: (payload: unknown) => void,
  ) => () => void;
}

interface LandmarkPayload {
  landmarkName?: unknown;
  sceneKey?: unknown;
}

function isBuilderWorkshopPayload(payload: unknown): payload is { landmarkName: 'builder_workshop' } {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as LandmarkPayload;
  return p.landmarkName === 'builder_workshop';
}

export function ApolloBuilderWorkshopListener(): null {
  const openWorkshop = useApolloBuilderDialogueStore((s) => s.openWorkshop);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleWindowEvent = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as
        | { topic?: unknown; payload?: unknown }
        | undefined;
      if (!detail) return;
      if (detail.topic !== 'game.landmark.interact') return;
      if (isBuilderWorkshopPayload(detail.payload)) {
        openWorkshop();
      }
    };

    // Direct CustomEvent emission shape used by the BusBridge fallback path.
    const handleDirectEvent = (evt: Event) => {
      const ce = evt as CustomEvent;
      if (isBuilderWorkshopPayload(ce.detail)) {
        openWorkshop();
      }
    };

    window.addEventListener('__NERIUM_GAME_EVENT__', handleWindowEvent);
    window.addEventListener(
      'nerium.apollo.builder_workshop.interact',
      handleDirectEvent,
    );

    // Bus polling path. The gameBridge handoff exposes the bus via
    // window.__NERIUM_GAME_BUS__ when wireBridge runs. Subscribe once
    // available and keep a disposer for unmount cleanup.
    let busDispose: (() => void) | null = null;
    let cancelled = false;

    const tryAttachBus = () => {
      if (cancelled || busDispose) return;
      const bus = (window as unknown as { __NERIUM_GAME_BUS__?: BusLike })
        .__NERIUM_GAME_BUS__;
      if (!bus || typeof bus.on !== 'function') return;
      busDispose = bus.on('game.landmark.interact', (payload) => {
        if (isBuilderWorkshopPayload(payload)) {
          openWorkshop();
        }
      });
    };

    tryAttachBus();

    let pollIntervalId: number | null = null;
    let pollTimeoutId: number | null = null;
    if (!busDispose) {
      pollIntervalId = window.setInterval(() => {
        tryAttachBus();
        if (busDispose && pollIntervalId !== null) {
          window.clearInterval(pollIntervalId);
          pollIntervalId = null;
        }
      }, 500);
      pollTimeoutId = window.setTimeout(() => {
        if (pollIntervalId !== null) {
          window.clearInterval(pollIntervalId);
          pollIntervalId = null;
        }
      }, 5000);
    }

    return () => {
      cancelled = true;
      window.removeEventListener('__NERIUM_GAME_EVENT__', handleWindowEvent);
      window.removeEventListener(
        'nerium.apollo.builder_workshop.interact',
        handleDirectEvent,
      );
      if (busDispose) {
        try {
          busDispose();
        } catch {
          // ignore disposer errors
        }
        busDispose = null;
      }
      if (pollIntervalId !== null) window.clearInterval(pollIntervalId);
      if (pollTimeoutId !== null) window.clearTimeout(pollTimeoutId);
    };
  }, [openWorkshop]);

  return null;
}

export default ApolloBuilderWorkshopListener;
