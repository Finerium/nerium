//
// src/game/visual/scenePolish.ts
//
// Helios-v2 W3 S9: scene-level polish bundle. Combines Lights2D ambient +
// day-night overlay + atmospheric overlay + per-scene point lights into a
// single applyScenePolish(scene, key) call so per-scene wiring stays as a
// 1-line change rather than 30 lines per scene.
//
// Per-scene config table below maps scene key to its polish recipe:
//   - dayNight: 'main' | 'outdoor_sub' | 'skip' (interior fixed lighting)
//   - atmospheric: 'smog' | 'leaves' | 'none'
//   - hero point lights: array of {x, y, color, intensity, radius, tween}
//
// The applied effects are returned via a handle so scene shutdown can
// dispose without leaking. Usage in scene.create():
//
//   this.scenePolish = applyScenePolish(this);
//
// Usage in scene SHUTDOWN handler:
//
//   this.scenePolish?.destroy();
//
// No em dash, no emoji per CLAUDE.md anti-patterns.
//

import * as Phaser from 'phaser';
import {
  enableSceneAmbient,
  addPointLight,
  type PointLightHandle,
} from './lighting';
import {
  buildDayNightOverlay,
  type DayNightHandle,
  type TimeOfDay,
} from './dayNightOverlay';
import {
  addSmogWispsOverlay,
  addAutumnLeavesOverlay,
  type AtmosphericOverlayHandle,
} from './atmosphericOverlay';

export type DayNightScope = 'main_outdoor' | 'outdoor_sub' | 'skip';
export type AtmosphericKind = 'smog' | 'leaves' | 'none';

interface PointLightSpec {
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
  tween?: {
    target: number;
    duration: number;
    ease?: string;
    holdJitterMs?: number;
  };
}

interface SceneRecipe {
  dayNight: DayNightScope;
  initialTimeOfDay?: TimeOfDay;
  atmospheric: AtmosphericKind;
  pointLights: PointLightSpec[];
}

/**
 * Per-scene polish recipe table per S9 directive 9.1-9.6. Keys match the
 * Phaser scene `key` property so a `applyScenePolish` call resolves by
 * scene.scene.key without further argument.
 *
 * Note: ApolloVillageScene + CaravanRoadScene + CyberpunkShanghaiScene main
 * scenes wire S9 polish directly (they have additional bespoke logic per
 * placement maps). The recipe table covers the 10 sub-area scenes for
 * uniform application.
 */
