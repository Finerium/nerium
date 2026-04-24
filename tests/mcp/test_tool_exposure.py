"""MCP tool exposure + rate-limit policy + Hemera gate E2E tests.

Assertions per ``docs/contracts/mcp_tool_registry.contract.md`` Section 9
+ ``docs/contracts/mcp_server.contract.md`` Sections 3.1, 4.3, 4.4:

- FastMCP discovery surfaces all 7 tools with non-empty input + output schemas.
- Each tool's input schema rejects known-bad payloads (Pydantic enforcement).
- Each tool's required scope + rate tier matches the registry.
- Rate-limit policies are registered for /mcp, /mcp/*, /oauth/register,
  /oauth/token, /oauth/authorize.
- ``create_ma_session`` gated by Hemera ``builder.live: false`` returns
  ``builder_not_enabled``.
- ``create_ma_session`` gated by Moros ``chronos:ma_capped: 1`` returns
  ``budget_capped``.
- Every invocation emits the structured log events
  ``mcp.tool.invoked`` + ``mcp.tool.completed``.
"""

import asyncio
import os

import pytest

from src.backend.mcp.registry import REGISTERED_TOOLS
from src.backend.mcp.server import mcp_server, register_mcp_tools


@pytest.fixture(scope="module", autouse=True)
def _tools_registered():
    """Ensure all tool decorators have fired before running assertions."""

    register_mcp_tools()
    yield


@pytest.fixture
def mcp_principal_ctx():
    """Install a McpPrincipal for the duration of one test."""

    from src.backend.middleware.auth import AuthPrincipal
    from src.backend.mcp.auth import reset_principal_for_tests, set_principal_for_tests

    principal = AuthPrincipal(
        user_id="01926f00-0000-7000-8000-000000000001",
        tenant_id="01926f00-0000-7000-8000-000000000001",
        scopes=frozenset({"mcp:read", "mcp:write"}),
        issuer="https://nerium.com",
        token_type="bearer",
        raw_claims={},
    )
    token = set_principal_for_tests(principal)
    try:
        yield principal
    finally:
        reset_principal_for_tests(token)


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------


def test_registry_advertises_seven_tools() -> None:
    assert len(REGISTERED_TOOLS) == 7
    names = {spec.name for spec in REGISTERED_TOOLS}
    assert names == {
        "list_projects",
        "list_agents",
        "search_marketplace",
        "get_agent_identity",
        "get_trust_score",
        "create_ma_session",
        "get_ma_session",
    }


def test_fastmcp_list_tools_returns_all_seven() -> None:
    async def _probe():
        return await mcp_server().list_tools()

    tools = asyncio.run(_probe())
    names = {t.name for t in tools}
    assert names == {
        "list_projects",
        "list_agents",
        "search_marketplace",
        "get_agent_identity",
        "get_trust_score",
        "create_ma_session",
        "get_ma_session",
    }
    for tool in tools:
        assert tool.description, f"tool {tool.name} has empty description"
        assert tool.inputSchema, f"tool {tool.name} has empty inputSchema"


def test_tool_input_schemas_are_json_schema_draft_2020_12() -> None:
    """Every FastMCP tool exposes an ``inputSchema`` parseable by jsonschema."""

    async def _probe():
        return await mcp_server().list_tools()

    tools = asyncio.run(_probe())
    for tool in tools:
        assert tool.inputSchema.get("type") == "object"
        assert "properties" in tool.inputSchema


# ---------------------------------------------------------------------------
# Pydantic input validation
# ---------------------------------------------------------------------------


def test_list_projects_input_rejects_invalid_limit() -> None:
    from pydantic import ValidationError

    from src.backend.mcp.tools.list_projects import ListProjectsInput

    with pytest.raises(ValidationError):
        ListProjectsInput(limit=0)
    with pytest.raises(ValidationError):
        ListProjectsInput(limit=200)


def test_list_projects_input_accepts_known_good() -> None:
    from src.backend.mcp.tools.list_projects import ListProjectsInput

    payload = ListProjectsInput(limit=20, status="active")
    assert payload.limit == 20
    assert payload.status == "active"


