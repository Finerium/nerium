"""Pydantic v2 projections + enums for ``marketplace_listing``.

Owner: Phanes (W2 NP P1 Session 1). Contract refs:
    - ``docs/contracts/marketplace_listing.contract.md`` Sections 3.1
      to 3.5 (Category, Subtype, PricingModel, License, table shape,
      per-category sub-schema).
    - ``docs/contracts/postgres_multi_tenant.contract.md`` Section 3.2
      (tenant column convention).

Scope
-----
Extends the scaffold landed by Aether (034_marketplace_listing /
``ListingCategory`` + ``ListingStatus`` Literal aliases) to the full
v0.2.0 shape. We keep the old Literal aliases exported so existing
importers (``src.backend.models.MarketplaceListing``) continue to work,
and expose new ``Category`` / ``Subtype`` / ``PricingModel`` /
``License`` / ``ListingVisibility`` enums plus the
``ALLOWED_SUBTYPES`` map per Section 3.1.

Design notes
------------
- Enums subclass ``str`` so JSON serialisation surfaces the string
  value without a ``.value`` shim.
- ``MarketplaceListing`` subclasses ``TenantBaseModel`` per project
  convention (id + tenant_id + created_at + updated_at inherited).
- ``ListingCreate`` / ``ListingUpdate`` / ``ListingPublic`` /
  ``ListingDetail`` are the wire shapes the router consumes. Draft
  creates default ``status='draft'`` + ``visibility='draft'`` so the
  happy path surfaces a non-public row that the creator can iterate
  before publishing.
- Category-specific metadata validation lives in
  ``src.backend.marketplace.validator`` so this module stays focused on
  projections and does not carry async validators that need Chione file
  manifest look-ups.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from src.backend.models.base import NeriumModel, TenantBaseModel


# ---------------------------------------------------------------------------
# Enums - Category / Subtype / PricingModel / License / ListingVisibility
# ---------------------------------------------------------------------------


class Category(str, Enum):
    """Top-level listing category per contract Section 3.1."""

    CORE_AGENT = "core_agent"
    CONTENT = "content"
    INFRASTRUCTURE = "infrastructure"
    ASSETS = "assets"
    SERVICES = "services"
    PREMIUM = "premium"
    DATA = "data"


class Subtype(str, Enum):
    """23-value subtype taxonomy per contract Section 3.1."""

    # CORE_AGENT
    AGENT = "agent"
    AGENT_BUNDLE = "agent_bundle"
    AGENT_TEAM = "agent_team"
    # CONTENT
    PROMPT = "prompt"
    SKILL = "skill"
    QUEST_TEMPLATE = "quest_template"
    DIALOGUE_TREE = "dialogue_tree"
    CONTEXT_PACK = "context_pack"
    # INFRASTRUCTURE
    MCP_CONFIG = "mcp_config"
    CONNECTOR = "connector"
    WORKFLOW = "workflow"
    EVAL_SUITE = "eval_suite"
    # ASSETS
    VOICE_PROFILE = "voice_profile"
    VISUAL_THEME = "visual_theme"
    SPRITE_PACK = "sprite_pack"
    SOUND_PACK = "sound_pack"
    # SERVICES
    CUSTOM_BUILD_SERVICE = "custom_build_service"
    CONSULTING_HOUR = "consulting_hour"
    # PREMIUM
    VERIFIED_CERTIFICATION = "verified_certification"
    PRIORITY_LISTING = "priority_listing"
    CUSTOM_DOMAIN_AGENT = "custom_domain_agent"
    # DATA
    DATASET = "dataset"
    ANALYTICS_DASHBOARD = "analytics_dashboard"


class PricingModel(str, Enum):
    """Six-model pricing taxonomy per contract Section 3.2."""

    FREE = "free"
    ONE_TIME = "one_time"
    SUBSCRIPTION_MONTHLY = "subscription_monthly"
    SUBSCRIPTION_YEARLY = "subscription_yearly"
    USAGE_BASED = "usage_based"
    TIERED = "tiered"


class License(str, Enum):
    """Eight-license enum per contract Section 3.2."""

    MIT = "MIT"
    CC0 = "CC0"
    CC_BY_4 = "CC_BY_4"
    CC_BY_SA_4 = "CC_BY_SA_4"
    CC_BY_NC_4 = "CC_BY_NC_4"
    APACHE_2 = "APACHE_2"
    CUSTOM_COMMERCIAL = "CUSTOM_COMMERCIAL"
    PROPRIETARY = "PROPRIETARY"


# Allowed-subtype membership map. Used by the validator at publish time
# to reject (category, subtype) pairs that do not match the contract
# Section 3.1 grouping. We keep ``dict[Category, frozenset[Subtype]]``
# so the value side is immutable and membership tests are O(1).
ALLOWED_SUBTYPES: dict[Category, frozenset[Subtype]] = {
    Category.CORE_AGENT: frozenset(
        {Subtype.AGENT, Subtype.AGENT_BUNDLE, Subtype.AGENT_TEAM}
    ),
    Category.CONTENT: frozenset(
        {
            Subtype.PROMPT,
            Subtype.SKILL,
            Subtype.QUEST_TEMPLATE,
            Subtype.DIALOGUE_TREE,
            Subtype.CONTEXT_PACK,
        }
    ),
    Category.INFRASTRUCTURE: frozenset(
        {
            Subtype.MCP_CONFIG,
            Subtype.CONNECTOR,
            Subtype.WORKFLOW,
            Subtype.EVAL_SUITE,
        }
    ),
    Category.ASSETS: frozenset(
        {
            Subtype.VOICE_PROFILE,
            Subtype.VISUAL_THEME,
            Subtype.SPRITE_PACK,
            Subtype.SOUND_PACK,
        }
    ),
    Category.SERVICES: frozenset(
        {Subtype.CUSTOM_BUILD_SERVICE, Subtype.CONSULTING_HOUR}
    ),
    Category.PREMIUM: frozenset(
        {
            Subtype.VERIFIED_CERTIFICATION,
            Subtype.PRIORITY_LISTING,
            Subtype.CUSTOM_DOMAIN_AGENT,
        }
    ),
    Category.DATA: frozenset({Subtype.DATASET, Subtype.ANALYTICS_DASHBOARD}),
}


# ---------------------------------------------------------------------------
# Literal aliases (legacy, kept for backward compatibility with Aether
# scaffold importers inside src.backend.models.__init__).
# ---------------------------------------------------------------------------
ListingCategory = Literal[
    "core_agent",
    "content",
    "infrastructure",
    "assets",
    "services",
    "premium",
    "data",
]
ListingStatus = Literal["draft", "published", "suspended", "archived"]


# ---------------------------------------------------------------------------
# Row projection + CRUD DTOs
# ---------------------------------------------------------------------------


class MarketplaceListing(TenantBaseModel):
    """Row projection of ``marketplace_listing``.

    Mirrors the table after 046_marketplace_listing_schema lands. Fields
    that live in the v0.2.0 add-column set are annotated with defaults
    so a row fetched immediately after the 034 scaffold (but before 046)
    still validates; the service layer never returns pre-046 rows once
    the migration has applied.
    """

    creator_user_id: UUID
    category: Category
    subtype: Subtype
    slug: Optional[str] = Field(default=None, max_length=60)
    title: str = Field(..., max_length=200)
    description: Optional[str] = None
    short_description: Optional[str] = Field(default=None, max_length=280)
    long_description: Optional[str] = None
    capability_tags: list[str] = Field(default_factory=list)
    license: License = License.PROPRIETARY
    pricing_model: PricingModel = PricingModel.FREE
    pricing_details: dict[str, Any] = Field(default_factory=dict)
    category_metadata: dict[str, Any] = Field(default_factory=dict)
    asset_refs: list[UUID] = Field(default_factory=list)
    thumbnail_r2_key: Optional[str] = None
    trust_score_cached: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    revenue_split_override: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    status: ListingStatus = "draft"
    version: str = Field(default="0.1.0", max_length=40)
    version_history: list[dict[str, Any]] = Field(default_factory=list)
    # Legacy generic pricing jsonb shipped by the 034 scaffold. Preserved so
    # any pre-0.2.0 row still round-trips. Phanes' service migrates reads
    # to pricing_details; writes default to empty.
    pricing: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    published_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None


class ListingCreate(NeriumModel):
    """Body for ``POST /v1/marketplace/listings``.

    Slug is optional; the service derives it from ``title`` when omitted.
    ``status`` is always ``draft`` on create; the publish endpoint flips
    it to ``published``. We reject ``status`` in the body to keep the
    wire contract predictable.
    """

    model_config = ConfigDict(extra="forbid")

    category: Category
    subtype: Subtype
    title: str = Field(..., min_length=1, max_length=200)
    short_description: Optional[str] = Field(
        default=None, max_length=280, description="Card-sized summary."
    )
    long_description: Optional[str] = Field(
        default=None, description="Markdown detail-page body."
    )
    slug: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=60,
        description="kebab-case slug. Auto-generated from title when omitted.",
    )
    capability_tags: list[str] = Field(default_factory=list, max_length=32)
    license: License = License.PROPRIETARY
    pricing_model: PricingModel = PricingModel.FREE
    pricing_details: dict[str, Any] = Field(default_factory=dict)
    category_metadata: dict[str, Any] = Field(default_factory=dict)
    asset_refs: list[UUID] = Field(default_factory=list, max_length=16)
    thumbnail_r2_key: Optional[str] = Field(default=None, max_length=512)
    version: str = Field(default="0.1.0", max_length=40)

    @model_validator(mode="after")
    def _subtype_matches_category(self) -> "ListingCreate":
        """Reject (category, subtype) pairs not in ALLOWED_SUBTYPES."""

        allowed = ALLOWED_SUBTYPES.get(self.category, frozenset())
        if self.subtype not in allowed:
            raise ValueError(
                f"subtype '{self.subtype.value}' is not permitted for "
                f"category '{self.category.value}'. See "
                "docs/contracts/marketplace_listing.contract.md Section 3.1."
            )
        return self


class ListingUpdate(NeriumModel):
    """Partial update body for ``PATCH /v1/marketplace/listings/{id}``.

    Every field is optional. Category + subtype are NOT editable via
    PATCH (changing them would invalidate ``category_metadata`` and the
    slug reservation); the creator must re-submit a fresh draft if the
    taxonomy classification needs to change.
    """

    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    short_description: Optional[str] = Field(default=None, max_length=280)
    long_description: Optional[str] = None
    capability_tags: Optional[list[str]] = Field(default=None, max_length=32)
    license: Optional[License] = None
    pricing_model: Optional[PricingModel] = None
    pricing_details: Optional[dict[str, Any]] = None
    category_metadata: Optional[dict[str, Any]] = None
    asset_refs: Optional[list[UUID]] = Field(default=None, max_length=16)
    thumbnail_r2_key: Optional[str] = Field(default=None, max_length=512)
    version: Optional[str] = Field(default=None, max_length=40)


class ListingPublic(NeriumModel):
    """Wire shape for list endpoints + card views.

    Excludes internal columns (``tenant_id`` metadata, version_history
    snapshots, raw ``pricing`` legacy blob) so public surface stays
    lean. Sorted by ``created_at DESC`` + keyset id tiebreaker at the
    query layer.
    """

    id: UUID
    creator_user_id: UUID
    category: Category
    subtype: Subtype
    slug: Optional[str] = None
    title: str
    short_description: Optional[str] = None
    capability_tags: list[str] = Field(default_factory=list)
    license: License
    pricing_model: PricingModel
    pricing_details: dict[str, Any] = Field(default_factory=dict)
    thumbnail_r2_key: Optional[str] = None
    trust_score_cached: Optional[float] = None
    status: ListingStatus
    version: str
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime] = None


class ListingDetail(ListingPublic):
    """Detail projection for single-row fetch.

    Extends ``ListingPublic`` with the heavy fields (long_description,
    category_metadata, asset_refs, version_history) + tenant id.
    """

    tenant_id: UUID
    long_description: Optional[str] = None
    category_metadata: dict[str, Any] = Field(default_factory=dict)
    asset_refs: list[UUID] = Field(default_factory=list)
    revenue_split_override: Optional[float] = None
    version_history: list[dict[str, Any]] = Field(default_factory=list)
    archived_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Legacy compatibility alias. Kept so the existing
# src.backend.models.__init__ import
#     from src.backend.models.marketplace_listing import
#         ListingCategory, ListingStatus, MarketplaceListing,
#         MarketplaceListingCreate
# still resolves. ``MarketplaceListingCreate`` is re-aliased onto
# ``ListingCreate`` so downstream importers see the enriched v0.2.0
# body without a rename churn.
# ---------------------------------------------------------------------------
MarketplaceListingCreate = ListingCreate


__all__ = [
    "ALLOWED_SUBTYPES",
    "Category",
    "License",
    "ListingCategory",
    "ListingCreate",
    "ListingDetail",
    "ListingPublic",
    "ListingStatus",
    "ListingUpdate",
    "MarketplaceListing",
    "MarketplaceListingCreate",
    "PricingModel",
    "Subtype",
]
