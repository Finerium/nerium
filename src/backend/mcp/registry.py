"""MCP tool registry envelope.

Contract: ``docs/contracts/mcp_tool_registry.contract.md`` Section 3.

Session 1 ships metadata for the 7 canonical tools. Handler modules land in
``src/backend/mcp/tools/*.py`` during Session 2.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ToolSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str
    title: str
    description: str = Field(..., max_length=500)
    required_scope: Literal["mcp:read", "mcp:write", "mcp:admin"]
    rate_tier: Literal["cheap", "normal", "expensive"]
    cost_hint_usd: float = Field(default=0.0, ge=0.0)
    annotations: dict[str, Any] = Field(default_factory=dict)

    input_schema: dict[str, Any] = Field(default_factory=dict)
    output_schema: dict[str, Any] = Field(default_factory=dict)


REGISTERED_TOOLS: tuple[ToolSpec, ...] = (
    ToolSpec(
        name="list_projects",
        title="List Projects",
        description=(
            "List NERIUM projects visible to the authenticated tenant. Returns id, "
            "name, timestamps, ma_session_count, status."
        ),
        required_scope="mcp:read",
        rate_tier="cheap",
        cost_hint_usd=0.0,
    ),
    ToolSpec(
        name="list_agents",
        title="List Agents",
        description=(
            "List agent identities owned by the tenant or shared publicly. Includes "
            "handle, display_name, capability_tags, trust_score."
        ),
        required_scope="mcp:read",
        rate_tier="cheap",
        cost_hint_usd=0.0,
    ),
    ToolSpec(
        name="search_marketplace",
        title="Search Marketplace",
        description=(
            "Hybrid FTS + pgvector semantic search across 7 marketplace categories. "
            "Returns RRF-ranked listings with price and trust score."
        ),
        required_scope="mcp:read",
        rate_tier="normal",
        cost_hint_usd=0.0,
    ),
    ToolSpec(
        name="get_agent_identity",
        title="Get Agent Identity",
        description=(
            "Fetch the Ed25519 identity card for an agent by identity_id or handle. "
            "Includes public key + rotation status."
        ),
        required_scope="mcp:read",
        rate_tier="cheap",
        cost_hint_usd=0.0,
    ),
    ToolSpec(
        name="get_trust_score",
        title="Get Trust Score",
        description=(
            "Return the current aggregated trust score for an agent with per-category "
            "breakdown and stability band."
        ),
        required_scope="mcp:read",
        rate_tier="cheap",
        cost_hint_usd=0.0,
    ),
    ToolSpec(
        name="create_ma_session",
        title="Create Managed Agent Session",
        description=(
            "Start a Builder-mode Managed Agent session. Gated by Hemera builder.live "
            "whitelist flag and the Chronos daily budget cap. Returns a streaming SSE URL."
        ),
        required_scope="mcp:write",
        rate_tier="expensive",
        cost_hint_usd=0.50,
    ),
    ToolSpec(
        name="get_ma_session",
        title="Get Managed Agent Session",
        description=(
            "Fetch Managed Agent session state including token usage, cost, stop reason."
        ),
        required_scope="mcp:read",
        rate_tier="cheap",
        cost_hint_usd=0.0,
    ),
)


def by_name(name: str) -> ToolSpec | None:
    for spec in REGISTERED_TOOLS:
        if spec.name == name:
            return spec
    return None


__all__ = ["REGISTERED_TOOLS", "ToolSpec", "by_name"]
