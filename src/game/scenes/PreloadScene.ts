//
// src/game/scenes/PreloadScene.ts
//
// Loads the full preload-asset-pack.json manifest (world atlases, tile
// sheets, audio cues when Euterpe ships them). Renders a native Phaser
// progress bar while loading, then hands off to ApolloVillageScene.
//
// Owner: Thalia-v2.
//

import * as Phaser from 'phaser';

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

    this.load.pack('preload-pack', '/assets/packs/preload-asset-pack.json');
  }

  create() {
    // World-scoped scenes receive the active worldId via scene data. For the
    // vertical slice we hard-start ApolloVillageScene on medieval_desert.
    this.scene.start('ApolloVillage', { worldId: 'medieval_desert' });
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
