//
// src/game/ui/TypewriterEffect.ts
//
// Boreas NP W3 Session 2. Drains chatStore.streaming_buffer onto the active
// assistant message at a configurable cps (default 60 chars per second). Uses
// a `Phaser.Time.TimerEvent` so the cadence stays in sync with the Phaser
// scene clock (suspends on tab background, resumes on visibility return).
//
// Cadence math:
//   - cps default 60. At 60 fps Phaser ticks every ~16.67 ms.
//   - per-tick draw count = ceil(cps / 60).
//   - reducedMotion (prefers-reduced-motion: reduce) flushes the entire
//     buffer immediately on each tick, skipping the typewriter cadence.
//
// Race handling: each per-session buffer drains independently. The
// effect promotes drained chars onto the matching assistant ChatMessage
// (last with `streaming: true` for that session_id). If no streaming
// message exists yet, the drain is parked until the SSE consumer creates
// one via `startStream()`.
//
// Cross-ref: docs/contracts/chat_ui.contract.md Section 3.4.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import { useChatStore } from '../../stores/chatStore';

export interface TypewriterOptions {
  /**
   * Characters per second to drain. Default 60. Hemera flag
   * `chat.typewriter_cps` overrides at runtime when wired.
   */
  cps?: number;
  /**
   * When true, skip the cadence entirely and flush the entire buffer
   * each tick. Default reads from `prefers-reduced-motion: reduce`
   * media query at construction time.
   */
  reducedMotion?: boolean;
  /**
   * Maximum buffer size before catch-up acceleration kicks in. Default
   * 5000 chars. Mirrors chat_ui.contract.md Section 8 backpressure rule.
   */
  catchUpThreshold?: number;
  /**
   * Catch-up multiplier applied when buffer exceeds threshold. Default 2x.
   */
  catchUpMultiplier?: number;
}

const DEFAULT_OPTIONS: Required<TypewriterOptions> = {
  cps: 60,
  reducedMotion: false,
  catchUpThreshold: 5000,
  catchUpMultiplier: 2,
};

function detectReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export interface TypewriterHandle {
  destroy(): void;
  /**
   * Force-flush all pending buffer characters into the matching messages.
   * Used on session.ended, command cancel, or visibility resume catch-up.
   */
  flushAll(): void;
}

/**
 * Attach the typewriter drain to a Phaser.Scene. Returns a handle the
 * scene must call `destroy()` on shutdown to avoid orphan timers.
 */
export function attachTypewriter(
  scene: Phaser.Scene,
  options: TypewriterOptions = {},
): TypewriterHandle {
  const opts: Required<TypewriterOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
    reducedMotion: options.reducedMotion ?? detectReducedMotion(),
  };

  const tickHz = 60;
  const tickIntervalMs = 1000 / tickHz;

  function consumeChars(session_id: string, take: number): string {
    const state = useChatStore.getState();
    const buf = state.streaming_buffer[session_id] ?? '';
    if (buf.length === 0 || take <= 0) return '';
    const taken = buf.slice(0, take);
    const remainder = buf.slice(take);
    // Mutate streaming_buffer directly: shrink by `take` chars. We use the
    // lower-level `setState`-equivalent via the appendDelta semantic by
    // first resetting and re-applying remainder. Since chatStore exposes
    // appendDelta + finishStream, we model "consume" as a direct
    // setState patch through useChatStore.setState.
    useChatStore.setState((s) => ({
      ...s,
      streaming_buffer: {
        ...s.streaming_buffer,
        [session_id]: remainder,
      },
    }));
    return taken;
  }

  function appendToStreamingMessage(session_id: string, chars: string): void {
    if (chars.length === 0) return;
    useChatStore.setState((s) => {
      // Find last index in s.messages matching session_id + streaming=true.
      let idx = -1;
      for (let i = s.messages.length - 1; i >= 0; i--) {
        const m = s.messages[i];
        if (m.session_id === session_id && m.streaming === true) {
          idx = i;
          break;
        }
      }
      if (idx === -1) {
        // No streaming target; park the chars back into the buffer so a
        // future startStream() can drain them.
        return {
          ...s,
          streaming_buffer: {
            ...s.streaming_buffer,
            [session_id]: chars + (s.streaming_buffer[session_id] ?? ''),
          },
        };
      }
      const next = s.messages.slice();
      next[idx] = { ...next[idx], content: next[idx].content + chars };
      return { ...s, messages: next };
    });
  }

  function tick(): void {
    const state = useChatStore.getState();
    const sessions = Object.keys(state.streaming_buffer);
    if (sessions.length === 0) return;

    for (const session_id of sessions) {
      const bufLen = (state.streaming_buffer[session_id] ?? '').length;
      if (bufLen === 0) continue;

      let perTick = Math.max(1, Math.ceil(opts.cps / tickHz));
      if (opts.reducedMotion) {
        perTick = bufLen; // flush whole buffer
      } else if (bufLen > opts.catchUpThreshold) {
        perTick = Math.ceil(perTick * opts.catchUpMultiplier);
      }

      const chars = consumeChars(session_id, perTick);
      appendToStreamingMessage(session_id, chars);
    }
  }

  const timer = scene.time.addEvent({
    delay: tickIntervalMs,
    loop: true,
    callback: tick,
  });

  // Visibility change: when tab returns, flush remaining buffers (catch up).
  function onVisibility(): void {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible') {
      // Drain everything pending so users do not see a backlog drip-feed
      // after returning to the tab.
      flushAll();
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  function flushAll(): void {
    const state = useChatStore.getState();
    for (const session_id of Object.keys(state.streaming_buffer)) {
      const bufLen = (state.streaming_buffer[session_id] ?? '').length;
      if (bufLen === 0) continue;
      const chars = consumeChars(session_id, bufLen);
      appendToStreamingMessage(session_id, chars);
    }
  }

  return {
    flushAll,
    destroy(): void {
      try {
        timer.remove(false);
      } catch {
        // ignore
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    },
  };
}
