# Marketplace Listing

**Contract Version:** 0.2.0
**Owner Agent(s):** Phanes (NP listing schema authority, 7-category + sub-schema jsonb validation + licensing + pricing CRUD). Demeter (P0 origin author, deprecated as owner per NP amendment).
**Consumer Agent(s):** Hyperion (search index ingestor per `marketplace_search.contract.md`), Iapetus (purchase flow reads listings per `marketplace_commerce.contract.md`), Astraea (per-listing trust score per `trust_score.contract.md` v0.2.0), Eunomia (admin moderation queue), Khronos (MCP `search_marketplace` + list tool), Tethys (creator_identity_id FK per `agent_identity.contract.md` v0.2.0), Chione (asset files linked via manifest per `file_storage.contract.md`), Kratos (purchased listings available to buyer's MA sessions)
**Stability:** stable for NP
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3 amendment)
**Changelog v0.2.0:** Replaced P0 4-tier pricing enum with 6-model pricing taxonomy (free / one_time / subscription_monthly / subscription_yearly / usage_based / tiered). Replaced P0 11-tag CapabilityTag enum with 7-category + 21-subtype hierarchical classification (Core Agent / Content / Infrastructure / Assets / Services / Premium / Data). Added 8-license enum (MIT / CC0 / CC_BY_4 / CC_BY_SA_4 / CC_BY_NC_4 / APACHE_2 / CUSTOM_COMMERCIAL / PROPRIETARY). Added per-category sub-schema jsonb validation. Added asset_refs[] for file_storage linkage. Added revenue_split override column for per-listing platform fee customization. P0 consumers should migrate by NP Wave 2; Phanes authors migration `XXX_marketplace_listing_v2_schema.py`.

## 1. Purpose

Defines the canonical `marketplace_listing` schema for NERIUM's open cross-vendor marketplace. Replaces P0 v0.1.0 flat-capability taxonomy with 7-category + subtype + license + pricing hierarchy per M1 Section C.21. Enables precise faceted search (Hyperion), subtype-specific UI (Phanes submission wizard), license-aware commerce (Iapetus), and category-weighted trust score (Astraea).

Seven categories reflect M1 Section C.21 research. Per-category sub-schema jsonb validated via zod schemas at publish/update.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 5 marketplace fragmentation pain)
- `CLAUDE.md` (root)
- `docs/phase_np/RV_NP_RESEARCH.md` (Section C.21 7-category schema)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.4 Phanes)
- `docs/contracts/agent_identity.contract.md` v0.2.0 (creator_identity_id FK)
- `docs/contracts/marketplace_search.contract.md` (consumer of tsvector + embedding)
- `docs/contracts/marketplace_commerce.contract.md` (purchase flow binding)
- `docs/contracts/trust_score.contract.md` v0.2.0 (per-category trust scoring)
- `docs/contracts/file_storage.contract.md` (asset_refs R2 manifest binding)
- `docs/contracts/feature_flag.contract.md` (Premium category pre-GA gating)

## 3. Schema Definition

### 3.1 Category + subtype taxonomy

