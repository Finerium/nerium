//
// tests/visual_foundation.test.ts
//
// Helios-v2 W3 S1 unit tests for the visual foundation modules:
//   - src/game/visual/palette.ts (palette tokens + gradient + helpers)
//   - src/game/visual/depth.ts (5-layer depth bands + dynamicDepthFor)
//   - src/game/visual/ysort.ts (SceneSorter + applyGroundOrigin)
//
// Pattern transplanted from tests/dialogue.test.ts (node:test + node:assert
// strict). No vitest, no jest, no jsdom. Pure logic verification only;
// Playwright covers in-browser scene smoke separately at
// tests/phaser-smoke.spec.ts.
//
// Run via: `npx tsx --test tests/visual_foundation.test.ts`
//

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  SHARED,
  MEDIEVAL_DESERT,
  CYBERPUNK_SHANGHAI,
  STEAMPUNK_VICTORIAN,
  CARAVAN_ROAD,
  PALETTE_BY_WORLD,
  buildSkyBands,
  hexToCss,
  rgba,
  lerpColor,
} from '../src/game/visual/palette';

import {
  DEPTH,
  depthForLayerKind,
  dynamicDepthFor,
  isInBand,
} from '../src/game/visual/depth';

import {
  SceneSorter,
  applyGroundOrigin,
  registerGroundSprite,
  type YSortable,
} from '../src/game/visual/ysort';

// ============================================================================
// PALETTE TESTS
// ============================================================================

describe('palette: SHARED tokens align to Marshall pricing landing OKLCH', () => {
  it('exposes all required cross-scene tokens', () => {
    const required = [
      'ink',
      'inkDeep',
      'inkSoft',
      'inkLine',
      'phos',
      'phosDim',
      'phosDeep',
      'phosFaint',
      'amber',
      'amberDeep',
      'rose',
      'fog',
      'bone',
      'boneSoft',
      'black',
      'white',
    ];
    for (const key of required) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(SHARED, key),
        `SHARED missing required token: ${key}`,
      );
      const value = (SHARED as Record<string, number>)[key];
      assert.equal(typeof value, 'number', `SHARED.${key} must be a number`);
      assert.ok(value >= 0 && value <= 0xffffff, `SHARED.${key} must be a 24-bit color`);
    }
  });

  it('phos token matches OKLCH-derived hex 0x82f0a0 (cross-scene brand cohesion)', () => {
    assert.equal(SHARED.phos, 0x82f0a0);
  });

  it('amber + rose accent tokens match landing :root palette', () => {
    assert.equal(SHARED.amber, 0xf0b45a);
    assert.equal(SHARED.rose, 0xf08070);
  });
});

describe('palette: per-world palettes carry 32-48 saturated colors', () => {
  it('MEDIEVAL_DESERT carries at least 32 distinct color tokens', () => {
    const keys = Object.keys(MEDIEVAL_DESERT);
    assert.ok(keys.length >= 32, `MEDIEVAL_DESERT has ${keys.length} keys, need >= 32`);
    assert.ok(keys.length <= 64, `MEDIEVAL_DESERT has ${keys.length} keys, soft cap 64`);
  });

  it('CYBERPUNK_SHANGHAI exposes both neon primaries cyan + magenta', () => {
    assert.equal(CYBERPUNK_SHANGHAI.neonCyan, 0x00f0ff);
    assert.equal(CYBERPUNK_SHANGHAI.neonMagenta, 0xff2e88);
  });

  it('STEAMPUNK_VICTORIAN brass + walnut + oxblood + electric arc primaries set', () => {
    assert.equal(STEAMPUNK_VICTORIAN.brassMid, 0xa47148);
    assert.equal(STEAMPUNK_VICTORIAN.walnut, 0x3d2b1f);
    assert.equal(STEAMPUNK_VICTORIAN.oxblood, 0x6b2e26);
    // electric arc blue accent per agent prompt
    assert.equal(STEAMPUNK_VICTORIAN.arcCyan, 0x68a8f8);
  });

  it('CARAVAN_ROAD palette includes both desert sand + cyberpunk neon teaser', () => {
    assert.ok(CARAVAN_ROAD.skyAmber >= 0);
    assert.ok(CARAVAN_ROAD.cityNeonCyan >= 0);
    assert.notEqual(
      CARAVAN_ROAD.skyAmber,
      CARAVAN_ROAD.cityNeonCyan,
      'caravan transitional palette must keep desert + cyberpunk distinct',
    );
  });

  it('PALETTE_BY_WORLD lookup returns correct palette per world id', () => {
    assert.strictEqual(PALETTE_BY_WORLD.medieval_desert, MEDIEVAL_DESERT);
    assert.strictEqual(PALETTE_BY_WORLD.cyberpunk_shanghai, CYBERPUNK_SHANGHAI);
    assert.strictEqual(PALETTE_BY_WORLD.steampunk_victorian, STEAMPUNK_VICTORIAN);
    assert.strictEqual(PALETTE_BY_WORLD.caravan_road, CARAVAN_ROAD);
  });
});

