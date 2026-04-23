/**
 * neonGlow.ts
 *
 * Canvas 2D neon-glow procedural FX for the Cyberpunk Shanghai world.
 *
 * Radial cyan and magenta gradient orbs composited with a lighter blend mode
 * and sinusoidal pulse timing, evoking Blade Runner 2049 plus Ghost in the
 * Shell per NarasiGhaisan Section 7. Orb positions pre-allocated; the tick
 * loop recomputes radius and alpha without allocation.
 *
 * Palette anchors trace back to NarasiGhaisan Section 7 and
 * app/builder/worlds/cyberpunk_shanghai/palette.ts:
 *   primary   oklch(0.830 0.150 200.0)  cyan    anchor  #00f0ff
 *   secondary oklch(0.660 0.270   5.0)  magenta anchor  #ff2e88
 *   accent    oklch(0.620 0.220 295.0)  purple  anchor  #8b5cf6
 *
 * API contract: matches sandParticles.ts FXController.
 * prefers-reduced-motion yields a single static render with no pulse.
 *
 * Author: Hesperus (Opus 4.7) W3, 2026-04-23.
 * Contract: docs/contracts/design_tokens.contract.md v0.1.0
 *           docs/contracts/world_aesthetic.contract.md v0.1.0
 */

export interface FXController {
  start(): void;
  stop(): void;
  destroy(): void;
  resize(width: number, height: number): void;
}

export interface NeonGlowOptions {
  width: number;
  height: number;
  orbCount?: number;
  pulseSpeed?: number;
  reducedMotion?: boolean;
}

interface NeonOrb {
  x: number;
  y: number;
  drift: number;
  radius: number;
  color: string;
  phase: number;
  amplitude: number;
}

const CYAN = '#00f0ff';
const MAGENTA = '#ff2e88';
const PURPLE = '#8b5cf6';
const HUES = [CYAN, MAGENTA, PURPLE];

const FRAME_BUDGET_MS = 1000 / 60;
const MAX_DT_MS = 64;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function resolveDpr(): number {
  if (typeof window === 'undefined') return 1;
  return Math.min(window.devicePixelRatio || 1, 2);
}

function configureCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  dpr: number,
): CanvasRenderingContext2D {
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    throw new Error('neonGlow: Canvas 2D context unavailable');
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function seedOrbs(
  pool: NeonOrb[],
  width: number,
  height: number,
  rng: () => number,
): void {
  for (let i = 0; i < pool.length; i += 1) {
    const o = pool[i];
    o.x = rng() * width;
    o.y = rng() * height;
    o.drift = (rng() - 0.5) * 12;
    o.radius = Math.min(width, height) * (0.18 + rng() * 0.28);
    o.color = HUES[i % HUES.length];
    o.phase = rng() * Math.PI * 2;
    o.amplitude = 0.35 + rng() * 0.35;
  }
}

function hexWithAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(3) + ')';
}

export function createNeonGlow(
  canvas: HTMLCanvasElement,
  options: NeonGlowOptions,
): FXController {
  const rng = Math.random;
  let width = Math.max(1, options.width);
  let height = Math.max(1, options.height);
  const orbCount = Math.max(2, Math.min(8, options.orbCount ?? 4));
  const pulseSpeed = options.pulseSpeed ?? 0.9;
  const reduced = options.reducedMotion ?? prefersReducedMotion();

  let dpr = resolveDpr();
  let ctx = configureCanvas(canvas, width, height, dpr);

  const orbs: NeonOrb[] = [];
  for (let i = 0; i < orbCount; i += 1) {
    orbs.push({
      x: 0,
      y: 0,
      drift: 0,
      radius: 0,
      color: CYAN,
      phase: 0,
      amplitude: 0.5,
    });
  }
  seedOrbs(orbs, width, height, rng);

  function renderFrame(dtSeconds: number, elapsedSeconds: number): void {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(6, 6, 12, 0.24)';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < orbs.length; i += 1) {
      const o = orbs[i];
      o.x += o.drift * dtSeconds;
      o.y += Math.sin(elapsedSeconds * 0.6 + o.phase) * 6 * dtSeconds;
      if (o.x > width + o.radius) o.x = -o.radius;
      if (o.x < -o.radius) o.x = width + o.radius;
      if (o.y > height + o.radius) o.y = -o.radius;
      if (o.y < -o.radius) o.y = height + o.radius;
      const pulse =
        0.4 + Math.sin(elapsedSeconds * pulseSpeed + o.phase) * 0.5 * o.amplitude;
      const innerAlpha = Math.max(0, Math.min(1, 0.5 * pulse + 0.15));
      const outerAlpha = Math.max(0, Math.min(1, 0.12 * pulse));
      const gradient = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.radius);
      gradient.addColorStop(0, hexWithAlpha(o.color, innerAlpha));
      gradient.addColorStop(0.55, hexWithAlpha(o.color, outerAlpha));
      gradient.addColorStop(1, hexWithAlpha(o.color, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderStatic(): void {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(6, 6, 12, 0.35)';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < orbs.length; i += 1) {
      const o = orbs[i];
      const gradient = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.radius);
      gradient.addColorStop(0, hexWithAlpha(o.color, 0.32));
      gradient.addColorStop(0.6, hexWithAlpha(o.color, 0.08));
      gradient.addColorStop(1, hexWithAlpha(o.color, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  let rafId: number | null = null;
  let lastTimestamp = 0;
  let elapsedSeconds = 0;

  function loop(ts: number): void {
    const raw = lastTimestamp === 0 ? FRAME_BUDGET_MS : ts - lastTimestamp;
    const dtMs = Math.min(raw, MAX_DT_MS);
    lastTimestamp = ts;
    elapsedSeconds += dtMs / 1000;
    renderFrame(dtMs / 1000, elapsedSeconds);
    rafId = requestAnimationFrame(loop);
  }

  let destroyed = false;

  const controller: FXController = {
    start(): void {
      if (destroyed || rafId !== null) return;
      if (reduced) {
        renderStatic();
        return;
      }
      lastTimestamp = 0;
      rafId = requestAnimationFrame(loop);
    },
    stop(): void {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
    destroy(): void {
      controller.stop();
      destroyed = true;
      ctx.clearRect(0, 0, width, height);
    },
    resize(nextWidth: number, nextHeight: number): void {
      if (destroyed) return;
      width = Math.max(1, nextWidth);
      height = Math.max(1, nextHeight);
      dpr = resolveDpr();
      ctx = configureCanvas(canvas, width, height, dpr);
      seedOrbs(orbs, width, height, rng);
      if (reduced) renderStatic();
    },
  };

  if (reduced) renderStatic();
  return controller;
}
