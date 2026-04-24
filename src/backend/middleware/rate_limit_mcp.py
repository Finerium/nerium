"""MCP-specific rate limit policy registrations.

Owner: Khronos. The Lua token bucket primitive lives in
:mod:`src.backend.middleware.rate_limit` (Aether session 2 shipped the
canonical script co-published in ``docs/contracts/redis_session.contract.md``
Section 4.2). This module only registers the per-path policies required
by ``docs/contracts/mcp_server.contract.md`` Section 4.3 and offers
helpers that per-tool code calls when it wants a second-tier bucket
(e.g. ``create_ma_session`` is rate_tier=expensive and wants a tighter
quota than the outer /mcp path).

Policies
--------
- ``/mcp``  (exact path): 60 req / min / identity (60 max, 1 rps refill).
- ``/mcp/*`` (wildcard):   60 req / min / identity (same; covers sub-paths).
- ``/oauth/register``:     10 req / hour / IP (DCR flood guard).
- ``/oauth/token``:        60 req / min / IP   (token refresh burst tolerance).
- ``/oauth/authorize``:    60 req / min / IP.

Hemera override
---------------
Hemera flag ``mcp.rate_limit_override`` (``{"per_token_per_min": N,
"per_ip_per_min": M}``) overrides the defaults live. When the flag returns
a non-None JSON object, :func:`register_mcp_rate_limit_policies` substitutes
the overridden buckets instead of the defaults. Mutations propagate within
the Hemera cache TTL (~10 s).
"""

from __future__ import annotations

import logging
from typing import Any

from src.backend.middleware.rate_limit import (
    RateLimitPolicy,
    register_rate_limit_policy,
)

log = logging.getLogger(__name__)


def _default_mcp_policy(per_min: int = 60) -> RateLimitPolicy:
    return RateLimitPolicy(
        max_tokens=per_min,
        refill_per_second=per_min / 60,
        bucket_name="mcp",
    )


def _default_oauth_policy(per_min: int = 60, bucket_name: str = "oauth") -> RateLimitPolicy:
    return RateLimitPolicy(
        max_tokens=per_min,
        refill_per_second=per_min / 60,
        bucket_name=bucket_name,
    )


def _dcr_flood_policy(per_hour: int = 10) -> RateLimitPolicy:
    return RateLimitPolicy(
        max_tokens=per_hour,
        refill_per_second=per_hour / 3600,
        bucket_name="oauth-dcr",
    )


def _resolve_override() -> dict[str, Any] | None:
    """Read the Hemera flag value synchronously from env shim.

    We resolve at registration time (process start). A future
    :func:`src.backend.flags.service.get_flag_sync` can be substituted.
    """

    import json
    import os

    raw = os.environ.get("HEMERA_FLAG_MCP_RATE_LIMIT_OVERRIDE")
    if raw is None:
        return None
    raw = raw.strip()
    if not raw or raw.lower() == "null":
        return None
    try:
        parsed = json.loads(raw)
    except ValueError:
        return None
    if isinstance(parsed, dict):
        return parsed
    return None


def register_mcp_rate_limit_policies() -> None:
    """Install the MCP + OAuth policies on the shared registry.

    Safe to call multiple times: duplicate registrations are ordered by
    insertion, the first matching pattern wins per
    :class:`~src.backend.middleware.rate_limit.RateLimitRegistry`.
    """

    override = _resolve_override()
    per_token = int(override.get("per_token_per_min", 60)) if override else 60
    per_ip = int(override.get("per_ip_per_min", 300)) if override else 300

    # /mcp exact + wildcard. The identity key in the outer middleware
    # falls back from tenant_id to IP, which matches our per-token (via
    # JWT sub -> tenant) + per-IP requirement for unauthenticated 401
    # bounces.
    mcp_policy = _default_mcp_policy(per_min=per_token)
    register_rate_limit_policy("/mcp", mcp_policy)
    register_rate_limit_policy("/mcp/*", mcp_policy)

    # /oauth/register: RFC 7591 flood guard, 10 per hour / IP
    register_rate_limit_policy("/oauth/register", _dcr_flood_policy())

    # /oauth/token + /oauth/authorize share a moderate IP-based bucket.
    # Authentication hits this path only during the short-lived auth code
    # exchange, so 60 / minute is comfortable for real users and absorbs
    # burst refresh rotations during Claude.ai reconnect storms.
    token_policy = _default_oauth_policy(per_min=per_token, bucket_name="oauth")
    register_rate_limit_policy("/oauth/token", token_policy)
    register_rate_limit_policy("/oauth/authorize", token_policy)

    log.info(
        "mcp.rate_limit.policies_registered",
        extra={
            "event": "mcp.rate_limit.policies_registered",
            "per_token_per_min": per_token,
            "per_ip_per_min": per_ip,
            "override_applied": override is not None,
        },
    )


# Second-tier bucket per tool rate_tier. Registered lazily by the per-tool
# handler modules that want a tighter bucket beyond the /mcp-wide limit.


def _tool_tier_policy(tool_name: str, rate_tier: str) -> RateLimitPolicy:
    per_min = {
        "cheap": 120,
        "normal": 60,
        "expensive": 10,
    }.get(rate_tier, 60)
    return RateLimitPolicy(
        max_tokens=per_min,
        refill_per_second=per_min / 60,
        bucket_name=f"mcp-{tool_name}",
    )


def register_per_tool_policy(tool_name: str, rate_tier: str) -> None:
    """Register a per-tool bucket at ``/mcp/tools/<tool_name>`` (reserved).

    FastMCP's current Streamable HTTP transport does not expose per-tool
    URLs; the registration is reserved for the post-hackathon refactor
    where tools may land on distinct paths for edge routing.
    """

    policy = _tool_tier_policy(tool_name, rate_tier)
    register_rate_limit_policy(f"/mcp/tools/{tool_name}", policy)


__all__ = [
    "register_mcp_rate_limit_policies",
    "register_per_tool_policy",
]
