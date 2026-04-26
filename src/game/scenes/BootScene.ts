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

import { setAssetManifest, type AssetManifestEntry } from '../visual/asset_keys';

const MANIFEST_KEY = 'asset_manifest';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' } satisfies Phaser.Types.Scenes.SettingsConfig);
  }

  preload() {
    // boot-asset-pack.json carries only the logo sheet used by PreloadScene
    // to draw a progress bar. Kept intentionally minimal so the boot phase
    // blocks for as short a time as possible.
    this.load.pack('boot-pack', '/assets/packs/boot-asset-pack.json');

    // Aether-Vercel T6 Phase 1.7.5: load the AI-asset manifest emitted by
    // `scripts/upload-assets-to-blob.ts`. Every downstream scene resolves
    // texture keys via `assetUrl(key)` which reads this manifest, so it MUST
    // land in the cache before PreloadScene + TitleScene + LoadingScene
    // queue their image loads. Phaser routes the JSON file through the same
    // loader so the existing COMPLETE handler covers both the pack and the
    // manifest fetch.
    this.load.json(MANIFEST_KEY, '/asset_manifest.json');

    // Fallback: if the pack load fails for any reason, the preloader still
    // runs with a pure-rectangle progress bar rendered in PreloadScene.
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.installManifest();
      this.launchUiAndPreload();
    });

    this.load.once(
      Phaser.Loader.Events.FILE_LOAD_ERROR,
      (fileObj: Phaser.Loader.File) => {
        console.warn(
          `[BootScene] pack load error for ${fileObj.key}; continuing to Preload anyway`,
        );
        // Manifest may still have loaded even if the boot pack failed.
        this.installManifest();
        this.launchUiAndPreload();
      },
    );
  }

  /**
   * Pull the loaded manifest JSON out of the Phaser cache and hand it to the
   * asset_keys.ts module so `assetUrl(key)` resolves. Idempotent and tolerant
   * of an absent cache entry: surfaces a single console error so downstream
   * `assetUrl` exceptions point at the root cause without flooding logs.
   */
  private installManifest(): void {
    const m = this.cache.json.get(MANIFEST_KEY) as
      | Record<string, AssetManifestEntry>
      | undefined;
    if (!m) {
      console.error(
        '[BootScene] /asset_manifest.json missing from cache. ' +
          'Verify scripts/upload-assets-to-blob.ts ran and the file is served by Next.js public/.',
      );
      return;
    }
    try {
      setAssetManifest(m);
      console.info(
        `[BootScene] asset manifest installed (${Object.keys(m).length} entries)`,
      );
    } catch (err) {
      console.error('[BootScene] setAssetManifest threw', err);
    }
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
