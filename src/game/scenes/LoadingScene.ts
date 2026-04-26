//
// src/game/scenes/LoadingScene.ts
//
// Helios-v2 W3 S10: explicit loading-screen scene used between major scene
// swaps for inter-world transition feel. Displays the `loading_screen` PNG
// (Prompt 50) full-screen + a progress bar overlay + minimum-display
// timer (1.5s) so the player perceives a coherent transition rather than
// a jump-cut.
//
// LoadingScene is REGISTERED in the Phaser game scene array but NOT in the
// default boot chain. It is invoked manually via:
//
//   scene.start('Loading', {
//     nextSceneKey: 'CaravanRoad',
//     nextSceneData: { worldId: 'medieval_desert', ... },
//     transitionImageKey?: 'transition_apollo_to_caravan',
//   });
//
// LoadingScene displays the optional inter-world transition image OR the
// generic loading_screen PNG, holds for at least 1.5s, then starts the
// nextScene.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import { ASSET_KEYS, ASSET_PATHS, type AssetKey } from '../visual/asset_keys';

const SCENE_KEY = 'Loading';
const MIN_DISPLAY_MS = 1500;
const FADE_IN_MS = 400;
const FADE_OUT_MS = 400;

export interface LoadingSceneData {
  /** The Phaser scene key to start once loading-display minimum elapses. */
  nextSceneKey: string;
  /** Optional data forwarded to scene.start() of the next scene. */
  nextSceneData?: object;
  /**
   * Optional override transition image key. When set, the LoadingScene will
   * display that asset full-screen instead of the generic loading_screen.
   * Useful for inter-world fade (e.g. transition_apollo_to_caravan).
   */
  transitionImageKey?: AssetKey;
}

export class LoadingScene extends Phaser.Scene {
  private nextSceneKey: string = '';
  private nextSceneData?: object;
  private transitionImageKey?: AssetKey;
  private elapsedSinceCreate = 0;
  private dispatched = false;

  constructor() {
    super({ key: SCENE_KEY } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  init(data: LoadingSceneData) {
    this.nextSceneKey = data.nextSceneKey;
    this.nextSceneData = data.nextSceneData;
    this.transitionImageKey = data.transitionImageKey;
    this.elapsedSinceCreate = 0;
    this.dispatched = false;
  }

  preload() {
    // Defensively load the loading_screen + transition images if not yet
    // in cache. PreloadScene already enqueues them via the registry, but
    // a transition between non-Preload routes may invoke LoadingScene
    // before Preload completes.
    if (!this.textures.exists(ASSET_KEYS.ui.loading.loading_screen)) {
      this.load.image(
        ASSET_KEYS.ui.loading.loading_screen,
        ASSET_PATHS.loading_screen,
      );
    }
    if (
      this.transitionImageKey &&
      !this.textures.exists(this.transitionImageKey)
    ) {
      this.load.image(
        this.transitionImageKey,
        ASSET_PATHS[this.transitionImageKey],
      );
    }
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.cameras.main.setBackgroundColor('#0b0f19');
    this.cameras.main.fadeIn(FADE_IN_MS, 0, 0, 0);

    // Pick the display image: transition image if set + loaded, otherwise
    // the generic loading_screen.
    const displayKey =
      this.transitionImageKey && this.textures.exists(this.transitionImageKey)
        ? this.transitionImageKey
        : this.textures.exists(ASSET_KEYS.ui.loading.loading_screen)
          ? ASSET_KEYS.ui.loading.loading_screen
          : null;

    if (displayKey) {
      const img = this.add.image(w / 2, h / 2, displayKey);
      const tex = img.texture.getSourceImage() as HTMLImageElement;
      const scale = Math.max(w / tex.width, h / tex.height);
      img.setDisplaySize(tex.width * scale, tex.height * scale);
      img.setScrollFactor(0);
      img.setDepth(0);
    }

    // Progress text + bar overlay near bottom.
    const loadingText = this.add
      .text(w / 2, h * 0.85, 'Loading', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#f4eedf',
        stroke: '#0a0d12',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(10);

    // Animated dots: '.', '..', '...'
    let dotCount = 0;
    this.time.addEvent({
      delay: 500,
      callback: () => {
        dotCount = (dotCount + 1) % 4;
        loadingText.setText('Loading' + '.'.repeat(dotCount));
      },
      loop: true,
    });
  }

  update(_time: number, delta: number) {
    this.elapsedSinceCreate += delta;
    if (this.dispatched) return;
    if (this.elapsedSinceCreate >= MIN_DISPLAY_MS) {
      this.dispatched = true;
      this.cameras.main.fadeOut(FADE_OUT_MS, 0, 0, 0);
      this.cameras.main.once(
        Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
        () => {
          this.scene.start(this.nextSceneKey, this.nextSceneData ?? {});
        },
      );
    }
  }
}
