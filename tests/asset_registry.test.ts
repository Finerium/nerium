//
// tests/asset_registry.test.ts
//
// Helios-v2 W3 S1 unit tests for the AI asset registry at
// src/game/visual/asset_keys.ts.
//
// Pattern transplanted from tests/visual_foundation.test.ts (node:test +
// node:assert strict). No vitest, no jest, no jsdom. Pure logic verification.
// Playwright covers in-browser preload smoke separately at
// tests/phaser-smoke.spec.ts.
//
// Run via: `npx tsx --test tests/asset_registry.test.ts`
//
// V6 lock: 96 active assets total (77 PNG transparent + 19 JPG full-bg).
// dust_motes stem CUT entirely V6, MUST NOT appear in registry.
//

import { strict as assert } from 'node:assert';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import {
  ASSET_KEYS,
  ASSET_PATHS,
  ALL_ASSET_KEYS,
  SPRITESHEET_FRAMES,
  SPRITESHEET_KEYS,
  isSpritesheetKey,
  type AssetKey,
} from '../src/game/visual/asset_keys';

// ============================================================================
// COUNT ASSERTIONS (V6 96-asset lock)
// ============================================================================

describe('asset_keys: V6 lock total count = 96', () => {
  it('ALL_ASSET_KEYS contains exactly 96 entries', () => {
    assert.equal(
      ALL_ASSET_KEYS.length,
      96,
      `expected 96 active assets per V6 lock, got ${ALL_ASSET_KEYS.length}`,
    );
  });

  it('ASSET_PATHS has exactly 96 entries', () => {
    const pathKeys = Object.keys(ASSET_PATHS);
    assert.equal(
      pathKeys.length,
      96,
      `expected 96 path entries, got ${pathKeys.length}`,
    );
  });

  it('every entry in ALL_ASSET_KEYS resolves to an ASSET_PATHS entry', () => {
    for (const key of ALL_ASSET_KEYS) {
      assert.ok(
        ASSET_PATHS[key],
        `ALL_ASSET_KEYS member ${key} has no ASSET_PATHS entry`,
      );
    }
  });
});

// ============================================================================
// PER-CATEGORY COUNT (V6 inventory breakdown)
// ============================================================================

describe('asset_keys: per-category counts match V6 inventory', () => {
  it('backgrounds = 13', () => {
    assert.equal(Object.keys(ASSET_KEYS.backgrounds).length, 13);
  });

  it('characters = 13 (8 static + 5 spritesheet)', () => {
    assert.equal(Object.keys(ASSET_KEYS.characters).length, 13);
  });

  it('overlays = 2', () => {
    assert.equal(Object.keys(ASSET_KEYS.overlays).length, 2);
  });

  it('props.apollo_village = 16', () => {
    assert.equal(Object.keys(ASSET_KEYS.props.apollo_village).length, 16);
  });

  it('props.caravan_road = 11', () => {
    assert.equal(Object.keys(ASSET_KEYS.props.caravan_road).length, 11);
  });

  it('props.cyberpunk_shanghai = 26', () => {
    assert.equal(Object.keys(ASSET_KEYS.props.cyberpunk_shanghai).length, 26);
  });

  it('ui.icons = 7', () => {
    assert.equal(Object.keys(ASSET_KEYS.ui.icons).length, 7);
  });

  it('ui.loading = 3', () => {
    assert.equal(Object.keys(ASSET_KEYS.ui.loading).length, 3);
  });

  it('ui.marketplace = 2', () => {
    assert.equal(Object.keys(ASSET_KEYS.ui.marketplace).length, 2);
  });

  it('ui.quest = 2', () => {
    assert.equal(Object.keys(ASSET_KEYS.ui.quest).length, 2);
  });

  it('ui.title = 1', () => {
    assert.equal(Object.keys(ASSET_KEYS.ui.title).length, 1);
  });

  it('total per-category sum = 96', () => {
    const sum =
      Object.keys(ASSET_KEYS.backgrounds).length +
      Object.keys(ASSET_KEYS.characters).length +
      Object.keys(ASSET_KEYS.overlays).length +
      Object.keys(ASSET_KEYS.props.apollo_village).length +
      Object.keys(ASSET_KEYS.props.caravan_road).length +
      Object.keys(ASSET_KEYS.props.cyberpunk_shanghai).length +
      Object.keys(ASSET_KEYS.ui.icons).length +
      Object.keys(ASSET_KEYS.ui.loading).length +
      Object.keys(ASSET_KEYS.ui.marketplace).length +
      Object.keys(ASSET_KEYS.ui.quest).length +
      Object.keys(ASSET_KEYS.ui.title).length;
    assert.equal(sum, 96, `per-category sum should be 96, got ${sum}`);
  });
});

