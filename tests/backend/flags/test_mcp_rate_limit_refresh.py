"""Khronos MCP rate-limit refresh from Hemera flag value.

Exercises :func:`refresh_mcp_rate_limit_policies_from_flags` by stubbing
:func:`src.backend.flags.service.get_flag` and asserting the
:class:`RateLimitRegistry` is updated via :func:`replace_rate_limit_policy`.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from src.backend.middleware import rate_limit, rate_limit_mcp


@pytest.fixture
def clean_registry():
    saved = list(rate_limit.REGISTRY._entries)
    rate_limit.REGISTRY.reset()
    try:
        yield rate_limit.REGISTRY
    finally:
        rate_limit.REGISTRY.reset()
        for pattern, policy in saved:
            rate_limit.REGISTRY.register(pattern, policy)


@pytest.mark.asyncio
async def test_refresh_with_null_uses_coded_defaults(monkeypatch, clean_registry) -> None:
    monkeypatch.setattr(
        "src.backend.middleware.rate_limit_mcp.get_flag",
        AsyncMock(return_value=None),
        raising=False,
    )
    # rate_limit_mcp imports get_flag lazily inside the function; patch at
    # the import site via the flags.service module.
    monkeypatch.setattr(
        "src.backend.flags.service.get_flag",
        AsyncMock(return_value=None),
    )

    await rate_limit_mcp.refresh_mcp_rate_limit_policies_from_flags()

    mcp_policy = clean_registry.resolve("/mcp")
    assert mcp_policy.max_tokens == 60


@pytest.mark.asyncio
async def test_refresh_with_dict_override_applies(monkeypatch, clean_registry) -> None:
    monkeypatch.setattr(
        "src.backend.flags.service.get_flag",
        AsyncMock(return_value={"per_token_per_min": 240, "per_ip_per_min": 600}),
    )

    await rate_limit_mcp.refresh_mcp_rate_limit_policies_from_flags()

    mcp_policy = clean_registry.resolve("/mcp")
    assert mcp_policy.max_tokens == 240
    oauth_policy = clean_registry.resolve("/oauth/token")
    assert oauth_policy.max_tokens == 240


@pytest.mark.asyncio
async def test_refresh_replaces_not_appends(monkeypatch, clean_registry) -> None:
    """Re-running refresh does NOT leave stale entries in the registry.

    Before the fix, ``register_rate_limit_policy`` appended duplicates
    and first-match-wins kept the stale policy. :func:`replace_rate_limit_policy`
    updates in place so the test asserts the entry count stays fixed.
    """

    monkeypatch.setattr(
        "src.backend.flags.service.get_flag",
        AsyncMock(return_value={"per_token_per_min": 60, "per_ip_per_min": 300}),
    )
    await rate_limit_mcp.refresh_mcp_rate_limit_policies_from_flags()
    first_count = len(clean_registry._entries)

    monkeypatch.setattr(
        "src.backend.flags.service.get_flag",
        AsyncMock(return_value={"per_token_per_min": 120, "per_ip_per_min": 500}),
    )
    await rate_limit_mcp.refresh_mcp_rate_limit_policies_from_flags()
    second_count = len(clean_registry._entries)

    assert first_count == second_count, "refresh must not grow the registry"
    policy = clean_registry.resolve("/mcp")
    assert policy.max_tokens == 120


@pytest.mark.asyncio
async def test_subscriber_triggers_refresh_only_on_relevant_flag(
    monkeypatch, clean_registry
) -> None:
    refreshed = []

    async def fake_refresh() -> None:
        refreshed.append(True)

    monkeypatch.setattr(
        "src.backend.middleware.rate_limit_mcp.refresh_mcp_rate_limit_policies_from_flags",
        fake_refresh,
    )

    # Irrelevant flag does NOT trigger refresh.
    await rate_limit_mcp._on_flag_invalidation(["builder.live"], "test")
    assert refreshed == []

    # Relevant flag triggers refresh.
    await rate_limit_mcp._on_flag_invalidation(["mcp.rate_limit_override"], "test")
    assert refreshed == [True]

    # Relevant flag via alias triggers refresh.
    await rate_limit_mcp._on_flag_invalidation(["mcp.rate_limit_cap"], "test")
    assert refreshed == [True, True]
