"""Pydantic v2 projections for ``app_user``.

Session 1 baseline shipped the ``app_user`` table; Session 3 migration
``030_app_user_extensions`` added ``tier`` / ``status`` / ``avatar_url``
/ ``email_verified`` columns. This module gives downstream pillars the
typed row view they need without re-authoring Pydantic fields per
caller.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import EmailStr, Field

from src.backend.models.base import NeriumModel, TenantBaseModel

UserTier = Literal["free", "solo", "team", "enterprise"]
UserStatus = Literal["active", "suspended", "deleted"]


class User(TenantBaseModel):
    """Full row projection of a single ``app_user`` record."""

    email: EmailStr = Field(..., description="Case-insensitive email (citext).")
    display_name: str = Field(..., max_length=100)
    password_hash: Optional[str] = Field(
        default=None,
        description="NULL for OAuth-only accounts.",
    )
    is_superuser: bool = Field(default=False)
    email_verified: bool = Field(default=False)
    email_verified_at: Optional[datetime] = Field(default=None)
    tier: UserTier = Field(default="free")
    status: UserStatus = Field(default="active")
    avatar_url: Optional[str] = Field(default=None, max_length=2048)
    deleted_at: Optional[datetime] = Field(default=None)
    purge_at: Optional[datetime] = Field(default=None)


class UserPublic(NeriumModel):
    """Public projection surfaced in marketplace cards + identity card."""

    id: UUID
    display_name: str
    avatar_url: Optional[str] = None
    tier: UserTier
    created_at: datetime


class UserCreate(NeriumModel):
    """Request shape for the internal sign-up endpoint.

    The password is accepted here but a :class:`User` projection in a
    response must not echo it back; this is enforced by the distinct
    model and field sets.
    """

    email: EmailStr
    display_name: str = Field(..., min_length=1, max_length=100)
    password: Optional[str] = Field(
        default=None,
        min_length=8,
        max_length=200,
        description="Optional: OAuth-first accounts skip this.",
    )
    tier: UserTier = Field(default="free")


class UserUpdate(NeriumModel):
    """Request shape for partial user update via admin or self-service.

    All fields optional; server merges into the existing row.
    """

    display_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    avatar_url: Optional[str] = Field(default=None, max_length=2048)
    tier: Optional[UserTier] = None
    status: Optional[UserStatus] = None


__all__ = [
    "User",
    "UserCreate",
    "UserPublic",
    "UserStatus",
    "UserTier",
    "UserUpdate",
]
