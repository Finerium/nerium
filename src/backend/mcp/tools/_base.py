"""Common observability + scope enforcement wrapper for MCP tool handlers.

Owner: Khronos. Per ``docs/contracts/mcp_tool_registry.contract.md`` Section 5
every tool emits ``mcp.tool.invoked`` / ``mcp.tool.completed`` / ``mcp.tool.errored``
structured log events and an OpenTelemetry span tagged with
``mcp.tool_name`` + ``mcp.scope`` + ``mcp.tenant_id``.

Use the :func:`tool_wrap` decorator to wrap any async tool body; it
handles:

1. ``require_scope`` enforcement (tool's declared scope from the registry).
2. OTel span creation + standard attributes.
3. Structured log emission pre-call, post-call, and on error (redacted).
4. Timing measurement in milliseconds.
5. Moros cost accounting hook via ``cost_hint_usd`` from the registry.
"""

# NOTE: no ``from __future__ import annotations``: FastMCP's
# ``Tool.from_function`` introspects parameter annotations via
# ``issubclass(annotation, Context)`` which requires concrete class
# objects, not PEP 563 string annotations. Keep this module and every
# tool handler using eager annotations so the decorator can parse them.

import functools
import inspect
import logging
import time
from collections.abc import Awaitable
from typing import Any, Callable, TypeVar

from src.backend.mcp.auth import require_scope
from src.backend.mcp.registry import by_name

logger = logging.getLogger(__name__)


try:  # pragma: no cover - optional at boot
    from opentelemetry import trace as _otel_trace
except ImportError:  # pragma: no cover
    _otel_trace = None  # type: ignore[assignment]


T = TypeVar("T")


def _tracer():  # type: ignore[no-untyped-def]
    if _otel_trace is None:
        return None
    return _otel_trace.get_tracer("nerium.mcp.tools")


def tool_wrap(tool_name: str) -> Callable[[Callable[..., Awaitable[T]]], Callable[..., Awaitable[T]]]:
    """Decorate an async tool handler with scope + obs + cost accounting.

    ``tool_name`` must match the entry in
    :data:`src.backend.mcp.registry.REGISTERED_TOOLS`. The decorator
    resolves the spec once at module import and fails fast if the tool
    name has not been registered.
    """

    spec = by_name(tool_name)
    if spec is None:
        raise RuntimeError(
            f"tool_wrap('{tool_name}') called but the tool is not in REGISTERED_TOOLS; "
            "amend src/backend/mcp/registry.py first."
        )

    required_scope = spec.required_scope
    rate_tier = spec.rate_tier
    cost_hint = spec.cost_hint_usd

    def decorator(fn: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
        @functools.wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> T:
            principal = require_scope(required_scope)

            logger.info(
                "mcp.tool.invoked",
                extra={
                    "event": "mcp.tool.invoked",
                    "tool_name": tool_name,
                    "scope": required_scope,
                    "rate_tier": rate_tier,
                    "cost_hint_usd": cost_hint,
                    "sub": principal.user_id,
                    "tenant_id": principal.tenant_id,
                },
            )

            tracer = _tracer()
            start = time.monotonic()
            span_cm = (
                tracer.start_as_current_span(f"mcp.tool.{tool_name}")
                if tracer is not None
                else _NullSpan()
            )

            try:
                with span_cm as span:
                    if span is not None and hasattr(span, "set_attribute"):
                        span.set_attribute("mcp.tool_name", tool_name)
                        span.set_attribute("mcp.scope", required_scope)
                        span.set_attribute("mcp.rate_tier", rate_tier)
                        span.set_attribute("mcp.sub", principal.user_id)
                        span.set_attribute("mcp.tenant_id", principal.tenant_id)
                    result = await fn(*args, **kwargs)
            except Exception as exc:
                duration_ms = int((time.monotonic() - start) * 1000)
                logger.error(
                    "mcp.tool.errored",
                    extra={
                        "event": "mcp.tool.errored",
                        "tool_name": tool_name,
                        "duration_ms": duration_ms,
                        "error_type": type(exc).__name__,
                        "error_message": str(exc)[:200],
                    },
                )
                raise

            duration_ms = int((time.monotonic() - start) * 1000)
            logger.info(
                "mcp.tool.completed",
                extra={
                    "event": "mcp.tool.completed",
                    "tool_name": tool_name,
                    "duration_ms": duration_ms,
                    "cost_usd": cost_hint,
                },
            )
            return result

        # Preserve signature annotations for FastMCP's schema derivation.
        wrapper.__signature__ = inspect.signature(fn)  # type: ignore[attr-defined]
        return wrapper

    return decorator


class _NullSpan:
    """No-op context manager for environments without OpenTelemetry."""

    def __enter__(self):  # type: ignore[no-untyped-def]
        return None

    def __exit__(self, exc_type, exc, tb):  # type: ignore[no-untyped-def]
        return False


__all__ = ["tool_wrap"]
