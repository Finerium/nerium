"""Realtime connection lifecycle audit (S1).

Owner: Nike (W2 NP P3 S1).

Connect / disconnect / timeout / error events on the WebSocket layer
flow through here so Selene can answer "who connected when, for how
long, and why did the connection close" questions during the demo and
post-hackathon postmortems.

Two write paths
---------------
1. Best-effort enqueue an Arq job ``realtime.audit.connection_event``
   that persists a row into the ``realtime_connection_audit`` table
   (created in migration ``045_realtime_connection_audit``). Arq is the
   right transport because the audit row is non-critical: the
   WebSocket close path must never block on a DB write.
2. Structured log event so Selene's existing log shipping picks it up
   even when Arq is unavailable (dev shells, fresh test environments).

If the Arq handle is missing (lifespan not yet ready, dev shell without
``arq`` installed, test fixture without a fake Arq) the enqueue is a
no-op with a warning log; the structured log line still fires so the
event is observable.

Contract references
-------------------
- ``docs/contracts/realtime_bus.contract.md`` Section 5 lifecycle events.
- ``docs/contracts/observability.contract.md`` Section 9 event names.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from src.backend.realtime.events import ConnectionLifecycleEvent
from src.backend.workers.arq_redis import get_arq_redis

logger = logging.getLogger(__name__)


ARQ_JOB_NAME: str = "realtime.audit.connection_event"
"""Arq job function name. Worker registers via :func:`register_audit_worker`."""


async def emit_lifecycle(event: ConnectionLifecycleEvent) -> None:
    """Persist + log a single connection lifecycle event.

    Always emits a structured log line (Selene captures via the JSON
    handler). The Arq enqueue is best-effort; failures are logged but
    swallowed so the WebSocket close path never raises.
    """

    log_extra = {
        "tenant_id": event.tenant_id,
        "user_id": event.user_id,
        "connection_id": event.connection_id,
        "event_type": event.event_type,
        "reason": event.reason,
    }
    logger.info(
        "realtime.ws.%s",
        event.event_type,
        extra=log_extra,
    )
    await _enqueue(event)


async def _enqueue(event: ConnectionLifecycleEvent) -> None:
    """Best-effort Arq enqueue. Swallows + logs every failure shape."""

    try:
        redis = get_arq_redis()
    except RuntimeError:
        # Lifespan not ready (tests without a fake_arq fixture). The
        # log line above already records the event; the audit row is
        # non-critical so we move on.
        return

    try:
        await redis.enqueue_job(
            ARQ_JOB_NAME,
            payload=_serialise(event),
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "realtime.audit.enqueue_failed event_type=%s err=%s",
            event.event_type,
            exc,
        )


def _serialise(event: ConnectionLifecycleEvent) -> str:
    """Serialise the event for Arq transit. JSON for portability."""

    return json.dumps(
        {
            "tenant_id": event.tenant_id,
            "user_id": event.user_id,
            "connection_id": event.connection_id,
            "event_type": event.event_type,
            "reason": event.reason,
            "metadata": event.metadata,
        },
        separators=(",", ":"),
    )


# ---------------------------------------------------------------------------
# Worker side (registers with Arq via WorkerSettings.functions)
# ---------------------------------------------------------------------------


async def realtime_audit_connection_event(
    ctx: dict[str, Any],
    payload: str,
) -> dict[str, Optional[str]]:
    """Arq worker entry point. Persists the audit row.

    Imported lazily by :mod:`src.backend.realtime.audit_jobs` so the
    Arq worker process picks it up via the central registry without
    forcing the API process to import asyncpg helpers it does not need
    at request time.
    """

    from src.backend.db.pool import get_pool
    from src.backend.utils.uuid7 import uuid7

    raw = json.loads(payload)
    audit_id = str(uuid7())

    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                INSERT INTO realtime_connection_audit (
                    id,
                    tenant_id,
                    user_id,
                    connection_id,
                    event_type,
                    reason,
                    metadata
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
                """,
                audit_id,
                raw["tenant_id"],
                raw["user_id"],
                raw["connection_id"],
                raw["event_type"],
                raw.get("reason"),
                json.dumps(raw.get("metadata") or {}),
            )

    return {"audit_id": audit_id, "event_type": raw["event_type"]}


__all__ = [
    "ARQ_JOB_NAME",
    "emit_lifecycle",
    "realtime_audit_connection_event",
]
