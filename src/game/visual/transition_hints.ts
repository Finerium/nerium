//
// src/game/visual/transition_hints.ts
//
// T-WORLD W7: visual affordance helpers for inter-world TransitionZone
// gates and sub-area entry markers. Pure visual primitives; no state, no
// scene-side effects. The TransitionZone object class composes these
// primitives into a complete edge-gate visual.
//
// Direction chevron: a Phaser.GameObjects.Container holding a single
// graphics chevron pointing in the cardinal direction. The chevron is
// drawn at (0, 0) so the container can be positioned wherever the gate
// anchor lives.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';

export type ChevronDirection = 'east' | 'west' | 'north' | 'south';

export interface ChevronOptions {
  /** Fill color of the chevron arrow. Default 0xfff5e0 (warm cream). */
  color?: number;
  /** Outline color. Default 0x0a0a0a. */
  outlineColor?: number;
  /** Half-size of the chevron in pixels. Default 14. */
  size?: number;
  /** Outline thickness. Default 1.5. */
  outlineWidth?: number;
}

/**
 * Build a direction chevron Container at the given scene-space position.
 * The Container hosts a single Phaser.GameObjects.Graphics arrow centered
 * at local (0, 0). Caller is responsible for setDepth + tweens.
 */
export function buildDirectionChevron(
  scene: Phaser.Scene,
  x: number,
  y: number,
  direction: ChevronDirection,
  options?: ChevronOptions,
): Phaser.GameObjects.Container {
  const color = options?.color ?? 0xfff5e0;
  const outlineColor = options?.outlineColor ?? 0x0a0a0a;
  const size = options?.size ?? 14;
  const outlineWidth = options?.outlineWidth ?? 1.5;

  const container = scene.add.container(x, y);

  const arrow = scene.add.graphics();
  arrow.fillStyle(color, 1);
  arrow.lineStyle(outlineWidth, outlineColor, 0.85);
  arrow.beginPath();

  switch (direction) {
    case 'east':
      arrow.moveTo(-size, -size);
      arrow.lineTo(size, 0);
      arrow.lineTo(-size, size);
      arrow.lineTo(-size * 0.4, 0);
      break;
    case 'west':
      arrow.moveTo(size, -size);
      arrow.lineTo(-size, 0);
      arrow.lineTo(size, size);
      arrow.lineTo(size * 0.4, 0);
      break;
    case 'north':
      arrow.moveTo(-size, size);
      arrow.lineTo(0, -size);
      arrow.lineTo(size, size);
      arrow.lineTo(0, size * 0.4);
      break;
    case 'south':
      arrow.moveTo(-size, -size);
      arrow.lineTo(0, size);
      arrow.lineTo(size, -size);
      arrow.lineTo(0, -size * 0.4);
      break;
  }

  arrow.closePath();
  arrow.fillPath();
  arrow.strokePath();
  container.add(arrow);

  return container;
}

/**
 * Build a glowing outer ring around an inter-world gate position. The ring
 * is a simple stroked circle that pairs with the chevron + prompt label
 * for readability against busy backgrounds. Useful for both edge-gate and
 * sub-area entry visuals.
 */
export function buildGateRing(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  color: number,
): Phaser.GameObjects.Graphics {
  const ring = scene.add.graphics();
  ring.lineStyle(2.5, color, 0.7);
  ring.strokeCircle(x, y, radius);
  return ring;
}

/**
 * Compose an idle-pulse tween for a TransitionZone container so the gate
 * marker remains discoverable without overpowering the scene. Returns the
 * tween so the caller can pause / resume on proximity changes.
 */
export function buildGateIdleTween(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container,
  baseY: number,
): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets: target,
    alpha: { from: 0.7, to: 1.0 },
    y: { from: baseY, to: baseY - 8 },
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
    duration: 1400,
    delay: Math.floor(Math.random() * 800),
  });
}

/**
 * Active proximity tween: bigger amplitude scale pulse to signal "press E
 * now" affordance. The caller pauses the idle tween and starts this; on
 * proximity exit the proximity tween stops and idle resumes.
 */
export function buildGateProximityTween(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container,
): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets: target,
    scale: { from: 1.0, to: 1.2 },
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
    duration: 280,
  });
}
