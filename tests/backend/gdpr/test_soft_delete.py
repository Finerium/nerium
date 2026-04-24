"""Tests for the GDPR soft-delete helper."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.backend.errors import NotFoundProblem
from src.backend.gdpr import delete as delete_service


async def test_soft_delete_sets_deleted_at_and_revokes_sessions(
    fake_gdpr_pool,
) -> None:
    conn = fake_gdpr_pool._test_conn
    user_id = uuid4()

    conn.fetchrow = AsyncMock(
        return_value={
            "id": user_id,
            "deleted_at": None,
            "purge_at": None,
        }
    )

    # First execute: the UPDATE app_user. Second: UPDATE user_session
    # returning "UPDATE 3" to simulate three sessions revoked.
    conn.execute = AsyncMock(side_effect=["UPDATE 1", "UPDATE 3"])

    result = await delete_service.delete_user_account(user_id=user_id)

    assert result.user_id == user_id
    assert result.already_deleted is False
    assert result.sessions_revoked == 3

    # purge_at must be deleted_at + 30 days. Allow a 2-second margin
    # for clock drift inside the helper.
    delta = result.purge_at - result.deleted_at
    assert (
        abs(delta - timedelta(days=delete_service.PURGE_WINDOW_DAYS))
        < timedelta(seconds=2)
    )

    # Verify the UPDATE fired with a ``SET deleted_at = $2`` shape.
    first_sql = conn.execute.await_args_list[0].args[0]
    assert "SET deleted_at" in first_sql
    assert "status     = 'deleted'" in first_sql or "status = 'deleted'" in first_sql


async def test_soft_delete_is_idempotent(fake_gdpr_pool) -> None:
    conn = fake_gdpr_pool._test_conn
    user_id = uuid4()
    prior_deleted_at = datetime.now(timezone.utc) - timedelta(days=2)
    prior_purge_at = prior_deleted_at + timedelta(
        days=delete_service.PURGE_WINDOW_DAYS
    )

    conn.fetchrow = AsyncMock(
        return_value={
            "id": user_id,
            "deleted_at": prior_deleted_at,
            "purge_at": prior_purge_at,
        }
    )

    result = await delete_service.delete_user_account(user_id=user_id)

    assert result.already_deleted is True
    assert result.sessions_revoked == 0
    assert result.deleted_at == prior_deleted_at
    assert result.purge_at == prior_purge_at
    # No mutations fired.
    assert conn.execute.await_count == 0


async def test_soft_delete_missing_user_raises_404(fake_gdpr_pool) -> None:
    conn = fake_gdpr_pool._test_conn
    conn.fetchrow = AsyncMock(return_value=None)

    with pytest.raises(NotFoundProblem):
        await delete_service.delete_user_account(user_id=uuid4())
