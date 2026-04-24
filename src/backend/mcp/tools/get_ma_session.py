"""MCP tool: get_ma_session.

Contract: ``docs/contracts/mcp_tool_registry.contract.md`` Section 4.7 +
``docs/contracts/ma_session_lifecycle.contract.md``.

Returns a projection of ``ma_session`` scoped by RLS to the tenant. When
the table is not yet migrated (Kratos pending) the tool returns 404 via
``NotFoundProblem`` with a descriptive detail.
"""


from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from src.backend.errors import NotFoundProblem
from src.backend.mcp.auth import current_mcp_principal
from src.backend.mcp.deps import db_fetchrow
from src.backend.mcp.server import mcp_server
from src.backend.mcp.tools._base import tool_wrap


class GetMaSessionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str = Field(..., min_length=32, max_length=64)


class MaSessionDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    status: Literal[
        "queued",
        "running",
        "streaming",
        "completed",
        "cancelled",
        "failed",
        "budget_capped",
    ]
    model: str
    prompt_preview: str
    started_at: str | None = None
    ended_at: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    cost_usd: float = 0.0
    stop_reason: str | None = None
    error: dict | None = None


_QUERY = """
SELECT id::text AS session_id,
       status,
       model,
       COALESCE(substring(system_prompt FROM 1 FOR 200), '') AS prompt_preview,
       started_at::text,
       ended_at::text,
       COALESCE(input_tokens, 0) AS input_tokens,
       COALESCE(output_tokens, 0) AS output_tokens,
       COALESCE(cache_read_tok, 0) AS cache_read_tokens,
       COALESCE(cache_write_tok, 0) AS cache_write_tokens,
       COALESCE(cost_usd, 0.0) AS cost_usd,
       stop_reason,
       error
  FROM ma_session
 WHERE id = $1::uuid
"""


@mcp_server().tool(
    name="get_ma_session",
    title="Get Managed Agent Session",
    description=(
        "Fetch Managed Agent session state including token usage, cost, stop reason."
    ),
)
@tool_wrap("get_ma_session")
async def get_ma_session_tool(input: GetMaSessionInput) -> MaSessionDetail:
    principal = current_mcp_principal()

    row = await db_fetchrow(
        _QUERY,
        input.session_id,
        tenant_id=principal.tenant_id,
    )

    if row is None:
        raise NotFoundProblem(
            detail=f"ma_session not found for session_id={input.session_id}",
        )

    error_raw = row["error"]
    error_dict = None
    if error_raw is not None:
        if isinstance(error_raw, str):
            import json

            try:
                error_dict = json.loads(error_raw)
            except ValueError:
                error_dict = {"raw": error_raw}
        elif isinstance(error_raw, dict):
            error_dict = dict(error_raw)

    return MaSessionDetail(
        session_id=row["session_id"],
        status=row["status"],
        model=row["model"],
        prompt_preview=row["prompt_preview"],
        started_at=row["started_at"],
        ended_at=row["ended_at"],
        input_tokens=int(row["input_tokens"]),
        output_tokens=int(row["output_tokens"]),
        cache_read_tokens=int(row["cache_read_tokens"]),
        cache_write_tokens=int(row["cache_write_tokens"]),
        cost_usd=float(row["cost_usd"]),
        stop_reason=row["stop_reason"],
        error=error_dict,
    )


__all__ = ["GetMaSessionInput", "MaSessionDetail", "get_ma_session_tool"]
