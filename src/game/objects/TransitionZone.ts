//
// src/game/objects/TransitionZone.ts
//
// T-WORLD W7: generic inter-world / sub-area scene transition trigger.
//
// Usage:
//   const gate = new TransitionZone(this, 1370, 480, {
//     destSceneKey: 'CaravanRoad',
//     destSceneData: { worldId: 'medieval_desert', spawn: { x: 96, y: 480 } },
//     promptLabel: 'Press E to travel to Caravan Road',
//     direction: 'east',
//     color: 0xfff5e0,
//     useLoadingScene: true,
//   });
//
//   // Per frame inside scene update():
//   gate.update(time, this.player);
//
//   // Inside scene SHUTDOWN cleanup:
//   gate.destroy();
//
// One TransitionZone instance owns:
//   - One arrow chevron Container (visual indicator pointing the direction)
//   - One persistent label text (only visible inside proximity radius)
//   - Two tweens: idle pulse + proximity scale pulse
//   - One key handle (E)
//   - Cooldown + transitioning latch so a single E press does not double-fire
//
// Design rationale per the T-WORLD audit doc:
//   1. Mirrors the established landmark E-key proximity + glyph + prompt
//      pattern from Helios-v2 S7 so the player UX stays consistent across
//      landmarks (sub-area entries) and inter-world gates.
//   2. Uses LoadingScene helper by default for cinematic transition feel
//      (1.5s loading_screen between worlds) instead of an immediate hard
//      cut. Pure fade transitions can be obtained by setting
//      `useLoadingScene: false` for sub-area returns + fast iterations.
//   3. Owns its own E key handle so the parent scene's existing E key
//      polling for landmarks does not need to coordinate with the gate.
//      Phaser's keyboard manager allows multiple JustDown polls of the same
//      physical key in the same frame; gates and landmarks are physically
//      separated so co-fire is impossible in practice.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import {
  buildDirectionChevron,
  buildGateIdleTween,
  buildGateProximityTween,
  type ChevronDirection,
} from '../visual/transition_hints';

export interface TransitionZoneOptions {
  /** Phaser scene key to start on E-key trigger. */
  destSceneKey: string;
  /** Optional payload forwarded to scene.start. */
  destSceneData?: object;
  /** Prompt label shown inside proximity radius. */
  promptLabel: string;
  /** Direction the chevron points. Visual hint only. */
  direction: ChevronDirection;
  /** Chevron + label color. Default 0xfff5e0 (warm cream). */
  color?: number;
  /** Proximity radius in pixels. Default 96. */
  radius?: number;
  /** Camera fade-out duration in ms. Default 500. */
  fadeOutMs?: number;
  /**
   * When true, route through the LoadingScene helper for a cinematic
   * 1.5s inter-world fade. When false, scene.start immediately after
   * fadeout. Default true.
   */
  useLoadingScene?: boolean;
  /**
   * Optional override loading-screen image key when useLoadingScene true.
   * Falls through to the generic loading_screen if not set or not loaded.
   */
  transitionImageKey?: string;
  /**
   * Vertical offset above (x, y) for the chevron + label anchor. Default 60.
   */
  glyphOffsetY?: number;
}

const COOLDOWN_MS = 500;
const GATE_DEPTH = 9001;
const LABEL_OFFSET_FROM_GLYPH = 26;

export class TransitionZone {
  private readonly scene: Phaser.Scene;
  private readonly anchorX: number;
  private readonly anchorY: number;
  private readonly opts: Required<
    Pick<
      TransitionZoneOptions,
      'destSceneKey' | 'promptLabel' | 'direction' | 'color' | 'radius' | 'fadeOutMs' | 'useLoadingScene' | 'glyphOffsetY'
    >
  > & { destSceneData?: object; transitionImageKey?: string };

