"""Tests for :mod:`src.backend.budget.hemera_seed`.

Owner: Moros (W2 NP P3 S1).

The seed helper must:

- Create missing flags with their Moros defaults.
- Never overwrite an existing row (admin tunings persist).
- Swallow DB errors so a fresh dev DB does not block the API boot.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.backend.budget.hemera_seed import MOROS_FLAG_SEEDS, ensure_moros_flags


class _FakeConn:
    """Conn stub that tracks INSERT calls."""

    def __init__(self, *, existing: set[str] | None = None) -> None:
        self.existing: set[str] = set(existing or ())
        self.calls: list[tuple[str, Any]] = []

    async def execute(self, sql: str, *args: Any) -> str:
        self.calls.append((sql, args))
        flag_name = args[0]
        # ON CONFLICT DO NOTHING path: existing row -> "INSERT 0 0";
        # fresh row -> "INSERT 0 1".
        if flag_name in self.existing:
            return "INSERT 0 0"
        self.existing.add(flag_name)
        return "INSERT 0 1"


class _FakePool:
    def __init__(self, conn: _FakeConn) -> None:
        self._conn = conn

    def acquire(self):
        parent = self._conn

        class _Ctx:
            async def __aenter__(self) -> _FakeConn:
                return parent

            async def __aexit__(self, exc_type, exc, tb) -> None:
                return None

        return _Ctx()


@pytest.mark.asyncio
async def test_ensure_moros_flags_creates_missing(monkeypatch) -> None:
    """Fresh DB -> every Moros flag is created."""

    conn = _FakeConn(existing=set())
    pool = _FakePool(conn)

    async def _noop_refresh(name: str) -> None:
        return None

    monkeypatch.setattr(
        "src.backend.flags.service.refresh_bootstrap_flag",
        _noop_refresh,
    )

    report = await ensure_moros_flags(pool=pool)

    expected = {seed.flag_name for seed in MOROS_FLAG_SEEDS}
    assert set(report.keys()) == expected
    assert all(v == "created" for v in report.values())
    # One execute per seed.
    assert len(conn.calls) == len(MOROS_FLAG_SEEDS)


@pytest.mark.asyncio
async def test_ensure_moros_flags_preserves_existing(monkeypatch) -> None:
    """An admin-tuned row must NOT be overwritten by the seed helper."""

    already_set = {"ma.daily_budget_usd"}
    conn = _FakeConn(existing=already_set)
    pool = _FakePool(conn)

    async def _noop_refresh(name: str) -> None:
        return None

    monkeypatch.setattr(
        "src.backend.flags.service.refresh_bootstrap_flag",
        _noop_refresh,
    )

    report = await ensure_moros_flags(pool=pool)

    assert report["ma.daily_budget_usd"] == "exists"
    # Others still created this run.
    assert report["ma.monthly_budget_usd"] == "created"
    assert report["ma.budget_cap_threshold"] == "created"


@pytest.mark.asyncio
async def test_ensure_moros_flags_swallows_db_error(monkeypatch) -> None:
    """DB error -> every flag reported as ``skipped`` + no raise."""

    class _BrokenPool:
        def acquire(self):
            class _Ctx:
                async def __aenter__(self) -> Any:
                    raise RuntimeError("db down")

                async def __aexit__(self, *_: Any) -> None:
                    return None

            return _Ctx()

    report = await ensure_moros_flags(pool=_BrokenPool())

    assert all(v == "skipped" for v in report.values())
    assert set(report.keys()) == {seed.flag_name for seed in MOROS_FLAG_SEEDS}


@pytest.mark.asyncio
async def test_seeds_declare_moros_ownership() -> None:
    """Every seed row must be owned by the moros agent tag."""

    for seed in MOROS_FLAG_SEEDS:
        assert seed.owner_agent == "moros"
        assert seed.kind == "number"


@pytest.mark.asyncio
async def test_default_flags_sql_seed_includes_moros_flags() -> None:
    """The on-disk SQL seed file must include the three Moros flags.

    We assert at the string level so an accidental removal of the lines
    surfaces as a failing test rather than a silent drift between the
    SQL seed + the Python fallback.
    """

    import pathlib

    sql_path = pathlib.Path(
        "src/backend/db/seed/default_flags.sql"
    ).resolve()
    text = sql_path.read_text()
    assert "'ma.daily_budget_usd'" in text
    assert "'ma.monthly_budget_usd'" in text
    assert "'ma.budget_cap_threshold'" in text