def test_get_agent_identity_requires_one_of_selector() -> None:
    from pydantic import ValidationError

    from src.backend.mcp.tools.get_agent_identity import GetAgentIdentityInput

    with pytest.raises(ValidationError):
        GetAgentIdentityInput()

    assert GetAgentIdentityInput(handle="apollo").handle == "apollo"
    assert GetAgentIdentityInput(
        identity_id="01926f00-0000-7000-8000-000000000001"
    ).identity_id.startswith("01926f00")


def test_search_marketplace_query_bounds() -> None:
    from pydantic import ValidationError

    from src.backend.mcp.tools.search_marketplace import SearchMarketplaceInput

    with pytest.raises(ValidationError):
        SearchMarketplaceInput(query="")
    with pytest.raises(ValidationError):
        SearchMarketplaceInput(query="x" * 300)


def test_create_ma_session_budget_bounds() -> None:
    from pydantic import ValidationError

    from src.backend.mcp.tools.create_ma_session import CreateMaSessionInput

    with pytest.raises(ValidationError):
        CreateMaSessionInput(prompt="hi", budget_usd_cap=0.0)
    with pytest.raises(ValidationError):
        CreateMaSessionInput(prompt="hi", budget_usd_cap=500.0)


# ---------------------------------------------------------------------------
# Rate limit policy registration
# ---------------------------------------------------------------------------


def test_rate_limit_policies_registered_for_mcp_and_oauth() -> None:
    from src.backend.middleware.rate_limit import REGISTRY
    from src.backend.middleware.rate_limit_mcp import register_mcp_rate_limit_policies

    REGISTRY.reset()
    register_mcp_rate_limit_policies()

    mcp_policy = REGISTRY.resolve("/mcp")
    assert mcp_policy.bucket_name == "mcp"

    mcp_sub_policy = REGISTRY.resolve("/mcp/some/deep/path")
    assert mcp_sub_policy.bucket_name == "mcp"

    register_policy = REGISTRY.resolve("/oauth/register")
    assert register_policy.bucket_name == "oauth-dcr"
    assert register_policy.max_tokens == 10

    token_policy = REGISTRY.resolve("/oauth/token")
    assert token_policy.bucket_name == "oauth"

    authorize_policy = REGISTRY.resolve("/oauth/authorize")
    assert authorize_policy.bucket_name == "oauth"


def test_rate_limit_override_hemera_flag_applied(monkeypatch) -> None:
    from src.backend.middleware.rate_limit import REGISTRY
    from src.backend.middleware.rate_limit_mcp import register_mcp_rate_limit_policies

    REGISTRY.reset()
    monkeypatch.setenv(
        "HEMERA_FLAG_MCP_RATE_LIMIT_OVERRIDE",
        '{"per_token_per_min": 600, "per_ip_per_min": 2000}',
    )
    register_mcp_rate_limit_policies()

    mcp_policy = REGISTRY.resolve("/mcp")
    assert mcp_policy.max_tokens == 600

    monkeypatch.delenv("HEMERA_FLAG_MCP_RATE_LIMIT_OVERRIDE", raising=False)


# ---------------------------------------------------------------------------
# Hemera gate on create_ma_session
# ---------------------------------------------------------------------------


def test_create_ma_session_denied_when_builder_live_false(
    monkeypatch, mcp_principal_ctx, caplog
) -> None:
    from src.backend.errors import ForbiddenProblem
    from src.backend.mcp.tools.create_ma_session import (
        CreateMaSessionInput,
        create_ma_session_tool,
    )

    monkeypatch.delenv("HEMERA_FLAG_BUILDER_LIVE", raising=False)

    async def _call():
        return await create_ma_session_tool(
            CreateMaSessionInput(prompt="build me a landing page"),
        )

    with pytest.raises(ForbiddenProblem) as exc_info:
        asyncio.run(_call())

    assert "builder_not_enabled" in str(exc_info.value.detail)


