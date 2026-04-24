"""Process-wide Arq redis handle accessor.

Aether's W1 Session 2 lifespan hook calls :func:`set_arq_redis` with
the :class:`ArqRedis` instance returned by ``arq.create_pool``. Worker
task modules + request-time enqueuers read via :func:`get_arq_redis`.

Kept as a separate module (mirroring the asyncpg pool pattern at
``src/backend/db/pool.py``) so downstream agents can import without
triggering the full worker module import graph.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

_redis: Any | None = None


def set_arq_redis(handle: Any | None) -> None:
    """Install the process-wide Arq redis handle.

    Passing ``None`` tears it down on shutdown.
    """

    global _redis
    _redis = handle


def get_arq_redis() -> Any:
    """Return the installed handle or raise.

    Raises
    ------
    RuntimeError
        If the lifespan hook has not yet installed the handle. Callers
        that want graceful degrade should catch this and fall back to
        a no-op; see :func:`src.backend.email.send._enqueue_send` for
        the reference pattern.
    """

    if _redis is None:
        raise RuntimeError(
            "Arq redis handle not initialized. Ensure the FastAPI lifespan "
            "has completed startup before using "
            "src.backend.workers.arq_redis.get_arq_redis()."
        )
    return _redis


__all__ = ["get_arq_redis", "set_arq_redis"]
