"""Pydantic v2 projections for the MA runtime domain.

Row projections live here (``ma_session``, ``ma_event``, ``ma_step``)
so downstream consumers (Khronos MCP, Boreas chat, Eunomia admin) can
reuse them without re-authoring per-module schemas.

Request / response DTOs for the HTTP surface live in
``src.backend.ma.schemas`` to keep the row projection module import
tree narrow (it is read by Arq workers too).
"""

from src.backend.models.ma.session import (
    MAEvent,
    MASession,
    MAStep,
)

__all__ = ["MAEvent", "MASession", "MAStep"]
