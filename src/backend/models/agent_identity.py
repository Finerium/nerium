"""Pydantic v2 projections for ``agent_identity`` (scaffold).

Scaffold matching migration ``037_agent_identity``. Tethys extends with
the full key-rotation columns + artifact manifest + audit table in Wave 2.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import Field, field_validator

from src.backend.models.base import NeriumModel, TenantBaseModel

IdentityStatus = Literal["active", "retiring", "revoked"]


class AgentIdentity(TenantBaseModel):
    """Row projection of ``agent_identity``. ``public_key`` is raw bytes."""

    agent_slug: str = Field(..., max_length=80)
    public_key: bytes = Field(..., description="Ed25519 pubkey, exactly 32 bytes.")
    status: IdentityStatus = Field(default="active")
    retires_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("public_key")
    @classmethod
    def _public_key_len(cls, value: bytes) -> bytes:
        if len(value) != 32:
            raise ValueError(
                "public_key must be exactly 32 bytes (Ed25519)"
            )
        return value


class AgentIdentityCreate(NeriumModel):
    """Request body for identity registration (scaffold)."""

    agent_slug: str = Field(
        ...,
        pattern=r"^[a-z0-9_-]+$",
        min_length=3,
        max_length=80,
    )
    public_key: bytes = Field(..., description="Raw 32-byte Ed25519 pubkey.")
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("public_key")
    @classmethod
    def _public_key_len(cls, value: bytes) -> bytes:
        if len(value) != 32:
            raise ValueError(
                "public_key must be exactly 32 bytes (Ed25519)"
            )
        return value


__all__ = [
    "AgentIdentity",
    "AgentIdentityCreate",
    "IdentityStatus",
]
