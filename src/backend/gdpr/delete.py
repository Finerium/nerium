"""GDPR soft-delete + session revoke.

Owner: Eunomia (W2 NP P6 S1).

Behaviour
---------
- Sets ``app_user.deleted_at = now()`` and
  ``app_user.status = 'deleted'`` so the user disappears from the
  public surface (marketplace cards, trust scores, review feeds) on
  the next query tick.
- Sets ``app_user.purge_at = now() + 30 days`` so a future purge cron
  (DEFERRED post-submit per P6 Pack V4 #6) can pick up the row when
  the window expires.
- Revokes every ``user_session`` row by setting ``revoked_at = now()``.
  Browser tokens stop refreshing at the next refresh-chain call.

Idempotency
-----------
Re-running ``delete_user_account`` is safe: the helper short-circuits
when ``deleted_at`` is already set, returning the prior result instead
of advancing the purge clock. This matches the contract guarantee that
the "delete my account" button can be clicked twice without shifting
the retention window.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from src.backend.db.pool import get_pool
from src.backend.errors import NotFoundProblem

logger = logging.getLogger(__name__)

# Retention window before hard purge. Per GDPR Article 17 we MAY keep
# data for a bounded period for audit + legal hold; 30 days is the
# industry convention and gives operators time to respond to a
# mistaken delete request.
PURGE_WINDOW_DAYS: int = 30


@dataclass(frozen=True)
class DeletionResult:
    """Summary surfaced to the HTTP response.

    Fields map 1:1 to the wire response body:
    - ``deleted_at``: when the soft-delete was first recorded.
    - ``purge_at``: when the purge cron is eligible to hard-remove rows.
    - ``sessions_revoked``: number of browser sessions invalidated by
      this call (0 when the user was already deleted previously).
    - ``already_deleted``: bool convenience flag for the frontend so it
      can render "account already pending deletion" instead of a fresh
      confirmation.
    """

    user_id: UUID
    deleted_at: datetime
    purge_at: datetime
    sessions_revoked: int
    already_deleted: bool


async def delete_user_account(*, user_id: UUID) -> DeletionResult:
    """Soft-delete the user account and revoke every live session.

    Raises
    ------
    NotFoundProblem
        When ``user_id`` does not correspond to an ``app_user`` row.
    """

    now = datetime.now(timezone.utc)
    purge_at = now + timedelta(days=PURGE_WINDOW_DAYS)

    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            existing = await conn.fetchrow(
                """
                SELECT id, deleted_at, purge_at
                FROM app_user
                WHERE id = $1
                FOR UPDATE
                """,
                user_id,
            )
            if existing is None:
                raise NotFoundProblem(
                    detail=f"User {user_id} not found.",
                )

            if existing["deleted_at"] is not None:
                logger.info("gdpr.delete.already_deleted user_id=%s", user_id)
                return DeletionResult(
                    user_id=user_id,
                    deleted_at=existing["deleted_at"],
                    purge_at=existing["purge_at"] or purge_at,
                    sessions_revoked=0,
                    already_deleted=True,
                )

            await conn.execute(
                """
                UPDATE app_user
                SET deleted_at = $2,
                    purge_at   = $3,
                    status     = 'deleted',
                    updated_at = now()
                WHERE id = $1
                """,
                user_id,
                now,
                purge_at,
            )

            revoke_status = await conn.execute(
                """
                UPDATE user_session
                SET revoked_at = $2, updated_at = now()
                WHERE user_id = $1 AND revoked_at IS NULL
                """,
                user_id,
                now,
            )

    sessions_revoked = _extract_affected_rows(revoke_status)
    logger.info(
        "gdpr.delete.soft user_id=%s sessions_revoked=%d purge_at=%s",
        user_id,
        sessions_revoked,
        purge_at.isoformat(),
    )
    return DeletionResult(
        user_id=user_id,
        deleted_at=now,
        purge_at=purge_at,
        sessions_revoked=sessions_revoked,
        already_deleted=False,
    )


def _extract_affected_rows(status_tag: Optional[str]) -> int:
    """Parse ``UPDATE n`` command tag from asyncpg into ``n``.

    asyncpg returns ``'UPDATE 3'`` on a 3-row update. Mocks + stand-in
    implementations may return ``None`` or ``'OK'``; we fall back to 0
    so the wire contract stays stable.
    """

    if not status_tag:
        return 0
    parts = str(status_tag).split()
    if len(parts) >= 2 and parts[0].upper() == "UPDATE":
        try:
            return int(parts[1])
        except ValueError:
            return 0
    return 0


__all__ = [
    "PURGE_WINDOW_DAYS",
    "DeletionResult",
    "delete_user_account",
]
