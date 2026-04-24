"""Redis-backed rate limit middleware.

Owner: Aether (W1 Session 2). Implements a token-bucket (GCRA-style)
limiter whose single round-trip Lua script mirrors the one registered
in ``docs/contracts/redis_session.contract.md`` Section 4.2 so Khronos
and Moros can reuse the same primitive.

Emits the IETF structured ``RateLimit`` + ``RateLimit-Policy`` headers
per ``rest_api_base.contract.md`` Section 3.6 on every response; on
denial returns :class:`RateLimitedProblem` with ``Retry-After`` in
seconds per RFC 9110.

Route-policy resolution
-----------------------
Per-route limits are resolved from an ordered registry:

- exact match by request path ("/v1/billing/checkout")
- prefix match ("/v1/mcp/*" against "/v1/mcp/tools/list")
- fallback default policy

The registry is a list of ``(pattern, policy)`` pairs inspected in
order. Consumers (Khronos, Moros, marketplace routers) call
:func:`register_rate_limit_policy` during their module import to add
policies without editing ``main.py``.

Identity resolution
-------------------
- Authenticated request: tenant id from ``request.state.tenant_id``.
- Unauthenticated: client IP (best-effort; behind Cloudflare the
  request should carry ``CF-Connecting-IP`` but we fall back to
  Starlette's ``request.client.host``).

Fail-open posture
-----------------
Per ``redis_session.contract.md`` Section 8 rate-limit failures are
"fail open" (allow the request, log the incident). This is safer than
fail-closed at submission scale; Moros's budget daemon provides the
hard stop.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Iterable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from src.backend.errors import RateLimitedProblem
from src.backend.errors.problem_json import problem_response
from src.backend.redis_client import eval_script

logger = logging.getLogger(__name__)


# Lua source for the token bucket mirrors
# docs/contracts/redis_session.contract.md Section 4.2. Kept inline so a
# redis-py ``EVAL`` call doesn't depend on file I/O during request path.
# Return: [allowed (0|1), remaining_tokens, retry_after_seconds]
TOKEN_BUCKET_LUA = """
local max = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local state = redis.call('HMGET', KEYS[1], 'tokens', 'last_refill_ms')
local tokens = tonumber(state[1]) or max
local last = tonumber(state[2]) or now

local elapsed = (now - last) / 1000.0
tokens = math.min(max, tokens + elapsed * refill)

if tokens < cost then
  redis.call('HSET', KEYS[1], 'tokens', tokens, 'last_refill_ms', now)
  redis.call('EXPIRE', KEYS[1], math.ceil(max / refill) + 60)
  return {0, tokens, math.ceil((cost - tokens) / refill)}
end

tokens = tokens - cost
redis.call('HSET', KEYS[1], 'tokens', tokens, 'last_refill_ms', now)
redis.call('EXPIRE', KEYS[1], math.ceil(max / refill) + 60)
return {1, tokens, 0}
"""


@dataclass(frozen=True)
class RateLimitPolicy:
    """Describes a bucket: ``max`` tokens refilled at ``refill`` per second.

    ``bucket_name`` is the human-readable label that lands in the
    ``RateLimit-Policy`` header (``policy="api"``). ``cost`` defaults
    to 1 token per request but endpoints that represent an expensive
    downstream call (LLM invocation via Kratos) may override.
    """

    max_tokens: int
    refill_per_second: float
    bucket_name: str = "api"
    cost: int = 1

    def window_seconds(self) -> int:
        if self.refill_per_second <= 0:
            return 60
        return max(1, int(round(self.max_tokens / self.refill_per_second)))


DEFAULT_POLICY = RateLimitPolicy(
    max_tokens=120,
    refill_per_second=2.0,
    bucket_name="api",
)
"""Baseline per-identity policy: 120 tokens, refills 2/sec.

