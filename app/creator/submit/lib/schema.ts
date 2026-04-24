//
// schema.ts
//
// Wizard-level Zod composition. Ties basics, category, pricing, license,
// and per-category metadata into a single draft shape. Stepwise validators
// below let the store advance per-step without forcing the whole draft
// to be valid upfront.
//
// Contract ref: docs/contracts/marketplace_listing.contract.md v0.2.0
// Sections 3.1 to 3.5. The server runs validate_for_publish() at publish
// time; this file runs the same shape rules client-side so the creator
// sees errors before a round trip.
//

import { z } from 'zod';

import {
  ALLOWED_SUBTYPES,
  CATEGORY_METADATA_SCHEMAS,
  basicsSchema,
  categoryEnum,
  licenseEnum,
  pricingDetailsSchemas,
  pricingModelEnum,
  slugRegex,
  subtypeEnum,
  type Category,
  type License,
  type PricingModel,
  type Subtype,
} from './category-schemas';

// ---------------------------------------------------------------------------
// Step enumeration and shared types
// ---------------------------------------------------------------------------

export const STEP_IDS = [
  'category',
  'basics',
  'metadata',
  'pricing',
  'assets',
  'preview',
  'submit',
] as const;

export type StepId = (typeof STEP_IDS)[number];

export const STEP_LABELS: Record<StepId, string> = {
  category: 'Category',
  basics: 'Basics',
  metadata: 'Metadata',
  pricing: 'Pricing',
  assets: 'Assets',
  preview: 'Preview',
  submit: 'Submit',
};

// The total draft shape assembled over the wizard's lifetime. All fields
// start partial because early steps only populate a subset; the publish
// step runs the strict full-draft validator below.
export interface DraftShape {
  category: Category | null;
  subtype: Subtype | null;
  basics: {
    title: string;
    short_description: string;
    long_description: string;
    slug: string;
    capability_tags: string[];
  };
  license: License;
  pricing_model: PricingModel;
  pricing_details: Record<string, unknown>;
  category_metadata: Record<string, unknown>;
  asset_refs: string[];
  thumbnail_r2_key: string | null;
  version: string;
}

export function createEmptyDraft(): DraftShape {
  return {
    category: null,
    subtype: null,
    basics: {
      title: '',
      short_description: '',
      long_description: '',
      slug: '',
      capability_tags: [],
    },
    license: 'PROPRIETARY',
    pricing_model: 'free',
    pricing_details: {},
    category_metadata: {},
    asset_refs: [],
    thumbnail_r2_key: null,
    version: '0.1.0',
  };
}

// ---------------------------------------------------------------------------
// Slug derivation
//
// Mirrors src.backend.marketplace.listing_service.derive_slug for the
// wizard's autocompleted slug field. The server re-derives on create so
// this only powers the instant UI preview.
// ---------------------------------------------------------------------------