export const SCENE_POLISH_RECIPES: Readonly<Record<string, SceneRecipe>> = Object.freeze({
  ApolloTempleInterior: {
    dayNight: 'skip',
    atmospheric: 'none',
    pointLights: [
      // Altar sun orb central, divine breathing pulse 0.9..1.0 over 2s.
      {
        x: 704,
        y: 80,
        radius: 320,
        color: 0xffb14a,
        intensity: 0.9,
        tween: { target: 1.0, duration: 2000, ease: 'Sine.easeInOut' },
      },
    ],
  },
  ApolloMarketplaceBazaar: {
    dayNight: 'outdoor_sub',
    initialTimeOfDay: 'day',
    atmospheric: 'none',
    pointLights: [
      // Warm hanging string lights faux: a pair of warm amber points.
      {
        x: 480,
        y: 240,
        radius: 160,
        color: 0xffb14a,
        intensity: 0.5,
        tween: { target: 0.7, duration: 1100, ease: 'Sine.easeInOut' },
      },
      {
        x: 920,
        y: 240,
        radius: 160,
        color: 0xffb14a,
        intensity: 0.5,
        tween: { target: 0.7, duration: 1300, ease: 'Sine.easeInOut' },
      },
    ],
  },
  ApolloOasis: {
    dayNight: 'outdoor_sub',
    initialTimeOfDay: 'dusk',
    atmospheric: 'none',
    pointLights: [
      // Shrine glyph cool moss-cyan-warm mix.
      {
        x: 1080,
        y: 240,
        radius: 100,
        color: 0x66ccaa,
        intensity: 0.3,
        tween: { target: 0.6, duration: 4000, ease: 'Sine.easeInOut' },
      },
    ],
  },
  CaravanWayhouseInterior: {
    dayNight: 'skip',
    atmospheric: 'none',
    pointLights: [
      // Hearth fireplace warm intense + flicker fast (200ms cycle).
      {
        x: 940,
        y: 380,
        radius: 240,
        color: 0xff7a3a,
        intensity: 0.7,
        tween: { target: 1.0, duration: 220, ease: 'Sine.easeInOut', holdJitterMs: 80 },
      },
      // Tavern table candle.
      {
        x: 760,
        y: 600,
        radius: 80,
        color: 0xff8844,
        intensity: 0.4,
        tween: { target: 0.6, duration: 180, ease: 'Sine.easeInOut' },
      },
    ],
  },
  CaravanForestCrossroad: {
    // S6 already places autumn_leaves PNG overlay statically; recipe omits
    // 'leaves' here to avoid double-overlay. S9 day-night dusk + ambient
    // applied; static overlay drift retained from S6.
    dayNight: 'outdoor_sub',
    initialTimeOfDay: 'dusk',
    atmospheric: 'none',
    pointLights: [],
  },
  CaravanMountainPass: {
    dayNight: 'outdoor_sub',
    initialTimeOfDay: 'night',
    atmospheric: 'none',
    pointLights: [
      // Cool windswept distant beacon.
      {
        x: 700,
        y: 200,
        radius: 280,
        color: 0xa0c0ff,
        intensity: 0.3,
        tween: { target: 0.5, duration: 3500, ease: 'Sine.easeInOut' },
      },
    ],
  },
  CyberSkyscraperLobby: {
    // S6 does NOT place smog_wisps overlay; recipe adds it for atmospheric.
    dayNight: 'skip',
    atmospheric: 'smog',
    pointLights: [
      // Hologram receptionist cyan glitch.
      {
        x: 704,
        y: 360,
        radius: 220,
        color: 0x00f0ff,
        intensity: 0.5,
        tween: { target: 0.85, duration: 1000, ease: 'Sine.easeInOut', holdJitterMs: 60 },
      },
      // Faint cyan trim on the elevator door.
      {
        x: 1180,
        y: 480,
        radius: 100,
        color: 0x66ddff,
        intensity: 0.4,
        tween: { target: 0.6, duration: 2200, ease: 'Sine.easeInOut' },
      },
    ],
  },
  CyberRooftop: {
    // S6 already places smog_wisps PNG overlay statically; recipe omits
    // 'smog' here to avoid double-overlay. S9 night overlay + billboard
    // points + ambient applied.
    dayNight: 'outdoor_sub',
    initialTimeOfDay: 'night',
    atmospheric: 'none',
    pointLights: [
      // Billboard magenta-cyan alternating.
      {
        x: 320,
        y: 220,
        radius: 240,
        color: 0xff2db5,
        intensity: 0.6,
        tween: { target: 0.9, duration: 1700, ease: 'Sine.easeInOut' },
      },
      {
        x: 1080,
        y: 220,
        radius: 240,
        color: 0x5ad6ff,
        intensity: 0.6,
        tween: { target: 0.9, duration: 1900, ease: 'Sine.easeInOut' },
      },
    ],
  },
  CyberUndergroundAlley: {
    // S6 already places smog_wisps PNG overlay statically; recipe omits
    // 'smog' here to avoid double-overlay. S9 ambient + sodium pipe leak
    // + flickering broken neon points applied.
    dayNight: 'skip',
    atmospheric: 'none',
    pointLights: [
      // Sodium amber pipe leak intermittent.
      {
        x: 200,
        y: 540,
        radius: 140,
        color: 0xff9b48,
        intensity: 0.4,
        tween: { target: 0.7, duration: 200, ease: 'Sine.easeInOut', holdJitterMs: 120 },
      },
      // Flickering broken neon.
      {
        x: 1100,
        y: 320,
        radius: 100,
        color: 0xff2db5,
        intensity: 0.3,
        tween: { target: 0.6, duration: 350, ease: 'Sine.easeInOut', holdJitterMs: 200 },
      },
    ],
  },
  CyberServerRoom: {
    // S6 does NOT place smog_wisps overlay; recipe adds it for atmospheric.
    dayNight: 'skip',
    atmospheric: 'smog',
    pointLights: [
      // Server racks alternating LEDs.
      {
        x: 360,
        y: 360,
        radius: 120,
        color: 0x00ffaa,
        intensity: 0.5,
        tween: { target: 0.8, duration: 800, ease: 'Sine.easeInOut' },
      },
      {
        x: 1040,
        y: 360,
        radius: 120,
        color: 0x00ffaa,
        intensity: 0.5,
        tween: { target: 0.8, duration: 920, ease: 'Sine.easeInOut' },
      },
      // Terminal cyan dominant pulse.
      {
        x: 700,
        y: 540,
        radius: 200,
        color: 0x00f0ff,
        intensity: 0.6,
        tween: { target: 1.0, duration: 1000, ease: 'Sine.easeInOut' },
      },
    ],
  },
});

