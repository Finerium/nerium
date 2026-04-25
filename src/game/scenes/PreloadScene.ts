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
  ASSET_PATHS,
  SPRITESHEET_FRAMES,
  isSpritesheetKey,
} from '../visual/asset_keys';

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
    // World-scoped scenes receive the active worldId via scene data. For the
    // vertical slice we hard-start ApolloVillageScene on medieval_desert.
    this.scene.start('ApolloVillage', { worldId: 'medieval_desert' });
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
      const url = ASSET_PATHS[key];
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
