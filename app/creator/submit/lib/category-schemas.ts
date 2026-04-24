//
// category-schemas.ts
//
// Client-side Zod mirror of the backend Pydantic per-category sub-schemas.
// Contract ref: docs/contracts/marketplace_listing.contract.md v0.2.0
// Sections 3.1 (Category + Subtype taxonomy), 3.2 (PricingModel, License),
// 3.4 (pricing_details shape), 3.5 (category_metadata sub-schema per category).
//
// Owner: Phanes (W2 NP P1 Session 2). Pythia-v3 authored the backend; this
// file keeps wire-shape parity so the creator submission wizard previews
// validation errors locally before the server round-trip. If the backend
// schema changes, update this file in lockstep and bump the schema_version
// export below.
//
// Design notes
// - Strings are kept as Zod enums to match Python Literal typing; adding a
//   new subtype on the backend means adding it here too or builds fail.
// - Per-category metadata shapes are Zod objects. The wizard derives the
//   visible field set from each shape so a taxonomy addition appears in
//   the UI without a component rewrite.
// - The backend rejects unknown keys via Pydantic extra='forbid'. The
//   mirror uses `.strict()` to preserve that behaviour client-side.
//

import { z } from 'zod';

// Keep this in sync with the contract header. Bump when shape drifts.
export const schema_version = '0.2.0';

// ---------------------------------------------------------------------------
// Enums - Category / Subtype / PricingModel / License
// ---------------------------------------------------------------------------

export const categoryEnum = z.enum([
  'core_agent',
  'content',
  'infrastructure',
  'assets',
  'services',
  'premium',
  'data',
]);
export type Category = z.infer<typeof categoryEnum>;

export const subtypeEnum = z.enum([
  // core_agent
  'agent',
  'agent_bundle',
  'agent_team',
  // content
  'prompt',
  'skill',
  'quest_template',
  'dialogue_tree',
  'context_pack',
  // infrastructure
  'mcp_config',
  'connector',
  'workflow',
  'eval_suite',
  // assets
  'voice_profile',
  'visual_theme',
  'sprite_pack',
  'sound_pack',
  // services
  'custom_build_service',
  'consulting_hour',
  // premium
  'verified_certification',
  'priority_listing',
  'custom_domain_agent',
  // data
  'dataset',
  'analytics_dashboard',
]);
export type Subtype = z.infer<typeof subtypeEnum>;

export const pricingModelEnum = z.enum([
  'free',
  'one_time',
  'subscription_monthly',
  'subscription_yearly',
  'usage_based',
  'tiered',
]);
export type PricingModel = z.infer<typeof pricingModelEnum>;

export const licenseEnum = z.enum([
  'MIT',
  'CC0',
  'CC_BY_4',
  'CC_BY_SA_4',
  'CC_BY_NC_4',
  'APACHE_2',
  'CUSTOM_COMMERCIAL',
  'PROPRIETARY',
]);
export type License = z.infer<typeof licenseEnum>;

export const ALLOWED_SUBTYPES: Record<Category, ReadonlyArray<Subtype>> = {
  core_agent: ['agent', 'agent_bundle', 'agent_team'],
  content: ['prompt', 'skill', 'quest_template', 'dialogue_tree', 'context_pack'],
  infrastructure: ['mcp_config', 'connector', 'workflow', 'eval_suite'],
  assets: ['voice_profile', 'visual_theme', 'sprite_pack', 'sound_pack'],
  services: ['custom_build_service', 'consulting_hour'],
  premium: ['verified_certification', 'priority_listing', 'custom_domain_agent'],
  data: ['dataset', 'analytics_dashboard'],
};

// Human-readable labels for the picker UI. Kept near the enum so adding a
// subtype forces a label edit in the same PR.
export const CATEGORY_LABELS: Record<Category, string> = {
  core_agent: 'Core Agent',
  content: 'Content',
  infrastructure: 'Infrastructure',
  assets: 'Assets',
  services: 'Services',
  premium: 'Premium',
  data: 'Data',
};

