//
// submission_types.ts (Eos P3a).
//
// Conforms to:
// - docs/contracts/listing_submission.contract.md v0.1.0 (Section 3 Schema Definition)
// - docs/contracts/marketplace_listing.contract.md v0.1.0 (AgentListing destination schema)
//
// Canonical types for the creator submission wizard. Mirrors the contract
// verbatim, with a small local-only ValidationResult shape added for
// validation.ts. Downstream Artemis and Phoebe consume AgentListing only;
// SubmissionDraft is Eos-internal.
//

import type {
  AgentListing,
  CapabilityTag,
  LivingTemplateParam,
  PricingTier,
  UsageUnit,
  VendorOrigin,
} from '../schema/listing.schema';

export type SubmissionStep =
  | 'identity_check'
  | 'metadata_entry'
  | 'capability_selection'
  | 'pricing_configuration'
  | 'living_template_definition'
  | 'preview_confirm'
  | 'publish_result';

export const SUBMISSION_STEP_ORDER: ReadonlyArray<SubmissionStep> = [
  'identity_check',
  'metadata_entry',
  'capability_selection',
  'pricing_configuration',
  'living_template_definition',
  'preview_confirm',
  'publish_result',
];

export const VISIBLE_STEP_ORDER: ReadonlyArray<SubmissionStep> = [
  'metadata_entry',
  'capability_selection',
  'pricing_configuration',
  'living_template_definition',
  'preview_confirm',
];

export interface SubmissionDraft {
  draft_id: string;
  creator_identity_id: string;
  current_step: SubmissionStep;
  partial_listing: Partial<AgentListing>;
  validation_errors: Record<string, string>;
  saved_at: string;
}

export interface SubmissionFormProps {
  draft: SubmissionDraft;
  onStepComplete: (step: SubmissionStep, patch: Partial<AgentListing>) => Promise<void>;
  onSaveDraft: (draft: SubmissionDraft) => Promise<void>;
  onPublish: (final_listing: AgentListing) => Promise<{ listing_id: string; slug: string }>;
  onCancel: () => void;
}

export interface PreviewCardProps {
  listing: AgentListing;
  mode: 'preview' | 'published';
}

export interface PublishConfirmProps {
  listing_id: string;
  slug: string;
  onViewListing: () => void;
  onNewSubmission: () => void;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: FieldError[];
}

export class ValidationError extends Error {
  readonly field_errors: Record<string, string>;
  constructor(field_errors: Record<string, string>) {
    super('Submission validation failed');
    this.name = 'ValidationError';
    this.field_errors = field_errors;
  }
}

export class DuplicateSlugError extends Error {
  readonly slug: string;
  constructor(slug: string) {
    super(`DuplicateSlugError: slug ${slug} is already taken`);
    this.name = 'DuplicateSlugError';
    this.slug = slug;
  }
}

// UI-helper literal sets for form controls. Sourced from listing.schema.ts at
// runtime so drift triggers a type error rather than silent mismatch.
export type LivingTemplateParamDraft = Partial<LivingTemplateParam> & {
  key: string;
  kind: LivingTemplateParam['kind'];
};

export interface MetadataStepFields {
  display_name: string;
  slug: string;
  short_description: string;
  long_description_markdown: string;
  vendor_origin: VendorOrigin;
}

export interface CapabilityStepFields {
  capability_tags: CapabilityTag[];
}

export interface PricingStepFields {
  pricing_tier: PricingTier;
  usage_cost_hint: {
    per_execution_unit: UsageUnit;
    estimate_range: { low_usd: number; high_usd: number };
  };
}

export interface LivingTemplateStepFields {
  living_template_params?: LivingTemplateParam[];
}

export type SubmissionStepKey = Exclude<SubmissionStep, 'identity_check' | 'publish_result'>;

export const STEP_LABEL: Record<SubmissionStepKey, string> = {
  metadata_entry: 'Basics',
  capability_selection: 'Capabilities',
  pricing_configuration: 'Pricing',
  living_template_definition: 'Customization',
  preview_confirm: 'Preview',
};

export const STEP_HELP: Record<SubmissionStepKey, string> = {
  metadata_entry: 'Name your agent and describe what it does.',
  capability_selection: 'Pick one to five capability tags so buyers can find you.',
  pricing_configuration: 'Pick a billing tier and a rough cost estimate per call.',
  living_template_definition: 'Optional: define parameters buyers can remix (e.g., "cabai" to "anggur").',
  preview_confirm: 'Review the listing as buyers will see it, then publish.',
};
