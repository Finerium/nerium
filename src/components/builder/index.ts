//
// src/components/builder/index.ts
//
// Builder component barrel export. Owners:
//   - BuilderTierGate: Marshall (W2 NP P6 S2)
//   - ModelSelectionModal: Lu (W3 NP T3)
//

export { BuilderTierGate } from './BuilderTierGate';
export type { BuilderTierGateProps } from './BuilderTierGate';

export {
  ModelSelectionModal,
  default as ModelSelectionModalWithResponsiveStyles,
  useBuilderModelSelectionStore,
} from './ModelSelectionModal';
export type {
  ModelSelectionModalProps,
  ConfirmedModelSelection,
  BuilderVendorId,
} from './ModelSelectionModal';

// T7 (2026-04-26): pixel-art companion shell + vendor badge for the
// Builder web route. Wrap the existing Erato HUD components inside the
// pixel shell to inherit the Apollo Village night-themed workshop
// aesthetic. Vendor badge renders the Anthropic + Google brass medallion
// assets verbatim, and tints the medallion for the remaining 6 vendors
// per the time-discipline fallback documented in
// `src/lib/marketplace/pixel_art_assets.ts`.
export { T7BuilderPixelShell } from './T7BuilderPixelShell';
export type { T7BuilderPixelShellProps } from './T7BuilderPixelShell';
export { T7VendorBadge, T7_VENDOR_IDS } from './T7VendorBadge';
export type { T7VendorId, T7VendorBadgeProps } from './T7VendorBadge';