```python
class Category(str, Enum):
    CORE_AGENT    = "core_agent"        # agents themselves
    CONTENT       = "content"           # prompts / skills / quest templates / dialogue
    INFRASTRUCTURE = "infrastructure"   # MCP configs / connectors / workflows / evals
    ASSETS        = "assets"            # voice profiles / visual themes / sprite packs / sound
    SERVICES      = "services"          # custom build / consulting / integration
    PREMIUM       = "premium"           # verified cert / priority listing / custom domain (gated)
    DATA          = "data"              # datasets / analytics dashboards

class Subtype(str, Enum):
    # CORE_AGENT
    AGENT                = "agent"
    AGENT_BUNDLE         = "agent_bundle"
    AGENT_TEAM           = "agent_team"
    # CONTENT
    PROMPT               = "prompt"
    SKILL                = "skill"
    QUEST_TEMPLATE       = "quest_template"
    DIALOGUE_TREE        = "dialogue_tree"
    CONTEXT_PACK         = "context_pack"
    # INFRASTRUCTURE
    MCP_CONFIG           = "mcp_config"
    CONNECTOR            = "connector"
    WORKFLOW             = "workflow"
    EVAL_SUITE           = "eval_suite"
    # ASSETS
    VOICE_PROFILE        = "voice_profile"
    VISUAL_THEME         = "visual_theme"
    SPRITE_PACK          = "sprite_pack"
    SOUND_PACK           = "sound_pack"
    # SERVICES
    CUSTOM_BUILD_SERVICE = "custom_build_service"
    CONSULTING_HOUR      = "consulting_hour"
    # PREMIUM
    VERIFIED_CERTIFICATION = "verified_certification"
    PRIORITY_LISTING       = "priority_listing"
    CUSTOM_DOMAIN_AGENT    = "custom_domain_agent"
    # DATA
    DATASET              = "dataset"
    ANALYTICS_DASHBOARD  = "analytics_dashboard"

# Category → allowed subtypes map
ALLOWED_SUBTYPES: dict[Category, set[Subtype]] = {
    Category.CORE_AGENT:    {Subtype.AGENT, Subtype.AGENT_BUNDLE, Subtype.AGENT_TEAM},
    Category.CONTENT:       {Subtype.PROMPT, Subtype.SKILL, Subtype.QUEST_TEMPLATE, Subtype.DIALOGUE_TREE, Subtype.CONTEXT_PACK},
    Category.INFRASTRUCTURE:{Subtype.MCP_CONFIG, Subtype.CONNECTOR, Subtype.WORKFLOW, Subtype.EVAL_SUITE},
    Category.ASSETS:        {Subtype.VOICE_PROFILE, Subtype.VISUAL_THEME, Subtype.SPRITE_PACK, Subtype.SOUND_PACK},
    Category.SERVICES:      {Subtype.CUSTOM_BUILD_SERVICE, Subtype.CONSULTING_HOUR},
    Category.PREMIUM:       {Subtype.VERIFIED_CERTIFICATION, Subtype.PRIORITY_LISTING, Subtype.CUSTOM_DOMAIN_AGENT},
    Category.DATA:          {Subtype.DATASET, Subtype.ANALYTICS_DASHBOARD},
}
```

### 3.2 Pricing model + license enum

```python
class PricingModel(str, Enum):
    FREE                  = "free"
    ONE_TIME              = "one_time"
    SUBSCRIPTION_MONTHLY  = "subscription_monthly"
    SUBSCRIPTION_YEARLY   = "subscription_yearly"
    USAGE_BASED           = "usage_based"            # per-token, per-execution metered
    TIERED                = "tiered"                 # multi-tier pricing

class License(str, Enum):
    MIT                 = "MIT"
    CC0                 = "CC0"
    CC_BY_4             = "CC_BY_4"
    CC_BY_SA_4          = "CC_BY_SA_4"
    CC_BY_NC_4          = "CC_BY_NC_4"
    APACHE_2            = "APACHE_2"
    CUSTOM_COMMERCIAL   = "CUSTOM_COMMERCIAL"
    PROPRIETARY         = "PROPRIETARY"
```

### 3.3 Database table

