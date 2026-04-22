//
// validation.ts (Eos P3a).
//
// Conforms to:
// - docs/contracts/listing_submission.contract.md v0.1.0 (Section 8 Error Handling)
// - docs/contracts/marketplace_listing.contract.md v0.1.0 (Section 3 Schema)
// - app/marketplace/schema/listing.schema.ts validateListingShape invariants
//
// Pure per-step validators. Each step returns ValidationResult so the form can
// surface inline errors without coupling to a runtime schema library. Rules
// mirror listing.schema.ts exactly; drift caught by the round-trip test in
// listing_submission.contract.md Section 9.
//

import {
  CAPABILITY_TAGS,
  LISTING_VISIBILITIES,
  PRICING_TIERS,
  VENDOR_ORIGINS,
  type AgentListing,
  type CapabilityTag,
  type ListingVisibility,
  type LivingTemplateParam,
  type PricingTier,
  type VendorOrigin,
} from '../schema/listing.schema';
import type {
  CapabilityStepFields,
  FieldError,
  LivingTemplateStepFields,
  MetadataStepFields,
  PricingStepFields,
  SubmissionDraft,
  SubmissionStep,
  ValidationResult,
} from './submission_types';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX_LEN = 60;
const DISPLAY_NAME_MAX_LEN = 80;
const DISPLAY_NAME_MIN_LEN = 3;
const SHORT_DESC_MAX_LEN = 280;
const SHORT_DESC_MIN_LEN = 20;
const LONG_DESC_MIN_LEN = 40;
const MIN_CAPABILITY_TAGS = 1;
const MAX_CAPABILITY_TAGS = 5;
const PARAM_KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;
const USAGE_UNITS = ['token', 'request', 'minute', 'task'] as const;

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

function fail(errors: FieldError[]): ValidationResult {
  return { valid: false, errors };
}

function isVendorOrigin(value: unknown): value is VendorOrigin {
  return typeof value === 'string' && (VENDOR_ORIGINS as ReadonlyArray<string>).includes(value);
}

function isCapabilityTag(value: unknown): value is CapabilityTag {
  return typeof value === 'string' && (CAPABILITY_TAGS as ReadonlyArray<string>).includes(value);
}

function isPricingTier(value: unknown): value is PricingTier {
  return typeof value === 'string' && (PRICING_TIERS as ReadonlyArray<string>).includes(value);
}

function isListingVisibility(value: unknown): value is ListingVisibility {
  return typeof value === 'string' && (LISTING_VISIBILITIES as ReadonlyArray<string>).includes(value);
}

export function validateIdentityCheck(draft: SubmissionDraft): ValidationResult {
  const errors: FieldError[] = [];
  if (!draft.creator_identity_id || draft.creator_identity_id.trim().length === 0) {
    errors.push({
      field: 'creator_identity_id',
      message: 'Connect a verified Registry identity before submitting a listing.',
    });
  }
  return errors.length === 0 ? ok() : fail(errors);
}

export function validateMetadata(fields: Partial<MetadataStepFields>): ValidationResult {
  const errors: FieldError[] = [];

  const display_name = (fields.display_name ?? '').trim();
  if (display_name.length < DISPLAY_NAME_MIN_LEN) {
    errors.push({
      field: 'display_name',
      message: `Display name must be at least ${DISPLAY_NAME_MIN_LEN} characters.`,
    });
  } else if (display_name.length > DISPLAY_NAME_MAX_LEN) {
    errors.push({
      field: 'display_name',
      message: `Display name must be at most ${DISPLAY_NAME_MAX_LEN} characters.`,
    });
  }

  const slug = (fields.slug ?? '').trim();
  if (slug.length === 0) {
    errors.push({ field: 'slug', message: 'Slug is required.' });
  } else if (slug.length > SLUG_MAX_LEN) {
    errors.push({
      field: 'slug',
      message: `Slug must be at most ${SLUG_MAX_LEN} characters.`,
    });
  } else if (!SLUG_RE.test(slug)) {
    errors.push({
      field: 'slug',
      message: 'Slug must be lowercase kebab-case, letters, digits, and hyphens only.',
    });
  }

  const short_description = (fields.short_description ?? '').trim();
  if (short_description.length < SHORT_DESC_MIN_LEN) {
    errors.push({
      field: 'short_description',
      message: `Short description must be at least ${SHORT_DESC_MIN_LEN} characters.`,
    });
  } else if (short_description.length > SHORT_DESC_MAX_LEN) {
    errors.push({
      field: 'short_description',
      message: `Short description must be at most ${SHORT_DESC_MAX_LEN} characters.`,
    });
  }

  const long_description = (fields.long_description_markdown ?? '').trim();
  if (long_description.length < LONG_DESC_MIN_LEN) {
    errors.push({
      field: 'long_description_markdown',
      message: `Long description must be at least ${LONG_DESC_MIN_LEN} characters; buyers scan this first.`,
    });
  }

  if (!isVendorOrigin(fields.vendor_origin)) {
    errors.push({
      field: 'vendor_origin',
      message: 'Pick a vendor origin so buyers can trust cross-platform provenance.',
    });
  }

  return errors.length === 0 ? ok() : fail(errors);
}

