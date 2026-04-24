"""Pydantic v2 projections for ``marketplace_listing`` (scaffold).

Scaffold model matching migration ``034_marketplace_listing``. Phanes
extends this module in Wave 2 with the full category / subtype + pricing
detail models per ``docs/contracts/marketplace_listing.contract.md``
Section 3.2 - 3.5.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import Field

from src.backend.models.base import NeriumModel, TenantBaseModel

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


class MarketplaceListing(TenantBaseModel):
    """Row projection of ``marketplace_listing`` scaffold."""

    creator_user_id: UUID
    category: ListingCategory
    subtype: str = Field(..., max_length=40)
    title: str = Field(..., max_length=200)
    description: Optional[str] = None
    pricing: dict[str, Any] = Field(default_factory=dict)
    license: str = Field(default="PROPRIETARY", max_length=40)
    status: ListingStatus = Field(default="draft")
    version: str = Field(default="0.1.0", max_length=40)
    metadata: dict[str, Any] = Field(default_factory=dict)
    published_at: Optional[datetime] = None


class MarketplaceListingCreate(NeriumModel):
    """Request body for listing creation (scaffold; Phanes extends)."""

    category: ListingCategory
    subtype: str = Field(..., min_length=1, max_length=40)
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=20000)
    pricing: dict[str, Any] = Field(default_factory=dict)
    license: str = Field(default="PROPRIETARY", max_length=40)
    version: str = Field(default="0.1.0", max_length=40)
    metadata: dict[str, Any] = Field(default_factory=dict)


__all__ = [
    "ListingCategory",
    "ListingStatus",
    "MarketplaceListing",
    "MarketplaceListingCreate",
]
