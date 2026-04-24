"""Pydantic v2 projection for ``trust_score`` (read-only).

Astraea owns the write path (recompute job); consumers only READ via
this projection. Matching migration ``036_trust_score``.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import Field

from src.backend.models.base import TenantBaseModel

SubjectType = Literal["user", "agent", "listing"]
TrustCategory = Literal[
    "reliability",
    "accuracy",
    "uptime",
    "quality",
    "overall",
]


class TrustScore(TenantBaseModel):
    """Row projection of ``trust_score``."""

    subject_type: SubjectType
    subject_id: UUID
    category: TrustCategory
    score: Decimal = Field(..., ge=Decimal("0"), le=Decimal("1"))
    signal_count: int = Field(default=0, ge=0)
    precomputed_at: Optional[datetime] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


__all__ = [
    "SubjectType",
    "TrustCategory",
    "TrustScore",
]