export function validateCapabilities(fields: Partial<CapabilityStepFields>): ValidationResult {
  const errors: FieldError[] = [];
  const tags = Array.isArray(fields.capability_tags) ? fields.capability_tags : [];
  if (tags.length < MIN_CAPABILITY_TAGS) {
    errors.push({
      field: 'capability_tags',
      message: `Pick at least ${MIN_CAPABILITY_TAGS} capability tag.`,
    });
  } else if (tags.length > MAX_CAPABILITY_TAGS) {
    errors.push({
      field: 'capability_tags',
      message: `Pick at most ${MAX_CAPABILITY_TAGS} capability tags.`,
    });
  }
  for (const tag of tags) {
    if (!isCapabilityTag(tag)) {
      errors.push({
        field: 'capability_tags',
        message: `Unknown capability tag "${String(tag)}".`,
      });
      break;
    }
  }
  const unique = new Set(tags);
  if (unique.size !== tags.length) {
    errors.push({ field: 'capability_tags', message: 'Capability tags must be unique.' });
  }
  return errors.length === 0 ? ok() : fail(errors);
}

export function validatePricing(fields: Partial<PricingStepFields>): ValidationResult {
  const errors: FieldError[] = [];
  if (!isPricingTier(fields.pricing_tier)) {
    errors.push({ field: 'pricing_tier', message: 'Pick a pricing tier.' });
  }
  const hint = fields.usage_cost_hint;
  if (!hint) {
    errors.push({
      field: 'usage_cost_hint',
      message: 'Provide a usage cost hint so buyers see an estimate before purchase.',
    });
  } else {
    if (!(USAGE_UNITS as ReadonlyArray<string>).includes(hint.per_execution_unit)) {
      errors.push({
        field: 'usage_cost_hint.per_execution_unit',
        message: 'Pick a per-execution unit (token, request, minute, or task).',
      });
    }
    const low = hint.estimate_range?.low_usd;
    const high = hint.estimate_range?.high_usd;
    if (typeof low !== 'number' || Number.isNaN(low) || low < 0) {
      errors.push({
        field: 'usage_cost_hint.estimate_range.low_usd',
        message: 'Low estimate must be zero or a positive number.',
      });
    }
    if (typeof high !== 'number' || Number.isNaN(high) || high < 0) {
      errors.push({
        field: 'usage_cost_hint.estimate_range.high_usd',
        message: 'High estimate must be zero or a positive number.',
      });
    }
    if (typeof low === 'number' && typeof high === 'number' && high < low) {
      errors.push({
        field: 'usage_cost_hint.estimate_range',
        message: 'High estimate must be greater than or equal to low estimate.',
      });
    }
  }
  return errors.length === 0 ? ok() : fail(errors);
}