describe('palette: gradient + color helpers', () => {
  it('hexToCss pads to 6-digit hex with leading hash', () => {
    assert.equal(hexToCss(0x000000), '#000000');
    assert.equal(hexToCss(0x82f0a0), '#82f0a0');
    assert.equal(hexToCss(0x00ff00), '#00ff00');
    assert.equal(hexToCss(0xff0000), '#ff0000');
  });

  it('rgba returns valid CSS rgba string', () => {
    assert.equal(rgba(0xff0000, 1), 'rgba(255, 0, 0, 1)');
    assert.equal(rgba(0x00ff00, 0.5), 'rgba(0, 255, 0, 0.5)');
    assert.equal(rgba(0x000000, 0), 'rgba(0, 0, 0, 0)');
  });

  it('rgba throws for out-of-range alpha', () => {
    assert.throws(() => rgba(0xffffff, -0.1));
    assert.throws(() => rgba(0xffffff, 1.5));
  });

  it('lerpColor returns endpoints at t=0 and t=1', () => {
    assert.equal(lerpColor(0xff0000, 0x00ff00, 0), 0xff0000);
    assert.equal(lerpColor(0xff0000, 0x00ff00, 1), 0x00ff00);
  });

  it('lerpColor midpoint between red and green is olive-ish', () => {
    const mid = lerpColor(0xff0000, 0x00ff00, 0.5);
    // Channel-wise lerp: r = 128, g = 128, b = 0 => 0x808000
    assert.equal(mid, 0x808000);
  });

  it('lerpColor clamps t outside [0,1]', () => {
    assert.equal(lerpColor(0xff0000, 0x00ff00, -1), 0xff0000);
    assert.equal(lerpColor(0xff0000, 0x00ff00, 2), 0x00ff00);
  });

  it('buildSkyBands returns a non-empty array for every world', () => {
    for (const world of [
      'medieval_desert',
      'cyberpunk_shanghai',
      'steampunk_victorian',
      'caravan_road',
    ] as const) {
      const bands = buildSkyBands(world);
      assert.ok(bands.length >= 3, `world ${world} has ${bands.length} bands, need >= 3`);
      for (const band of bands) {
        assert.ok(band.yRatio >= 0 && band.yRatio <= 1, 'yRatio in [0,1]');
        assert.ok(band.heightRatio > 0 && band.heightRatio <= 1, 'heightRatio (0,1]');
        assert.ok(typeof band.color === 'number', 'color is number');
      }
    }
  });

  it('buildSkyBands medieval_desert covers cobalt-to-amber dusk progression', () => {
    const bands = buildSkyBands('medieval_desert');
    assert.ok(bands.length >= 5, 'medieval needs >=5 bands for dusk gradient');
    // First band must be skyDeep (darkest), last band warmer than first
    assert.equal(bands[0].color, MEDIEVAL_DESERT.skyDeep);
    assert.equal(bands.at(-1)?.color, MEDIEVAL_DESERT.skyHorizonGlow);
  });
});

// ============================================================================
// DEPTH TESTS
// ============================================================================