// ============================================================================
// KEY UNIQUENESS (no collisions across categories)
// ============================================================================

describe('asset_keys: no key collision across categories', () => {
  it('all 96 keys are unique strings', () => {
    const seen = new Set<string>();
    for (const key of ALL_ASSET_KEYS) {
      assert.equal(typeof key, 'string', `key ${key} must be a string`);
      assert.ok(!seen.has(key), `duplicate key detected: ${key}`);
      seen.add(key);
    }
    assert.equal(seen.size, 96);
  });

  it('asset value matches its own key (stem identity invariant)', () => {
    // Each leaf in ASSET_KEYS satisfies leafValue === leafKey because the
    // registry uses the stem as both key and Phaser texture key.
    function walk(node: unknown): void {
      if (typeof node === 'string') return;
      if (typeof node !== 'object' || node === null) return;
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (typeof v === 'string') {
          assert.equal(
            v,
            k,
            `ASSET_KEYS leaf value mismatch: key="${k}" but value="${v}"`,
          );
        } else {
          walk(v);
        }
      }
    }
    walk(ASSET_KEYS);
  });
});

// ============================================================================
// SPRITESHEET CONFIGURATION
// ============================================================================

describe('asset_keys: spritesheet metadata for character walk cycles', () => {
  it('SPRITESHEET_FRAMES exposes exactly 5 character walk-cycle sheets', () => {
    assert.equal(Object.keys(SPRITESHEET_FRAMES).length, 5);
  });

  it('every spritesheet entry has frame 512x512 (4x4 grid 2048x2048)', () => {
    for (const key of SPRITESHEET_KEYS) {
      const frames = SPRITESHEET_FRAMES[key];
      assert.equal(frames.frameWidth, 512, `${key} frameWidth should be 512`);
      assert.equal(frames.frameHeight, 512, `${key} frameHeight should be 512`);
    }
  });

  it('every spritesheet key is also in ASSET_KEYS.characters', () => {
    const characterKeys = new Set<string>(Object.values(ASSET_KEYS.characters));
    for (const key of SPRITESHEET_KEYS) {
      assert.ok(
        characterKeys.has(key),
        `spritesheet ${key} is not in ASSET_KEYS.characters`,
      );
    }
  });

  it('isSpritesheetKey returns true only for spritesheet keys', () => {
    for (const key of ALL_ASSET_KEYS) {
      const expected = (SPRITESHEET_KEYS as readonly string[]).includes(key);
      assert.equal(
        isSpritesheetKey(key),
        expected,
        `isSpritesheetKey('${key}') mismatch: expected ${expected}`,
      );
    }
  });

  it('5 specific spritesheet stems are registered', () => {
    const expected: ReadonlyArray<string> = [
      'player_spritesheet',
      'apollo_spritesheet',
      'caravan_vendor_spritesheet',
      'synth_vendor_spritesheet',
      'treasurer_spritesheet',
    ];
    for (const stem of expected) {
      assert.ok(
        (SPRITESHEET_KEYS as readonly string[]).includes(stem),
        `expected spritesheet stem ${stem} missing from registry`,
      );
    }
  });
});

// ============================================================================
// PATH FORMAT (Next.js public URL convention)
// ============================================================================