Approximates 120 requests/minute with modest burst capacity. Tuned
for submission scale; production tuning tracks GlitchTip incidents
and Grafana Cloud dashboards.
"""


@dataclass
class RateLimitRegistry:
    """Ordered registry of (pattern, policy) pairs."""

    _entries: list[tuple[str, RateLimitPolicy]] = field(default_factory=list)
    default: RateLimitPolicy = DEFAULT_POLICY

    def register(self, pattern: str, policy: RateLimitPolicy) -> None:
        self._entries.append((pattern, policy))

    def replace(self, pattern: str, policy: RateLimitPolicy) -> None:
        """Update the policy for an existing pattern, or register fresh.

        Used by the Hemera flag service to refresh runtime policies when
        ``mcp.rate_limit_override`` changes. First-match wins in
        :meth:`resolve`, so replacing the exact entry in place is the
        only way to make a second registration with the same pattern
        visible. Entries added for the first time are appended.
        """

        for idx, (existing_pattern, _) in enumerate(self._entries):
            if existing_pattern == pattern:
                self._entries[idx] = (pattern, policy)
                return
        self._entries.append((pattern, policy))

    def reset(self) -> None:
        self._entries.clear()

    def resolve(self, path: str) -> RateLimitPolicy:
        # Exact match beats prefix match beats default.
        for pattern, policy in self._entries:
            if pattern == path:
                return policy
        for pattern, policy in self._entries:
            if pattern.endswith("*") and path.startswith(pattern[:-1]):
                return policy
            if not pattern.endswith("*") and pattern != path:
                continue
        # Second pass for prefix rules that did not end with '*' but
        # are still used as prefixes.
        return self.default


# Module-level registry so downstream agents import + register without
# editing main.py. Registration order matters: earlier entries win on
# exact match, later entries extend with broader patterns.
REGISTRY = RateLimitRegistry()


def register_rate_limit_policy(pattern: str, policy: RateLimitPolicy) -> None:
    """Register a per-pattern :class:`RateLimitPolicy`.

    ``pattern`` may be an exact path (``/v1/billing/checkout``) or a
    wildcard prefix (``/v1/mcp/*``). More specific patterns SHOULD be
    registered before broader ones.
    """

    REGISTRY.register(pattern, policy)


def replace_rate_limit_policy(pattern: str, policy: RateLimitPolicy) -> None:
    """Update an existing pattern's policy, or register fresh if new.

    Thin wrapper around :meth:`RateLimitRegistry.replace`. Downstream
    code (Hemera flag refresh) calls this when it needs to swap the
    runtime policy for a pattern without pushing a duplicate entry that
    would be shadowed by the first-match win in :meth:`resolve`.
    """

    REGISTRY.replace(pattern, policy)


def _client_ip(request: Request) -> str:
    """Best-effort client IP extraction.

    Cloudflare + our Caddy reverse proxy supply ``CF-Connecting-IP`` and
    ``X-Forwarded-For``. Absent both, fall back to Starlette's
    ``request.client.host``. IP-based limiting is a soft fallback for
    unauthenticated surfaces only; authenticated flows limit by tenant.
    """

    for header in ("cf-connecting-ip", "x-forwarded-for", "x-real-ip"):
        value = request.headers.get(header)
        if value:
            # x-forwarded-for may contain a comma-separated chain; the
            # leftmost value is the originating client.
            return value.split(",")[0].strip()
    client = request.client
    if client is not None:
        return client.host
    return "unknown"


def _identity_key(request: Request, policy: RateLimitPolicy) -> tuple[str, str]:
    """Return ``(bucket_label, identity_label)`` for key formatting."""

    tenant_id = getattr(request.state, "tenant_id", None)
    if tenant_id:
        return policy.bucket_name, f"tenant:{tenant_id}"
    return policy.bucket_name, f"ip:{_client_ip(request)}"


def _format_rate_limit_header(policy: RateLimitPolicy, remaining: int, reset_s: int) -> str:
    """Per rest_api_base.contract Section 3.6 structured field grammar."""

    return f"limit={policy.max_tokens}, remaining={max(0, remaining)}, reset={max(0, reset_s)}"


def _format_rate_limit_policy_header(policy: RateLimitPolicy) -> str:
    return (
        f"{policy.max_tokens};w={policy.window_seconds()};policy=\"{policy.bucket_name}\""
    )


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Enforce the resolved :class:`RateLimitPolicy` on each request."""

    def __init__(
        self,
        app: object,
        *,
        registry: RateLimitRegistry | None = None,
        skip_paths: Iterable[str] = (
            "/healthz",
            "/readyz",
            "/metrics",
            "/version",
        ),
        skip_prefixes: Iterable[str] = (),
        lua_script: str = TOKEN_BUCKET_LUA,
        evaluator: Callable[..., Awaitable[object]] | None = None,
    ) -> None:
        super().__init__(app)
        self._registry = registry or REGISTRY
        self._skip_paths = frozenset(skip_paths)
        self._skip_prefixes = tuple(skip_prefixes)
        self._lua = lua_script
        # Allow tests to inject a fake evaluator without touching Redis.
        self._evaluator = evaluator or eval_script

    def _is_skipped(self, path: str) -> bool:
        if path in self._skip_paths:
            return True
        for prefix in self._skip_prefixes:
            if path.startswith(prefix):
                return True
        return False

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        path = request.url.path

        if self._is_skipped(path) or request.method == "OPTIONS":
            return await call_next(request)

        policy = self._registry.resolve(path)
        bucket_label, identity_label = _identity_key(request, policy)
        redis_key = f"rl:{bucket_label}:{identity_label}"
        now_ms = int(time.time() * 1000)

        try:
            result = await self._evaluator(
                self._lua,
                [redis_key],
                [
                    policy.max_tokens,
                    policy.refill_per_second,
                    now_ms,
                    policy.cost,
                ],
            )
        except Exception as exc:  # Fail open per contract Section 8.
            logger.warning(
                "rate_limit.redis.unreachable",
                extra={"path": path, "err": str(exc)},
            )
            return await call_next(request)

        allowed, remaining, retry_after = _parse_lua_result(result)

        rate_limit_header = _format_rate_limit_header(
            policy,
            remaining=int(remaining),
            reset_s=int(retry_after or policy.window_seconds()),
        )
        rate_limit_policy_header = _format_rate_limit_policy_header(policy)

        if not allowed:
            logger.info(
                "rate_limit.denied",
                extra={
                    "bucket": bucket_label,
                    "identity": identity_label,
                    "path": path,
                    "retry_after_s": int(retry_after),
                },
            )
            exc = RateLimitedProblem(
                detail=(
                    f"Rate limit exceeded for bucket '{bucket_label}'. "
                    f"Retry after {int(retry_after)} seconds."
                ),
                retry_after_seconds=int(retry_after or 1),
                rate_limit_header=rate_limit_header,
                rate_limit_policy_header=rate_limit_policy_header,
            )
            problem = exc.to_problem(
                instance=path,
                request_id=request.headers.get("x-request-id"),
            )
            return problem_response(problem, headers=exc.headers)

        response = await call_next(request)
        response.headers.setdefault("RateLimit", rate_limit_header)
        response.headers.setdefault("RateLimit-Policy", rate_limit_policy_header)
        return response


def _parse_lua_result(result: object) -> tuple[bool, int, int]:
    """Normalise redis-py's EVAL return shape.

    redis-py returns lists as Python lists of bytes or ints depending on
    decode_responses. We defensively coerce.
    """

    try:
        allowed_raw, remaining_raw, retry_after_raw = result  # type: ignore[misc]
    except (TypeError, ValueError):
        # Unexpected shape: fail open.
        return True, 0, 0

    def _to_int(value: object) -> int:
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, (int, float)):
            return int(value)
        if isinstance(value, (bytes, bytearray)):
            return int(value.decode("ascii", errors="ignore") or 0)
        if isinstance(value, str):
            return int(value or 0)
        return 0

    allowed = bool(_to_int(allowed_raw))
    remaining = _to_int(remaining_raw)
    retry_after = _to_int(retry_after_raw)
    return allowed, remaining, retry_after


def install_rate_limit(
    app: object,
    *,
    registry: RateLimitRegistry | None = None,
    skip_paths: Iterable[str] = (
        "/healthz",
        "/readyz",
        "/metrics",
        "/version",
    ),
    skip_prefixes: Iterable[str] = (),
) -> None:
    """Attach :class:`RateLimitMiddleware` to the given app."""

    app.add_middleware(  # type: ignore[attr-defined]
        RateLimitMiddleware,
        registry=registry,
        skip_paths=tuple(skip_paths),
        skip_prefixes=tuple(skip_prefixes),
    )


__all__ = [
    "DEFAULT_POLICY",
    "REGISTRY",
    "RateLimitMiddleware",
    "RateLimitPolicy",
    "RateLimitRegistry",
    "TOKEN_BUCKET_LUA",
    "install_rate_limit",
    "register_rate_limit_policy",
    "replace_rate_limit_policy",
]
