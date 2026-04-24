"""Cross-worker cache invalidation via Redis pub/sub.

Producer
--------
:func:`publish_invalidation` publishes a JSON message onto the
``flag:invalidate`` channel with the affected flag names and a small
envelope (source, timestamp). Callers fire-and-forget: a pub/sub miss
degrades to the 10 s cache TTL.

Consumer
--------
:func:`start_invalidation_listener` launches a background asyncio task
that subscribes to ``flag:invalidate`` and for each message:

1. Purges the process-local ``flag:<name>:*`` Redis entries owned by
   this worker (via :func:`cache.invalidate_flag`). Cache entries are
   shared across workers via Redis so only ONE worker needs to do the
   SCAN + DEL, but SCAN is cheap and idempotent.
2. Refreshes the process-local bootstrap dict via
   :func:`service.refresh_bootstrap_flag` so sync consumers (Khronos
   rate-limit registration) see the new default.
3. Calls every registered subscriber callback. Consumer modules
   (e.g. :mod:`src.backend.middleware.rate_limit_mcp`) register here
   so they can refresh their own caches or re-register policies.

The listener is a long-lived task; the FastAPI lifespan cancels it on
shutdown. Tests bypass the listener and call the subscriber callbacks
directly.

Message shape
-------------
::

    {
        "flag_names": ["builder.live", "ma.daily_budget_usd"],
        "source": "admin_api",
        "emitted_at": "2026-04-24T18:05:00.000000+00:00"
    }

Unknown fields are ignored for forward-compat.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from datetime import datetime, timezone
from typing import Awaitable, Callable, Final

from src.backend.flags import cache as flag_cache
from src.backend.flags import service as flag_service
from src.backend.redis_client import get_redis_client

logger = logging.getLogger(__name__)

CHANNEL: Final[str] = "flag:invalidate"
"""Redis pub/sub channel. Do not rename; consumers subscribe by literal."""

Subscriber = Callable[[list[str], str], Awaitable[None]]
"""Callback signature: ``await callback(flag_names, source)``."""

_subscribers: list[Subscriber] = []
_listener_task: asyncio.Task[None] | None = None


def register_subscriber(callback: Subscriber) -> None:
    """Register a callback that fires on every invalidation message.

    Subscribers run in the listener task. Exceptions raised by a
    subscriber are caught + logged; they do NOT interrupt other
    subscribers or the listener loop.
    """

    _subscribers.append(callback)


def clear_subscribers() -> None:
    """Drop all registered subscribers. Tests use this to reset state."""

    _subscribers.clear()


async def publish_invalidation(
    flag_names: list[str],
    *,
    source: str = "admin_api",
) -> int:
    """Publish an invalidation message. Returns Redis PUBLISH receive count.

    ``source`` is a short tag describing which code path emitted the
    invalidation (``admin_api``, ``override_upsert``, ``ttl_sweep``,
    ``flag_create``, ``flag_update``, ``flag_delete``). Aids operator
    triage via Selene logs.
    """

    if not flag_names:
        return 0

    payload = json.dumps(
        {
            "flag_names": sorted(set(flag_names)),
            "source": source,
            "emitted_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    client = get_redis_client()
    try:
        receivers = await client.publish(CHANNEL, payload)
        logger.debug(
            "flags.invalidate.published flags=%s source=%s receivers=%d",
            flag_names,
            source,
            receivers,
        )
        return int(receivers)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("flags.invalidate.publish_failed err=%s", exc)
        return 0
    finally:
        await client.close()


async def start_invalidation_listener() -> asyncio.Task[None]:
    """Launch the pub/sub listener as a background task. Idempotent."""

    global _listener_task
    if _listener_task is not None and not _listener_task.done():
        return _listener_task

    _listener_task = asyncio.create_task(
        _listener_loop(), name="hemera.invalidation_listener"
    )
    return _listener_task


async def stop_invalidation_listener() -> None:
    """Cancel the listener task. Called from the FastAPI lifespan shutdown."""

    global _listener_task
    task = _listener_task
    _listener_task = None
    if task is None:
        return
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


async def _listener_loop() -> None:
    """Long-running listener. Reconnects on transient Redis errors."""

    backoff = 0.5
    while True:
        try:
            await _run_once()
            # _run_once only returns on graceful unsubscribe. Reset backoff.
            backoff = 0.5
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning(
                "flags.invalidate.listener_error err=%s backoff=%.2fs",
                exc,
                backoff,
            )
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30.0)


async def _run_once() -> None:
    """Subscribe + consume messages until the connection drops."""

    client = get_redis_client()
    pubsub = client.pubsub()
    try:
        await pubsub.subscribe(CHANNEL)
        logger.info("flags.invalidate.listener_subscribed channel=%s", CHANNEL)
        async for msg in pubsub.listen():
            if msg is None:
                continue
            if msg.get("type") != "message":
                continue
            raw = msg.get("data")
            await _dispatch(raw)
    finally:
        try:
            await pubsub.unsubscribe(CHANNEL)
        except Exception:  # pragma: no cover - defensive
            pass
        try:
            await pubsub.aclose()
        except AttributeError:  # pragma: no cover - older redis-py
            await pubsub.close()
        await client.close()


async def _dispatch(raw: object) -> None:
    """Decode a raw pub/sub payload and run the refresh + subscribers."""

    try:
        if isinstance(raw, (bytes, bytearray)):
            payload = json.loads(raw.decode("utf-8"))
        elif isinstance(raw, str):
            payload = json.loads(raw)
        else:
            logger.warning("flags.invalidate.unsupported_payload type=%s", type(raw))
            return
    except ValueError as exc:
        logger.warning("flags.invalidate.decode_failed err=%s raw=%r", exc, raw)
        return

    flag_names_raw = payload.get("flag_names", [])
    if not isinstance(flag_names_raw, list):
        logger.warning("flags.invalidate.bad_shape payload=%s", payload)
        return
    flag_names = [str(name) for name in flag_names_raw if name]
    source = str(payload.get("source", "unknown"))

    logger.debug(
        "flags.invalidate.received flags=%s source=%s", flag_names, source
    )

    for name in flag_names:
        try:
            await flag_cache.invalidate_flag(name)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("flags.invalidate.cache_purge_failed flag=%s err=%s", name, exc)
        try:
            await flag_service.refresh_bootstrap_flag(name)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("flags.invalidate.bootstrap_refresh_failed flag=%s err=%s", name, exc)

    for subscriber in list(_subscribers):
        try:
            await subscriber(flag_names, source)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning(
                "flags.invalidate.subscriber_failed subscriber=%s err=%s",
                getattr(subscriber, "__qualname__", repr(subscriber)),
                exc,
            )


__all__ = [
    "CHANNEL",
    "Subscriber",
    "clear_subscribers",
    "publish_invalidation",
    "register_subscriber",
    "start_invalidation_listener",
    "stop_invalidation_listener",
]