```sql
CREATE TYPE listing_visibility AS ENUM ('draft', 'public', 'unlisted', 'archived');

CREATE TABLE marketplace_listing (
  id                    uuid PRIMARY KEY,
  tenant_id             uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  creator_identity_id   uuid NOT NULL REFERENCES agent_identity(id),
  slug                  text UNIQUE NOT NULL,                -- kebab-case
  title                 text NOT NULL,
  short_description     text NOT NULL CHECK (char_length(short_description) <= 280),
  long_description      text,                                -- markdown
  category              text NOT NULL,                       -- values per Section 3.1 Category
  subtype               text NOT NULL,                       -- per Subtype
  capability_tags       text[] NOT NULL DEFAULT '{}',        -- free-form discoverability tags
  license               text NOT NULL,                       -- per License
  pricing_model         text NOT NULL,                       -- per PricingModel
  pricing_details       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- shape per pricing_model (Section 3.4)
  category_metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- shape per category (Section 3.5)
  asset_refs            uuid[] NOT NULL DEFAULT '{}',        -- FK to file_storage_manifest.id[]
  thumbnail_r2_key      text,                                -- public thumbnail
  trust_score_cached    numeric(4,3),                        -- 0.000 to 1.000, refreshed by Astraea
  revenue_split_override numeric(4,3),                        -- NULL = use platform default; 0.000 to 1.000 creator share
  visibility            listing_visibility NOT NULL DEFAULT 'draft',
  version               text NOT NULL DEFAULT '1.0.0',       -- semver
  version_history       jsonb NOT NULL DEFAULT '[]'::jsonb,
  search_tsv            tsvector,                            -- generated, see marketplace_search.contract.md
  embedding             vector(1024),                        -- generated by Hyperion
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  archived_at           timestamptz,
  CHECK (category IN ('core_agent','content','infrastructure','assets','services','premium','data')),
  CHECK (subtype  IN ('agent','agent_bundle','agent_team','prompt','skill','quest_template','dialogue_tree','context_pack','mcp_config','connector','workflow','eval_suite','voice_profile','visual_theme','sprite_pack','sound_pack','custom_build_service','consulting_hour','verified_certification','priority_listing','custom_domain_agent','dataset','analytics_dashboard')),
  CHECK (license IN ('MIT','CC0','CC_BY_4','CC_BY_SA_4','CC_BY_NC_4','APACHE_2','CUSTOM_COMMERCIAL','PROPRIETARY')),
  CHECK (pricing_model IN ('free','one_time','subscription_monthly','subscription_yearly','usage_based','tiered'))
);

CREATE INDEX idx_listing_tenant_created ON marketplace_listing(tenant_id, created_at DESC);
CREATE INDEX idx_listing_public ON marketplace_listing(category, subtype) WHERE visibility = 'public';
CREATE INDEX idx_listing_slug ON marketplace_listing(slug);
CREATE INDEX idx_listing_creator ON marketplace_listing(creator_identity_id);
CREATE INDEX idx_listing_trust ON marketplace_listing(trust_score_cached DESC) WHERE visibility = 'public';

ALTER TABLE marketplace_listing ENABLE ROW LEVEL SECURITY;
-- Public listings readable cross-tenant; private listings tenant-scoped
CREATE POLICY public_read ON marketplace_listing FOR SELECT USING (
  visibility = 'public' OR tenant_id = current_setting('app.tenant_id', true)::uuid
);
CREATE POLICY tenant_write ON marketplace_listing FOR INSERT, UPDATE, DELETE USING (
  tenant_id = current_setting('app.tenant_id', true)::uuid
);
```

### 3.4 pricing_details per pricing_model

```json
// free
{}

// one_time
{"amount_cents": 1500, "currency": "USD"}

// subscription_monthly / yearly
{"amount_cents": 999, "currency": "USD", "stripe_price_id": "price_xxx"}

// usage_based
{"meter": "per_execution" | "per_token" | "per_minute",
 "rate_cents": 5, "currency": "USD", "free_tier_units": 100}

// tiered
{"tiers": [
   {"name": "Starter", "max_units": 1000, "amount_cents": 500},
   {"name": "Pro",     "max_units": 10000, "amount_cents": 2000}
 ],
 "currency": "USD"}
```

### 3.5 category_metadata per category (sub-schema)

```python
class CoreAgentMetadata(BaseModel):
    runtime_requirements: dict        # {model: "claude-opus-4-7", tools: [...], mcp_servers: [...]}
    prompt_artifact_id: UUID          # file_storage_manifest reference to .md prompt
    example_inputs: list[dict]
    success_criteria: str | None

class ContentMetadata(BaseModel):
    content_format: Literal["markdown","json","yaml","text","mdx"]
    language: str = "en"
    word_count: int | None
    inline_preview: str | None        # first 500 chars

class InfrastructureMetadata(BaseModel):
    platform_compat: list[Literal["claude_code","anthropic_api","openai_api","mcp_remote","mcp_local"]]
    config_schema: dict               # JSON Schema of user-provided config
    install_instructions_md: str | None

class AssetsMetadata(BaseModel):
    media_type: Literal["image","audio","video","font","3d_model","animation"]
    dimensions: dict | None           # {width, height} images, {duration_s} audio
    file_format: str                  # "png", "mp3", "ttf", "fbx", etc.
    license_notes: str | None         # attribution hints for CC_BY_*

class ServicesMetadata(BaseModel):
    service_kind: Literal["custom_build","consulting","integration","training"]
    delivery_time_days: int
    scope_description: str
    included_revisions: int
    sla: str | None

class PremiumMetadata(BaseModel):
    premium_kind: Literal["verified_certification","priority_listing","custom_domain_agent"]
    issuance_workflow: dict | None    # pending per M1 Open Question 5
    validity_days: int | None
    renewal_policy: str | None

class DataMetadata(BaseModel):
    row_count: int | None
    size_mb: int
    schema_json_url: str | None       # sample schema preview
    update_frequency: Literal["static","daily","weekly","monthly","on_demand"]
    source_attribution: str
```