describe('depth: 5-layer band constants enforce render order', () => {
  it('SKY_GRADIENT < PARALLAX_BG < GROUND_TILES < WORLD_TILES < ABOVE_TILES', () => {
    assert.ok(DEPTH.SKY_GRADIENT < DEPTH.PARALLAX_BG, 'sky behind parallax');
    assert.ok(DEPTH.PARALLAX_BG < DEPTH.GROUND_TILES, 'parallax behind ground');
    assert.ok(DEPTH.GROUND_TILES < DEPTH.WORLD_TILES, 'ground behind world');
    assert.ok(DEPTH.WORLD_TILES < DEPTH.ABOVE_TILES, 'world behind canopy');
    assert.ok(DEPTH.ABOVE_TILES < DEPTH.AMBIENT_FX, 'canopy behind FX');
    assert.ok(DEPTH.AMBIENT_FX < DEPTH.UI_OVERLAY, 'FX behind UI overlay');
    assert.ok(DEPTH.DAY_NIGHT_OVERLAY < DEPTH.UI_SCENE, 'tint behind chat HUD');
  });

  it('fixed values match visual_manifest contract Section 3.3', () => {
    assert.equal(DEPTH.SKY_GRADIENT, -100);
    assert.equal(DEPTH.PARALLAX_BG, -50);
    assert.equal(DEPTH.GROUND_TILES, -10);
    assert.equal(DEPTH.WORLD_TILES, 0);
    assert.equal(DEPTH.DYNAMIC_ENTITY_OFFSET, 1);
    assert.equal(DEPTH.ABOVE_TILES, 100);
    assert.equal(DEPTH.AMBIENT_FX, 500);
    assert.equal(DEPTH.UI_OVERLAY, 9000);
    assert.equal(DEPTH.DAY_NIGHT_OVERLAY, 9500);
    assert.equal(DEPTH.UI_SCENE, 10000);
  });

  it('depthForLayerKind maps each manifest layer kind to its band', () => {
    assert.equal(depthForLayerKind('sky_gradient'), DEPTH.SKY_GRADIENT);
    assert.equal(depthForLayerKind('parallax_bg'), DEPTH.PARALLAX_BG);
    assert.equal(depthForLayerKind('ground_tiles'), DEPTH.GROUND_TILES);
    assert.equal(depthForLayerKind('world_tiles'), DEPTH.WORLD_TILES);
    assert.equal(depthForLayerKind('above_tiles'), DEPTH.ABOVE_TILES);
  });

  it('dynamicDepthFor places y=200 sprite ahead of static world-tile baseline', () => {
    const playerDepth = dynamicDepthFor(200);
    assert.equal(playerDepth, DEPTH.WORLD_TILES + DEPTH.DYNAMIC_ENTITY_OFFSET + 200);
    assert.ok(
      playerDepth > DEPTH.WORLD_TILES,
      'y-sorted player must be above static world tiles',
    );
  });

  it('y-sort: sprite at higher y occludes sprite at lower y', () => {
    const npcAtY150 = dynamicDepthFor(150);
    const playerAtY200 = dynamicDepthFor(200);
    assert.ok(
      playerAtY200 > npcAtY150,
      'player at y=200 should render above NPC at y=150 (occlusion correctness)',
    );
  });

  it('above_tiles at depth 100 stays above sprites placed in upper viewport region', () => {
    // ABOVE_TILES = 100 per visual_manifest.contract Section 3.3 lock. The
    // canopy / roof / awning convention is that these decorations are
    // placed at HIGH world position (small y, near top of scene) where any
    // y-sorted sprite that walks under them has y < 99 and so dynamicDepthFor
    // returns < 100. Sprites at the bottom of the viewport (y > 99) do not
    // walk under canopy in practice.
    //
    // Architectural note (Helios-v2 S1): for full-viewport coverage in a
    // 480x270 internal resolution, sprites at y > 99 will outrank
    // ABOVE_TILES. This is intentional per contract; canopy authoring must
    // place props at top of scene only.
    const spriteUpper = dynamicDepthFor(50);
    assert.ok(
      DEPTH.ABOVE_TILES > spriteUpper,
      'above_tiles must stay above sprite walking under canopy at y=50',
    );
    const spriteAtTop = dynamicDepthFor(98);
    assert.ok(
      DEPTH.ABOVE_TILES > spriteAtTop,
      'above_tiles must stay above sprite at y=98 (just below canopy band edge)',
    );
  });

  it('isInBand classifies depths correctly', () => {
    assert.ok(isInBand(-100, 'SKY_GRADIENT'));
    assert.ok(isInBand(-50, 'PARALLAX_BG'));
    assert.ok(isInBand(-10, 'GROUND_TILES'));
    assert.ok(isInBand(0, 'WORLD_TILES'));
    assert.ok(isInBand(50, 'WORLD_TILES'), 'y-sort 50 still in WORLD_TILES band');
    assert.ok(isInBand(99, 'WORLD_TILES'));
    assert.ok(isInBand(100, 'ABOVE_TILES'));
    assert.ok(isInBand(500, 'AMBIENT_FX'));
    assert.ok(isInBand(9500, 'DAY_NIGHT_OVERLAY'));
    assert.ok(isInBand(10000, 'UI_SCENE'));
    // Negative tests: ensure cross-band mismatches fail
    assert.ok(!isInBand(0, 'SKY_GRADIENT'));
    assert.ok(!isInBand(100, 'WORLD_TILES'));
  });
});

