"""AuthorizationCode model.

Contract: ``docs/contracts/oauth_dcr.contract.md`` Section 3.2.

The authorization code is single-use with 60 second TTL. Binds user,
client, PKCE challenge, and RFC 8707 resource indicator so ``/oauth/token``
can verify all three. Redis key ``oauth:code:<code>`` per redis_session
contract. ``used`` flips on exchange; replays return ``invalid_grant``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class AuthorizationCode(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=False)

    code: str = Field(..., min_length=32, max_length=128)
    client_id: str
    user_id: UUID
    redirect_uri: HttpUrl
    scope: str

    code_challenge: str = Field(..., min_length=43, max_length=128)
    code_challenge_method: Literal["S256"] = Field(default="S256")

    resource: list[HttpUrl] = Field(default_factory=list)

    expires_at: datetime
    used: bool = False
    created_at: datetime

    def is_expired(self, now: datetime) -> bool:
        return now >= self.expires_at