  private chevronContainer?: Phaser.GameObjects.Container;
  private idleTween?: Phaser.Tweens.Tween;
  private proximityTween?: Phaser.Tweens.Tween;
  private promptText?: Phaser.GameObjects.Text;
  private proximityActive = false;
  private transitioning = false;
  private eKey?: Phaser.Input.Keyboard.Key;
  private lastEmitAt = 0;
  private destroyed = false;
  private chevronBaseY = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, options: TransitionZoneOptions) {
    this.scene = scene;
    this.anchorX = x;
    this.anchorY = y;
    this.opts = {
      destSceneKey: options.destSceneKey,
      destSceneData: options.destSceneData,
      promptLabel: options.promptLabel,
      direction: options.direction,
      color: options.color ?? 0xfff5e0,
      radius: options.radius ?? 96,
      fadeOutMs: options.fadeOutMs ?? 500,
      useLoadingScene: options.useLoadingScene ?? true,
      glyphOffsetY: options.glyphOffsetY ?? 60,
      transitionImageKey: options.transitionImageKey,
    };
    this.build();
  }

  private build(): void {
    const baseY = this.anchorY - this.opts.glyphOffsetY;
    this.chevronBaseY = baseY;

    this.chevronContainer = buildDirectionChevron(
      this.scene,
      this.anchorX,
      baseY,
      this.opts.direction,
      { color: this.opts.color },
    );
    this.chevronContainer.setDepth(GATE_DEPTH);
    this.chevronContainer.setAlpha(0.7);

    this.idleTween = buildGateIdleTween(this.scene, this.chevronContainer, baseY);

    const colorHex = '#' + this.opts.color.toString(16).padStart(6, '0');
    this.promptText = this.scene.add.text(
      this.anchorX,
      baseY - LABEL_OFFSET_FROM_GLYPH,
      this.opts.promptLabel,
      {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: colorHex,
        align: 'center',
        backgroundColor: 'rgba(10, 10, 16, 0.82)',
        padding: { left: 8, right: 8, top: 4, bottom: 4 },
        stroke: '#0a0a10',
        strokeThickness: 2,
      },
    );
    this.promptText.setOrigin(0.5, 1);
    this.promptText.setDepth(GATE_DEPTH);
    this.promptText.setVisible(false);

    const keyboard = this.scene.input.keyboard;
    if (keyboard) {
      this.eKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    }
  }

  /**
   * Per-frame proximity check + E-key trigger handler. Call from scene
   * update(). Returns true if the transition fired this tick (caller can
   * use this to short-circuit other interactive polling for the same
   * frame, though gates are placed away from landmarks so co-fire is rare).
   */
  update(time: number, player: Phaser.GameObjects.GameObject | undefined): boolean {
    if (this.destroyed || this.transitioning) return false;
    if (!player) return false;

    const px = (player as { x?: number }).x;
    const py = (player as { y?: number }).y;
    if (typeof px !== 'number' || typeof py !== 'number') return false;

    const dx = px - this.anchorX;
    const dy = py - this.anchorY;
    const dist = Math.hypot(dx, dy);
    const inProximity = dist <= this.opts.radius;

    if (inProximity !== this.proximityActive) {
      this.proximityActive = inProximity;
      this.applyProximityState(inProximity);
    }

    if (!inProximity || !this.eKey) return false;
    if (!Phaser.Input.Keyboard.JustDown(this.eKey)) return false;
    if (time - this.lastEmitAt < COOLDOWN_MS) return false;
    this.lastEmitAt = time;
    this.fire();
    return true;
  }

  private applyProximityState(inProximity: boolean): void {
    if (!this.chevronContainer || !this.promptText) return;
    if (inProximity) {
      this.idleTween?.pause();
      this.chevronContainer.setAlpha(1.0);
      this.chevronContainer.setY(this.chevronBaseY);
      this.proximityTween?.stop();
      this.proximityTween = buildGateProximityTween(this.scene, this.chevronContainer);
      this.promptText.setVisible(true);
    } else {
      this.proximityTween?.stop();
      this.proximityTween = undefined;
      this.chevronContainer.setScale(1.0);
      this.idleTween?.resume();
      this.promptText.setVisible(false);
    }
  }

  private fire(): void {
    this.transitioning = true;
    // Hide the prompt + freeze the chevron immediately so a queued frame
    // does not paint the prompt during the fadeout.
    this.promptText?.setVisible(false);
    this.proximityTween?.stop();

    const cam = this.scene.cameras.main;
    cam.fadeOut(this.opts.fadeOutMs, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      if (this.opts.useLoadingScene) {
        const loadingData: Record<string, unknown> = {
          nextSceneKey: this.opts.destSceneKey,
          nextSceneData: this.opts.destSceneData ?? {},
        };
        if (this.opts.transitionImageKey) {
          loadingData.transitionImageKey = this.opts.transitionImageKey;
        }
        this.scene.scene.start('Loading', loadingData);
      } else {
        this.scene.scene.start(this.opts.destSceneKey, this.opts.destSceneData ?? {});
      }
    });
  }

  /** Tear down all visual + tween + key handles. Idempotent. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      this.idleTween?.stop();
      this.proximityTween?.stop();
    } catch (err) {
      console.error('[TransitionZone] tween stop threw', err);
    }
    this.idleTween = undefined;
    this.proximityTween = undefined;
    try {
      this.chevronContainer?.destroy(true);
    } catch (err) {
      console.error('[TransitionZone] chevron container destroy threw', err);
    }
    this.chevronContainer = undefined;
    try {
      this.promptText?.destroy();
    } catch (err) {
      console.error('[TransitionZone] prompt text destroy threw', err);
    }
    this.promptText = undefined;
    // Note: the E key handle is owned globally by the keyboard manager;
    // we intentionally do NOT removeKey here because the parent scene may
    // still be polling the same physical key for its landmark interactions.
    // Scene shutdown destroys the keyboard plugin which clears all keys.
    this.eKey = undefined;
  }
}
