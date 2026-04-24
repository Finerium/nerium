"""Read-side helpers for the audit trail.

Writes happen server-side inside the trigger functions defined in
``025_hemera_flags.py`` and are not exposed from Python. This module
only surfaces query helpers for the admin UI.

Pagination uses a compact cursor (base64-encoded ``(at, id)`` tuple) so
the admin UI can request the next page without storing server state.
See ``docs/contracts/rest_api_base.contract.md`` Section 3.5 for the
canonical cursor shape.
"""

from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from typing import Sequence

import asyncpg

from src.backend.db.pool import get_pool


async def list_audit_for_flag(
    flag_name: str,
    *,
    limit: int = 50,
    cursor: str | None = None,
) -> tuple[Sequence[asyncpg.Record], str | None]:
    """Return audit rows + next_cursor for a single flag.

    Rows ordered ``at DESC, id DESC`` so the most recent event appears
    first. The cursor encodes the last emitted ``(at, id)`` so the next
    page is fetched via ``WHERE (at, id) < (cursor_at, cursor_id)``.
    """

    limit = max(1, min(200, int(limit)))

    cursor_at: datetime | None = None
    cursor_id: int | None = None
    if cursor:
        cursor_at, cursor_id = _decode_cursor(cursor)

    pool = get_pool()
    async with pool.acquire() as conn:
        if cursor_at is None:
            rows = await conn.fetch(
                """
                SELECT id, actor_user_id, flag_name, scope_kind, scope_id,
                       action, old_value, new_value, reason, at
                FROM hemera_audit
                WHERE flag_name = $1
                ORDER BY at DESC, id DESC
                LIMIT $2
                """,
                flag_name,
                limit + 1,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT id, actor_user_id, flag_name, scope_kind, scope_id,
                       action, old_value, new_value, reason, at
                FROM hemera_audit
                WHERE flag_name = $1
                  AND (at, id) < ($2::timestamptz, $3::bigint)
                ORDER BY at DESC, id DESC
                LIMIT $4
                """,
                flag_name,
                cursor_at,
                cursor_id,
                limit + 1,
            )

    if len(rows) > limit:
        tail = rows[-1]
        next_cursor = _encode_cursor(tail["at"], int(tail["id"]))
        rows = rows[:limit]
    else:
        next_cursor = None
    return rows, next_cursor


async def count_audit_for_flag(flag_name: str) -> int:
    """Return the total audit row count for a flag.

    Used by the admin dashboard summary. Kept O(index-scan) via the
    ``idx_hemera_audit_flag_at`` partial.
    """

    pool = get_pool()
    async with pool.acquire() as conn:
        value = await conn.fetchval(
            "SELECT count(*) FROM hemera_audit WHERE flag_name = $1",
            flag_name,
        )
    return int(value or 0)


def _encode_cursor(at: datetime, row_id: int) -> str:
    payload = {
        "at": at.astimezone(timezone.utc).isoformat(),
        "id": row_id,
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_cursor(cursor: str) -> tuple[datetime, int]:
    padded = cursor + "=" * (-len(cursor) % 4)
    try:
        raw = base64.urlsafe_b64decode(padded.encode("ascii"))
        payload = json.loads(raw.decode("utf-8"))
        at = datetime.fromisoformat(payload["at"])
        if at.tzinfo is None:
            at = at.replace(tzinfo=timezone.utc)
        return at, int(payload["id"])
    except (ValueError, KeyError, TypeError) as exc:
        raise ValueError(f"invalid audit cursor: {cursor!r}") from exc


__all__ = [
    "count_audit_for_flag",
    "list_audit_for_flag",
]
