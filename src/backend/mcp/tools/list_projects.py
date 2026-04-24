"""MCP tool: list_projects.

Contract: ``docs/contracts/mcp_tool_registry.contract.md`` Section 4.1.
Reads from the future ``projects`` table (pending Kratos + product surface
migrations). Until the table ships, :func:`db_fetch` returns an empty list
and the tool responds with ``items: []``, keeping the Claude.ai connector
surface stable.
"""


from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from src.backend.mcp.auth import current_mcp_principal
from src.backend.mcp.deps import db_fetch
from src.backend.mcp.server import mcp_server
from src.backend.mcp.tools._base import tool_wrap


class ListProjectsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=20, ge=1, le=100)
    cursor: str | None = Field(default=None, max_length=512)
    status: Literal["active", "archived", "all"] = "active"


class ProjectSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    created_at: str
    updated_at: str
    ma_session_count: int
    status: Literal["active", "archived"]


class ListProjectsOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[ProjectSummary]
    next_cursor: str | None = None


_QUERY = """
SELECT id::text,
       name,
       created_at::text,
       updated_at::text,
       COALESCE(ma_session_count, 0) AS ma_session_count,
       status
  FROM projects
 WHERE ($1::text = 'all' OR status = $1::text)
 ORDER BY created_at DESC
 LIMIT $2
"""


@mcp_server().tool(
    name="list_projects",
    title="List Projects",
    description=(
        "List NERIUM projects visible to the authenticated tenant. Returns "
        "id, name, timestamps, ma_session_count, status."
    ),
)
@tool_wrap("list_projects")
async def list_projects_tool(input: ListProjectsInput) -> ListProjectsOutput:
    principal = current_mcp_principal()
    rows = await db_fetch(
        _QUERY,
        input.status,
        input.limit,
        tenant_id=principal.tenant_id,
    )

    items: list[ProjectSummary] = []
    for row in rows:
        items.append(
            ProjectSummary(
                id=row["id"],
                name=row["name"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                ma_session_count=int(row["ma_session_count"]),
                status=row["status"],
            )
        )

    return ListProjectsOutput(items=items, next_cursor=None)


__all__ = ["ListProjectsInput", "ListProjectsOutput", "list_projects_tool"]
