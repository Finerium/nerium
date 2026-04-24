"""MCP tool: get_agent_identity.

Contract: ``docs/contracts/mcp_tool_registry.contract.md`` Section 4.4.
Reads ``agent_identity`` by ``identity_id`` or ``handle``. Returns 404-style
error envelope (JSON-RPC ``-32601`` / HTTP 404) when the target row or the
entire table is missing.
"""


from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.backend.errors import NotFoundProblem
from src.backend.mcp.auth import current_mcp_principal
from src.backend.mcp.deps import db_fetchrow
from src.backend.mcp.server import mcp_server
from src.backend.mcp.tools._base import tool_wrap


class GetAgentIdentityInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identity_id: str | None = Field(default=None, max_length=64)
    handle: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def _one_of_required(self) -> "GetAgentIdentityInput":
        if not (self.identity_id or self.handle):
            raise ValueError("either identity_id or handle is required")
        return self


class AgentIdentityOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identity_id: str
    handle: str
    display_name: str
    kind: Literal["creator", "agent", "platform", "system"]
    vendor_origin: str
    public_key: str
    public_key_fingerprint: str
    key_status: Literal["active", "retiring", "revoked"]
    retires_at: str | None
    version: str
    capability_tags: list[str]
    trust_score_pointer: str
    created_at: str


_QUERY_BY_ID = """
SELECT identity_id::text,
       handle,
       display_name,
       kind,
       vendor_origin,
       public_key,
       public_key_fingerprint,
       key_status,
       retires_at::text,
       version,
       COALESCE(capability_tags, ARRAY[]::text[]) AS capability_tags,
       COALESCE(trust_score_pointer, '') AS trust_score_pointer,
       created_at::text
  FROM agent_identity
 WHERE identity_id = $1::uuid
"""

_QUERY_BY_HANDLE = """
SELECT identity_id::text,
       handle,
       display_name,
       kind,
       vendor_origin,
       public_key,
       public_key_fingerprint,
       key_status,
       retires_at::text,
       version,
       COALESCE(capability_tags, ARRAY[]::text[]) AS capability_tags,
       COALESCE(trust_score_pointer, '') AS trust_score_pointer,
       created_at::text
  FROM agent_identity
 WHERE handle = $1
"""


@mcp_server().tool(
    name="get_agent_identity",
    title="Get Agent Identity",
    description=(
        "Fetch the Ed25519 identity card for an agent by identity_id or handle. "
        "Includes public key + rotation status."
    ),
)
@tool_wrap("get_agent_identity")
async def get_agent_identity_tool(input: GetAgentIdentityInput) -> AgentIdentityOutput:
    principal = current_mcp_principal()

    if input.identity_id:
        row = await db_fetchrow(
            _QUERY_BY_ID,
            input.identity_id,
            tenant_id=principal.tenant_id,
        )
    else:
        row = await db_fetchrow(
            _QUERY_BY_HANDLE,
            input.handle,
            tenant_id=principal.tenant_id,
        )

    if row is None:
        selector = input.identity_id or input.handle
        raise NotFoundProblem(
            detail=f"agent identity not found for selector: {selector}",
        )

    return AgentIdentityOutput(
        identity_id=row["identity_id"],
        handle=row["handle"],
        display_name=row["display_name"],
        kind=row["kind"],
        vendor_origin=row["vendor_origin"],
        public_key=row["public_key"],
        public_key_fingerprint=row["public_key_fingerprint"],
        key_status=row["key_status"],
        retires_at=row["retires_at"],
        version=row["version"],
        capability_tags=list(row["capability_tags"]),
        trust_score_pointer=row["trust_score_pointer"],
        created_at=row["created_at"],
    )


__all__ = ["AgentIdentityOutput", "GetAgentIdentityInput", "get_agent_identity_tool"]
