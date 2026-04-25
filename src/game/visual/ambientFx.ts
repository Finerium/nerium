//
// src/game/visual/ambientFx.ts
//
// Helios-v2 W3 S2: ambient FX particle emitter factory per scene. Wraps
// Phaser's ParticleEmitter with per-world presets:
//   - Apollo:    sand particles (drift SE, alpha 0.3, rate 30/s)
//   - Caravan:   leaves (flutter, rate 20/s)
//   - Cyberpunk: neon rain + smog + hologram pulse (rate 60/s combined)
//   - Steampunk: steam puffs + gear sparks (rate 40/s)
//
// The emitter does not need a real texture; we generate a tiny 1x1 px
// rectangle texture once per scene at boot and reuse the key. This avoids
// shipping a separate sprite atlas for ambient FX.
//
// Per visual_manifest.contract Section 3.1 AmbientFxSchema.kind values
// the factory returns the correct emitter or null (kind === 'none').
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import { DEPTH } from './depth';
import { MEDIEVAL_DESERT, CYBERPUNK_SHANGHAI, STEAMPUNK_VICTORIAN, CARAVAN_ROAD } from './palette';

export type AmbientFxKind =
  | 'dust'
  | 'leaves'
  | 'rain'
  | 'neon_smog'
  | 'steam'
  | 'gear_spark'
  | 'none';

export interface AmbientFxOptions {
  kind: AmbientFxKind;
  /** Override default emit area; defaults to scene scale viewport */
  emitArea?: { x: number; y: number; width: number; height: number };
  /** Override default particle count cap (defaults vary by kind) */
  particleCount?: number;
}

/**
 * Lazy-create a 1x1 white texture used for tinted ambient FX particles.
 * Subsequent calls reuse the cached texture key.
 */
function ensureParticleTexture(scene: Phaser.Scene): string {
  const key = '__nerium_fx_pixel';
  if (!scene.textures.exists(key)) {
    const g = scene.add.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture(key, 2, 2);
    g.destroy();
  }
  return key;
}

/**
 * Build an ambient FX emitter with per-kind preset config. Returns the
 * emitter so the caller can pause / resume on scene shutdown. Returns null
 * when kind is 'none'.
 */
