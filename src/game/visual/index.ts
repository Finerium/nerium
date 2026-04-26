//
// src/game/visual/index.ts
//
// Helios-v2 W3 S1: barrel export for the visual foundation. Scene authors
// import from `../visual` rather than reaching into individual files so a
// later refactor (e.g., shader-driven palette swap) only changes this file.
//
// Helios-v2 W3 post-S4 cleanup: parallaxLayer, decoration, groundPaint, and
// spriteTextures re-exports REMOVED. Their source files were renamed with a
// `.deprecated.ts` suffix in the same atomic commit. The cutover from the
// procedural SVG / pixel-rect composition to the AI-generated PNG asset
// bundle completed at S4 (all 3 main scenes migrated). No live consumer
// remains for any of those symbols. The deprecated source files are kept on
// disk under their renamed names for archaeological reference and to
// preserve git history; they are NOT re-exported from this barrel and are
// NOT to be imported from any new code.
//

export {
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
  type WorldPaletteId,
  type SharedPaletteKey,
  type GradientBand,
} from './palette';

export {
  DEPTH,
  depthForLayerKind,
  dynamicDepthFor,
  isInBand,
  type DepthBand,
  type LayerKind,
} from './depth';

export {
  SceneSorter,
  applyGroundOrigin,
  registerGroundSprite,
  type YSortable,
  type OriginSettable,
} from './ysort';

export { buildSkyGradient, type SkyGradientOptions } from './skyGradient';

export {
  buildAmbientFx,
  type AmbientFxKind,
  type AmbientFxOptions,
} from './ambientFx';

export {
  enableSceneAmbient,
  addPointLight,
  addLandmarkHalo,
  SCENE_AMBIENT_COLOR,
  type PointLightOptions,
  type PointLightHandle,
  type LandmarkHaloOptions,
} from './lighting';

export {
  buildDayNightOverlay,
  nextTimeOfDay,
  TIME_OF_DAY_PHASES,
  type TimeOfDay,
  type TimeOfDayPhase,
  type DayNightHandle,
} from './dayNightOverlay';

export {
  addSmogWispsOverlay,
  addAutumnLeavesOverlay,
  type AtmosphericOverlayHandle,
  type SmogWispsOptions,
  type AutumnLeavesOptions,
} from './atmosphericOverlay';

export {
  applyScenePolish,
  SCENE_POLISH_RECIPES,
  type ScenePolishHandle,
  type DayNightScope,
  type AtmosphericKind,
} from './scenePolish';
