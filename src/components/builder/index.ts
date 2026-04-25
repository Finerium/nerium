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
