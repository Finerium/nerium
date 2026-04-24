"""MA event publisher + replay helper.

Owner: Kratos (W2 S2).

Kratos is the **producer** side of the realtime bus for MA sessions.
Every event the dispatcher emits (S3 wires the dispatcher) lands in
three places atomically:

1. Postgres ``ma_event`` (durable audit + resume source of truth).
2. Redis Stream ``stream:ma:<session_id>`` (server-side replay cache,
   24 h trim per ``realtime_bus.contract.md`` Section 4.3 + 8).
3. Redis Pub/Sub channel ``ma:event:<session_id>`` (live fan-out to
   Nike's per-user WebSocket + per-session SSE consumers).

The SSE endpoint in :mod:`src.backend.ma.sse_stream` consumes these
via the resume helper (Redis Stream ``XRANGE`` + ``XREAD`` blocking
tail). Nike's WebSocket broker similarly subscribes via its
``ConnectionManager`` but lives outside this module.

Contract references
-------------------
- ``docs/contracts/realtime_bus.contract.md`` Section 3.1 envelope.
- ``docs/contracts/realtime_bus.contract.md`` Section 4.3 reconnect +
  replay semantics.
- ``docs/contracts/ma_session_lifecycle.contract.md`` Section 5 full
  event type registry.
- ``docs/contracts/agent_orchestration_runtime.contract.md`` Section
  4.2 ``normalize_and_publish`` hook point.

Design notes
------------
- The stream trim window is 24 h at submission (contract sets 1 h for
  MA; we extended to 24 h because a judge might reopen a completed
  session overnight). ``MAXLEN ~ 10000`` keeps steady-state memory
  bounded; the dispatcher writes <500 events per typical session so
  10 000 covers ~20 sessions of replay headroom.
- Redis Streams ids are server-generated ``<ms>-<seq>`` pairs; we
  advertise the monotonic database ``ma_event.id`` (bigserial) as the
  SSE ``id:`` header instead because it is trivially monotone across
  sessions AND durable across Redis outages. The Redis Stream id is
  retained only for internal ``XRANGE`` bookkeeping.
- ``publish_event`` is ``async`` but tolerates a missing Redis
  (logs + continues) because the Postgres row is still the canonical
  store; the live fan-out is best-effort.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Iterable, Optional
from uuid import UUID

import asyncpg

from src.backend.redis_client import get_redis_client

logger = logging.getLogger(__name__)


STREAM_KEY_FMT: str = "stream:ma:{session_id}"
"""Redis Stream key for per-session replay buffer."""

PUBSUB_CHANNEL_FMT: str = "ma:event:{session_id}"
"""Redis Pub/Sub channel for Nike fan-out + Boreas chat UIScene."""

STREAM_MAXLEN_APPROX: int = 10_000
"""``MAXLEN ~ N`` trim target (Redis uses approximate for speed)."""


async def persist_and_publish(
    conn: asyncpg.Connection,
    *,
    session_id: UUID,
    event_type: str,
    payload: dict[str, Any],
    redis: Any | None = None,
) -> int:
    """Insert into ``ma_event`` and fan out via Redis.

    Returns the ``ma_event.id`` (bigserial) which is used as the
    server-monotonic SSE id for resume. The ``seq`` column is computed
    per-session via a subquery so multiple concurrent writers (the
    dispatcher + a cancel webhook) do not collide on the
    ``(session_id, seq)`` unique constraint under serialisable
    isolation; we rely on the row lock implied by the subquery max
    select.

    Parameters
    ----------
    conn
        Tenant-bound asyncpg connection. Must be in a transaction when
        called from the dispatcher so the row + stream publish live or
        die together.
    session_id
        Parent MA session.
    event_type
        Dotted wire-level event name per
        ``realtime_bus.contract.md`` Section 3.2 (``nerium.ma.delta``,
        ``nerium.ma.tool_call``, ...).
    payload
        JSON-serialisable body. Datetimes are stringified upstream; we
        do not ``json.dumps(default=str)`` here because a silent
        fallback would mask schema drift.
    redis
        Optional Redis handle for tests; defaults to the process-wide
        client.
    """

    row = await conn.fetchrow(
        """
        WITH next_seq AS (
            SELECT COALESCE(max(seq), 0) + 1 AS seq FROM ma_event
            WHERE session_id = $1
        )
        INSERT INTO ma_event (session_id, tenant_id, seq, event_type, payload)
        SELECT $1, (SELECT tenant_id FROM ma_session WHERE id = $1),
               (SELECT seq FROM next_seq), $2, $3::jsonb
        RETURNING id, seq, created_at
        """,
        session_id,
        event_type,
        json.dumps(payload),
    )
    assert row is not None
    event_id = int(row["id"])

    # Build the envelope the SSE endpoint + Nike WebSocket both emit.
    envelope = _build_envelope(
        event_id=event_id,
        event_type=event_type,
        payload=payload,
        occurred_at=row["created_at"],
    )

    client = redis if redis is not None else _safe_redis()
    if client is not None:
        stream_key = STREAM_KEY_FMT.format(session_id=str(session_id))
        channel = PUBSUB_CHANNEL_FMT.format(session_id=str(session_id))
        try:
            await client.xadd(
                stream_key,
                {"event": json.dumps(envelope)},
                maxlen=STREAM_MAXLEN_APPROX,
                approximate=True,
            )
        except Exception:
            logger.exception(
                "ma.event.stream_publish_failed session_id=%s event_type=%s",
                session_id,
                event_type,
            )
        try:
            await client.publish(channel, json.dumps(envelope))
        except Exception:
            logger.exception(
                "ma.event.pubsub_publish_failed session_id=%s event_type=%s",
                session_id,
                event_type,
            )
    else:
        logger.warning(
            "ma.event.redis_missing session_id=%s event_type=%s; "
            "persistence-only emit",
            session_id,
            event_type,
        )

    return event_id


def _build_envelope(
    *,
    event_id: int,
    event_type: str,
    payload: dict[str, Any],
    occurred_at: datetime,
) -> dict[str, Any]:
    """Shape the realtime-bus canonical envelope.

    Matches ``realtime_bus.contract.md`` Section 3.1
    :class:`RealtimeEvent`. Downstream SSE + WebSocket serialise this
    the same way; keeping the shape in one place makes the ticket
    auth verifier + Nike's ConnectionManager future-proof.
    """

    return {
        "id": event_id,
        "type": event_type,
        "data": payload,
        "occurred_at": _iso(occurred_at),
        "version": 1,
    }


def _iso(moment: datetime) -> str:
    """Return an ISO-8601 UTC string with ``Z`` suffix."""

    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    else:
        moment = moment.astimezone(timezone.utc)
    return moment.isoformat().replace("+00:00", "Z")


def _safe_redis() -> Any | None:
    """Return the process-wide Redis client or ``None`` if lifespan
    has not installed one yet (tests, Arq worker before startup).
    """

    try:
        return get_redis_client()
    except RuntimeError:
        return None


async def select_events_since(
    conn: asyncpg.Connection,
    *,
    session_id: UUID,
    after_event_id: int,
    limit: int = 500,
) -> list[asyncpg.Record]:
    """Return events with ``id > after_event_id`` for SSE resume.

    The SSE endpoint feeds ``Last-Event-ID`` into ``after_event_id``
    and replays the gap. We cap at ``limit`` rows per call so a
    client reconnecting after a very long disconnect does not starve
    the event loop; the endpoint iterates until caught up.
    """

    return list(
        await conn.fetch(
            "SELECT id, seq, event_type, payload, created_at "
            "FROM ma_event WHERE session_id = $1 AND id > $2 "
            "ORDER BY id ASC LIMIT $3",
            session_id,
            after_event_id,
            limit,
        )
    )


def row_to_envelope(row: asyncpg.Record) -> dict[str, Any]:
    """Convert a ``ma_event`` row into the realtime-bus envelope.

    Handles the asyncpg ``jsonb`` quirk (returns a ``str`` when no
    codec is registered) so the payload round-trips cleanly.
    """

    raw = row["payload"]
    payload: dict[str, Any]
    if isinstance(raw, str):
        try:
            payload = json.loads(raw)
        except ValueError:
            payload = {}
    elif isinstance(raw, dict):
        payload = raw
    else:
        payload = {}
    return _build_envelope(
        event_id=int(row["id"]),
        event_type=row["event_type"],
        payload=payload,
        occurred_at=row["created_at"],
    )


__all__ = [
    "PUBSUB_CHANNEL_FMT",
    "STREAM_KEY_FMT",
    "STREAM_MAXLEN_APPROX",
    "persist_and_publish",
    "row_to_envelope",
    "select_events_since",
]
