"""Cursor pagination primitives.

Owner: Aether (W1 Session 2). Per ``docs/contracts/rest_api_base.contract.md``
Section 3.3 all list endpoints paginate via opaque base64 JSON cursors.
Clients MUST NOT decode or synthesise cursors; they only round-trip the
value between responses and subsequent requests.

Wire format::

    {
      "v": 1,            # schema version, rejects forward-incompatible
      "ts": "2026-04-24T18:30:00.000Z",  # created_at iso8601, UTC
      "id": "01926f12-...",               # UUID v7 tiebreaker
      "dir": "next" | "prev"              # direction requested
    }

Encoded with URL-safe base64 (no ``=`` padding) so it fits in query
parameters unescaped. The payload is deliberately small; additional
fields may be added in a future schema version (v2) and consumers
MUST fall back gracefully when they receive a version they do not
understand (return 400 ``validation_failed`` with a descriptive slug).

Keyset pagination semantics
---------------------------

Primary ordering is ``created_at DESC`` with ``id DESC`` as a
tiebreaker. ``id`` is UUID v7 so it embeds the creation timestamp
too; when two rows share the same ``created_at`` we still get a
deterministic order. :func:`keyset_where_clause` emits a WHERE
fragment plus parameter values that callers splice into parametrised
asyncpg queries.

No ORM. The helpers assume consumer code owns the SQL string and only
need a validated fragment + bind values.
"""

from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from enum import StrEnum
from typing import Annotated, Any, Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

CURSOR_SCHEMA_VERSION: int = 1
"""Payload schema version. Bump when the wire format changes."""

DEFAULT_LIMIT: int = 25
MAX_LIMIT: int = 100
MIN_LIMIT: int = 1

ItemT = TypeVar("ItemT")


class CursorDirection(StrEnum):
    """Paging direction sentinel.

    ``next`` asks for rows strictly after the cursor point in the
    default DESC order (older rows). ``prev`` asks for rows strictly
    before, used to walk backwards. Most clients only use ``next``; the
    ``prev`` branch exists so bidirectional UIs (infinite scroll with
    scroll-up) stay first-class.
    """

    NEXT = "next"
    PREV = "prev"