Validator at publish/update: `subtype` MUST be in `ALLOWED_SUBTYPES[category]`; `category_metadata` MUST parse against the matching sub-schema class.

## 4. Interface / API Contract

### 4.1 CRUD

- `POST /v1/marketplace/listings` create draft. Body includes all fields. Slug generated from title if missing.
- `PATCH /v1/marketplace/listings/{id}` update draft or public (public update bumps version).
- `POST /v1/marketplace/listings/{id}/publish` draft → public (triggers Hyperion search reindex via `flag:invalidate` + `search.index.updated` event).
- `POST /v1/marketplace/listings/{id}/archive` public → archived.
- `GET /v1/marketplace/listings/{id}` detail view (tenant-scoped via RLS; public listings cross-tenant).
- `GET /v1/marketplace/listings` paginated list. Filters: `?category=`, `?subtype=`, `?license=`, `?pricing_model=`, `?visibility=`, `?creator_identity_id=`.
- `POST /v1/marketplace/listings/{id}/versions` publishes a new version: increments semver, snapshots current row into `version_history` jsonb array.

### 4.2 Premium category gating

Premium category (verified_certification, priority_listing, custom_domain_agent) gated by Hemera flag `marketplace.premium_enabled` default `false`. Until flag flipped true, POST/PATCH with `category=premium` returns HTTP 403 `premium_gated` per M1 Open Question 5.

### 4.3 Validation pipeline at publish

```python
async def validate_for_publish(listing: MarketplaceListing) -> list[ValidationIssue]:
    issues = []
    # Subtype matches category
    if listing.subtype not in ALLOWED_SUBTYPES[listing.category]:
        issues.append(ValidationIssue(field="subtype", code="subtype_not_in_category"))
    # Category-specific sub-schema validates
    sub_schema_class = SUB_SCHEMA_MAP[listing.category]
    try: sub_schema_class.model_validate(listing.category_metadata)
    except ValidationError as e: issues.append(ValidationIssue(field="category_metadata", code=str(e)))
    # Pricing details valid for model
    validate_pricing(listing.pricing_model, listing.pricing_details, issues)
    # License compatible with category (datasets can't be PROPRIETARY if marketed as "open")
    # ...
    # Asset refs all clean virus scan
    for asset_id in listing.asset_refs:
        m = await load_manifest(asset_id)
        if m.virus_scan_status != "clean":
            issues.append(ValidationIssue(field="asset_refs", code="asset_not_scanned_clean"))
    return issues
```

Return issues on `POST /v1/marketplace/listings/{id}/validate` (dry-run) or block publish with HTTP 422.

## 5. Event Signatures

Wire events per `realtime_bus.contract.md`:

| Event | Payload |
|---|---|
| `nerium.marketplace.listing_published` | `{listing_id, slug, category, subtype, creator_identity_id, license, pricing_model}` |
| `nerium.marketplace.listing_updated` | `{listing_id, version, changed_fields}` |
| `nerium.marketplace.listing_archived` | `{listing_id, reason}` |

Log:

| Event | Fields |
|---|---|
| `marketplace.listing.created` | `listing_id`, `category`, `subtype`, `creator_identity_id` |
| `marketplace.listing.published` | `listing_id`, `version`, `duration_since_draft_s` |
| `marketplace.listing.validation_failed` | `listing_id`, `issue_count`, `codes[]` |
| `marketplace.listing.premium_gated` | `listing_id`, `attempted_subtype` |

## 6. File Path Convention

