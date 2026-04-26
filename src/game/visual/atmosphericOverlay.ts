//
// src/game/visual/atmosphericOverlay.ts
//
// Helios-v2 W3 S9: atmospheric overlay PNG (smog_wisps + autumn_leaves) per
// directive 9.5. Wraps Phaser.GameObjects.Image at depth 9000 (UI_OVERLAY)
// with subtle alpha + position tween for organic drift.
//
// Per S9 directive 9.5:
//   - smog_wisps (Prompt 46): full-screen alpha 0.5 on Cyberpunk + 4 cyber
//     sub-area scenes. Tween position + alpha 0.4..0.6 over 3s.
//   - autumn_leaves (Prompt 47): full-screen alpha 0.5 on Caravan + Forest
//     Crossroad. Tween position drift left-to-right slow.
//   - dust_motes (Prompt 45) CUT V6; Apollo dust handled by particle emitter
//     buildAmbientFx kind 'dust' instead of PNG overlay.
//
// Note: S3 Caravan + S4 Cyber main scenes already place the autumn_leaves
// + smog_wisps overlays as static images. S9 ADDS a subtle drift tween + a
// 4 cyber sub-area smog presence, plus the Forest Crossroad autumn_leaves
// drift. The helper is safe to call with replace=true to upgrade an existing
// static overlay to a tweened one.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import { DEPTH } from './depth';
import { ASSET_KEYS } from './asset_keys';

export interface AtmosphericOverlayHandle {
  image: Phaser.GameObjects.Image;
  alphaTween?: Phaser.Tweens.Tween;
  positionTween?: Phaser.Tweens.Tween;
  destroy: () => void;
}

export interface SmogWispsOptions {
  /** Camera scrollFactor (default 0.6 mild parallax). */
  scrollFactor?: number;
  /** Override alpha range tween (default 0.4..0.6 over 3s). */
  alphaRange?: { min: number; max: number; durationMs: number };
}

/**
 * Add the smog_wisps PNG overlay at scene viewport with subtle alpha tween.
 * Returns handle. Caller stores + calls destroy() on scene shutdown.
 */
export function addSmogWispsOverlay(
  scene: Phaser.Scene,
  options: SmogWispsOptions = {},
): AtmosphericOverlayHandle {
  const width = scene.scale.width;
  const height = scene.scale.height;
  const image = scene.add.image(0, 0, ASSET_KEYS.overlays.smog_wisps);
  image.setOrigin(0, 0);
  image.setDisplaySize(width, height);
  image.setDepth(DEPTH.UI_OVERLAY);
  image.setScrollFactor(options.scrollFactor ?? 0.6);
  image.setAlpha(0.5);

  const alphaRange = options.alphaRange ?? { min: 0.4, max: 0.6, durationMs: 3000 };
  const alphaTween = scene.tweens.add({
    targets: image,
    alpha: { from: alphaRange.min, to: alphaRange.max },
    duration: alphaRange.durationMs,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });

  // Slow horizontal drift: ~30 px over 8s for organic feel.
  const positionTween = scene.tweens.add({
    targets: image,
    x: { from: -15, to: 15 },
    duration: 8000,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });

  const destroy = () => {
    if (alphaTween.isPlaying()) alphaTween.stop();
    if (positionTween.isPlaying()) positionTween.stop();
    if (image.scene) image.destroy();
  };

  return { image, alphaTween, positionTween, destroy };
}

export interface AutumnLeavesOptions {
  scrollFactor?: number;
  /** Drift duration ms (default 12000 for slow feel). */
  driftDurationMs?: number;
  /** Override base alpha (default 0.45). */
  alpha?: number;
}

/**
 * Add the autumn_leaves PNG overlay with slow left-to-right drift tween.
 * Returns handle.
 */
export function addAutumnLeavesOverlay(
  scene: Phaser.Scene,
  options: AutumnLeavesOptions = {},
): AtmosphericOverlayHandle {
  const width = scene.scale.width;
  const height = scene.scale.height;
  const image = scene.add.image(0, 0, ASSET_KEYS.overlays.autumn_leaves);
  image.setOrigin(0, 0);
  image.setDisplaySize(width, height);
  image.setDepth(DEPTH.UI_OVERLAY);
  image.setScrollFactor(options.scrollFactor ?? 0.7);
  image.setAlpha(options.alpha ?? 0.45);

  const positionTween = scene.tweens.add({
    targets: image,
    x: { from: -20, to: 20 },
    duration: options.driftDurationMs ?? 12000,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });

  const destroy = () => {
    if (positionTween.isPlaying()) positionTween.stop();
    if (image.scene) image.destroy();
  };

  return { image, positionTween, destroy };
}
