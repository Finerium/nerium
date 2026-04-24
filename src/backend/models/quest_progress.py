"""Pydantic v2 projections for ``quest_progress``.

Mirrors migration ``032_quest_progress``. The Zustand quest store is
the hot runtime; this projection is the durable persistence shape that
the API serializes on GET + PATCH.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import Field

from src.backend.models.base import NeriumModel, TenantBaseModel

QuestStatus = Literal["not_started", "in_progress", "completed", "failed"]


class QuestProgress(TenantBaseModel):
    """Row projection of ``quest_progress``."""

    user_id: UUID
    quest_id: str = Field(..., description="Quest slug per src/data/quests/.")
    status: QuestStatus = Field(default="in_progress")
    current_step: int = Field(default=0, ge=0)
    state: dict[str, Any] = Field(default_factory=dict)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class QuestProgressUpdate(NeriumModel):
    """Partial update payload for quest progress.

    All fields optional; server merges into existing row. ``state``
    replaces the prior dict in full, the runtime is expected to load +
    mutate + POST back.
    """

    status: Optional[QuestStatus] = None
    current_step: Optional[int] = Field(default=None, ge=0)
    state: Optional[dict[str, Any]] = None
    completed_at: Optional[datetime] = None


__all__ = [
    "QuestProgress",
    "QuestProgressUpdate",
    "QuestStatus",
]
