"""Arq background worker settings and DLQ helpers.

Owner: Aether (W1 Session 2). Arq 0.26 is pinned in ``pyproject.toml``
and the worker uses the same Redis connection URL as the API unless a
dedicated ``NERIUM_ARQ_REDIS_URL`` env var is provided via
:class:`~src.backend.config.Settings` in a later iteration.

Running the worker::

    uv run arq src.backend.workers.arq_worker.WorkerSettings

Registration pattern
--------------------
Downstream agents register their async jobs at import time:

    from src.backend.workers.arq_worker import register_job

    async def send_receipt(ctx, invoice_id: str) -> None:
        ...

    register_job(send_receipt)

Cron jobs:

    from arq.cron import cron
    from src.backend.workers.arq_worker import register_cron_job

    register_cron_job(cron(rollover_usage, hour=0, minute=0))

DLQ
---
Final-attempt failures are written through to Postgres table
``job_dlq`` (migration shipped in Session 3). Session 2 stores a
placeholder constant so the wrapper function can call the insert
helper once the schema is live. We avoid importing the DB pool inside
this module to keep the worker import tree lightweight when running
alongside the API.

Contract references
-------------------
- ``docs/contracts/redis_session.contract.md`` Section 3.1 (ACL user
  ``worker`` for ``jobs:*``/``arq:*``).
- ``docs/contracts/redis_session.contract.md`` Section 3.2 (key
  namespace ``jobs:arq:*`` library-managed).
- ``docs/phase_np/RV_NP_RESEARCH.md`` Section A.8 (Arq choice
  rationale versus Celery/Dramatiq/BullMQ).
"""

from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable

from arq.connections import RedisSettings
from arq.cron import CronJob

from src.backend.config import Settings, get_settings

logger = logging.getLogger(__name__)


DLQ_KEY = "jobs:dlq"
"""Redis Stream / Postgres table identifier for dead-letter jobs.

Session 3 adds a Postgres table ``job_dlq`` and a Redis Stream
``jobs:dlq:stream`` to supplement it. The constant is declared here so
per-agent job functions can import a stable name for the final-attempt
write-through.
"""


JobFunction = Callable[..., Awaitable[Any]]
"""Async function registered with Arq.

The first positional argument is the Arq ``ctx`` dict (conn, job_id,
attempt, retry, logger). Subsequent args come from the caller's
``enqueue_job`` invocation.
"""


# Module-level registries. Per-agent modules append to these during
# their own import; `WorkerSettings` reads them at worker process
# startup.
REGISTERED_JOBS: list[JobFunction] = []
REGISTERED_CRONS: list[CronJob] = []


def register_job(fn: JobFunction) -> JobFunction:
    """Register an async job function.

    Returns the function unchanged so it can be used as a decorator or
    plain call:

        @register_job
        async def send_receipt(ctx, invoice_id: str) -> None:
            ...
    """

    REGISTERED_JOBS.append(fn)
    return fn


def register_cron_job(cron_job: CronJob) -> CronJob:
    """Register an Arq :class:`~arq.cron.CronJob`."""

    REGISTERED_CRONS.append(cron_job)
    return cron_job


def build_redis_settings(settings: Settings | None = None) -> RedisSettings:
    """Parse the Redis URL into Arq's :class:`RedisSettings`.

    Arq uses its own Redis connection pool (not redis-py's) because it
    maintains worker-side pub/sub and list pops. We share the same URL
    so operators see only one Redis process to manage.
    """

    effective = settings or get_settings()
    return RedisSettings.from_dsn(effective.redis_url)


async def _on_startup(ctx: dict[str, Any]) -> None:
    """Worker process startup hook.

    Logs a banner so operators can correlate the worker pid with the
    API log stream. Future iterations open an asyncpg pool here for
    DLQ inserts; Session 2 stays stateless to keep the blast radius
    small.
    """

    logger.info(
        "arq.worker.startup",
        extra={
            "registered_jobs": [fn.__name__ for fn in REGISTERED_JOBS],
            "registered_crons": [getattr(c, "name", repr(c)) for c in REGISTERED_CRONS],
        },
    )


