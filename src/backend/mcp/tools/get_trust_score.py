"""MCP tool: get_trust_score.

Contract: ``docs/contracts/mcp_tool_registry.contract.md`` Section 4.5.
Reads Astraea's ``agent_trust_score`` row with the precomputed Bayesian
smoothed mean + Wilson lower bound. Returns 404 when the row or table is
missing.
"""


from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from src.backend.errors import NotFoundProblem
from src.backend.mcp.auth import current_mcp_principal
from src.backend.mcp.deps import db_fetchrow
from src.backend.mcp.server import mcp_server
from src.backend.mcp.tools._base import tool_wrap


class GetTrustScoreInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identity_id: str = Field(..., max_length=64)


class TrustScoreOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identity_id: str
    score: float = Field(..., ge=0.0, le=1.0)
    band: Literal["unverified", "emerging", "established", "trusted", "elite"]
    computed_at: str
    stability: Literal["provisional", "stable"]
    category_scores: dict[str, float]
    inputs_summary: dict[str, float]


_QUERY = """
SELECT identity_id::text,
       COALESCE(score, 0.0) AS score,
       band,
       computed_at::text,
       stability,
       COALESCE(category_scores, '{}'::jsonb) AS category_scores,
       COALESCE(inputs_summary, '{}'::jsonb) AS inputs_summary
  FROM agent_trust_score
 WHERE identity_id = $1::uuid
"""


@mcp_server().tool(
    name="get_trust_score",
    title="Get Trust Score",
    description=(
        "Return the current aggregated trust score for an agent with "
        "per-category breakdown and stability band."
    ),
)
@tool_wrap("get_trust_score")
async def get_trust_score_tool(input: GetTrustScoreInput) -> TrustScoreOutput:
    principal = current_mcp_principal()

    row = await db_fetchrow(
        _QUERY,
        input.identity_id,
        tenant_id=principal.tenant_id,
    )

    if row is None:
        raise NotFoundProblem(
            detail=f"trust score not found for identity_id={input.identity_id}",
        )

    category_scores_raw = row["category_scores"]
    if isinstance(category_scores_raw, str):
        import json

        category_scores = json.loads(category_scores_raw)
    else:
        category_scores = dict(category_scores_raw or {})

    inputs_summary_raw = row["inputs_summary"]
    if isinstance(inputs_summary_raw, str):
        import json

        inputs_summary = json.loads(inputs_summary_raw)
    else:
        inputs_summary = dict(inputs_summary_raw or {})

    return TrustScoreOutput(
        identity_id=row["identity_id"],
        score=float(row["score"]),
        band=row["band"],
        computed_at=row["computed_at"],
        stability=row["stability"],
        category_scores={str(k): float(v) for k, v in category_scores.items()},
        inputs_summary={str(k): float(v) for k, v in inputs_summary.items()},
    )


__all__ = ["GetTrustScoreInput", "TrustScoreOutput", "get_trust_score_tool"]