export function buildAmbientFx(
  scene: Phaser.Scene,
  options: AmbientFxOptions,
): Phaser.GameObjects.Particles.ParticleEmitter | null {
  if (options.kind === 'none') return null;

  const textureKey = ensureParticleTexture(scene);

  const viewport = scene.scale;
  const area = options.emitArea ?? {
    x: 0,
    y: 0,
    width: viewport.width,
    height: viewport.height,
  };

  switch (options.kind) {
    case 'dust': {
      // Apollo Village sand particles: drift south-east, soft amber tint,
      // long lifespan low alpha.
      const count = options.particleCount ?? 30;
      const emitter = scene.add.particles(0, 0, textureKey, {
        x: { min: area.x, max: area.x + area.width },
        y: { min: area.y, max: area.y + area.height * 0.3 },
        lifespan: { min: 5000, max: 8000 },
        speedX: { min: 5, max: 18 },
        speedY: { min: 5, max: 14 },
        scale: { min: 0.4, max: 1.2 },
        alpha: { start: 0.0, end: 0.35 },
        tint: [MEDIEVAL_DESERT.sandSpeckleLight, MEDIEVAL_DESERT.sandSpeckleDark],
        frequency: 1000 / Math.max(1, count),
        blendMode: Phaser.BlendModes.NORMAL,
      });
      emitter.setDepth(DEPTH.AMBIENT_FX);
      emitter.setScrollFactor(0.6);
      return emitter;
    }
    case 'leaves': {
      const count = options.particleCount ?? 20;
      const emitter = scene.add.particles(0, 0, textureKey, {
        x: { min: area.x, max: area.x + area.width },
        y: { min: area.y, max: area.y + area.height * 0.2 },
        lifespan: { min: 6000, max: 9000 },
        speedX: { min: -25, max: 25 },
        speedY: { min: 15, max: 35 },
        scale: { min: 0.6, max: 1.4 },
        rotate: { start: 0, end: 360 },
        alpha: { start: 0.0, end: 0.6 },
        tint: [CARAVAN_ROAD.skyAmber, MEDIEVAL_DESERT.cactusBody, CARAVAN_ROAD.roadHi],
        frequency: 1000 / Math.max(1, count),
        blendMode: Phaser.BlendModes.NORMAL,
      });
      emitter.setDepth(DEPTH.AMBIENT_FX);
      emitter.setScrollFactor(0.8);
      return emitter;
    }
    case 'rain': {
      const count = options.particleCount ?? 60;
      const emitter = scene.add.particles(0, 0, textureKey, {
        x: { min: area.x, max: area.x + area.width },
        y: area.y,
        lifespan: { min: 1500, max: 2500 },
        speedX: { min: -20, max: -5 },
        speedY: { min: 280, max: 360 },
        scaleX: 0.5,
        scaleY: 4,
        alpha: { start: 0.4, end: 0.0 },
        tint: CYBERPUNK_SHANGHAI.rainStreak,
        frequency: 1000 / Math.max(1, count),
        blendMode: Phaser.BlendModes.NORMAL,
      });
      emitter.setDepth(DEPTH.AMBIENT_FX);
      emitter.setScrollFactor(0.95);
      return emitter;
    }
    case 'neon_smog': {
      const count = options.particleCount ?? 25;
      const emitter = scene.add.particles(0, 0, textureKey, {
        x: { min: area.x, max: area.x + area.width },
        y: { min: area.y + area.height * 0.4, max: area.y + area.height },
        lifespan: { min: 8000, max: 14000 },
        speedX: { min: -8, max: 12 },
        speedY: { min: -6, max: 4 },
        scale: { min: 4, max: 12 },
        alpha: { start: 0.0, end: 0.25 },
        tint: [CYBERPUNK_SHANGHAI.neonViolet, CYBERPUNK_SHANGHAI.holoMagenta, CYBERPUNK_SHANGHAI.holoCyan],
        frequency: 1000 / Math.max(1, count),
        blendMode: Phaser.BlendModes.ADD,
      });
      emitter.setDepth(DEPTH.AMBIENT_FX);
      emitter.setScrollFactor(0.4);
      return emitter;
    }
    case 'steam': {
      const count = options.particleCount ?? 25;
      const emitter = scene.add.particles(0, 0, textureKey, {
        x: { min: area.x, max: area.x + area.width },
        y: { min: area.y + area.height * 0.7, max: area.y + area.height },
        lifespan: { min: 3000, max: 6000 },
        speedX: { min: -8, max: 12 },
        speedY: { min: -45, max: -25 },
        scale: { min: 2, max: 6 },
        alpha: { start: 0.4, end: 0.0 },
        tint: [STEAMPUNK_VICTORIAN.steamPale, STEAMPUNK_VICTORIAN.steamMid, STEAMPUNK_VICTORIAN.steamShadow],
        frequency: 1000 / Math.max(1, count),
        blendMode: Phaser.BlendModes.NORMAL,
      });
      emitter.setDepth(DEPTH.AMBIENT_FX);
      emitter.setScrollFactor(0.7);
      return emitter;
    }
    case 'gear_spark': {
      const count = options.particleCount ?? 15;
      const emitter = scene.add.particles(0, 0, textureKey, {
        x: { min: area.x, max: area.x + area.width },
        y: { min: area.y + area.height * 0.5, max: area.y + area.height * 0.9 },
        lifespan: { min: 600, max: 1200 },
        speedX: { min: -60, max: 60 },
        speedY: { min: -120, max: -40 },
        scale: { min: 0.4, max: 0.9 },
        alpha: { start: 1.0, end: 0.0 },
        tint: [STEAMPUNK_VICTORIAN.brassGlint, STEAMPUNK_VICTORIAN.lampCore, STEAMPUNK_VICTORIAN.arcWhite],
        frequency: 1000 / Math.max(1, count),
        blendMode: Phaser.BlendModes.ADD,
      });
      emitter.setDepth(DEPTH.AMBIENT_FX);
      emitter.setScrollFactor(0.85);
      return emitter;
    }
    default: {
      const exhaustive: never = options.kind;
      throw new Error(`buildAmbientFx: unhandled kind ${exhaustive as string}`);
    }
  }
}
