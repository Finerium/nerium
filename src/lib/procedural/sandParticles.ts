/**
 * sandParticles.ts
 *
 * Canvas 2D sand-drift procedural FX for the Medieval Desert world.
 *
 * Warm terracotta and sand particles drifting horizontally with a gentle
 * vertical jitter, evoking Moroccan souk afternoon haze plus Dune Arrakeen
 * noon dust per NarasiGhaisan Section 7. Particle pool is pre-allocated at
 * init time so the tick loop performs zero per-frame allocation.
 *
 * Palette anchors trace back to app/builder/worlds/medieval_desert/palette.ts:
 *   primary   oklch(0.620 0.140  45.0)  terracotta     ~ #c97a4a
 *   secondary oklch(0.820 0.100  85.0)  sand           ~ #e8c57d
 *   accent    oklch(0.750 0.180  70.0)  saffron        ~ #e0a851
 *   muted     oklch(0.700 0.040  75.0)  muted sand     ~ #c1a775
 *
 * API contract (shared across the three procedural FX modules):
 *   createSandParticles(canvas, options) returns FXController with
 *   start() + stop() + destroy() + resize() entry points. rAF lifecycle
 *   owned internally. prefers-reduced-motion honored by skipping the loop
 *   and painting a single static frame.
 *
 * Author: Hesperus (Opus 4.7) W3, 2026-04-23.
 * Contract: docs/contracts/design_tokens.contract.md v0.1.0 (palette source)
 *           docs/contracts/world_aesthetic.contract.md v0.1.0 (WorldPalette)
 */

export interface FXController {
  start(): void;
  stop(): void;
  destroy(): void;
  resize(width: number, height: number): void;
}

export interface SandParticlesOptions {
  width: number;
  height: number;
  density?: number;
  windSpeed?: number;
  reducedMotion?: boolean;
}

interface SandParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  hue: number;
  phase: number;
}

const PALETTE: Array<{ r: number; g: number; b: number }> = [
  { r: 0xc9, g: 0x7a, b: 0x4a },
  { r: 0xe8, g: 0xc5, b: 0x7d },
  { r: 0xe0, g: 0xa8, b: 0x51 },
  { r: 0xc1, g: 0xa7, b: 0x75 },
];

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
    throw new Error('sandParticles: Canvas 2D context unavailable');
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function spawn(
  particle: SandParticle,
  width: number,
  height: number,
  wind: number,
  rng: () => number,
): void {
  particle.x = rng() * width;
  particle.y = rng() * height;
  particle.vx = wind * (0.5 + rng() * 0.75);
  particle.vy = (rng() - 0.5) * 6;
  particle.size = 0.6 + rng() * 1.8;
  particle.alpha = 0.25 + rng() * 0.55;
  particle.hue = Math.floor(rng() * PALETTE.length);
  particle.phase = rng() * Math.PI * 2;
}

export function createSandParticles(
  canvas: HTMLCanvasElement,
  options: SandParticlesOptions,
): FXController {
  const rng = Math.random;
  let width = Math.max(1, options.width);
  let height = Math.max(1, options.height);
  const density = options.density ?? 0.00012;
  const wind = options.windSpeed ?? 42;
  const reduced = options.reducedMotion ?? prefersReducedMotion();

  let dpr = resolveDpr();
  let ctx = configureCanvas(canvas, width, height, dpr);

  const particleCount = Math.max(12, Math.min(240, Math.floor(width * height * density)));
  const pool: SandParticle[] = [];
  for (let i = 0; i < particleCount; i += 1) {
    const p: SandParticle = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 0,
      alpha: 0,
      hue: 0,
      phase: 0,
    };
    spawn(p, width, height, wind, rng);
    pool.push(p);
  }

  function renderFrame(dtSeconds: number, elapsedSeconds: number): void {
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < pool.length; i += 1) {
      const p = pool[i];
      p.x += p.vx * dtSeconds;
      p.y += (p.vy + Math.sin(elapsedSeconds * 1.2 + p.phase) * 8) * dtSeconds;
      if (p.x > width + 8) {
        p.x = -8;
        p.y = rng() * height;
      } else if (p.x < -8) {
        p.x = width + 8;
        p.y = rng() * height;
      }
      if (p.y < -8) p.y = height + 8;
      if (p.y > height + 8) p.y = -8;
      const color = PALETTE[p.hue];
      ctx.fillStyle =
        'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + p.alpha.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function renderStatic(): void {
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < pool.length; i += 1) {
      const p = pool[i];
      const color = PALETTE[p.hue];
      ctx.fillStyle =
        'rgba(' + color.r + ',' + color.g + ',' + color.b + ',' + (p.alpha * 0.6).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
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
      for (let i = 0; i < pool.length; i += 1) {
        spawn(pool[i], width, height, wind, rng);
      }
      if (reduced) renderStatic();
    },
  };

  if (reduced) renderStatic();
  return controller;
}
