"""Realtime lifespan helpers.

Owner: Nike (W2 NP P3 S1).

Aether's :func:`src.backend.main.lifespan` calls into
:func:`install_realtime` after the Redis pool is up and before the
application yields. Symmetric :func:`shutdown_realtime` runs during
shutdown. Keeping this in a sibling module avoids forcing
``main.py`` to import the full WebSocket stack at import time.

Usage::

    from src.backend.realtime.lifespan import install_realtime, shutdown_realtime

    async with lifespan(app):
        await install_realtime()
        try:
            yield
        finally:
            await shutdown_realtime()
"""

from __future__ import annotations

import logging
from typing import Any

from src.backend.realtime.connection_manager import (
    ConnectionManager,
    get_connection_manager,
    set_connection_manager,
)
from src.backend.redis_client import get_redis_client

logger = logging.getLogger(__name__)


async def install_realtime() -> ConnectionManager:
    """Construct + install the process-wide ConnectionManager.

    Returns the live manager for tests that want a direct handle. If
    the Redis client is not yet installed the manager is still created
    but cross-worker fan-out + replay are no-ops (single-process tests).
    """

    redis: Any | None
    try:
        redis = get_redis_client()
    except RuntimeError:
        redis = None

    manager = ConnectionManager(redis=redis)
    set_connection_manager(manager)
    await manager.start()
    logger.info(
        "realtime.lifespan.install redis=%s",
        "up" if redis is not None else "off",
    )
    return manager


async def shutdown_realtime() -> None:
    """Stop the manager + clear the process accessor.

    Idempotent: if ``install_realtime`` did not run we silently return.
    """

    try:
        manager = get_connection_manager()
    except RuntimeError:
        return
    try:
        await manager.stop()
    finally:
        set_connection_manager(None)
        logger.info("realtime.lifespan.shutdown")


__all__ = ["install_realtime", "shutdown_realtime"]
