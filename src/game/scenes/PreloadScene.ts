//
// src/game/scenes/PreloadScene.ts
//
// Loads the full preload-asset-pack.json manifest (world atlases, tile
// sheets, audio cues when Euterpe ships them) plus every AI-generated PNG +
// JPG asset (96 stems registered in src/game/visual/asset_keys.ts) before
// handing off to ApolloVillageScene. Renders a native Phaser progress bar
// while loading.
//
// Owner: Thalia-v2 (legacy pack pipeline) + Helios-v2 W3 S1 (AI asset
// preload extension).
//

import * as Phaser from 'phaser';

import {
  ALL_ASSET_KEYS,
  SPRITESHEET_FRAMES,
  assetUrl,
  isSpritesheetKey,
} from '../visual/asset_keys';
import { exposeTextureMemoryHook, inspectTextureMemory } from '../visual';
import { IntroNarrativeScene } from './IntroNarrativeScene';

export class PreloadScene extends Phaser.Scene {
  private progressBar?: Phaser.GameObjects.Graphics;
  private progressBarBg?: Phaser.GameObjects.Graphics;
  private loadingText?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'Preload' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  preload() {
    this.drawProgressUI();

    this.load.on('progress', (value: number) => {
      this.progressBar?.clear();
      this.progressBar?.fillStyle(0xe8c57d, 1);
      const width = this.scale.width;
      const barWidth = Math.min(width * 0.5, 480);
      const barHeight = 16;
      this.progressBar?.fillRect(
        (width - barWidth) / 2 + 2,
        this.scale.height / 2 - barHeight / 2 + 2,
        (barWidth - 4) * value,
        barHeight - 4,
      );
    });

    this.load.on('complete', () => {
      this.progressBar?.destroy();
      this.progressBarBg?.destroy();
      this.loadingText?.destroy();
    });

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error(`[PreloadScene] asset load failed: ${file.key} at ${file.src}`);
    });

    // Legacy CC0 pack (atlases, tilesets, UI) pre-existing pre-pivot. Kept so
    // any scene still consuming `atlas_medieval_desert` / `roguelike_master`
    // / `warped_city_tileset` / `ui_panel_kenney` continues to resolve.
    this.load.pack('preload-pack', '/assets/packs/preload-asset-pack.json');

    // Helios-v2 W3 S1: enqueue every AI-generated PNG + JPG declared in the
    // asset_keys.ts registry. Registry is the single source of truth so new
    // assets land in the preload phase by adding to ASSET_KEYS / ASSET_PATHS
    // without touching this scene. Spritesheet keys (player_spritesheet etc.)
    // dispatch to this.load.spritesheet with the frame metadata; everything
    // else loads as a static image.
    this.preloadAiAssets();
  }

  create() {
    // Helios-v2 W3 S8: register Phaser AnimationManager animations for the 5
    // character spritesheets (player + apollo + caravan_vendor + synth_vendor
    // + treasurer). Each sheet is 4x4 grid 2048x2048, frame 512x512:
    //   Row 0 (frames 0-3): down-facing walk cycle
    //   Row 1 (frames 4-7): up-facing walk cycle
    //   Row 2 (frames 8-11): left-facing walk cycle
    //   Row 3 (frames 12-15): right-facing walk cycle
    //
    // Walk anims at 9 fps, idle anims (single first-frame loop) at 4 fps.
    // The keys are namespaced by spritesheet (e.g. 'player_walk_down') so
    // each sheet's anims do not collide. Anims live globally in
    // AnimationManager so any scene that loads this spritesheet can call
    // sprite.anims.play('<sheet>_walk_down') without re-registering.
    //
    // Per S8 directive item 1, this registration is shipped here in the
    // PreloadScene create() lifecycle so the animations are guaranteed
    // available before ApolloVillageScene + sub-area scenes start.
    this.registerCharacterAnimations();

    // Helios-v2 W3 S11: expose texture memory diagnostic on window for
    // Playwright + dev console + log peak measurement once.
    exposeTextureMemoryHook(this);
    const report = inspectTextureMemory(this);
    console.info(
      `[PreloadScene] texture memory peak ${report.estimatedMB} MB across ${report.textureCount} textures ` +
        `(target < 200 MB). Top: ${report.topConsumers
          .slice(0, 3)
          .map((t) => `${t.key} ${t.mb}MB`)
          .join(', ')}`,
    );

    // Aether-Vercel T6 Phase 1.6: route through IntroNarrativeScene on
    // first visit (sessionStorage gate). Skip entirely when ?intro=0
    // is present OR the player has already seen the intro this session.
    // Force replay via ?intro=1 ignores the sessionStorage flag.
    //
    // The 22 Playwright specs that depend on the
    // BootScene -> PreloadScene -> ApolloVillage chain set
    // sessionStorage.nerium.intro_seen=1 OR navigate with ?intro=0 in
    // their test fixture so the intro never plays during regression.
    // Tests that explicitly want the intro use ?intro=1.
    if (IntroNarrativeScene.shouldPlayIntro()) {
      this.scene.start('IntroNarrative');
    } else {
      // World-scoped scenes receive the active worldId via scene data.
      // For the vertical slice we hard-start ApolloVillageScene on
      // medieval_desert.
      this.scene.start('ApolloVillage', { worldId: 'medieval_desert' });
    }
  }

  /**
   * Helios-v2 W3 S8 character animation registration. Per spritesheet, build
   * 4 walk anims (down/up/left/right) at 9 fps + 4 idle anims (single-frame)
   * at 4 fps. Idempotent: skips re-registration if anim key already exists.
   */
  private registerCharacterAnimations(): void {
    const sheetKeys = [
      'player_spritesheet',
      'apollo_spritesheet',
      'caravan_vendor_spritesheet',
      'synth_vendor_spritesheet',
      'treasurer_spritesheet',
    ];
    const dirRanges: Array<{ dir: string; start: number; end: number }> = [
      { dir: 'down', start: 0, end: 3 },
      { dir: 'up', start: 4, end: 7 },
      { dir: 'left', start: 8, end: 11 },
      { dir: 'right', start: 12, end: 15 },
    ];

    let walkRegistered = 0;
    let idleRegistered = 0;
    for (const sheetKey of sheetKeys) {
      // Skip if the texture did not actually load (defensive).
      if (!this.textures.exists(sheetKey)) {
        console.warn(
          `[PreloadScene] spritesheet ${sheetKey} did not load; skipping anim registration`,
        );
        continue;
      }
      for (const { dir, start, end } of dirRanges) {
        const walkKey = `${sheetKey}_walk_${dir}`;
        if (!this.anims.exists(walkKey)) {
          this.anims.create({
            key: walkKey,
            frames: this.anims.generateFrameNumbers(sheetKey, { start, end }),
            frameRate: 9,
            repeat: -1,
          });
          walkRegistered += 1;
        }
        const idleKey = `${sheetKey}_idle_${dir}`;
        if (!this.anims.exists(idleKey)) {
          this.anims.create({
            key: idleKey,
            frames: this.anims.generateFrameNumbers(sheetKey, { start, end: start }),
            frameRate: 4,
            repeat: -1,
          });
          idleRegistered += 1;
        }
      }
    }
    console.info(
      `[PreloadScene] registered ${walkRegistered} walk anims + ${idleRegistered} idle anims across ${sheetKeys.length} spritesheets`,
    );
  }

  /**
   * Helios-v2 W3 S1: preload every key registered in asset_keys.ts. Static
   * keys land via this.load.image, spritesheet keys via this.load.spritesheet
   * with the SPRITESHEET_FRAMES metadata. Texture filter NEAREST is set in
   * BootScene game config so every preloaded texture renders crisply at
   * downscaled integer scale.
   */
  private preloadAiAssets(): void {
    let imageCount = 0;
    let sheetCount = 0;
    for (const key of ALL_ASSET_KEYS) {
      // Aether-Vercel T6 Phase 1.7.4: assets now ship via Vercel Blob; URL is
      // resolved per-key from the manifest installed by BootScene.
      const url = assetUrl(key);
      if (isSpritesheetKey(key)) {
        const frames = SPRITESHEET_FRAMES[key];
        this.load.spritesheet(key, url, frames);
        sheetCount += 1;
      } else {
        this.load.image(key, url);
        imageCount += 1;
      }
    }
    // Single concise log; per CLAUDE.md keep streams tight on long preloads.
    console.info(
      `[PreloadScene] enqueued ${imageCount} AI images + ${sheetCount} spritesheets ` +
        `(${imageCount + sheetCount} total) from asset_keys.ts registry`,
    );
  }

  private drawProgressUI() {
    const width = this.scale.width;
    const height = this.scale.height;
    const barWidth = Math.min(width * 0.5, 480);
    const barHeight = 16;

    this.cameras.main.setBackgroundColor('#0b0f19');

    this.loadingText = this.add
      .text(width / 2, height / 2 - 48, 'Loading NERIUM', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#e8c57d',
      })
      .setOrigin(0.5, 0.5);

    this.progressBarBg = this.add.graphics();
    this.progressBarBg.fillStyle(0x2a1d12, 1);
    this.progressBarBg.fillRect(
      (width - barWidth) / 2,
      height / 2 - barHeight / 2,
      barWidth,
      barHeight,
    );
    this.progressBarBg.lineStyle(2, 0xe8c57d, 1);
    this.progressBarBg.strokeRect(
      (width - barWidth) / 2,
      height / 2 - barHeight / 2,
      barWidth,
      barHeight,
    );

    this.progressBar = this.add.graphics();
  }
}
