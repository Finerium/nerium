//
// src/game/scenes/TitleScene.ts
//
// Helios-v2 W3 S10: title screen scene + "Press Start" prompt + Enter/Space/E
// keyhandler that fades to ApolloVillageScene.
//
// Per S10 directive 1, the scene displays the `title_screen` PNG (Prompt 51)
// full-screen + a blinking "Press Start" prompt overlay + tween fade entry.
// On any of Enter/Space/E key down, a fade-out tween runs and starts the
// Preload/ApolloVillage chain.
//
// TitleScene is REGISTERED in the Phaser game scene array but is NOT in the
// default boot chain (BootScene -> Preload -> ApolloVillage stays the same
// to preserve the 22 Playwright spec contracts). The TitleScene is reached
// when:
//   1. User navigates to /play?title=1 (production demo entry point), OR
//   2. Window flag __NERIUM_TITLE_SCREEN__ === true is set before boot, OR
//   3. Caller manually invokes scene.start('Title').
//
// The Title screen is a Demo show-and-tell UX. The boot chain default
// remains identical to S8 ship so no regression in test sweep.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import {
  ASSET_KEYS,
  assetUrl,
  isAssetManifestReady,
  setAssetManifest,
  type AssetManifestEntry,
} from '../visual/asset_keys';

const SCENE_KEY = 'Title';
const FADE_IN_MS = 600;
const FADE_OUT_MS = 600;

export class TitleScene extends Phaser.Scene {
  private titleImage?: Phaser.GameObjects.Image;
  private pressStartText?: Phaser.GameObjects.Text;
  private blinkTween?: Phaser.Tweens.Tween;
  private dismissed = false;
  private enterKey?: Phaser.Input.Keyboard.Key;
  private spaceKey?: Phaser.Input.Keyboard.Key;
  private eKey?: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: SCENE_KEY } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  preload() {
    // TitleScene runs BEFORE PreloadScene, so title_screen + Press Start
    // assets are not yet in the texture cache. Load only what we need at
    // this scene specifically. The full registry preload follows in
    // PreloadScene.
    //
    // Aether-Vercel T6 Phase 1.7.4: when the title route is forced via
    // /play?title=1 BEFORE BootScene finishes, the asset manifest may not
    // yet be installed. Defensively load the manifest first if absent, then
    // chain the title image enqueue inside the loader complete handler.
    if (isAssetManifestReady()) {
      if (!this.textures.exists(ASSET_KEYS.ui.title.title_screen)) {
        this.load.image(
          ASSET_KEYS.ui.title.title_screen,
          assetUrl('title_screen'),
        );
      }
      return;
    }
    this.load.json('asset_manifest', '/asset_manifest.json');
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      const m = this.cache.json.get('asset_manifest') as
        | Record<string, AssetManifestEntry>
        | undefined;
      if (!m) {
        console.error(
          '[TitleScene] /asset_manifest.json missing from cache; title image cannot resolve',
        );
        return;
      }
      try {
        setAssetManifest(m);
      } catch (err) {
        console.error('[TitleScene] setAssetManifest threw', err);
        return;
      }
      // Queue the title image now that the manifest is installed. The
      // create() lifecycle waits for textures to exist before composition.
      if (!this.textures.exists(ASSET_KEYS.ui.title.title_screen)) {
        this.load.image(
          ASSET_KEYS.ui.title.title_screen,
          assetUrl('title_screen'),
        );
        this.load.start();
      }
    });
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.cameras.main.setBackgroundColor('#0b0f19');
    this.cameras.main.fadeIn(FADE_IN_MS, 0, 0, 0);

    // Title screen PNG full-screen.
    if (this.textures.exists(ASSET_KEYS.ui.title.title_screen)) {
      this.titleImage = this.add.image(w / 2, h / 2, ASSET_KEYS.ui.title.title_screen);
      // Cover-fit: scale image to fully cover the viewport while preserving
      // aspect. The PNG is shipped at near-1280x720; use displaySize.
      const tex = this.titleImage.texture.getSourceImage() as HTMLImageElement;
      const sw = tex.width;
      const sh = tex.height;
      const scale = Math.max(w / sw, h / sh);
      this.titleImage.setDisplaySize(sw * scale, sh * scale);
      this.titleImage.setScrollFactor(0);
      this.titleImage.setDepth(0);
    } else {
      // Fallback gradient when title texture absent (defensive).
      const fallbackBg = this.add.rectangle(w / 2, h / 2, w, h, 0x14181f);
      fallbackBg.setScrollFactor(0);
    }

    // "Press Start" prompt with blinking alpha tween.
    this.pressStartText = this.add
      .text(w / 2, h * 0.85, 'Press Enter to begin', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#f4eedf',
        stroke: '#0a0d12',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(10);

    this.blinkTween = this.tweens.add({
      targets: this.pressStartText,
      alpha: { from: 0.4, to: 1.0 },
      duration: 700,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    // Key bindings.
    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.enterKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
      this.spaceKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.eKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    }

    // Allow pointer click anywhere as start trigger (mobile + accessibility).
    this.input.once('pointerdown', () => this.dismissTitle());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.blinkTween?.stop();
      this.blinkTween = undefined;
      this.titleImage?.destroy();
      this.pressStartText?.destroy();
    });
  }

  update() {
    if (this.dismissed) return;
    if (
      (this.enterKey && Phaser.Input.Keyboard.JustDown(this.enterKey)) ||
      (this.spaceKey && Phaser.Input.Keyboard.JustDown(this.spaceKey)) ||
      (this.eKey && Phaser.Input.Keyboard.JustDown(this.eKey))
    ) {
      this.dismissTitle();
    }
  }

  private dismissTitle() {
    if (this.dismissed) return;
    this.dismissed = true;
    this.cameras.main.fadeOut(FADE_OUT_MS, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('Preload');
    });
  }
}