export function validateLivingTemplate(fields: Partial<LivingTemplateStepFields>): ValidationResult {
  const errors: FieldError[] = [];
  const params = fields.living_template_params;
  if (!params || params.length === 0) {
    return ok();
  }
  const seen_keys = new Set<string>();
  for (const [index, param] of params.entries()) {
    const base = `living_template_params.${index}`;
    if (!param.key || !PARAM_KEY_RE.test(param.key)) {
      errors.push({
        field: `${base}.key`,
        message: 'Parameter key must start with a lowercase letter, then letters, digits, or underscores (max 32).',
      });
    }
    if (seen_keys.has(param.key)) {
      errors.push({
        field: `${base}.key`,
        message: `Parameter key "${param.key}" is duplicated.`,
      });
    }
    seen_keys.add(param.key);
    if (!param.label || param.label.trim().length < 2) {
      errors.push({
        field: `${base}.label`,
        message: 'Parameter label must be at least 2 characters.',
      });
    }
    if (!param.description || param.description.trim().length < 4) {
      errors.push({
        field: `${base}.description`,
        message: 'Describe what this parameter controls so buyers can remix it.',
      });
    }
    if (!isSupportedKind(param.kind)) {
      errors.push({
        field: `${base}.kind`,
        message: 'Parameter kind must be string, enum, number, or boolean.',
      });
    }
    if (param.kind === 'enum') {
      if (!param.enum_values || param.enum_values.length === 0) {
        errors.push({
          field: `${base}.enum_values`,
          message: 'Enum parameters need at least one value.',
        });
      } else {
        const values_unique = new Set(param.enum_values);
        if (values_unique.size !== param.enum_values.length) {
          errors.push({
            field: `${base}.enum_values`,
            message: 'Enum values must be unique.',
          });
        }
      }
    }
    if (!validateDefaultValueShape(param)) {
      errors.push({
        field: `${base}.default_value`,
        message: 'Default value must match the declared parameter kind.',
      });
    }
  }
  return errors.length === 0 ? ok() : fail(errors);
}

function isSupportedKind(kind: unknown): kind is LivingTemplateParam['kind'] {
  return kind === 'string' || kind === 'enum' || kind === 'number' || kind === 'boolean';
}

function validateDefaultValueShape(param: LivingTemplateParam): boolean {
  const d = param.default_value;
  switch (param.kind) {
    case 'string':
      return typeof d === 'string';
    case 'number':
      return typeof d === 'number' && Number.isFinite(d);
    case 'boolean':
      return typeof d === 'boolean';
    case 'enum':
      return typeof d === 'string' && Array.isArray(param.enum_values) && param.enum_values.includes(d);
    default:
      return false;
  }
}

export function validateFullListing(listing: Partial<AgentListing>): ValidationResult {
  const errors: FieldError[] = [];
  const metadata = validateMetadata({
    display_name: listing.display_name,
    slug: listing.slug,
    short_description: listing.short_description,
    long_description_markdown: listing.long_description_markdown,
    vendor_origin: listing.vendor_origin as VendorOrigin,
  });
  errors.push(...metadata.errors);
  const capabilities = validateCapabilities({
    capability_tags: listing.capability_tags ?? [],
  });
  errors.push(...capabilities.errors);
  const pricing = validatePricing({
    pricing_tier: listing.pricing_tier,
    usage_cost_hint: listing.usage_cost_hint,
  });
  errors.push(...pricing.errors);
  const living_template = validateLivingTemplate({
    living_template_params: listing.living_template_params,
  });
  errors.push(...living_template.errors);
  if (listing.visibility !== undefined && !isListingVisibility(listing.visibility)) {
    errors.push({ field: 'visibility', message: 'Unknown visibility value.' });
  }
  if (!listing.creator_identity_id || listing.creator_identity_id.trim().length === 0) {
    errors.push({
      field: 'creator_identity_id',
      message: 'Creator identity must be attached before publish.',
    });
  }
  return errors.length === 0 ? ok() : fail(errors);
}

export function validateForStep(
  step: SubmissionStep,
  draft: SubmissionDraft,
): ValidationResult {
  const partial = draft.partial_listing;
  switch (step) {
    case 'identity_check':
      return validateIdentityCheck(draft);
    case 'metadata_entry':
      return validateMetadata({
        display_name: partial.display_name,
        slug: partial.slug,
        short_description: partial.short_description,
        long_description_markdown: partial.long_description_markdown,
        vendor_origin: partial.vendor_origin as VendorOrigin,
      });
    case 'capability_selection':
      return validateCapabilities({ capability_tags: partial.capability_tags ?? [] });
    case 'pricing_configuration':
      return validatePricing({
        pricing_tier: partial.pricing_tier,
        usage_cost_hint: partial.usage_cost_hint,
      });
    case 'living_template_definition':
      return validateLivingTemplate({ living_template_params: partial.living_template_params });
    case 'preview_confirm':
      return validateFullListing(partial);
    case 'publish_result':
      return ok();
    default:
      return ok();
  }
}

export function errorsToFieldMap(errors: ReadonlyArray<FieldError>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const error of errors) {
    if (!(error.field in map)) {
      map[error.field] = error.message;
    }
  }
  return map;
}