export function deriveSlug(title: string): string {
  const lowered = title.toLowerCase();
  const dashed = lowered
    .normalize('NFKD')
    .replace(/[^\x00-\x7f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const truncated = dashed.slice(0, 60).replace(/-+$/, '');
  return truncated || 'listing';
}

// ---------------------------------------------------------------------------
// Per-step validators
//
// Each returns a SafeParseReturnType so the store can pull .success and
// .error without re-throwing. Keep these narrow - a step only validates
// what it touches.
// ---------------------------------------------------------------------------

export const categoryStepSchema = z
  .object({
    category: categoryEnum,
    subtype: subtypeEnum,
  })
  .refine(
    (v) => ALLOWED_SUBTYPES[v.category].includes(v.subtype),
    {
      message: 'Subtype is not valid for the selected category.',
      path: ['subtype'],
    },
  );

export const basicsStepSchema = basicsSchema;

export function metadataStepSchemaFor(category: Category) {
  return CATEGORY_METADATA_SCHEMAS[category];
}

export function pricingStepSchemaFor(pricing_model: PricingModel) {
  return pricingDetailsSchemas[pricing_model];
}

export const licenseStepSchema = z.object({
  license: licenseEnum,
});

export const assetsStepSchema = z.object({
  asset_refs: z.array(z.string().uuid()).max(16).default([]),
  thumbnail_r2_key: z.string().max(512).nullable(),
});

// ---------------------------------------------------------------------------
// Full draft -> server payload
//
// Shape consumed by POST /v1/marketplace/listings + PATCH. Derives final
// slug from title when the creator left it blank.
// ---------------------------------------------------------------------------

export interface ListingCreateBody {
  category: Category;
  subtype: Subtype;
  title: string;
  short_description?: string;
  long_description?: string;
  slug?: string;
  capability_tags: string[];
  license: License;
  pricing_model: PricingModel;
  pricing_details: Record<string, unknown>;
  category_metadata: Record<string, unknown>;
  asset_refs: string[];
  thumbnail_r2_key?: string;
  version: string;
}

export function toCreateBody(draft: DraftShape): ListingCreateBody {
  if (!draft.category || !draft.subtype) {
    throw new Error('draft missing category/subtype; cannot build create body');
  }
  const slug = draft.basics.slug || deriveSlug(draft.basics.title);
  const body: ListingCreateBody = {
    category: draft.category,
    subtype: draft.subtype,
    title: draft.basics.title,
    capability_tags: draft.basics.capability_tags,
    license: draft.license,
    pricing_model: draft.pricing_model,
    pricing_details: draft.pricing_details,
    category_metadata: draft.category_metadata,
    asset_refs: draft.asset_refs,
    version: draft.version,
  };
  if (draft.basics.short_description)
    body.short_description = draft.basics.short_description;
  if (draft.basics.long_description)
    body.long_description = draft.basics.long_description;
  if (slug) body.slug = slug;
  if (draft.thumbnail_r2_key) body.thumbnail_r2_key = draft.thumbnail_r2_key;
  return body;
}

export interface ListingUpdateBody {
  title?: string;
  short_description?: string;
  long_description?: string;
  capability_tags?: string[];
  license?: License;
  pricing_model?: PricingModel;
  pricing_details?: Record<string, unknown>;
  category_metadata?: Record<string, unknown>;
  asset_refs?: string[];
  thumbnail_r2_key?: string;
  version?: string;
}

// PATCH body. Only fields the creator has plausibly edited; the server
// treats missing keys as no-change and rejects unknown ones.
export function toUpdateBody(draft: DraftShape): ListingUpdateBody {
  const body: ListingUpdateBody = {};
  if (draft.basics.title) body.title = draft.basics.title;
  if (draft.basics.short_description)
    body.short_description = draft.basics.short_description;
  if (draft.basics.long_description)
    body.long_description = draft.basics.long_description;
  body.capability_tags = draft.basics.capability_tags;
  body.license = draft.license;
  body.pricing_model = draft.pricing_model;
  body.pricing_details = draft.pricing_details;
  body.category_metadata = draft.category_metadata;
  body.asset_refs = draft.asset_refs;
  if (draft.thumbnail_r2_key) body.thumbnail_r2_key = draft.thumbnail_r2_key;
  body.version = draft.version;
  return body;
}

// Publish-time strict check: mirrors validate_for_publish in the backend.
export function validateForPublish(draft: DraftShape): {
  ok: boolean;
  issues: { field: string; code: string; message: string }[];
} {
  const issues: { field: string; code: string; message: string }[] = [];
  const catParse = categoryStepSchema.safeParse({
    category: draft.category,
    subtype: draft.subtype,
  });
  if (!catParse.success) {
    for (const e of catParse.error.issues) {
      issues.push({
        field: e.path.join('.'),
        code: 'category_step_invalid',
        message: e.message,
      });
    }
  }
  const basicsParse = basicsStepSchema.safeParse(draft.basics);
  if (!basicsParse.success) {
    for (const e of basicsParse.error.issues) {
      issues.push({
        field: 'basics.' + e.path.join('.'),
        code: 'basics_invalid',
        message: e.message,
      });
    }
  }
  if (draft.basics.slug && !slugRegex.test(draft.basics.slug)) {
    issues.push({
      field: 'basics.slug',
      code: 'slug_shape',
      message: 'slug must be lowercase kebab-case.',
    });
  }
  if (!draft.basics.long_description?.trim()) {
    issues.push({
      field: 'basics.long_description',
      code: 'description_required_for_public',
      message: 'long_description is required to publish a listing.',
    });
  }
  if (draft.category) {
    const metaParse = CATEGORY_METADATA_SCHEMAS[draft.category].safeParse(
      draft.category_metadata,
    );
    if (!metaParse.success) {
      for (const e of metaParse.error.issues) {
        issues.push({
          field: 'category_metadata.' + e.path.join('.'),
          code: 'category_metadata_invalid',
          message: e.message,
        });
      }
    }
  }
  const priceParse = pricingDetailsSchemas[draft.pricing_model].safeParse(
    draft.pricing_details,
  );
  if (!priceParse.success) {
    for (const e of priceParse.error.issues) {
      issues.push({
        field: 'pricing_details.' + e.path.join('.'),
        code: 'pricing_details_invalid',
        message: e.message,
      });
    }
  }
  return { ok: issues.length === 0, issues };
}
