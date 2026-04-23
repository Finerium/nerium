'use client';

//
// src/components/BusBridge.tsx
//
// Top-level translator. Mount once near the root of `GameShell`, above every
// HUD sibling. The component renders nothing; it subscribes in `useEffect`
// and cleans up on unmount.
//
// Scope (per translator_notes gotcha 5 + zustand-bridge SKILL Section
// "BusBridge Forwarding Component"):
//
//   1. Listen on `window` for `__NERIUM_GAME_EVENT__` CustomEvents. Those
//      originate from Linus `emitDialogueEvent` and Erato-v2 `emitBusEvent`
//      when `window.__NERIUM_GAME_BUS__` is not yet exposed by
//      PhaserCanvas.
//   2. Translate a curated subset of topics into Zustand store actions:
//        - `game.shop.open` / `game.shop.close` toggle `useUIStore.shopOpen`.
//        - `game.inventory.opened` sets `useUIStore.inventoryPanelOpen`.
//        - `game.quest.trigger_requested` forwards to
//          `useQuestStore.fireTrigger` (HUD-originated trigger requests).
//        - `game.dialogue.challenge_submitted` mirrors the prompt into
//          `useQuestStore.recordPromptSubmission`.
//        - `game.cinematic.start` / `game.cinematic.complete` toggle the
//          UI cinematic flag.
//        - `game.ui.overlay_changed` echoes into the UI store so HUD
//          surfaces re-render coherently.
//   3. Emit a best-effort DOM-level acknowledgement via `data-*` attribute
//      on the document body so Playwright smoke tests can wait on state
//      changes without introspecting Zustand internals.
//
// This component does NOT talk to Phaser directly. Phaser-to-Zustand wiring
// lives inside `wireBridge` at `src/state/gameBridge.ts` and runs inside
// PhaserCanvas. BusBridge is the React-side counterpart that closes the
// loop for UI-only events that do not need to cross the Phaser boundary.
//

import { useEffect } from 'react';

import { useUIStore } from '../stores/uiStore';
import { useQuestStore } from '../stores/questStore';
import type { Trigger } from '../data/quests/_schema';

interface EventEnvelope {
  topic: string;
  payload?: Record<string, unknown>;
}

function readEnvelope(evt: Event): EventEnvelope | null {
  const detail = (evt as CustomEvent).detail;
  if (!detail || typeof detail !== 'object') return null;
  const maybeTopic = (detail as { topic?: unknown }).topic;
  if (typeof maybeTopic !== 'string') return null;
  const payload = (detail as { payload?: unknown }).payload;
  return {
    topic: maybeTopic,
    payload:
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined,
  };
}

function tagBodyState(key: string, value: string): void {
  if (typeof document === 'undefined') return;
  try {
    document.body.dataset[`neriumHud${key}`] = value;
  } catch {
    // no-op: attribute write is best-effort for E2E observability
  }
}

export function BusBridge(): null {
  useEffect(() => {
    const uiStore = useUIStore;
    const questStore = useQuestStore;

    const handle = (evt: Event) => {
      const env = readEnvelope(evt);
      if (!env) return;
      const payload = env.payload ?? {};

      switch (env.topic) {
        case 'game.shop.open': {
          if (!uiStore.getState().shopOpen) uiStore.getState().toggleShop();
          tagBodyState('ShopOpen', 'true');
          break;
        }
        case 'game.shop.close': {
          if (uiStore.getState().shopOpen) uiStore.getState().toggleShop();
          tagBodyState('ShopOpen', 'false');
          break;
        }
        case 'game.inventory.opened': {
          if (!uiStore.getState().inventoryPanelOpen) {
            uiStore.getState().toggleInventoryPanel();
          }
          tagBodyState('InventoryOpen', 'true');
          break;
        }
        case 'game.ui.overlay_changed': {
          const next = payload.next as 'dialogue' | 'shop' | 'inventory' | 'quest_log' | 'cinematic' | null | undefined;
          uiStore.getState().setOverlay(next ?? null);
          tagBodyState('Overlay', String(next ?? 'none'));
          break;
        }
        case 'game.cinematic.start': {
          const key = typeof payload.key === 'string' ? payload.key : 'unknown';
          uiStore.getState().startCinematic(key);
          tagBodyState('Cinematic', key);
          break;
        }
        case 'game.cinematic.complete':
        case 'game.cinematic.abort': {
          uiStore.getState().endCinematic();
          tagBodyState('Cinematic', 'none');
          break;
        }
        case 'game.quest.trigger_requested': {
          const trigger = payload.trigger as Trigger | undefined;
          if (!trigger || typeof trigger.type !== 'string') break;
          const value = typeof payload.value === 'string' ? payload.value : undefined;
          questStore.getState().fireTrigger(trigger, value);
          break;
        }
        case 'game.dialogue.challenge_submitted': {
          const slotId = typeof payload.slotId === 'string' ? payload.slotId : null;
          const value = typeof payload.value === 'string' ? payload.value : null;
          if (slotId && value !== null) {
            questStore.getState().recordPromptSubmission(slotId, value);
          }
          break;
        }
        case 'nerium.ui.model_changed':
        case 'nerium.ui.language_changed':
        default:
          break;
      }
    };

    window.addEventListener('__NERIUM_GAME_EVENT__', handle);
    return () => window.removeEventListener('__NERIUM_GAME_EVENT__', handle);
  }, []);

  return null;
}

export default BusBridge;