export const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  core_agent: 'Agents themselves: single agents, bundles, or teams.',
  content: 'Prompts, skills, quest templates, dialogue, context packs.',
  infrastructure: 'MCP configs, connectors, workflows, eval suites.',
  assets: 'Voice profiles, visual themes, sprite packs, sound packs.',
  services: 'Custom build services and consulting by the hour.',
  premium: 'Verified certification, priority placement, custom domains.',
  data: 'Datasets and analytics dashboards.',
};

export const SUBTYPE_LABELS: Record<Subtype, string> = {
  agent: 'Single Agent',
  agent_bundle: 'Agent Bundle',
  agent_team: 'Agent Team',
  prompt: 'Prompt',
  skill: 'Skill',
  quest_template: 'Quest Template',
  dialogue_tree: 'Dialogue Tree',
  context_pack: 'Context Pack',
  mcp_config: 'MCP Config',
  connector: 'Connector',
  workflow: 'Workflow',
  eval_suite: 'Eval Suite',
  voice_profile: 'Voice Profile',
  visual_theme: 'Visual Theme',
  sprite_pack: 'Sprite Pack',
  sound_pack: 'Sound Pack',
  custom_build_service: 'Custom Build Service',
  consulting_hour: 'Consulting Hour',
  verified_certification: 'Verified Certification',
  priority_listing: 'Priority Listing',
  custom_domain_agent: 'Custom Domain Agent',
  dataset: 'Dataset',
  analytics_dashboard: 'Analytics Dashboard',
};

export const LICENSE_LABELS: Record<License, string> = {
  MIT: 'MIT',
  CC0: 'CC0 (Public Domain)',
  CC_BY_4: 'CC BY 4.0',
  CC_BY_SA_4: 'CC BY-SA 4.0',
  CC_BY_NC_4: 'CC BY-NC 4.0',
  APACHE_2: 'Apache 2.0',
  CUSTOM_COMMERCIAL: 'Custom Commercial',
  PROPRIETARY: 'Proprietary',
};

export const PRICING_MODEL_LABELS: Record<PricingModel, string> = {
  free: 'Free',
  one_time: 'One-time purchase',
  subscription_monthly: 'Monthly subscription',
  subscription_yearly: 'Yearly subscription',
  usage_based: 'Usage-based (metered)',
  tiered: 'Tiered pricing',
};

// ---------------------------------------------------------------------------
// Per-category metadata sub-schemas (mirror of src/backend/marketplace/schemas)
// ---------------------------------------------------------------------------

// core_agent/core_agent.py CoreAgentMetadata
export const coreAgentMetadataSchema = z
  .object({
    runtime_requirements: z
      .record(z.string(), z.unknown())
      .describe('Runtime shape: model id, tool allowlist, MCP servers.'),
    prompt_artifact_id: z
      .string()
      .uuid()
      .describe('file_storage_manifest id pointing at the prompt .md blob.'),
    example_inputs: z.array(z.record(z.string(), z.unknown())).default([]),
    success_criteria: z.string().optional(),
  })
  .strict();

// content/content.py ContentMetadata
export const contentMetadataSchema = z
  .object({
    content_format: z.enum(['markdown', 'json', 'yaml', 'text', 'mdx']),
    language: z.string().max(16).default('en'),
    word_count: z.number().int().nonnegative().optional(),
    inline_preview: z.string().max(500).optional(),
  })
  .strict();

// infrastructure/infrastructure.py InfrastructureMetadata
export const infrastructureMetadataSchema = z
  .object({
    platform_compat: z
      .array(
        z.enum([
          'claude_code',
          'anthropic_api',
          'openai_api',
          'mcp_remote',
          'mcp_local',
        ]),
      )
      .min(1),
    config_schema: z.record(z.string(), z.unknown()).default({}),
    install_instructions_md: z.string().optional(),
  })
  .strict();

