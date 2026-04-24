"""MCP tool: list_agents.

Contract: ``docs/contracts/mcp_tool_registry.contract.md`` Section 4.2.
Reads from the ``agent_identity`` table shipped by Tethys. Until the
migration lands the tool returns ``items: []`` via the db_fetch UndefinedTable
fallback.
"""


from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from src.backend.mcp.auth import current_mcp_principal
from src.backend.mcp.deps import db_fetch
from src.backend.mcp.server import mcp_server
from src.backend.mcp.tools._base import tool_wrap


class ListAgentsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    owner: Literal["me", "public", "all"] = "me"
    limit: int = Field(default=20, ge=1, le=100)
    cursor: str | None = Field(default=None, max_length=512)


class AgentSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identity_id: str
    handle: str
    display_name: str
    capability_tags: list[str]
    trust_score: float = Field(..., ge=0.0, le=1.0)
    version: str
    created_at: str


class ListAgentsOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[AgentSummary]
    next_cursor: str | None = None


_QUERY_ME = """
SELECT identity_id::text,
       handle,
       display_name,
       COALESCE(capability_tags, ARRAY[]::text[]) AS capability_tags,
       COALESCE(trust_score, 0.0) AS trust_score,
       COALESCE(version, '0.1.0') AS version,
       created_at::text
  FROM agent_identity
 WHERE owner_user_id = $1::uuid
 ORDER BY created_at DESC
 LIMIT $2
"""

_QUERY_PUBLIC = """
SELECT identity_id::text,
       handle,
       display_name,
       COALESCE(capability_tags, ARRAY[]::text[]) AS capability_tags,
       COALESCE(trust_score, 0.0) AS trust_score,
       COALESCE(version, '0.1.0') AS version,
       created_at::text
  FROM agent_identity
 WHERE visibility = 'public'
 ORDER BY trust_score DESC, created_at DESC
 LIMIT $1
"""


@mcp_server().tool(
    name="list_agents",
    title="List Agents",
    description=(
        "List agent identities owned by the tenant or shared publicly. "
        "Includes handle, display_name, capability_tags, trust_score."
    ),
)
@tool_wrap("list_agents")
async def list_agents_tool(input: ListAgentsInput) -> ListAgentsOutput:
    principal = current_mcp_principal()

    if input.owner == "public":
        rows = await db_fetch(
            _QUERY_PUBLIC,
            input.limit,
            tenant_id=principal.tenant_id,
        )
    else:
        rows = await db_fetch(
            _QUERY_ME,
            principal.user_id,
            input.limit,
            tenant_id=principal.tenant_id,
        )

    items: list[AgentSummary] = []
    for row in rows:
        items.append(
            AgentSummary(
                identity_id=row["identity_id"],
                handle=row["handle"],
                display_name=row["display_name"],
                capability_tags=list(row["capability_tags"]),
                trust_score=float(row["trust_score"]),
                version=row["version"],
                created_at=row["created_at"],
            )
        )

    return ListAgentsOutput(items=items, next_cursor=None)


__all__ = ["AgentSummary", "ListAgentsInput", "ListAgentsOutput", "list_agents_tool"]
