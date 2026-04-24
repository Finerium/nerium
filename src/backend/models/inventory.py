"""Pydantic v2 projections for ``inventory``.

Mirrors migration ``033_inventory``. See module docstring on the
migration for a full rationale of the polymorphic ``item_ref``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import Field

from src.backend.models.base import NeriumModel, TenantBaseModel

ItemType = Literal[
    "agent_instance",
    "asset",
    "token",
    "badge",
    "bundle",
    "subscription",
]


class Inventory(TenantBaseModel):
    """Row projection of ``inventory``."""

    user_id: UUID
    item_type: ItemType
    item_ref: str = Field(..., description="Polymorphic reference by item_type.")
    quantity: int = Field(default=1, ge=0)
    metadata: dict[str, Any] = Field(default_factory=dict)
    acquired_at: datetime
    expires_at: Optional[datetime] = None


class InventoryCreate(NeriumModel):
    """Request shape for awarding a new inventory row."""

    user_id: UUID
    item_type: ItemType
    item_ref: str = Field(..., min_length=1, max_length=200)
    quantity: int = Field(default=1, ge=0)
    metadata: dict[str, Any] = Field(default_factory=dict)
    expires_at: Optional[datetime] = None


__all__ = [
    "Inventory",
    "InventoryCreate",
    "ItemType",
]