// assets/assets.py AssetsMetadata
export const assetsMetadataSchema = z
  .object({
    media_type: z.enum(['image', 'audio', 'video', 'font', '3d_model', 'animation']),
    file_format: z.string().min(1).max(32),
    dimensions: z.record(z.string(), z.unknown()).optional(),
    license_notes: z.string().optional(),
  })
  .strict();

// services/services.py ServicesMetadata
export const servicesMetadataSchema = z
  .object({
    service_kind: z.enum(['custom_build', 'consulting', 'integration', 'training']),
    delivery_time_days: z.number().int().min(0).max(365),
    scope_description: z.string().min(1).max(4000),
    included_revisions: z.number().int().min(0).max(20).default(0),
    sla: z.string().max(2000).optional(),
  })
  .strict();

// premium/premium.py PremiumMetadata
export const premiumMetadataSchema = z
  .object({
    premium_kind: z.enum([
      'verified_certification',
      'priority_listing',
      'custom_domain_agent',
    ]),
    issuance_workflow: z.record(z.string(), z.unknown()).optional(),
    validity_days: z.number().int().min(1).max(3650).optional(),
    renewal_policy: z.string().max(2000).optional(),
  })
  .strict();

// data/data.py DataMetadata
export const dataMetadataSchema = z
  .object({
    size_mb: z.number().int().min(0).max(1024 * 1024),
    update_frequency: z.enum(['static', 'daily', 'weekly', 'monthly', 'on_demand']),
    source_attribution: z.string().min(1).max(2000),
    row_count: z.number().int().nonnegative().optional(),
    schema_json_url: z.string().max(2048).optional(),
  })
  .strict();

// Dispatch map: category -> zod schema.
export const CATEGORY_METADATA_SCHEMAS: Record<Category, z.ZodTypeAny> = {
  core_agent: coreAgentMetadataSchema,
  content: contentMetadataSchema,
  infrastructure: infrastructureMetadataSchema,
  assets: assetsMetadataSchema,
  services: servicesMetadataSchema,
  premium: premiumMetadataSchema,
  data: dataMetadataSchema,
};

// ---------------------------------------------------------------------------
// Pricing details shape per model (contract Section 3.4)
// ---------------------------------------------------------------------------

const currencySchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO 4217 code');

export const pricingDetailsSchemas = {
  free: z.object({}).strict(),
  one_time: z
    .object({
      amount_cents: z.number().int().nonnegative(),
      currency: currencySchema,
    })
    .strict(),
  subscription_monthly: z
    .object({
      amount_cents: z.number().int().nonnegative(),
      currency: currencySchema,
      stripe_price_id: z.string().optional(),
    })
    .strict(),
  subscription_yearly: z
    .object({
      amount_cents: z.number().int().nonnegative(),
      currency: currencySchema,
      stripe_price_id: z.string().optional(),
    })
    .strict(),
  usage_based: z
    .object({
      meter: z.enum(['per_execution', 'per_token', 'per_minute']),
      rate_cents: z.number().int().nonnegative(),
      currency: currencySchema,
      free_tier_units: z.number().int().nonnegative().optional(),
    })
    .strict(),
  tiered: z
    .object({
      tiers: z
        .array(
          z
            .object({
              name: z.string().min(1),
              max_units: z.number().int().positive(),
              amount_cents: z.number().int().nonnegative(),
            })
            .strict(),
        )
        .min(1),
      currency: currencySchema,
    })
    .strict(),
} as const;

export type PricingDetailsOf<M extends PricingModel> = z.infer<
  (typeof pricingDetailsSchemas)[M]
>;

// ---------------------------------------------------------------------------
// Basics step - title / description / slug
// ---------------------------------------------------------------------------

export const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const basicsSchema = z.object({
  title: z.string().min(1).max(200),
  short_description: z.string().max(280).optional().or(z.literal('')),
  long_description: z.string().optional().or(z.literal('')),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(slugRegex, 'slug must be lowercase kebab-case')
    .optional()
    .or(z.literal('')),
  capability_tags: z.array(z.string().min(1).max(40)).max(32).default([]),
});
export type BasicsFields = z.infer<typeof basicsSchema>;
