/**
 * NERIUM Marketplace Listing Schema
 *
 * Contract conformance: docs/contracts/marketplace_listing.contract.md v0.1.0
 * Section 3 Schema Definition is the authoritative source; this file is the
 * shipped TypeScript surface consumed by Eos (submission), Artemis (browse),
 * Coeus (search), Phoebe (identity card), Tyche (pricing tier), Hecate (identity).
 *
 * Owner: Demeter (Marketplace Lead, P1)
 * Scope: hackathon prototype, SQLite backing store, no production trading guarantees.
 */

export const VENDOR_ORIGINS = [
  'hand_coded',
  'cursor',
  'claude_code',
  'replit',
  'bolt',
  'lovable',
  'claude_skills',
  'gpt_store',
  'mcp_hub',
  'huggingface_space',
  'langchain_hub',
  'vercel_gallery',
  'cloudflare_marketplace',
  'nerium_builder',
  'other',
] as const;

export type VendorOrigin = (typeof VENDOR_ORIGINS)[number];

export const PRICING_TIERS = ['free', 'cheap', 'mid', 'premium'] as const;
export type PricingTier = (typeof PRICING_TIERS)[number];

export const CAPABILITY_TAGS = [
  'code_generation',
  'research',
  'data_extraction',
  'customer_support',
  'marketing_copy',
  'design_asset',
  'video_generation',
  'trading_signal',
  'domain_automation',
  'analysis',
  'other',
] as const;
export type CapabilityTag = (typeof CAPABILITY_TAGS)[number];

export const LISTING_VISIBILITIES = [
  'draft',
  'public',
  'unlisted',
  'archived',
] as const;
export type ListingVisibility = (typeof LISTING_VISIBILITIES)[number];

export type UsageUnit = 'token' | 'request' | 'minute' | 'task';

export interface UsageCostHint {
  per_execution_unit: UsageUnit;
  estimate_range: { low_usd: number; high_usd: number };
}

export type LivingTemplateParamKind = 'string' | 'enum' | 'number' | 'boolean';

export interface LivingTemplateParam {
  key: string;
  label: string;
  kind: LivingTemplateParamKind;
  enum_values?: string[];
  default_value: string | number | boolean;
  description: string;
}

export type LivingTemplateParams = LivingTemplateParam[];

export interface AgentListing {
  listing_id: string;
  slug: string;
  display_name: string;
  short_description: string;
  long_description_markdown: string;
  creator_identity_id: string;
  vendor_origin: VendorOrigin;
  capability_tags: CapabilityTag[];
  pricing_tier: PricingTier;
  usage_cost_hint: UsageCostHint;
  living_template_params?: LivingTemplateParams;
  trust_score_pointer: string;
  audit_summary: string;
  created_at: string;
  updated_at: string;
  visibility: ListingVisibility;
}

export interface MarketplaceCatalog {
  getListing(listing_id: string): Promise<AgentListing | null>;
  listBy(
    filter: Partial<{
      vendor_origin: VendorOrigin;
      pricing_tier: PricingTier;
      capability_tag: CapabilityTag;
      creator_identity_id: string;
    }>
  ): Promise<AgentListing[]>;
  upsert(listing: AgentListing): Promise<AgentListing>;
  archive(listing_id: string): Promise<void>;
}

export class ListingValidationError extends Error {
  constructor(public field: string, message: string) {
    super(`ListingValidationError [${field}]: ${message}`);
    this.name = 'ListingValidationError';
  }
}

export class UnknownIdentityError extends Error {
  constructor(public creator_identity_id: string) {
    super(`UnknownIdentityError: creator_identity_id ${creator_identity_id} not found in Registry`);
    this.name = 'UnknownIdentityError';
  }
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX_LEN = 60;
const SHORT_DESC_MAX_LEN = 280;
const MIN_CAPABILITY_TAGS = 1;
const MAX_CAPABILITY_TAGS = 5;

export function validateListingShape(listing: AgentListing): void {
  if (!listing.slug || listing.slug.length > SLUG_MAX_LEN || !SLUG_RE.test(listing.slug)) {
    throw new ListingValidationError('slug', 'slug must be kebab-case alphanumeric, max 60 chars');
  }
  if (listing.short_description.length > SHORT_DESC_MAX_LEN) {
    throw new ListingValidationError('short_description', `must be <= ${SHORT_DESC_MAX_LEN} chars`);
  }
  if (
    listing.capability_tags.length < MIN_CAPABILITY_TAGS ||
    listing.capability_tags.length > MAX_CAPABILITY_TAGS
  ) {
    throw new ListingValidationError(
      'capability_tags',
      `must contain ${MIN_CAPABILITY_TAGS} to ${MAX_CAPABILITY_TAGS} tags`
    );
  }
  if (!VENDOR_ORIGINS.includes(listing.vendor_origin)) {
    throw new ListingValidationError('vendor_origin', `unknown vendor_origin ${listing.vendor_origin}`);
  }
  if (!PRICING_TIERS.includes(listing.pricing_tier)) {
    throw new ListingValidationError('pricing_tier', `unknown pricing_tier ${listing.pricing_tier}`);
  }
  if (!LISTING_VISIBILITIES.includes(listing.visibility)) {
    throw new ListingValidationError('visibility', `unknown visibility ${listing.visibility}`);
  }
  const low = listing.usage_cost_hint.estimate_range.low_usd;
  const high = listing.usage_cost_hint.estimate_range.high_usd;
  if (low < 0 || high < low) {
    throw new ListingValidationError('usage_cost_hint', 'estimate_range must satisfy 0 <= low <= high');
  }
  if (listing.living_template_params) {
    for (const p of listing.living_template_params) {
      if (p.kind === 'enum' && (!p.enum_values || p.enum_values.length === 0)) {
        throw new ListingValidationError(
          `living_template_params.${p.key}`,
          'enum kind requires non-empty enum_values'
        );
      }
    }
  }
}

export const MARKETPLACE_EVENT_TOPICS = {
  created: 'marketplace.listing.created',
  updated: 'marketplace.listing.updated',
  archived: 'marketplace.listing.archived',
} as const;