export interface ScenePolishHandle {
  /** Day-night overlay handle (undefined when scope is 'skip'). */
  dayNight?: DayNightHandle;
  /** Atmospheric overlay handle (undefined when atmospheric is 'none'). */
  atmospheric?: AtmosphericOverlayHandle;
  /** Hero point lights placed per scene recipe. */
  pointLights: PointLightHandle[];
  /** Tear down everything. Idempotent. */
  destroy: () => void;
}

/**
 * Apply the S9 polish recipe for the given scene. Looks up SCENE_POLISH_RECIPES
 * by scene.scene.key. If no recipe is registered for the key, returns a
 * no-op handle (logged once) so callers can ship without conditional checks.
 */
export function applyScenePolish(scene: Phaser.Scene): ScenePolishHandle {
  const sceneKey = scene.scene.key;
  const recipe = SCENE_POLISH_RECIPES[sceneKey];

  if (!recipe) {
    // Main scenes wire S9 directly; sub-areas use the recipe table. A miss
    // here on a sub-area is a config bug; on a main scene it is expected.
    return { pointLights: [], destroy: () => {} };
  }

  // Step 1: enable Lights2D ambient color preset.
  enableSceneAmbient(scene);

  // Step 2: build day-night overlay if scope is not 'skip'.
  let dayNight: DayNightHandle | undefined;
  if (recipe.dayNight !== 'skip') {
    dayNight = buildDayNightOverlay(scene, recipe.initialTimeOfDay ?? 'dusk');
  }

  // Step 3: atmospheric overlay (smog or leaves).
  let atmospheric: AtmosphericOverlayHandle | undefined;
  if (recipe.atmospheric === 'smog') {
    atmospheric = addSmogWispsOverlay(scene);
  } else if (recipe.atmospheric === 'leaves') {
    atmospheric = addAutumnLeavesOverlay(scene);
  }

  // Step 4: hero point lights from recipe.
  const pointLights: PointLightHandle[] = [];
  for (const spec of recipe.pointLights) {
    pointLights.push(addPointLight(scene, spec));
  }

  const destroy = () => {
    for (const pl of pointLights) {
      try {
        pl.destroy();
      } catch (err) {
        console.error(`[scenePolish:${sceneKey}] point light destroy threw`, err);
      }
    }
    pointLights.length = 0;
    try {
      atmospheric?.destroy();
    } catch (err) {
      console.error(`[scenePolish:${sceneKey}] atmospheric destroy threw`, err);
    }
    try {
      dayNight?.destroy();
    } catch (err) {
      console.error(`[scenePolish:${sceneKey}] dayNight destroy threw`, err);
    }
  };

  return { dayNight, atmospheric, pointLights, destroy };
}
