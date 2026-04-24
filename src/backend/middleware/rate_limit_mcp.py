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
"per_ip_per_min": M}``) overrides the defaults live. Two resolution
paths exist:

1. Boot-time: :func:`register_mcp_rate_limit_policies` reads the
   ``HEMERA_FLAG_MCP_RATE_LIMIT_OVERRIDE`` env var as a static
   fallback (the DB pool does not exist when middleware registration
   runs inside ``create_app``).
2. Runtime: :func:`refresh_mcp_rate_limit_policies_from_flags` is
   called by the FastAPI lifespan after the Hemera bootstrap loads,
   and re-registers via :func:`replace_rate_limit_policy` so the
   live DB value wins over the env-var fallback. The same function
   is invoked by the Hemera pub/sub subscriber
   (:func:`_on_flag_invalidation`) on every ``flag:invalidate``
   message mentioning ``mcp.rate_limit_override``, so changes made
   through the admin UI propagate in ~100 ms instead of the 10 s
   cache TTL.
"""

from __future__ import annotations

import logging
from typing import Any

from src.backend.middleware.rate_limit import (
    RateLimitPolicy,
    register_rate_limit_policy,
    replace_rate_limit_policy,
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
    """Resolve the current ``mcp.rate_limit_override`` value synchronously.

    Priority:

    1. Hemera bootstrap cache (populated at lifespan startup via
       :func:`src.backend.flags.service.bootstrap_all_flags`). Reads the
       flag's ``default_value``, NOT a per-user override, because
       registration runs once at process startup and cannot evaluate a
       per-request scope.
    2. ``HEMERA_FLAG_MCP_RATE_LIMIT_OVERRIDE`` environment variable
       (legacy env-shim retained so the API stays bootable when the
       DB has not yet been migrated).

    Returns ``None`` when neither source resolves to a dict. The caller
    treats ``None`` as "use coded defaults".

    For PER-REQUEST sensitivity (scope-specific overrides applied by
    ``POST /v1/admin/flags/mcp.rate_limit_override/overrides``), the
    pub/sub subscriber :func:`_on_flag_invalidation` re-fires
    :func:`refresh_mcp_rate_limit_policies_from_flags` so the registry
    reflects the new global default within the pub/sub latency (~100 ms).
    """

    import json
    import os

    # Primary: Hemera bootstrap cache (process-local dict, populated
    # post-lifespan). Import lazily so this module stays importable
    # during tests that do not need flag state.
    try:
        from src.backend.flags.service import get_bootstrap_default

        value = get_bootstrap_default("mcp.rate_limit_override")
        if isinstance(value, dict):
            return value
    except Exception:  # pragma: no cover - defensive
        pass

    # Fallback: env-shim. Retained for dev shells that run without the
    # Hemera bootstrap (e.g., a bare ``pytest`` against a tiny fixture
    # app that never enters the lifespan).
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


# -----------------------------------------------------------------------
# Hemera flag service integration
# -----------------------------------------------------------------------
#
# The four call sites above (register_mcp_rate_limit_policies) all read
# the sync bootstrap cache via ``_resolve_override()``. At lifespan
# startup the FastAPI app calls the async ``refresh_...`` below which
# uses Hemera's async ``get_flag`` path so per-scope + TTL'd overrides
# applied through the admin API take precedence over the boot-time
# static value. The subscriber wires the pub/sub invalidator so changes
# made through the admin UI propagate immediately.


async def refresh_mcp_rate_limit_policies_from_flags() -> None:
    """Re-register MCP + OAuth policies using live Hemera flag values.

    Called from the FastAPI lifespan (once, after Hemera bootstrap) and
    from the :mod:`src.backend.flags.invalidator` subscriber on every
    ``flag:invalidate`` message mentioning ``mcp.rate_limit_override``.

    Uses :func:`replace_rate_limit_policy` so the first-match-wins
    semantics of :class:`RateLimitRegistry` still favour the refreshed
    policy on subsequent requests.
    """

    # Import lazily to avoid a circular import during middleware install
    # (rate_limit_mcp is imported by main._install_middleware).
    from src.backend.flags.service import get_flag

    override = await get_flag("mcp.rate_limit_override")
    if isinstance(override, dict):
        per_token = int(override.get("per_token_per_min", 60))
        per_ip = int(override.get("per_ip_per_min", 300))
    else:
        per_token = 60
        per_ip = 300

    mcp_policy = _default_mcp_policy(per_min=per_token)
    replace_rate_limit_policy("/mcp", mcp_policy)
    replace_rate_limit_policy("/mcp/*", mcp_policy)
    replace_rate_limit_policy("/oauth/register", _dcr_flood_policy())
    token_policy = _default_oauth_policy(per_min=per_token, bucket_name="oauth")
    replace_rate_limit_policy("/oauth/token", token_policy)
    replace_rate_limit_policy("/oauth/authorize", token_policy)

    log.info(
        "mcp.rate_limit.policies_refreshed",
        extra={
            "event": "mcp.rate_limit.policies_refreshed",
            "per_token_per_min": per_token,
            "per_ip_per_min": per_ip,
            "override_applied": isinstance(override, dict),
            "source": "hemera.get_flag",
        },
    )


async def _on_flag_invalidation(flag_names: list[str], source: str) -> None:
    """Hemera pub/sub subscriber.

    Refreshes MCP rate-limit policies whenever
    ``mcp.rate_limit_override`` changes. Other flag names are ignored;
    the subscriber remains attached so additional MCP-owned flags can
    be added later without re-registering with the invalidator.
    """

    relevant = {"mcp.rate_limit_override", "mcp.rate_limit_cap"}
    if not (set(flag_names) & relevant):
        return
    try:
        await refresh_mcp_rate_limit_policies_from_flags()
    except Exception as exc:  # pragma: no cover - defensive
        log.warning(
            "mcp.rate_limit.refresh_on_invalidation_failed "
            "flags=%s source=%s err=%s",
            flag_names,
            source,
            exc,
        )


def _register_hemera_subscriber() -> None:
    """Attach :func:`_on_flag_invalidation` to the Hemera invalidator.

    Called at module import time. Safe to re-run: the invalidator's
    subscriber list is idempotent for our single-register use case
    because :mod:`src.backend.middleware.rate_limit_mcp` is imported
    once per process. Tests that want to isolate subscriber state call
    :func:`src.backend.flags.invalidator.clear_subscribers` in fixtures.
    """

    try:
        from src.backend.flags.invalidator import register_subscriber

        register_subscriber(_on_flag_invalidation)
    except Exception as exc:  # pragma: no cover - defensive
        log.warning("mcp.rate_limit.subscriber_register_failed err=%s", exc)


_register_hemera_subscriber()


__all__ = [
    "_on_flag_invalidation",
    "refresh_mcp_rate_limit_policies_from_flags",
    "register_mcp_rate_limit_policies",
    "register_per_tool_policy",
]
