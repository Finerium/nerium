"""Realtime envelope shapes + WebSocket close-code constants.

Owner: Nike (W2 NP P3 S1).

Mirrors the Pythia-v3 contract envelope at
``docs/contracts/realtime_bus.contract.md`` Section 3.1. Kratos has its
own MA-specific envelope builder in :mod:`src.backend.ma.event_bus` that
emits the same shape; this module is the canonical generic source the
ConnectionManager + WebSocket server consume directly.

The envelope is JSON-serialisable with ``json.dumps`` (no datetime
shenanigans) so the same payload travels over the WebSocket text frame
verbatim and lands in the Redis pub/sub channel without re-encoding.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable, Literal

# ---------------------------------------------------------------------------
# Wire envelope
# ---------------------------------------------------------------------------


REALTIME_ENVELOPE_VERSION: int = 1
"""Envelope schema version per contract Section 3.1."""


@dataclass(frozen=True)
class RealtimeEvent:
    """Generic realtime envelope.

    Notes
    -----
    - ``id`` is server-monotonic. The ConnectionManager assigns ids
      from the Redis Stream ``XADD`` reply when an event is fanned out
      so reconnection resume can replay from a known checkpoint.
    - ``occurred_at`` is an ISO-8601 UTC string with a ``Z`` suffix to
      match what Kratos emits on the MA SSE side.
    - ``data`` is intentionally typed as ``dict[str, Any]`` not a
      pydantic model: Nike is generic infrastructure and downstream
      pillars (Kratos, Iapetus, Plutus, Moros, Hemera) own their own
      payload schemas.
    """

    id: int
    type: str
    data: dict[str, Any]
    occurred_at: str
    version: int = REALTIME_ENVELOPE_VERSION

    def as_dict(self) -> dict[str, Any]:
        """Return the JSON-ready dictionary used by both transports."""

        return {
            "id": self.id,
            "type": self.type,
            "data": self.data,
            "occurred_at": self.occurred_at,
            "version": self.version,
        }

    def to_json(self) -> str:
        """Compact JSON encoding suitable for WebSocket text frames."""

        return json.dumps(self.as_dict(), separators=(",", ":"))


def now_iso_utc() -> str:
    """Return the current UTC time as ISO-8601 with a ``Z`` suffix."""

    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def build_event(
    *,
    event_id: int,
    event_type: str,
    data: dict[str, Any],
    occurred_at: str | None = None,
) -> RealtimeEvent:
    """Construct a :class:`RealtimeEvent` with default timestamping."""

    return RealtimeEvent(
        id=event_id,
        type=event_type,
        data=data,
        occurred_at=occurred_at or now_iso_utc(),
        version=REALTIME_ENVELOPE_VERSION,
    )


# ---------------------------------------------------------------------------
# WebSocket protocol frames
# ---------------------------------------------------------------------------
#
# Server-to-client and client-to-server frames share an ``op`` discriminator.
# These constants are referenced by both the ws_server and the heartbeat
# task to keep the wire vocabulary in one place.

WS_OP_PING: Literal["ping"] = "ping"
WS_OP_PONG: Literal["pong"] = "pong"
WS_OP_SUBSCRIBE: Literal["subscribe"] = "subscribe"
WS_OP_UNSUBSCRIBE: Literal["unsubscribe"] = "unsubscribe"
WS_OP_RESUME: Literal["resume"] = "resume"
WS_OP_EVENT: Literal["event"] = "event"
WS_OP_WELCOME: Literal["welcome"] = "welcome"
WS_OP_ERROR: Literal["error"] = "error"
WS_OP_SUBSCRIBE_ACK: Literal["subscribe_ack"] = "subscribe_ack"
WS_OP_UNSUBSCRIBE_ACK: Literal["unsubscribe_ack"] = "unsubscribe_ack"
WS_OP_RESUME_ACK: Literal["resume_ack"] = "resume_ack"
WS_OP_RESUME_TRUNCATED: Literal["resume_truncated"] = "resume_truncated"


# ---------------------------------------------------------------------------
# WebSocket close codes
# ---------------------------------------------------------------------------
#
# RFC 6455 reserves 1000-2999 for protocol-level use; application close
# codes start at 4000. Per ``realtime_bus.contract.md`` Section 8 +
# the spawn directive, we use the 4000 + 4400 series with descriptive
# reason strings. Reasons are short ASCII tokens; clients map them to
# human-friendly copy on their end.


class CloseCode:
    """WebSocket close-code constants used by Nike."""

    # Protocol-level.
    NORMAL = 1000
    GOING_AWAY = 1001
    POLICY_VIOLATION = 1008
    INTERNAL_ERROR = 1011

    # Application.
    TENANT_SUSPENDED = 4001
    QUOTA_EXCEEDED = 4002
    SLOW_CONSUMER = 4408
    TICKET_INVALID = 4401
    TICKET_REUSED = 4429
    HEARTBEAT_TIMEOUT = 4001  # alias surfaced via reason string


CLOSE_REASON_TICKET_MISSING: str = "ticket_missing"
CLOSE_REASON_TICKET_INVALID: str = "ticket_invalid"
CLOSE_REASON_TICKET_EXPIRED: str = "ticket_expired"
CLOSE_REASON_TICKET_WRONG_AUDIENCE: str = "wrong_audience"
CLOSE_REASON_TICKET_REUSED: str = "ticket_reused"
CLOSE_REASON_TENANT_SUSPENDED: str = "tenant_suspended"
CLOSE_REASON_QUOTA_EXCEEDED: str = "too_many_connections"
CLOSE_REASON_HEARTBEAT_TIMEOUT: str = "heartbeat_timeout"
CLOSE_REASON_IDLE_TIMEOUT: str = "idle_timeout"
CLOSE_REASON_SLOW_CONSUMER: str = "slow_consumer"
CLOSE_REASON_INTERNAL_ERROR: str = "server_error"
CLOSE_REASON_CLIENT_GOODBYE: str = "client_goodbye"


# ---------------------------------------------------------------------------
# Lifecycle event taxonomy (Selene observability surface)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ConnectionLifecycleEvent:
    """Structured lifecycle record persisted via Arq into Postgres."""

    tenant_id: str
    user_id: str
    connection_id: str
    event_type: Literal["connect", "disconnect", "timeout", "error"]
    reason: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Subscription helpers
# ---------------------------------------------------------------------------


def normalise_resource_key(value: str) -> str:
    """Normalise a resource key for use in the subscription index.

    Resource keys take the shape ``<scope>:<id>`` per contract Section 7;
    we lower-case the scope, strip whitespace, and reject embedded
    whitespace so the room registry stays simple to debug.
    """

    if not isinstance(value, str):
        raise ValueError("resource key must be a string")
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("resource key must not be empty")
    if any(ch.isspace() for ch in cleaned):
        raise ValueError("resource key must not contain whitespace")
    if ":" not in cleaned:
        raise ValueError(
            "resource key must follow '<scope>:<id>' shape, "
            f"got {cleaned!r}"
        )
    scope, _, ident = cleaned.partition(":")
    if not scope or not ident:
        raise ValueError(
            "resource key must have non-empty scope + id, "
            f"got {cleaned!r}"
        )
    return f"{scope.lower()}:{ident}"


def iter_resource_keys(values: Iterable[str]) -> list[str]:
    """Normalise a batch of resource keys, dedupe while preserving order."""

    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        key = normalise_resource_key(value)
        if key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


__all__ = [
    "CLOSE_REASON_CLIENT_GOODBYE",
    "CLOSE_REASON_HEARTBEAT_TIMEOUT",
    "CLOSE_REASON_IDLE_TIMEOUT",
    "CLOSE_REASON_INTERNAL_ERROR",
    "CLOSE_REASON_QUOTA_EXCEEDED",
    "CLOSE_REASON_SLOW_CONSUMER",
    "CLOSE_REASON_TENANT_SUSPENDED",
    "CLOSE_REASON_TICKET_EXPIRED",
    "CLOSE_REASON_TICKET_INVALID",
    "CLOSE_REASON_TICKET_MISSING",
    "CLOSE_REASON_TICKET_REUSED",
    "CLOSE_REASON_TICKET_WRONG_AUDIENCE",
    "CloseCode",
    "ConnectionLifecycleEvent",
    "REALTIME_ENVELOPE_VERSION",
    "RealtimeEvent",
    "WS_OP_ERROR",
    "WS_OP_EVENT",
    "WS_OP_PING",
    "WS_OP_PONG",
    "WS_OP_RESUME",
    "WS_OP_RESUME_ACK",
    "WS_OP_RESUME_TRUNCATED",
    "WS_OP_SUBSCRIBE",
    "WS_OP_SUBSCRIBE_ACK",
    "WS_OP_UNSUBSCRIBE",
    "WS_OP_UNSUBSCRIBE_ACK",
    "WS_OP_WELCOME",
    "build_event",
    "iter_resource_keys",
    "normalise_resource_key",
    "now_iso_utc",
]
