# Marketplace Listing

**Contract Version:** 0.1.0
**Owner Agent(s):** Demeter (schema owner and curator)
**Consumer Agent(s):** Eos (submission flow producer), Artemis (browse surface), Coeus (search and living template remix), Phoebe (identity card render), Tyche (pricing-tier to billing alignment), Hecate (identity linkage)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the canonical `AgentListing` schema for the open cross-vendor Marketplace (name, capabilities, vendor origin, pricing tier, living-template parameters, trust score pointer, audit summary) so creator submissions from any vendor feed a single taxonomy per NarasiGhaisan Section 5 pain resolution.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 5 Marketplace fragmentation pain)
- `CLAUDE.md` (root)
- `docs/contracts/agent_identity.contract.md` (Registry linkage)
- `docs/contracts/billing_meter.contract.md` (pricing-tier enum alignment)
- `docs/contracts/living_template_customize.contract.md` (living-template parameter schema)

## 3. Schema Definition

```typescript
// app/marketplace/schema/listing.schema.ts

export type VendorOrigin =
  | 'hand_coded'
  | 'cursor'
  | 'claude_code'
  | 'replit'
  | 'bolt'
  | 'lovable'
  | 'claude_skills'
  | 'gpt_store'
  | 'mcp_hub'
  | 'huggingface_space'
  | 'langchain_hub'
  | 'vercel_gallery'
  | 'cloudflare_marketplace'
  | 'other';

export type PricingTier = 'free' | 'cheap' | 'mid' | 'premium';

export type CapabilityTag =
  | 'code_generation'
  | 'research'
  | 'data_extraction'
  | 'customer_support'
  | 'marketing_copy'
  | 'design_asset'
  | 'video_generation'
  | 'trading_signal'
  | 'domain_automation'
  | 'analysis'
  | 'other';

export interface AgentListing {
  listing_id: string;                // uuid v4
  slug: string;                      // kebab-case unique human-readable
  display_name: string;
  short_description: string;         // max 280 chars
  long_description_markdown: string;
  creator_identity_id: string;       // foreign key to Registry identity
  vendor_origin: VendorOrigin;
  capability_tags: CapabilityTag[];  // at least 1, at most 5
  pricing_tier: PricingTier;
  usage_cost_hint: {
    per_execution_unit: 'token' | 'request' | 'minute' | 'task';
    estimate_range: { low_usd: number; high_usd: number };
  };
  living_template_params?: Array<{
    key: string;
    label: string;
    kind: 'string' | 'enum' | 'number' | 'boolean';
    enum_values?: string[];
    default_value: string | number | boolean;
    description: string;
  }>;
  trust_score_pointer: string;       // path or URL to trust score surface
  audit_summary: string;             // short text, last updated timestamp visible
  created_at: string;                // ISO-8601 UTC
  updated_at: string;
  visibility: 'draft' | 'public' | 'unlisted' | 'archived';
}
```

## 4. Interface / API Contract

```typescript
export interface MarketplaceCatalog {
  getListing(listing_id: string): Promise<AgentListing | null>;
  listBy(filter: Partial<{ vendor_origin: VendorOrigin; pricing_tier: PricingTier; capability_tag: CapabilityTag; creator_identity_id: string }>): Promise<AgentListing[]>;
  upsert(listing: AgentListing): Promise<AgentListing>;
  archive(listing_id: string): Promise<void>;
}
```

- Implementations back the catalog with SQLite for hackathon scope; schema migration scripts live under `app/marketplace/schema/migrations/`.
- `upsert` validates against the Zod schema derived from the TypeScript types before write; invalid data throws `ListingValidationError`.

## 5. Event Signatures

- `marketplace.listing.created` payload: `{ listing_id, slug }`
- `marketplace.listing.updated` payload: `{ listing_id, changed_fields: string[] }`
- `marketplace.listing.archived` payload: `{ listing_id }`

These events ride their own `marketplace.*` namespace on the shared event bus, reserved for Marketplace pillar.

## 6. File Path Convention

- Schema: `app/marketplace/schema/listing.schema.ts`
- Catalog implementation: `app/marketplace/catalog/SqliteCatalog.ts`
- Migrations: `app/marketplace/schema/migrations/`
- Taxonomy fixtures: `app/marketplace/taxonomy/categories.json`

## 7. Naming Convention

- `VendorOrigin`, `PricingTier`, `CapabilityTag` enum values: lowercase `snake_case` string literals.
- Slugs: lowercase kebab-case, alphanumeric and hyphens only, max 60 chars.
- Field names: `snake_case` in JSON and TypeScript alike (consistent wire format).

## 8. Error Handling

- Invalid `slug` (duplicate, bad chars): throws `ListingValidationError` with field pointer.
- `capability_tags` outside 1 to 5 range: throws.
- `creator_identity_id` not found in Registry: throws `UnknownIdentityError`.
- `pricing_tier` inconsistent with `usage_cost_hint.estimate_range`: logs warning, accepts (advisory).
- Archive of nonexistent listing: no-op, returns without error.

## 9. Testing Surface

- Round-trip upsert: write a listing, read by id, assert fields match.
- Filter semantics: upsert 5 listings with varied fields, assert `listBy({ vendor_origin: 'claude_code' })` returns only matching entries.
- Validation: attempt upsert with 6 capability_tags, assert throws.
- Living template parameters: upsert a listing with 3 params, assert retrieval preserves param order and default_value types.
- Event emission: upsert and assert `marketplace.listing.created` event published with correct payload.

## 10. Open Questions

- None at contract draft. Vendor origin filter surfacing in UI is an Artemis strategic_decision, schema side is finalized.

## 11. Post-Hackathon Refactor Notes

- Expand `VendorOrigin` as new platforms emerge; consider making it an extensible registry rather than a closed enum.
- Integrate with an external embedding store (pgvector, Chroma) for semantic search; hackathon uses SQLite LIKE or Coeus-mediated similarity.
- Add versioning per listing (creators ship v1, v2, v3 of an agent) with diff view.
- Introduce revenue-share flag linking listing to Banking payout schedule; currently inferred from pricing_tier plus Tyche's tier_model.
- Formal legal licensing metadata (MIT, Apache-2.0, proprietary, custom EULA) to allow enterprise buyers to filter.