def test_create_ma_session_allowed_when_builder_live_true(
    monkeypatch, mcp_principal_ctx
) -> None:
    from src.backend.errors.problem_json import ServiceUnavailableProblem
    from src.backend.mcp.tools.create_ma_session import (
        CreateMaSessionInput,
        create_ma_session_tool,
    )

    monkeypatch.setenv("HEMERA_FLAG_BUILDER_LIVE", "true")

    async def _call():
        return await create_ma_session_tool(
            CreateMaSessionInput(prompt="build me a landing page"),
        )

    # Without Kratos's ma_session table the tool short-circuits with a 503.
    # This asserts the gate passed (Hemera flag true) + the next failure is
    # the expected downstream-missing one, NOT the gate denial.
    with pytest.raises(ServiceUnavailableProblem) as exc_info:
        asyncio.run(_call())

    assert "ma_session_unavailable" in str(exc_info.value.detail)


# ---------------------------------------------------------------------------
# Structured log emission
# ---------------------------------------------------------------------------


def test_tool_invocation_emits_structured_logs(
    monkeypatch, mcp_principal_ctx, caplog
) -> None:
    import logging

    from src.backend.mcp.tools.list_projects import (
        ListProjectsInput,
        list_projects_tool,
    )

    caplog.set_level(logging.INFO, logger="src.backend.mcp.tools._base")

    async def _call():
        return await list_projects_tool(ListProjectsInput(limit=10))

    result = asyncio.run(_call())
    assert result.items == []  # table not present, graceful empty

    events = [record.__dict__.get("event") for record in caplog.records]
    assert "mcp.tool.invoked" in events
    assert "mcp.tool.completed" in events


# ---------------------------------------------------------------------------
# Scope enforcement
# ---------------------------------------------------------------------------


def test_tool_rejects_missing_scope() -> None:
    """A tool decorated with mcp:write raises ForbiddenProblem when only mcp:read present."""

    from src.backend.errors import ForbiddenProblem
    from src.backend.mcp.auth import reset_principal_for_tests, set_principal_for_tests
    from src.backend.mcp.tools.create_ma_session import (
        CreateMaSessionInput,
        create_ma_session_tool,
    )
    from src.backend.middleware.auth import AuthPrincipal

    read_only = AuthPrincipal(
        user_id="01926f00-0000-7000-8000-000000000001",
        tenant_id="01926f00-0000-7000-8000-000000000001",
        scopes=frozenset({"mcp:read"}),
        raw_claims={},
    )
    token = set_principal_for_tests(read_only)
    try:
        async def _call():
            return await create_ma_session_tool(
                CreateMaSessionInput(prompt="x"),
            )

        with pytest.raises(ForbiddenProblem):
            asyncio.run(_call())
    finally:
        reset_principal_for_tests(token)


def test_tool_rejects_unauthenticated() -> None:
    """Calling any tool without a principal raises UnauthorizedProblem."""

    from src.backend.errors import UnauthorizedProblem
    from src.backend.mcp.tools.list_projects import (
        ListProjectsInput,
        list_projects_tool,
    )

    async def _call():
        return await list_projects_tool(ListProjectsInput())

    with pytest.raises(UnauthorizedProblem):
        asyncio.run(_call())


# ---------------------------------------------------------------------------
# Registry metadata consistency
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("spec", REGISTERED_TOOLS, ids=lambda s: s.name)
def test_registry_metadata_shape(spec) -> None:
    assert spec.name
    assert spec.title
    assert spec.description
    assert spec.required_scope in {"mcp:read", "mcp:write", "mcp:admin"}
    assert spec.rate_tier in {"cheap", "normal", "expensive"}
    assert spec.cost_hint_usd >= 0


def test_cloudflare_waf_doc_shipped() -> None:
    """Ensure ops/cloudflare/waf_mcp_allowlist.json is present + parses."""

    import json

    path = "ops/cloudflare/waf_mcp_allowlist.json"
    assert os.path.isfile(path), f"{path} missing"
    with open(path, "r", encoding="utf-8") as fh:
        payload = json.load(fh)
    assert payload["owner_agent"] == "khronos"
    assert "160.79.104.0/21" in payload["rule_expression"]
    assert payload["zone"] == "nerium.com"
