'use client';
//
// src/lib/focusArbitration.ts
//
// Focus arbitration FSM (Boreas NP W3 Session 1). Three-mode state machine
// per docs/contracts/chat_ui.contract.md Section 3.1 and M1 Research G.44.
//
// Modes:
//   - movement: WASD active, chat input blurred, world scenes receive
//     keyboard input.
//   - chat:     DOMElement focused, WASD disabled, world scenes receive
//     no keyboard input. T key opens; Esc closes.
//   - dialogue: 1-4 choice keys active, WASD + chat both disabled.
//
// The hook + getter both read from `useChatStore.getState().mode` so
// React HUD components (non-/play routes) and Phaser scenes share the same
// single source of truth without an explicit useGameStore.chatMode mirror.
//
// IMPORTANT: UIScene itself is exempt from disabling. Its DOMElement input
// needs Phaser keyboard plugin enabled to relay Esc + ArrowUp + ArrowDown
// while the world scenes are silenced.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import { useEffect } from 'react';
import { useChatStore, type ChatMode } from '../stores/chatStore';

/**
 * Detect whether the currently focused element is a text-entry surface that
 * should suppress Phaser world scene keyboard input.
 *
 * Captures: <input type="text|search|email|url|tel|password|number">,
 * <textarea>, [contenteditable="true"], any descendant of
 * [data-nerium-capture="true"].
 *
 * Per chat_ui.contract.md Section 4.3.
 */
export function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT') {
    const t = (el as HTMLInputElement).type;
    return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(t);
  }
  if (tag === 'TEXTAREA') return true;
  if (el.getAttribute('contenteditable') === 'true') return true;
  if (typeof (el as Element).closest === 'function' && el.closest('[data-nerium-capture="true"]')) {
    return true;
  }
  return false;
}

/**
 * Compute whether Phaser world scenes should receive keyboard input given
 * the active DOM focus + the chat mode FSM.
 *
 * Phaser world scenes are enabled iff:
 *   1. No text-entry element owns focus, AND
 *   2. chatStore.mode === 'movement'.
 *
 * UIScene is always enabled regardless of this output (callers exempt it).
 */
export function shouldEnableWorldKeyboard(activeElement: Element | null, mode: ChatMode): boolean {
  if (isTextEntry(activeElement)) return false;
  return mode === 'movement';
}

/**
 * Apply keyboard-enabled state to every Phaser world scene. UIScene is
 * exempted by its `key` matching the literal `UIScene` string.
 *
 * Bare-Phaser-typed argument so this module avoids a hard runtime import of
 * Phaser; the wireBridge call site passes its game handle.
 */
export function applyKeyboardArbitration(
  game: { scene: { scenes: ReadonlyArray<{ scene: { key: string }; input?: { keyboard?: { enabled: boolean } | null } }> } } | null,
  enableWorld: boolean,
): void {
  if (!game) return;
  const scenes = game.scene.scenes;
  for (const s of scenes) {
    if (s.scene.key === 'UIScene') continue;
    const kb = s.input?.keyboard;
    if (!kb) continue;
    kb.enabled = enableWorld;
  }
}

/**
 * React hook that wires `focusin` + `focusout` + `visibilitychange` DOM
 * events to keyboard enable/disable across every Phaser world scene.
 *
 * Returns a cleanup that removes the listeners. Idempotent across React
 * Strict Mode double-mount (re-attach on second mount, both removed on
 * unmount).
 *
 * Caller passes a getter so the hook can resolve the current Phaser.Game
 * instance (which is constructed inside PhaserCanvas.useEffect after the
 * component mounts).
 */
export function useFocusArbitration(getGame: () => unknown): void {
  useEffect(() => {
    function evaluate(): void {
      const game = getGame() as Parameters<typeof applyKeyboardArbitration>[0];
      if (!game) return;
      const mode = useChatStore.getState().mode;
      const enableWorld = shouldEnableWorldKeyboard(document.activeElement, mode);
      applyKeyboardArbitration(game, enableWorld);
    }

    document.addEventListener('focusin', evaluate);
    document.addEventListener('focusout', () => queueMicrotask(evaluate));
    document.addEventListener('visibilitychange', evaluate);

    // Re-evaluate when chat mode changes even without DOM focus shift (Esc
    // close path goes through setMode without blurring the input).
    const unsubMode = useChatStore.subscribe(
      (s) => s.mode,
      () => evaluate(),
      { fireImmediately: false },
    );

    // Initial pass once on mount.
    evaluate();

    return () => {
      document.removeEventListener('focusin', evaluate);
      document.removeEventListener('focusout', evaluate);
      document.removeEventListener('visibilitychange', evaluate);
      unsubMode();
    };
  }, [getGame]);
}
