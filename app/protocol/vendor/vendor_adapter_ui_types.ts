// Vendor adapter UI shared types.
// Contract: docs/contracts/vendor_adapter_ui.contract.md v0.1.0
// Owner: Morpheus (P3b Protocol Worker, Vendor Adapter UI).
// Consumers: MultiVendorPanel, TaskAssignmentGrid, HonestAnnotation,
// Erato ModelStrategySelector multiVendorPanel slot, Harmonia aesthetic sweep.
//
// Honest-claim discipline (NarasiGhaisan Section 16, CLAUDE.md anti-pattern 7):
// execution_status is auto-locked to 'mock' for every non-anthropic assignment
// during hackathon scope. Flipping to 'real' is gated behind a post-hackathon
// feature flag, per contract Section 4.

import type {
  VendorId,
  VendorCapabilityProfile,
} from '../adapters/VendorAdapter';

export type { VendorId, VendorCapabilityProfile };

export type TaskDimension =
  | 'strategy'
  | 'code_generation'
  | 'ui_design'
  | 'copywriting'
  | 'image_generation'
  | 'video_generation'
  | 'data_analysis'
  | 'research';

export type ExecutionStatus = 'real' | 'mock';

export interface VendorAssignment {
  task: TaskDimension;
  vendor_id: VendorId;
  execution_status: ExecutionStatus;
  rationale?: string;
}

export type AnnotationSeverity = 'info' | 'advisory';

export interface HonestAnnotationProps {
  text?: string;
  severity?: AnnotationSeverity;
  alwaysVisible?: boolean;
  className?: string;
}

export interface TaskAssignmentGridProps {
  assignments: VendorAssignment[];
  availableVendors: VendorCapabilityProfile[];
  onToggle: (task: TaskDimension, vendor_id: VendorId) => void;
  readOnly?: boolean;
}

export interface MultiVendorPanelProps {
  assignments: VendorAssignment[];
  availableVendors: VendorCapabilityProfile[];
  onAssignmentChange: (next: VendorAssignment[]) => void;
  annotation_text?: string;
  readOnly?: boolean;
}

export interface AssignmentChangedEvent {
  task: TaskDimension;
  previous_vendor_id: VendorId;
  next_vendor_id: VendorId;
}

export interface AnnotationRenderedEvent {
  location: 'multi_vendor_panel' | 'task_grid' | 'other';
}

export const TASK_DIMENSIONS: ReadonlyArray<TaskDimension> = [
  'strategy',
  'code_generation',
  'ui_design',
  'copywriting',
  'image_generation',
  'video_generation',
  'data_analysis',
  'research',
];

export const TASK_LABELS: Readonly<Record<TaskDimension, string>> = {
  strategy: 'Strategy',
  code_generation: 'Code generation',
  ui_design: 'UI design',
  copywriting: 'Copywriting',
  image_generation: 'Image generation',
  video_generation: 'Video generation',
  data_analysis: 'Data analysis',
  research: 'Research',
};

export const VENDOR_LABELS: Readonly<Record<VendorId, string>> = {
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  higgsfield: 'Higgsfield',
  openai_generic: 'OpenAI',
  llama_generic: 'Llama',
};

export function isMockVendor(vendor_id: VendorId): boolean {
  return vendor_id !== 'anthropic';
}

export function normaliseExecutionStatus(vendor_id: VendorId): ExecutionStatus {
  return isMockVendor(vendor_id) ? 'mock' : 'real';
}

export function enforceMockPolicy(
  assignments: VendorAssignment[],
): VendorAssignment[] {
  return assignments.map((a) => ({
    ...a,
    execution_status: normaliseExecutionStatus(a.vendor_id),
  }));
}
