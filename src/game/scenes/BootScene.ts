//
// src/game/scenes/BootScene.ts
//
// Initial Phaser scene. Responsible for the tiny boot-only asset surface
// (logo art needed for the loading progress bar) and handing control to
// PreloadScene, which reads the full preload-asset-pack.json manifest.
//
// Owner: Thalia-v2 per docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md Section
// 4.4 and the phaser-scene-authoring skill (four-scene convention).
//

import * as Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  preload() {
    // boot-asset-pack.json carries only the logo sheet used by PreloadScene
    // to draw a progress bar. Kept intentionally minimal so the boot phase
    // blocks for as short a time as possible.
    this.load.pack('boot-pack', '/assets/packs/boot-asset-pack.json');

    // Fallback: if the pack load fails for any reason, the preloader still
    // runs with a pure-rectangle progress bar rendered in PreloadScene.
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.launchUiAndPreload();
    });

    this.load.once(
      Phaser.Loader.Events.FILE_LOAD_ERROR,
      (fileObj: Phaser.Loader.File) => {
        console.warn(
          `[BootScene] pack load error for ${fileObj.key}; continuing to Preload anyway`,
        );
        this.launchUiAndPreload();
      },
    );
  }

  create() {
    // Unreachable on normal success path (COMPLETE fires scene.start in
    // preload). Included as defense against the edge case where preload
    // emits no files and jumps directly to create.
    this.launchUiAndPreload();
  }

  /**
   * Boreas NP W3 Session 1: launch the persistent UIScene overlay before
   * starting Preload + world scenes. UIScene mounts the Minecraft chat
   * DOMElement input + history container with depth above world scenes;
   * `bringToTop` ensures every later `scene.start()` between world scenes
   * (Apollo -> CaravanRoad -> CyberpunkShanghai) leaves UIScene on top.
   *
   * Idempotent: running this method twice (e.g. on the COMPLETE +
   * FILE_LOAD_ERROR race) only launches UIScene once because Phaser ignores
   * duplicate launch calls for an already-active scene.
   */
  private launchUiAndPreload(): void {
    if (!this.scene.isActive('UIScene') && !this.scene.isPaused('UIScene')) {
      this.scene.launch('UIScene');
    }
    this.scene.bringToTop('UIScene');
    this.scene.start('Preload');
  }
}
