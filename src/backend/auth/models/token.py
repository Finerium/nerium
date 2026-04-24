"""Access + refresh token models.

Contract: ``docs/contracts/oauth_dcr.contract.md`` Section 3.3 + 4.4.

Access token is a JWT; this module stores issuance metadata for revocation
+ audit. Refresh tokens are opaque. Their SHA-256 hash is persisted;
plaintext is never stored at rest. Rotation chains link each new refresh
back to its predecessor via ``rotated_from``; reuse of an already-rotated
token revokes the entire ``family_id`` per OAuth 2.1 BCP.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class AccessToken(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=False)

    jti: str
    client_id: str
    user_id: UUID
    scope: str
    resource: HttpUrl
    expires_at: datetime
    revoked: bool = False


class RefreshToken(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=False)

    token_hash: str = Field(..., min_length=64, max_length=128)
    family_id: UUID
    client_id: str
    user_id: UUID
    scope: str
    resource: HttpUrl
    expires_at: datetime
    rotated_from: str | None = None
    revoked_family: bool = False
    created_at: datetime

    def is_expired(self, now: datetime) -> bool:
        return now >= self.expires_at