class CursorPayload(BaseModel):
    """Decoded cursor state.

    The field names are deliberately terse (``v``, ``ts``, ``id``,
    ``dir``) so the JSON blob fits inside a short base64 string. Clients
    MUST treat the entire cursor as opaque; these names are internal.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    v: int = Field(
        default=CURSOR_SCHEMA_VERSION,
        description="Schema version. Payloads with v != 1 are rejected.",
    )
    ts: datetime = Field(
        description="created_at boundary (ISO-8601 UTC). Rows on the requested "
        "side of this boundary are returned."
    )
    id: UUID = Field(
        description="UUID v7 tiebreaker. Ensures deterministic ordering when "
        "two rows share the same created_at timestamp."
    )
    dir: CursorDirection = Field(
        default=CursorDirection.NEXT,
        description="Paging direction. 'next' walks older rows, 'prev' newer.",
    )

    @field_validator("v")
    @classmethod
    def _reject_unknown_version(cls, v: int) -> int:
        if v != CURSOR_SCHEMA_VERSION:
            raise ValueError(
                f"Unsupported cursor schema version {v}; expected {CURSOR_SCHEMA_VERSION}."
            )
        return v

    @field_validator("ts")
    @classmethod
    def _normalise_tz(cls, ts: datetime) -> datetime:
        if ts.tzinfo is None:
            return ts.replace(tzinfo=timezone.utc)
        return ts.astimezone(timezone.utc)


def encode_cursor(payload: CursorPayload | dict[str, Any]) -> str:
    """Encode a :class:`CursorPayload` (or compatible dict) as an opaque
    URL-safe base64 string.

    Equal-sign padding is stripped per RFC 7515 Section 2 so the token
    round-trips through query parameters without URL escape.
    """

    if not isinstance(payload, CursorPayload):
        payload = CursorPayload.model_validate(payload)
    raw = json.dumps(
        {
            "v": payload.v,
            "ts": payload.ts.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "id": str(payload.id),
            "dir": payload.dir.value,
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    token = base64.urlsafe_b64encode(raw).rstrip(b"=")
    return token.decode("ascii")


def decode_cursor(cursor: str) -> CursorPayload:
    """Decode an opaque cursor back into a validated :class:`CursorPayload`.

    Raises
    ------
    ValueError
        If the cursor is malformed, was encoded with a future schema
        version, or otherwise fails pydantic validation. Callers are
        expected to convert this into a problem+json ``validation_failed``
        response.
    """

    if not cursor or not isinstance(cursor, str):
        raise ValueError("cursor must be a non-empty string")
    padding = "=" * (-len(cursor) % 4)
    try:
        raw = base64.urlsafe_b64decode(cursor + padding)
    except (ValueError, TypeError) as exc:
        raise ValueError("cursor is not valid base64") from exc
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("cursor payload is not valid JSON") from exc
    if not isinstance(parsed, dict):
        raise ValueError("cursor payload must be a JSON object")
    return CursorPayload.model_validate(parsed)


class CursorPaginationParams(BaseModel):
    """Query string inputs common to every list endpoint.

    Pydantic model rather than a FastAPI ``Query`` bundle so per-pillar
    routers can compose the model into their own dependency without
    losing the ``limit`` clamp.
    """

    model_config = ConfigDict(extra="forbid")

    limit: Annotated[int, Field(ge=MIN_LIMIT, le=MAX_LIMIT)] = DEFAULT_LIMIT
    cursor: str | None = Field(
        default=None,
        description="Opaque cursor returned by the previous page. Omit for page 1.",
    )

    def decoded(self) -> CursorPayload | None:
        """Return the decoded payload or ``None`` when there is no cursor."""

        if not self.cursor:
            return None
        return decode_cursor(self.cursor)


class CursorPage(BaseModel, Generic[ItemT]):
    """Envelope returned by every paginated list endpoint.

    Generic over the item type so per-pillar routers can declare
    ``CursorPage[MarketplaceListing]`` etc. for OpenAPI fidelity.
    """

    model_config = ConfigDict(extra="forbid")

    items: list[ItemT] = Field(
        default_factory=list,
        description="Page of rows. Ordered newest-first by created_at, id DESC.",
    )
    next_cursor: str | None = Field(
        default=None,
        description="Opaque cursor to pass as ?cursor=... for the next page. "
        "Null when the caller reached the end of the collection.",
    )
    has_more: bool = Field(
        default=False,
        description="True iff another page exists after this one.",
    )


def keyset_where_clause(
    payload: CursorPayload | None,
    *,
    ts_column: str = "created_at",
    id_column: str = "id",
    start_placeholder: int = 1,
) -> tuple[str, list[Any]]:
    """Build a keyset WHERE fragment for the given cursor.

    Emits a SQL-safe fragment such as
    ``(created_at, id) < ($1, $2)`` for DESC pagination and returns the
    corresponding bind values so the caller can splice them into a
    parametrised asyncpg query.

    Parameters
    ----------
    payload
        Decoded cursor or ``None`` for page 1 (returns empty fragment).
    ts_column
        Timestamp column name. Callers MUST pass a value they control
        (no user input); the helper inlines it into SQL.
    id_column
        UUID v7 tiebreaker column name.
    start_placeholder
        First ``$N`` index to use. Callers who already built WHERE
        fragments increment past their existing binds.

    Returns
    -------
    tuple[str, list[Any]]
        (fragment, binds). Fragment is empty string when ``payload`` is
        ``None``; binds is ``[]`` to match.

    Notes
    -----
    The emitted fragment assumes the outer query orders rows as
    ``ORDER BY <ts> DESC, <id> DESC``. For ascending pagination swap
    ``<`` to ``>`` in consumer code or extend this helper.
    """

    if payload is None:
        return "", []

    if payload.dir == CursorDirection.NEXT:
        operator = "<"
    else:
        operator = ">"

    ts_ph = f"${start_placeholder}"
    id_ph = f"${start_placeholder + 1}"
    fragment = f"({ts_column}, {id_column}) {operator} ({ts_ph}, {id_ph})"
    return fragment, [payload.ts, payload.id]


__all__ = [
    "CURSOR_SCHEMA_VERSION",
    "DEFAULT_LIMIT",
    "MAX_LIMIT",
    "MIN_LIMIT",
    "CursorDirection",
    "CursorPage",
    "CursorPaginationParams",
    "CursorPayload",
    "decode_cursor",
    "encode_cursor",
    "keyset_where_clause",
]