describe('asset_keys: ASSET_PATHS conform to Next.js public URL convention', () => {
  it('every path begins with /assets/ai/', () => {
    for (const key of ALL_ASSET_KEYS) {
      const path = ASSET_PATHS[key];
      assert.ok(
        path.startsWith('/assets/ai/'),
        `path for ${key} must start with /assets/ai/, got ${path}`,
      );
    }
  });

  it('every path ends with .png or .jpg only (V6 format flexibility lock)', () => {
    for (const key of ALL_ASSET_KEYS) {
      const path = ASSET_PATHS[key];
      assert.ok(
        path.endsWith('.png') || path.endsWith('.jpg'),
        `path for ${key} must end with .png or .jpg, got ${path}`,
      );
    }
  });

  it('count per extension: 77 .png + 19 .jpg = 96 (V6 lock)', () => {
    let pngCount = 0;
    let jpgCount = 0;
    for (const key of ALL_ASSET_KEYS) {
      const path = ASSET_PATHS[key];
      if (path.endsWith('.png')) pngCount += 1;
      else if (path.endsWith('.jpg')) jpgCount += 1;
    }
    assert.equal(pngCount, 77, `expected 77 PNG, got ${pngCount}`);
    assert.equal(jpgCount, 19, `expected 19 JPG, got ${jpgCount}`);
    assert.equal(pngCount + jpgCount, 96);
  });

  it('no path references _archive subfolder (V6 lock)', () => {
    for (const key of ALL_ASSET_KEYS) {
      const path = ASSET_PATHS[key];
      assert.ok(
        !path.includes('_archive'),
        `path for ${key} must not reference _archive, got ${path}`,
      );
    }
  });
});

// ============================================================================
// dust_motes CUT (V6 lock)
// ============================================================================

describe('asset_keys: dust_motes stem cut V6, NOT in registry', () => {
  it('no key contains dust_motes substring', () => {
    for (const key of ALL_ASSET_KEYS) {
      assert.ok(
        !key.includes('dust_motes'),
        `dust_motes stem found in registry as ${key} but V6 cut entirely`,
      );
    }
  });

  it('no path contains dust_motes substring', () => {
    for (const key of ALL_ASSET_KEYS) {
      const path = ASSET_PATHS[key];
      assert.ok(
        !path.includes('dust_motes'),
        `dust_motes path found in registry as ${path} but V6 cut entirely`,
      );
    }
  });
});

// ============================================================================
// FILESYSTEM EXISTENCE (verifies symlink mount is correct)
// ============================================================================

describe('asset_keys: every registered path resolves to an on-disk file', () => {
  // The symlink mount: public/assets/ai/{...} -> _Reference/ai_generated_assets/{...}
  // Resolves at the repository root, which we locate by walking up from this
  // test file. tests/asset_registry.test.ts -> repo root is one level up.
  const repoRoot = resolve(__dirname, '..');

  it('public/assets/ai/ exists and is a directory', () => {
    const dir = resolve(repoRoot, 'public/assets/ai');
    assert.ok(existsSync(dir), `public/assets/ai/ missing at ${dir}`);
  });

  it('every ASSET_PATHS URL maps to an existing file via the symlink mount', () => {
    for (const key of ALL_ASSET_KEYS) {
      const url = ASSET_PATHS[key];
      // Strip leading slash, prepend public/
      const filePath = resolve(repoRoot, 'public', url.replace(/^\//, ''));
      assert.ok(
        existsSync(filePath),
        `asset ${key} URL ${url} does not resolve to an on-disk file at ${filePath}`,
      );
    }
  });

  it('source folder _Reference/ai_generated_assets has 96 active assets total', () => {
    const sourceRoot = resolve(repoRoot, '_Reference/ai_generated_assets');
    const categories = ['backgrounds', 'characters', 'overlays', 'props', 'ui'];
    let count = 0;
    function recurseCount(dirPath: string): void {
      const entries = readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === '_archive') continue;
        const childPath = resolve(dirPath, entry.name);
        if (entry.isDirectory()) {
          recurseCount(childPath);
        } else if (entry.isFile()) {
          if (entry.name.endsWith('.png') || entry.name.endsWith('.jpg')) {
            count += 1;
          }
        }
      }
    }
    for (const cat of categories) {
      recurseCount(resolve(sourceRoot, cat));
    }
    assert.equal(
      count,
      96,
      `source folder has ${count} active assets, V6 expects 96`,
    );
  });
});

// ============================================================================
// AssetKey type system
// ============================================================================

describe('asset_keys: AssetKey type union derived correctly', () => {
  it('a known stem narrows to AssetKey at compile time', () => {
    // Static type assertion via assignment. If ASSET_KEYS leaf shape drifts,
    // this line fails to compile and `npx tsc --noEmit` will surface it.
    const k: AssetKey = ASSET_KEYS.backgrounds.apollo_village_bg;
    assert.equal(k, 'apollo_village_bg');
  });

  it('treasurer_spritesheet narrows to both AssetKey and SpritesheetKey', () => {
    const k: AssetKey = ASSET_KEYS.characters.treasurer_spritesheet;
    assert.ok(isSpritesheetKey(k));
  });
});
