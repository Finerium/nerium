"""Pydantic v2 projections for ``user_session``.

Mirrors migration ``031_user_session``. The opaque refresh token is NOT
exposed on any projection; only the hash and metadata appear in
responses. Callers that need the plaintext token fetch it from the
Redis KV cache (short-lived) or from the cookie itself.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import Field, IPvAnyAddress

from src.backend.models.base import NeriumModel, TenantBaseModel


class Session(TenantBaseModel):
    """Row projection of ``user_session``."""

    user_id: UUID
    token_hash: str = Field(..., description="SHA-256 hash of refresh token.")
    user_agent: Optional[str] = None
    ip_address: Optional[IPvAnyAddress] = None
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    last_seen_at: datetime
    metadata: dict = Field(default_factory=dict)


class SessionCreate(NeriumModel):
    """Input payload for session row insertion (auth layer internal)."""

    user_id: UUID
    token_hash: str
    user_agent: Optional[str] = None
    ip_address: Optional[IPvAnyAddress] = None
    expires_at: datetime
    metadata: dict = Field(default_factory=dict)


__all__ = [
    "Session",
    "SessionCreate",
]