// ============================================================================
// Y-SORT SCENE SORTER TESTS
// ============================================================================

describe('ysort: SceneSorter manages a pool of y-sortable sprites', () => {
  /** Tiny stub satisfying YSortable for unit-level testing without Phaser. */
  function makeStub(initialY: number): YSortable & { lastDepth?: number } {
    return {
      y: initialY,
      lastDepth: undefined,
      setDepth(value: number) {
        this.lastDepth = value;
      },
    };
  }

  it('register / unregister round-trip', () => {
    const sorter = new SceneSorter();
    const sprite = makeStub(100);
    sorter.register(sprite);
    assert.equal(sorter.size, 1);
    sorter.unregister(sprite);
    assert.equal(sorter.size, 0);
  });

  it('register is idempotent for the same sprite', () => {
    const sorter = new SceneSorter();
    const sprite = makeStub(100);
    sorter.register(sprite);
    sorter.register(sprite);
    sorter.register(sprite);
    assert.equal(sorter.size, 1);
  });

  it('tick assigns dynamicDepthFor each registered sprite', () => {
    const sorter = new SceneSorter();
    const player = makeStub(200);
    const npc = makeStub(150);
    const tree = makeStub(80);
    sorter.register(player);
    sorter.register(npc);
    sorter.register(tree);

    sorter.tick();

    assert.equal(player.lastDepth, dynamicDepthFor(200));
    assert.equal(npc.lastDepth, dynamicDepthFor(150));
    assert.equal(tree.lastDepth, dynamicDepthFor(80));

    // Verify occlusion order: higher y -> higher depth (in front)
    assert.ok((player.lastDepth ?? 0) > (npc.lastDepth ?? 0));
    assert.ok((npc.lastDepth ?? 0) > (tree.lastDepth ?? 0));
  });

  it('tick reflects sprite movement after position updates', () => {
    const sorter = new SceneSorter();
    const sprite = makeStub(100);
    sorter.register(sprite);

    sorter.tick();
    const firstDepth = sprite.lastDepth;

    sprite.y = 200;
    sorter.tick();
    const secondDepth = sprite.lastDepth;

    assert.notEqual(firstDepth, secondDepth, 'depth must change when sprite moves');
    assert.ok(
      (secondDepth ?? 0) > (firstDepth ?? 0),
      'moving the sprite further down increases depth',
    );
  });

  it('unregisterAll clears every registered sprite', () => {
    const sorter = new SceneSorter();
    sorter.register(makeStub(10));
    sorter.register(makeStub(20));
    sorter.register(makeStub(30));
    assert.equal(sorter.size, 3);
    sorter.unregisterAll();
    assert.equal(sorter.size, 0);
  });

  it('applyGroundOrigin sets origin (0.5, 1) for Oak-Woods feet anchor', () => {
    let lastOrigin: { x: number; y: number } | null = null;
    const sprite = {
      setOrigin(x: number, y: number) {
        lastOrigin = { x, y };
        return this;
      },
    };
    applyGroundOrigin(sprite as never);
    assert.deepEqual(lastOrigin, { x: 0.5, y: 1 });
  });

  it('registerGroundSprite is a one-shot helper for register + applyGroundOrigin', () => {
    const sorter = new SceneSorter();
    let lastOrigin: { x: number; y: number } | null = null;
    const sprite = {
      y: 250,
      setOrigin(x: number, y: number) {
        lastOrigin = { x, y };
        return this;
      },
      setDepth() {
        return this;
      },
    };
    registerGroundSprite(sorter, sprite as never);
    assert.equal(sorter.size, 1);
    assert.deepEqual(lastOrigin, { x: 0.5, y: 1 });
  });
});
