"""RegisteredClient model.

Contract: ``docs/contracts/oauth_dcr.contract.md`` Section 3.1.

RFC 7591 Dynamic Client Registration record. Public clients (Claude.ai)
register with ``token_endpoint_auth_method = "none"`` and never receive a
client_secret. Confidential clients (Tauri Mode B hybrid, reserved) register
with ``client_secret_post`` and receive a generated secret at registration
time. ``client_secret_expires_at = 0`` encodes never-expires per RFC 7591.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class RegisteredClient(BaseModel):
    """Record of a client that has completed Dynamic Client Registration."""

    model_config = ConfigDict(extra="forbid", frozen=False)

    client_id: str = Field(..., description="UUID v7 string assigned at registration")
    client_secret: str | None = Field(default=None)
    client_secret_expires_at: int = Field(default=0)
    client_id_issued_at: int = Field(..., description="Unix seconds when registration completed")

    redirect_uris: list[HttpUrl] = Field(..., min_length=1)
    token_endpoint_auth_method: Literal["none", "client_secret_post"] = "none"
    grant_types: list[Literal["authorization_code", "refresh_token"]] = Field(
        default_factory=lambda: ["authorization_code", "refresh_token"]
    )
    response_types: list[Literal["code"]] = Field(default_factory=lambda: ["code"])

    scope: str = Field(default="mcp:read")
    client_name: str = Field(..., min_length=1, max_length=200)
    client_uri: HttpUrl | None = None
    logo_uri: HttpUrl | None = None
    tos_uri: HttpUrl | None = None
    policy_uri: HttpUrl | None = None

    software_id: str | None = Field(default=None, max_length=200)
    software_version: str | None = Field(default=None, max_length=50)

    metadata: dict = Field(default_factory=dict)

    created_at: datetime = Field(..., description="Server-assigned UTC timestamp")
    last_used_at: datetime | None = Field(default=None)

    def is_public(self) -> bool:
        return self.token_endpoint_auth_method == "none"

    def scopes(self) -> list[str]:
        return [s for s in self.scope.split() if s]
