//
// src/game/visual/ysort.ts
//
// Helios-v2 W3 S1: dynamic y-sort utility per visual_manifest.contract
// Section 4.2 + agent prompt scene matrix Section "Dynamic y-sort".
//
// Pattern transplanted via `.claude/skills/phaser-scene-authoring/SKILL.md`
// (Talos-v2 W3 skill artifact, MIT-attributed upstream). The deprecated
// raw folder reference is removed per W3 S0 cleanup; the surviving skill
// artifact preserves license attribution.
// Top-down JRPG world layer requires that a player or NPC standing in front
// (larger y) of another sprite occludes the sprite behind (smaller y).
// Phaser default depth ordering uses creation order, so without dynamic
// y-sort sprites can clip over taller scenery.
//
// Approach:
//   1. Each candidate sprite (Player, NPC, decoration prop with collider)
//      registers itself with the SceneSorter via register().
//   2. Each frame the consuming Scene calls sceneSorter.tick() inside its
//      update() loop. Sorter computes setDepth(dynamicDepthFor(sprite.y))
//      for every registered sprite. Cost is O(n); typical n = player + 5
//      NPCs + 10-20 decoration props = under 30 setDepth calls per tick.
//   3. Sprites use setOrigin(0.5, 1) Oak-Woods pattern so the y-coordinate
//      references the feet anchor; this keeps the y-sort intuitive
//      ("feet farther down the screen = closer to camera").
//
// Caller responsibility:
//   - setOrigin(0.5, 1) on each registered sprite (helper applyGroundOrigin
//     below covers single-sprite case).
//   - Unregister on sprite destroy to avoid stale GameObject references.
//     SceneSorter.unregisterAll() flushes everything on scene shutdown.
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import { dynamicDepthFor } from './depth';

/**
 * Minimal interface a sprite must satisfy to register with SceneSorter.
 * Phaser.GameObjects.Sprite, Phaser.Physics.Arcade.Sprite, and Phaser
 * .GameObjects.Image all conform via duck-typing (each exposes y +
 * setDepth + setOrigin via the Transform + Depth + Origin mixins).
 */
export interface YSortable {
  y: number;
  setDepth: (value: number) => unknown;
}

/**
 * Per-scene sorter. Each Phaser Scene that wants y-sort discipline
 * instantiates one in create(), registers entities at spawn, and calls
 * tick() each frame. Sorter holds weak-ish references via Set + manual
 * unregister; do not leak between scenes.
 */
export class SceneSorter {
  private readonly sprites: Set<YSortable> = new Set();

  /** Register a sprite into the dynamic depth pool. Idempotent on repeats. */
  register(sprite: YSortable): void {
    this.sprites.add(sprite);
  }

  /** Remove a sprite from the pool. Call from sprite destroy handlers. */
  unregister(sprite: YSortable): void {
    this.sprites.delete(sprite);
  }

  /** Flush every registered sprite. Call from scene SHUTDOWN handler. */
  unregisterAll(): void {
    this.sprites.clear();
  }

  /** Number of currently registered sprites. */
  get size(): number {
    return this.sprites.size;
  }

  /**
   * Apply the y-sort each frame. Iterates over all registered sprites and
   * sets each sprite's depth to dynamicDepthFor(sprite.y). Cost is O(n)
   * per frame; with 20-30 typical entities this is well under 0.1 ms on
   * mid-tier hardware.
   *
   * Safe to call from Phaser.Scenes.Events.UPDATE handler or directly in
   * Scene.update().
   */
  tick(): void {
    for (const sprite of this.sprites) {
      sprite.setDepth(dynamicDepthFor(sprite.y));
    }
  }
}

/**
 * Minimal interface for any sprite that exposes setOrigin. The Phaser
 * Transform mixin satisfies this; the unit-test stub also satisfies this
 * without requiring a full Phaser.GameObjects.GameObject base. Decoupling
 * here keeps the helper testable without instantiating Phaser at all.
 */
export interface OriginSettable {
  setOrigin: (x: number, y: number) => unknown;
}

/**
 * Helper for the Oak-Woods setOrigin(0.5, 1) pattern. Pass any sprite that
 * already has setOrigin available; this nudges its origin to the feet so
 * the y-sort reads the "feet at coord, torso up" anchor.
 *
 * Returns the sprite for chaining.
 *
 * Phaser sprites satisfy OriginSettable through the Transform mixin. The
 * Phaser-typed call site (Player.ts, NPC.ts) imports the same helper and
 * the structural compatibility holds without an explicit cast.
 */
export function applyGroundOrigin<T extends OriginSettable>(sprite: T): T {
  sprite.setOrigin(0.5, 1);
  return sprite;
}

/**
 * Convenience: register a sprite into a SceneSorter AND apply ground origin
 * in one call. The most common spawn pattern for player + NPC + tall prop.
 */
export function registerGroundSprite<T extends YSortable & OriginSettable>(
  sorter: SceneSorter,
  sprite: T,
): T {
  applyGroundOrigin(sprite);
  sorter.register(sprite);
  return sprite;
}
