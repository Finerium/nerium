"""Fixtures for the Moros budget daemon test suite.

Owner: Moros (W2 NP P3 S1).

The fake Redis here is intentionally independent from the realtime
conftest's ``fake_redis_client``. Budget tests exercise a narrower
surface (GET / SET / HSET / DEL / INCR / PUBLISH / EXPIRE / SCAN) so we
keep a minimal stand-in to avoid a hard dependency on ``fakeredis`` in
every budget test file.
"""

from __future__ import annotations

import asyncio
from typing import Any, Iterable, Iterator

import pytest
import pytest_asyncio


class FakeRedis:
    """Minimal async Redis double.

    Supports the surface Moros touches:

    - ``get(key)`` / ``set(key, value, ex=..., nx=...)``
    - ``delete(key)``
    - ``incr(key)``
    - ``hset(key, mapping=...)`` / ``hgetall(key)``
    - ``expire(key, ttl)``
    - ``publish(channel, payload)``
    - ``scan_iter(match=..., count=...)``

    Storage: flat dict for strings, nested dict for hashes, list of
    published messages per channel. The stand-in is NOT thread-safe;
    every test awaits serially.
    """

    def __init__(self) -> None:
        self.strings: dict[str, str] = {}
        self.hashes: dict[str, dict[str, str]] = {}
        self.published: list[tuple[str, str]] = []
        self.expired: dict[str, int] = {}
        self.raises: dict[str, Exception] = {}

    async def get(self, key: str) -> Any:
        self._maybe_raise(key)
        return self.strings.get(key)

    async def set(
        self,
        key: str,
        value: Any,
        *,
        ex: int | None = None,
        nx: bool | None = None,
        **_: Any,
    ) -> Any:
        self._maybe_raise(key)
        if nx and key in self.strings:
            return None
        self.strings[key] = str(value)
        if ex is not None:
            self.expired[key] = int(ex)
        return True

    async def delete(self, *keys: str) -> int:
        count = 0
        for key in keys:
            if key in self.strings:
                del self.strings[key]
                count += 1
            if key in self.hashes:
                del self.hashes[key]
                count += 1
        return count

    async def incr(self, key: str) -> int:
        self._maybe_raise(key)
        current = int(self.strings.get(key, "0"))
        current += 1
        self.strings[key] = str(current)
        return current

    async def hset(
        self,
        key: str,
        mapping: dict[str, str] | None = None,
        **_: Any,
    ) -> int:
        mapping = mapping or {}
        target = self.hashes.setdefault(key, {})
        added = 0
        for field, value in mapping.items():
            if field not in target:
                added += 1
            target[field] = str(value)
        return added

    async def hgetall(self, key: str) -> dict[str, str]:
        self._maybe_raise(key)
        return dict(self.hashes.get(key) or {})

    async def expire(self, key: str, ttl: int) -> int:
        self.expired[key] = int(ttl)
        return 1

    async def publish(self, channel: str, payload: str) -> int:
        self.published.append((channel, payload))
        return 1

    async def scan_iter(self, *, match: str, count: int = 200):
        # Glob-to-prefix conversion: we only need the ``chronos:tenant:*:usd_today``
        # + ``:capped`` patterns Moros sweeps. Implement a basic wildcard
        # walk that covers ``*`` anywhere in the pattern.
        import fnmatch

        for key in list(self.strings.keys()):
            if fnmatch.fnmatchcase(key, match):
                yield key

    def queue_error(self, key: str, exc: Exception) -> None:
        """Wire a synthetic failure on the next ``get``/``set`` for ``key``."""

        self.raises[key] = exc

    def _maybe_raise(self, key: str) -> None:
        exc = self.raises.pop(key, None)
        if exc is not None:
            raise exc


@pytest_asyncio.fixture
async def fake_redis() -> FakeRedis:
    """A fresh :class:`FakeRedis` per test."""

    yield FakeRedis()


@pytest.fixture(autouse=True)
def _reset_moros_metrics() -> Iterator[None]:
    """Reset Prometheus counters between tests so assertions stay local.

    Prometheus ``Counter`` + ``Gauge`` clients in the obs module keep
    process-wide state. Each test gets a clean slate via a ``clear``
    call on the ``_value`` store where available. If the obs module is
    not importable (minimal dep install) we yield without touching
    anything.
    """

    try:
        from src.backend.obs import metrics as m
    except Exception:
        yield
        return

    targets = [
        getattr(m, "budget_cap_tripped_total", None),
        getattr(m, "budget_alert_threshold_total", None),
        getattr(m, "budget_global_spent_usd", None),
    ]
    for target in targets:
        if target is None:
            continue
        clear = getattr(target, "clear", None)
        if callable(clear):
            try:
                clear()
            except Exception:
                pass
    yield
