"""Realtime lifespan helpers.

Owner: Nike (W2 NP P3 S1 + S2).

Aether's :func:`src.backend.main.lifespan` calls into
:func:`install_realtime` after the Redis pool is up and before the
application yields. Symmetric :func:`shutdown_realtime` runs during
shutdown. Keeping this in a sibling module avoids forcing
``main.py`` to import the full WebSocket stack at import time.

S2 additions
------------
The installer now ALSO wires the Kratos ticket verifier seam
(:func:`src.backend.ma.ticket_verifier.set_ticket_verifier`) with an
async closure backed by :func:`ticket_service.validate_ticket`. Kratos'
MA SSE path therefore flips from 503 ``service_unavailable`` to
authenticated-200 once this runs. The install happens inside the
Nike lifespan so the order stays well-defined: Redis pool up ->
ConnectionManager up -> Kratos verifier wired -> app yields.

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

from src.backend.ma.ticket_verifier import set_ticket_verifier
from src.backend.realtime.connection_manager import (
    ConnectionManager,
    get_connection_manager,
    set_connection_manager,
)
from src.backend.realtime.ticket_service import build_kratos_verifier
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

    # Wire the Kratos ticket verifier seam.
    #
    # We capture ``redis`` at install time via a resolver closure so
    # the verifier always sees the live handle (the lifespan swaps
    # the module-level pool in / out during test runs, and the
    # resolver picks up the swap without a re-install).
    if redis is not None:
        verifier = build_kratos_verifier(
            redis_resolver=lambda: get_redis_client(),
        )
        set_ticket_verifier(verifier)
        logger.info("realtime.lifespan.kratos_verifier_installed")
    else:
        # No Redis means revocation checks would fail-open trivially;
        # leave the previous verifier in place so unit tests that
        # install the dev HS256 path keep working.
        logger.info(
            "realtime.lifespan.kratos_verifier_skipped reason=no_redis"
        )

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
        # Still try to clear the Kratos seam so tests that re-use the
        # process do not inherit a stale verifier that points at a
        # torn-down Redis pool.
        try:
            set_ticket_verifier(None)
        except Exception:
            pass
        return
    try:
        await manager.stop()
    finally:
        set_connection_manager(None)
        try:
            set_ticket_verifier(None)
        except Exception:
            pass
        logger.info("realtime.lifespan.shutdown")


__all__ = ["install_realtime", "shutdown_realtime"]
