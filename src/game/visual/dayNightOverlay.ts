//
// src/game/visual/dayNightOverlay.ts
//
// Helios-v2 W3 S9: full-screen MULTIPLY tint overlay for day-night cycle
// across main scenes + outdoor sub-areas. Per S9 directive 9.3, interior
// sub-areas (Apollo Temple Interior, Caravan Wayhouse Interior, Cyber
// Skyscraper Lobby, Cyber Underground Alley, Cyber Server Room) SKIP the
// overlay and use fixed lighting.
//
// Time-of-day cycle 5-min total: dawn (60s) -> day (90s) -> dusk (60s) ->
// night (90s) -> repeat. Each phase has a tint color + alpha:
//   - Dawn:  warm pink-orange tint, alpha 0.20
//   - Day:   clear, alpha 0.00 (overlay invisible)
//   - Dusk:  warm amber-magenta tint, alpha 0.30
//   - Night: deep blue-violet tint, alpha 0.50
//
// The overlay is a Phaser.GameObjects.Rectangle filling the camera viewport
// at depth DAY_NIGHT_OVERLAY (9500), MULTIPLY blend mode so it tints world
// content without obscuring UI (UIScene at depth 10000 stays readable).
// scrollFactor 0 keeps the overlay camera-locked.
//
// Manual debug toggle: `setTimeOfDay(scene, phase)` cycles phases instantly.
// Used by S9 Playwright snapshots for deterministic capture.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import { DEPTH } from './depth';

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

export interface TimeOfDayPhase {
  /** Tint color (hex). */
  tint: number;
  /** Final alpha at the centerpoint of the phase. */
  alpha: number;
  /** Phase duration in ms. */
  durationMs: number;
}

export const TIME_OF_DAY_PHASES: Readonly<Record<TimeOfDay, TimeOfDayPhase>> = Object.freeze({
  dawn: { tint: 0xff9070, alpha: 0.2, durationMs: 60_000 },
  day: { tint: 0xffffff, alpha: 0.0, durationMs: 90_000 },
  dusk: { tint: 0xff7050, alpha: 0.3, durationMs: 60_000 },
  night: { tint: 0x202050, alpha: 0.5, durationMs: 90_000 },
});

const PHASE_ORDER: readonly TimeOfDay[] = Object.freeze(['dawn', 'day', 'dusk', 'night']);

export interface DayNightHandle {
  rect: Phaser.GameObjects.Rectangle;
  /** Current phase. */
  phase: TimeOfDay;
  /** Step to the next phase (cycles dawn -> day -> dusk -> night -> dawn). */
  setPhase: (phase: TimeOfDay) => void;
  /** Tear down the overlay + its tween. Idempotent. */
  destroy: () => void;
}

/**
 * Build a day-night overlay rectangle for the scene. Returns a handle the
 * caller stores so scene cleanup can dispose. Initial phase is 'dusk' so
 * the overlay reads as "warm evening" by default (Apollo Village vibe).
 *
 * The overlay is sized to the camera viewport and follows camera via
 * scrollFactor 0; it auto-resizes if the scale changes.
 */
export function buildDayNightOverlay(
  scene: Phaser.Scene,
  initialPhase: TimeOfDay = 'dusk',
): DayNightHandle {
  const width = scene.scale.width;
  const height = scene.scale.height;

  const initialConfig = TIME_OF_DAY_PHASES[initialPhase];
  const rect = scene.add.rectangle(0, 0, width, height, initialConfig.tint, initialConfig.alpha);
  rect.setOrigin(0, 0);
  rect.setDepth(DEPTH.DAY_NIGHT_OVERLAY);
  rect.setScrollFactor(0);
  rect.setBlendMode(Phaser.BlendModes.MULTIPLY);

  let currentPhase: TimeOfDay = initialPhase;
  let phaseTween: Phaser.Tweens.Tween | undefined;

  const setPhase = (phase: TimeOfDay) => {
    if (phase === currentPhase) return;
    const next = TIME_OF_DAY_PHASES[phase];
    if (phaseTween && phaseTween.isPlaying()) {
      phaseTween.stop();
    }
    rect.setFillStyle(next.tint, rect.fillAlpha);
    phaseTween = scene.tweens.add({
      targets: rect,
      fillAlpha: next.alpha,
      duration: 1500,
      ease: 'Sine.easeInOut',
    });
    currentPhase = phase;
  };

  // Resize listener: re-fit the rect to new scale dimensions if user resizes.
  const resizeHandler = () => {
    rect.width = scene.scale.width;
    rect.height = scene.scale.height;
  };
  scene.scale.on('resize', resizeHandler);

  const destroy = () => {
    if (phaseTween && phaseTween.isPlaying()) {
      phaseTween.stop();
    }
    scene.scale.off('resize', resizeHandler);
    if (rect.scene) {
      rect.destroy();
    }
  };

  return {
    rect,
    get phase() {
      return currentPhase;
    },
    setPhase,
    destroy,
  };
}

/**
 * Convenience: cycle to the next phase in dawn -> day -> dusk -> night order.
 */
export function nextTimeOfDay(current: TimeOfDay): TimeOfDay {
  const idx = PHASE_ORDER.indexOf(current);
  return PHASE_ORDER[(idx + 1) % PHASE_ORDER.length] as TimeOfDay;
}
