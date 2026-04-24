//
// tests/creator_submit_schema.test.ts
//
// Unit tests for the per-category Zod mirrors that drive the creator
// submission wizard. Parity against the server Pydantic sub-schemas is
// asserted at round-trip granularity: each category gets at least one
// positive and one negative case. Runner: node:test via
// `node --test --experimental-strip-types tests/creator_submit_schema.test.ts`.
//

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  ALLOWED_SUBTYPES,
  CATEGORY_METADATA_SCHEMAS,
  assetsMetadataSchema,
  categoryEnum,
  contentMetadataSchema,
  coreAgentMetadataSchema,
  dataMetadataSchema,
  infrastructureMetadataSchema,
  licenseEnum,
  premiumMetadataSchema,
  pricingDetailsSchemas,
  pricingModelEnum,
  servicesMetadataSchema,
  subtypeEnum,
} from '../app/creator/submit/lib/category-schemas';
import {
  categoryStepSchema,
  deriveSlug,
  toCreateBody,
  toUpdateBody,
  validateForPublish,
  createEmptyDraft,
} from '../app/creator/submit/lib/schema';

// ----- Enum parity -----

describe('enum parity with the backend contract', () => {
  it('category enum has 7 members matching the contract', () => {
    assert.deepEqual(categoryEnum.options.sort(), [
      'assets',
      'content',
      'core_agent',
      'data',
      'infrastructure',
      'premium',
      'services',
    ]);
  });

  it('subtype enum has all 23 members', () => {
    assert.equal(subtypeEnum.options.length, 23);
  });

  it('license enum has 8 members', () => {
    assert.equal(licenseEnum.options.length, 8);
  });

  it('pricing model enum has 6 members', () => {
    assert.equal(pricingModelEnum.options.length, 6);
  });

  it('ALLOWED_SUBTYPES covers every category', () => {
    for (const c of categoryEnum.options) {
      assert.ok(
        Array.isArray(ALLOWED_SUBTYPES[c]) && ALLOWED_SUBTYPES[c].length > 0,
        `category ${c} must have at least one subtype`,
      );
    }
  });
});

// ----- Category metadata sub-schemas -----

describe('CoreAgent metadata schema', () => {
  it('accepts a valid payload', () => {
    const parse = coreAgentMetadataSchema.safeParse({
      runtime_requirements: { model: 'claude-opus-4-7' },
      prompt_artifact_id: '01926f00-5001-7a50-8501-000000000001',
      example_inputs: [{ greeting: 'hi' }],
      success_criteria: 'advisor completes onboarding',
    });
    assert.ok(parse.success);
  });
  it('rejects missing prompt_artifact_id', () => {
    const parse = coreAgentMetadataSchema.safeParse({
      runtime_requirements: {},
    });
    assert.equal(parse.success, false);
  });
});

describe('Content metadata schema', () => {
  it('accepts markdown format', () => {
    const parse = contentMetadataSchema.safeParse({
      content_format: 'markdown',
    });
    assert.ok(parse.success);
  });
  it('rejects unknown content_format', () => {
    const parse = contentMetadataSchema.safeParse({ content_format: 'lua' });
    assert.equal(parse.success, false);
  });
});

describe('Infrastructure metadata schema', () => {
  it('accepts a payload with platform_compat', () => {
    const parse = infrastructureMetadataSchema.safeParse({
      platform_compat: ['claude_code'],
    });
    assert.ok(parse.success);
  });
  it('rejects empty platform_compat', () => {
    const parse = infrastructureMetadataSchema.safeParse({
      platform_compat: [],
    });
    assert.equal(parse.success, false);
  });
});

describe('Assets metadata schema', () => {
  it('accepts an image sprite pack', () => {
    const parse = assetsMetadataSchema.safeParse({
      media_type: 'image',
      file_format: 'png',
    });
    assert.ok(parse.success);
  });
  it('rejects missing file_format', () => {
    const parse = assetsMetadataSchema.safeParse({ media_type: 'image' });
    assert.equal(parse.success, false);
  });
});

describe('Services metadata schema', () => {
  it('accepts a consulting offering', () => {
    const parse = servicesMetadataSchema.safeParse({
      service_kind: 'consulting',
      delivery_time_days: 3,
      scope_description: 'one 60-min block',
    });
    assert.ok(parse.success);
  });
  it('rejects negative delivery_time_days', () => {
    const parse = servicesMetadataSchema.safeParse({
      service_kind: 'consulting',
      delivery_time_days: -1,
      scope_description: 'x',
    });
    assert.equal(parse.success, false);
  });
});

describe('Premium metadata schema', () => {
  it('accepts a verified_certification payload', () => {
    const parse = premiumMetadataSchema.safeParse({
      premium_kind: 'verified_certification',
      validity_days: 365,
    });
    assert.ok(parse.success);
  });
  it('rejects unknown premium_kind', () => {
    const parse = premiumMetadataSchema.safeParse({
      premium_kind: 'gold_star',
    });
    assert.equal(parse.success, false);
  });
});

