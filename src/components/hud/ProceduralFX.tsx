'use client';

/**
 * ProceduralFX.tsx
 *
 * React Client Component wrapper for the three Hesperus Canvas 2D procedural
 * FX modules. Erato-v2 consumes this component as an ambient layer beneath
 * world-specific HUD chrome. One of three variants must be selected per
 * world:
 *
 *   variant="sand"  -> Medieval Desert   (warm terracotta drift)
 *   variant="neon"  -> Cyberpunk Shanghai (cyan + magenta pulse)
 *   variant="steam" -> Steampunk Victorian (brass-tinted rising puff)
 *
 * Mount lifecycle:
 *   - On mount, construct the FX controller via createSandParticles /
 *     createNeonGlow / createSteamPuff and call start().
 *   - ResizeObserver watches the host wrapper so the canvas tracks layout
 *     changes; resize() flushes the particle pool to the new bounds.
 *   - On unmount, controller.destroy() releases the rAF loop and clears
 *     the canvas. No leaked rAF handlers.
 *
 * Accessibility:
 *   - aria-hidden="true" because the FX is decorative; screen readers skip it.
 *   - prefers-reduced-motion honored by each FX module (static single frame).
 *   - Canvas layer is pointer-events: none so the FX never intercepts clicks.
 *
 * Contract: docs/contracts/design_tokens.contract.md v0.1.0 palette source.
 *           world variant mapping aligns with
 *           docs/contracts/world_aesthetic.contract.md v0.1.0 WorldId enum.
 *
 * Author: Hesperus (Opus 4.7) W3, 2026-04-23.
 */

import { useEffect, useRef, type ReactElement } from 'react';
import { createSandParticles, type FXController } from '../../lib/procedural/sandParticles';
import { createNeonGlow } from '../../lib/procedural/neonGlow';
import { createSteamPuff } from '../../lib/procedural/steamPuff';

export type ProceduralFXVariant = 'sand' | 'neon' | 'steam';

export interface ProceduralFXProps {
  variant: ProceduralFXVariant;
  className?: string;
  density?: number;
  speed?: number;
  orbCount?: number;
  paused?: boolean;
}

function makeController(
  variant: ProceduralFXVariant,
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  props: Pick<ProceduralFXProps, 'density' | 'speed' | 'orbCount'>,
): FXController {
  if (variant === 'sand') {
    return createSandParticles(canvas, {
      width,
      height,
      density: props.density,
      windSpeed: props.speed,
    });
  }
  if (variant === 'neon') {
    return createNeonGlow(canvas, {
      width,
      height,
      orbCount: props.orbCount,
      pulseSpeed: props.speed,
    });
  }
  return createSteamPuff(canvas, {
    width,
    height,
    density: props.density,
    riseSpeed: props.speed,
  });
}

export function ProceduralFX({
  variant,
  className,
  density,
  speed,
  orbCount,
  paused = false,
}: ProceduralFXProps): ReactElement {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<FXController | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const rect = wrapper.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    const controller = makeController(variant, canvas, width, height, {
      density,
      speed,
      orbCount,
    });
    controllerRef.current = controller;
    if (!paused) controller.start();

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(entries => {
            for (const entry of entries) {
              const box = entry.contentRect;
              controller.resize(Math.max(1, box.width), Math.max(1, box.height));
            }
          })
        : null;
    if (observer) observer.observe(wrapper);

    return () => {
      if (observer) observer.disconnect();
      controller.destroy();
      controllerRef.current = null;
    };
  }, [variant, density, speed, orbCount, paused]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (paused) controller.stop();
    else controller.start();
  }, [paused]);

  const wrapperClass =
    'pointer-events-none absolute inset-0 overflow-hidden' +
    (className ? ' ' + className : '');

  return (
    <div ref={wrapperRef} className={wrapperClass} aria-hidden="true">
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

export default ProceduralFX;