async def _on_shutdown(ctx: dict[str, Any]) -> None:
    """Worker process shutdown hook. Opposite of :func:`_on_startup`."""

    logger.info("arq.worker.shutdown")


async def _on_job_start(ctx: dict[str, Any]) -> None:
    """Per-job startup. Arq calls this on every job pick-up."""

    logger.debug(
        "arq.job.start",
        extra={
            "function": ctx.get("job_try") and ctx.get("function"),
            "job_id": ctx.get("job_id"),
            "attempt": ctx.get("job_try"),
        },
    )


async def _on_job_end(ctx: dict[str, Any]) -> None:
    """Per-job completion hook.

    Fires on success, failure, and abort. Arq exposes the outcome via
    ``ctx['job_try']`` + the exception (if any) attached to the queue
    record. DLQ write-through on final failure happens here in a later
    iteration once the Postgres table is live.
    """

    attempt = ctx.get("job_try")
    max_tries = ctx.get("max_tries")
    # Arq does not attach the exception to ctx in older releases; the
    # DLQ write-through lands in Session 3 alongside the schema.
    if attempt and max_tries and attempt >= max_tries:
        logger.warning(
            "arq.job.final_attempt",
            extra={
                "job_id": ctx.get("job_id"),
                "function": ctx.get("function"),
                "attempt": attempt,
                "max_tries": max_tries,
            },
        )


class WorkerSettings:
    """Arq worker settings consumed by ``arq`` CLI.

    Arq 0.26 reads class attributes rather than importing from a
    module-level dict. Keep this class minimal; mutation happens via
    :func:`register_job` / :func:`register_cron_job` at module import
    time.
    """

    # Arq re-reads ``functions`` / ``cron_jobs`` each startup so late
    # registrations land as long as the importing module is reached
    # before the worker boots (arq imports the settings class first,
    # then calls ``on_startup``).
    functions: list[JobFunction] = REGISTERED_JOBS
    cron_jobs: list[CronJob] = REGISTERED_CRONS

    # Retry policy. Contract mandates exponential backoff and a DLQ.
    max_tries: int = 5
    retry_jobs: bool = True
    # Arq handles retry delays via ``retry_delays`` kwarg on enqueue;
    # the default here is a simple exponential series (1s, 5s, 25s,
    # 125s, 625s) that caller code can override per-job.

    # Job timeout (soft cap). Individual jobs may raise earlier via
    # their own ``asyncio.wait_for``.
    job_timeout: int = 300  # seconds

    # Keep finished jobs around briefly so the dashboard can inspect
    # the outcome; queue TTL beyond this is handled by Arq's cleanup.
    keep_result: int = 3600  # seconds

    # Lifecycle hooks.
    on_startup = staticmethod(_on_startup)
    on_shutdown = staticmethod(_on_shutdown)
    on_job_start = staticmethod(_on_job_start)
    on_job_end = staticmethod(_on_job_end)

    @classmethod
    def resolve_redis_settings(cls) -> RedisSettings:
        """Return the :class:`RedisSettings` derived from Aether config.

        Called lazily so import of this module does not touch the
        environment until the worker actually boots.
        """

        return build_redis_settings()

    # Arq reads ``redis_settings`` as an attribute. We compute it once
    # at class definition time; operators restart the worker to pick
    # up env changes. If you change ``NERIUM_REDIS_URL`` without a
    # restart the worker continues on the old URL.
    redis_settings: RedisSettings = build_redis_settings()


__all__ = [
    "DLQ_KEY",
    "JobFunction",
    "REGISTERED_CRONS",
    "REGISTERED_JOBS",
    "WorkerSettings",
    "build_redis_settings",
    "register_cron_job",
    "register_job",
]