- Listing router: `src/backend/routers/v1/marketplace/listing.py`
- CRUD logic: `src/backend/marketplace/listing_service.py`
- Category sub-schemas: `src/backend/marketplace/schemas/<category>.py`
- Validator: `src/backend/marketplace/validator.py`
- Pricing validator: `src/backend/marketplace/pricing_validator.py`
- Frontend pages: `src/frontend/app/marketplace/publish/page.tsx`, `src/frontend/app/marketplace/[slug]/page.tsx`
- Publish wizard: `src/frontend/components/marketplace/PublishWizard.tsx` (category → subtype → metadata → pricing → license → preview)
- Migrations: `src/backend/db/migrations/XXX_marketplace_listing_v2_schema.py` (upgrades v0.1.0 → v0.2.0)
- Seed: `src/backend/db/seed/demo_listings.sql` (3-5 per category for pitch demo)
- Tests: `tests/marketplace/test_category_subtype_validation.py`, `test_pricing_details_validation.py`, `test_publish_flow.py`, `test_premium_gating.py`, `test_version_snapshot.py`, `test_rls_public_cross_tenant.py`

## 7. Naming Convention

- Slug: kebab-case alphanumeric + hyphens, max 60 chars, unique.
- Category + subtype + pricing_model + license values per enums Section 3.
- Visibility values: `draft`, `public`, `unlisted`, `archived`.
- Field names: snake lowercase.
- Version: semver string `<major>.<minor>.<patch>`.
- Metadata jsonb keys: snake lowercase.
- Event names: `marketplace.listing.<action>`.

## 8. Error Handling

- Subtype not in category: HTTP 422 `subtype_not_in_category`.
- Category metadata fails sub-schema: HTTP 422 with field path + zod error.
- Pricing details missing required field for model: HTTP 422.
- Slug collision: HTTP 409 `slug_taken`.
- Premium gate: HTTP 403 `premium_gated`.
- Creator identity not found / revoked: HTTP 400 `invalid_creator_identity`.
- Asset ref virus_scan_status != clean: HTTP 422 `asset_not_scanned_clean`.
- Publish draft without required long_description: HTTP 422 `description_required_for_public`.
- Version non-increment on update: allowed for draft (auto-bump); on public, MUST increment via `/versions` endpoint; direct patch of public without version bump returns HTTP 400 `version_required`.
- RLS read on private cross-tenant: HTTP 404 (hide existence).

## 9. Testing Surface

- Create draft: POST with minimal fields succeeds, slug auto-generated.
- Category + subtype validation: `category=core_agent, subtype=sprite_pack` → 422.
- Category metadata sub-schema: `category=assets, subtype=sprite_pack, category_metadata={foo: 1}` fails; `{media_type: "image", file_format: "png"}` passes.
- Pricing `usage_based` requires `meter`: missing returns 422.
- Publish validation: draft without long_description → 422; with complete → publishes.
- Asset ref not clean: virus scan pending → 422.
- Premium gate: flag false, `category=premium` → 403; flag true → accepted.
- Version bump on update: public listing patch auto-creates version 1.0.1 + snapshots 1.0.0 into version_history.
- Slug collision: second create with same slug → 409.
- Creator identity revoked mid-publish: subsequent publish fails with `invalid_creator_identity`.
- Search tsvector generation: title + short_description → correct tsvector (via Postgres generated column per `marketplace_search.contract.md`).
- RLS public cross-tenant read: tenant A creates public, tenant B reads: visible.
- RLS private cross-tenant read: tenant A creates draft, tenant B reads: 404.
- Archive: public → archived, search index removes.

## 10. Open Questions

- Version history retention: unlimited jsonb array size is risky. Recommend cap at last 20 versions + archive older to R2 as JSON blob.
- Cross-rail pricing (USD + IDR single listing): `pricing_details.currency_variants` array. Defer post-hackathon if not in M1 critical path.
- License enforcement on buyer side (prevent CC_BY_NC_4 buyer from commercial use): advisory at submission; legal tooling post-hackathon.

## 11. Post-Hackathon Refactor Notes

- Listing collections / bundles (buy multiple listings as a set with bundle pricing).
- Listing dependency graph (listing A requires listing B; bundle recommendation).
- A/B testing of listing copy (Phanes → Hyperion → conversion tracking).
- Time-limited promotions via `valid_from` + `valid_until` override fields.
- Regional pricing overrides (IDR-native pricing in addition to USD).
- Automated category suggestion via embedding cluster at publish (Hyperion).
- Listing quality score (beyond trust score): completeness of description + asset thumbnail + example inputs + reviews.
- Content policy moderation (LLM-based) pre-publish.
- Listing transfer workflow (creator sells rights to another identity).
- Historical pricing chart (for usage-based listings).
- Referral / affiliate tracking per listing.
- Multi-language listing copy (title + descriptions translated).
