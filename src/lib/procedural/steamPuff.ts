/**
 * steamPuff.ts
 *
 * Canvas 2D steam-puff procedural FX for the Steampunk Victorian world.
 *
 * Brass-tinted rising plume of particles with expanding radius and
 * noise-modulated alpha. Evokes gas-lamp warmth plus BioShock Columbia
 * ambient puff per NarasiGhaisan Section 7 V2 proposal. Puff pool is
 * pre-allocated; the tick loop recycles spent particles back through a
 * deterministic spawn slot without per-frame allocation.
 *
 * Palette anchors trace back to app/builder/worlds/steampunk_victorian/palette.ts:
 *   primary    oklch(0.680 0.110 78.0)  brass   ~ #c9a061
 *   secondary  oklch(0.380 0.130 25.0)  oxblood ~ #7a2f24
 *   accent     oklch(0.580 0.120 48.0)  walnut  ~ #a46b3f
 *   background oklch(0.900 0.030 85.0)  ivory   ~ #e5d6b8
 *
 * API contract: matches sandParticles.ts FXController.
 * prefers-reduced-motion yields a single static render with no rise.
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

export interface SteamPuffOptions {
  width: number;
  height: number;
  density?: number;
  riseSpeed?: number;
  reducedMotion?: boolean;
}

interface SteamParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  noiseSeed: number;
}

const TINTS: Array<{ r: number; g: number; b: number }> = [
  { r: 0xe5, g: 0xd6, b: 0xb8 },
  { r: 0xc9, g: 0xa0, b: 0x61 },
  { r: 0xa4, g: 0x6b, b: 0x3f },
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
    throw new Error('steamPuff: Canvas 2D context unavailable');
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function pseudoNoise(seed: number, t: number): number {
  const v = Math.sin(seed * 127.1 + t * 43.7) * 43758.5453;
  return v - Math.floor(v);
}

function respawn(
  p: SteamParticle,
  width: number,
  height: number,
  riseSpeed: number,
  rng: () => number,
): void {
  p.x = width * (0.35 + rng() * 0.3);
  p.y = height - 4;
  p.vx = (rng() - 0.5) * 14;
  p.vy = -(riseSpeed * (0.75 + rng() * 0.6));
  p.radius = 4 + rng() * 6;
  p.maxRadius = 18 + rng() * 32;
  p.life = 0;
  p.maxLife = 2.2 + rng() * 2.4;
  p.noiseSeed = rng() * 1000;
}

export function createSteamPuff(
  canvas: HTMLCanvasElement,
  options: SteamPuffOptions,
): FXController {
  const rng = Math.random;
  let width = Math.max(1, options.width);
  let height = Math.max(1, options.height);
  const density = options.density ?? 0.00018;
  const riseSpeed = options.riseSpeed ?? 52;
  const reduced = options.reducedMotion ?? prefersReducedMotion();

  let dpr = resolveDpr();
  let ctx = configureCanvas(canvas, width, height, dpr);

  const count = Math.max(8, Math.min(120, Math.floor(width * height * density)));
  const puffs: SteamParticle[] = [];
  for (let i = 0; i < count; i += 1) {
    const p: SteamParticle = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 0,
      maxRadius: 0,
      life: 0,
      maxLife: 1,
      noiseSeed: 0,
    };
    respawn(p, width, height, riseSpeed, rng);
    p.life = rng() * p.maxLife;
    p.y = height - rng() * height * 0.9;
    puffs.push(p);
  }

  function paint(p: SteamParticle, t: number): void {
    const progress = p.life / p.maxLife;
    const tintIndex = Math.min(TINTS.length - 1, Math.floor(progress * TINTS.length));
    const tint = TINTS[tintIndex];
    const noise = pseudoNoise(p.noiseSeed, t);
    const jitter = 0.8 + noise * 0.4;
    const envelope =
      progress < 0.15
        ? progress / 0.15
        : progress > 0.7
          ? Math.max(0, 1 - (progress - 0.7) / 0.3)
          : 1;
    const alpha = Math.max(0, 0.55 * envelope * jitter);
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
    gradient.addColorStop(
      0,
      'rgba(' + tint.r + ',' + tint.g + ',' + tint.b + ',' + alpha.toFixed(3) + ')',
    );
    gradient.addColorStop(
      0.7,
      'rgba(' + tint.r + ',' + tint.g + ',' + tint.b + ',' + (alpha * 0.35).toFixed(3) + ')',
    );
    gradient.addColorStop(1, 'rgba(' + tint.r + ',' + tint.g + ',' + tint.b + ',0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function renderFrame(dtSeconds: number, elapsedSeconds: number): void {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < puffs.length; i += 1) {
      const p = puffs[i];
      p.life += dtSeconds;
      if (p.life >= p.maxLife) {
        respawn(p, width, height, riseSpeed, rng);
        continue;
      }
      p.x += p.vx * dtSeconds + Math.sin(elapsedSeconds + p.noiseSeed) * 3 * dtSeconds;
      p.y += p.vy * dtSeconds;
      const growth = (p.maxRadius - p.radius) * dtSeconds * 0.55;
      p.radius = Math.min(p.maxRadius, p.radius + growth);
      paint(p, elapsedSeconds);
    }
  }

  function renderStatic(): void {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < puffs.length; i += 1) {
      paint(puffs[i], 0);
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
      for (let i = 0; i < puffs.length; i += 1) {
        respawn(puffs[i], width, height, riseSpeed, rng);
      }
      if (reduced) renderStatic();
    },
  };

  if (reduced) renderStatic();
  return controller;
}