describe('Data metadata schema', () => {
  it('accepts a dataset with size + source', () => {
    const parse = dataMetadataSchema.safeParse({
      size_mb: 100,
      update_frequency: 'weekly',
      source_attribution: 'internal',
    });
    assert.ok(parse.success);
  });
  it('rejects missing source_attribution', () => {
    const parse = dataMetadataSchema.safeParse({
      size_mb: 100,
      update_frequency: 'weekly',
    });
    assert.equal(parse.success, false);
  });
});

// ----- Category step validator -----

describe('category step schema', () => {
  it('accepts a valid category/subtype pair', () => {
    const parse = categoryStepSchema.safeParse({
      category: 'core_agent',
      subtype: 'agent',
    });
    assert.ok(parse.success);
  });
  it('rejects a subtype outside its category', () => {
    const parse = categoryStepSchema.safeParse({
      category: 'core_agent',
      subtype: 'sprite_pack',
    });
    assert.equal(parse.success, false);
  });
});

// ----- Pricing detail schemas -----

describe('pricing details shape', () => {
  it('free accepts empty dict', () => {
    const parse = pricingDetailsSchemas.free.safeParse({});
    assert.ok(parse.success);
  });
  it('one_time rejects missing currency', () => {
    const parse = pricingDetailsSchemas.one_time.safeParse({
      amount_cents: 500,
    });
    assert.equal(parse.success, false);
  });
  it('usage_based accepts a complete payload', () => {
    const parse = pricingDetailsSchemas.usage_based.safeParse({
      meter: 'per_execution',
      rate_cents: 5,
      currency: 'USD',
      free_tier_units: 100,
    });
    assert.ok(parse.success);
  });
  it('tiered rejects an empty tiers array', () => {
    const parse = pricingDetailsSchemas.tiered.safeParse({
      tiers: [],
      currency: 'USD',
    });
    assert.equal(parse.success, false);
  });
});

// ----- Dispatch map sanity -----

describe('CATEGORY_METADATA_SCHEMAS dispatch', () => {
  it('maps every category to a schema', () => {
    for (const c of categoryEnum.options) {
      assert.ok(CATEGORY_METADATA_SCHEMAS[c] !== undefined, `missing ${c}`);
    }
  });
});

// ----- Slug derivation -----

describe('deriveSlug', () => {
  it('kebab-cases a plain title', () => {
    assert.equal(deriveSlug('Hello World'), 'hello-world');
  });
  it('strips non-ASCII and collapses dashes', () => {
    assert.equal(deriveSlug('Namaste   -- World!'), 'namaste-world');
  });
  it('truncates past 60 characters', () => {
    const long = 'x'.repeat(80);
    assert.ok(deriveSlug(long).length <= 60);
  });
  it('falls back to "listing" for empty input', () => {
    assert.equal(deriveSlug(''), 'listing');
  });
});

// ----- validateForPublish aggregation -----

describe('validateForPublish', () => {
  it('flags missing long_description', () => {
    const draft = createEmptyDraft();
    draft.category = 'content';
    draft.subtype = 'prompt';
    draft.basics.title = 'X';
    draft.category_metadata = { content_format: 'markdown' };
    const out = validateForPublish(draft);
    assert.equal(out.ok, false);
    const codes = out.issues.map((i) => i.code);
    assert.ok(codes.includes('description_required_for_public'));
  });

  it('passes a complete content draft', () => {
    const draft = createEmptyDraft();
    draft.category = 'content';
    draft.subtype = 'prompt';
    draft.basics.title = 'Clean';
    draft.basics.long_description = 'A complete long description.';
    draft.category_metadata = { content_format: 'markdown' };
    const out = validateForPublish(draft);
    assert.equal(out.ok, true, JSON.stringify(out.issues));
  });
});

// ----- toCreateBody / toUpdateBody -----

describe('toCreateBody', () => {
  it('derives the slug when absent', () => {
    const draft = createEmptyDraft();
    draft.category = 'content';
    draft.subtype = 'prompt';
    draft.basics.title = 'New Prompt';
    draft.basics.slug = '';
    const body = toCreateBody(draft);
    assert.equal(body.slug, 'new-prompt');
    assert.equal(body.category, 'content');
    assert.equal(body.subtype, 'prompt');
  });
});

describe('toUpdateBody', () => {
  it('emits every non-empty field', () => {
    const draft = createEmptyDraft();
    draft.category = 'assets';
    draft.subtype = 'sprite_pack';
    draft.basics.title = 'Pack';
    draft.basics.long_description = 'long';
    draft.license = 'CC_BY_4';
    draft.pricing_model = 'one_time';
    draft.pricing_details = { amount_cents: 500, currency: 'USD' };
    draft.category_metadata = { media_type: 'image', file_format: 'png' };
    const body = toUpdateBody(draft);
    assert.equal(body.title, 'Pack');
    assert.equal(body.license, 'CC_BY_4');
    assert.deepEqual(body.pricing_details, { amount_cents: 500, currency: 'USD' });
  });
});
