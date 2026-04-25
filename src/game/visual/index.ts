//
// src/game/visual/index.ts
//
// Helios-v2 W3 S1: barrel export for the visual foundation. Scene authors
// import from `../visual` rather than reaching into individual files so a
// later refactor (e.g., shader-driven palette swap) only changes this file.
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
  buildParallaxLayer,
  stairStepSilhouette,
  type ParallaxLayerOptions,
  type SilhouetteRect,
} from './parallaxLayer';

export {
  buildAmbientFx,
  type AmbientFxKind,
  type AmbientFxOptions,
} from './ambientFx';

export {
  buildTent,
  buildCactus,
  buildWaterWell,
  buildFirePit,
  buildLampPost,
  buildPalmTree,
  buildRock,
  buildMerchantStall,
  type TentVariant,
} from './decoration';
