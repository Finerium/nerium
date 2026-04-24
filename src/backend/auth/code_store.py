"""Authorization code short-lived cache.

Contract: ``docs/contracts/oauth_dcr.contract.md`` Section 4.2 +
``docs/contracts/redis_session.contract.md`` Section 3.2 key ``oauth:code:<code>``.

Consume is atomic: GETDEL on Redis, pop on in-memory. Single-use invariant
preserved.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Protocol, runtime_checkable

from src.backend.auth.models.code import AuthorizationCode

log = logging.getLogger(__name__)


@runtime_checkable
class CodeStore(Protocol):
    async def put(self, code: AuthorizationCode) -> None: ...
    async def consume(self, code_value: str) -> AuthorizationCode | None: ...
    async def peek(self, code_value: str) -> AuthorizationCode | None: ...


class InMemoryCodeStore:
    def __init__(self) -> None:
        self._codes: dict[str, AuthorizationCode] = {}
        self._lock = asyncio.Lock()

    async def put(self, code: AuthorizationCode) -> None:
        async with self._lock:
            self._codes[code.code] = code
            log.info(
                "oauth.code.issued",
                extra={
                    "event": "oauth.code.issued",
                    "client_id": code.client_id,
                    "scope": code.scope,
                    "ttl_seconds": int((code.expires_at - code.created_at).total_seconds()),
                },
            )

    async def consume(self, code_value: str) -> AuthorizationCode | None:
        async with self._lock:
            record = self._codes.pop(code_value, None)
            if record is None:
                return None
            now = datetime.now(timezone.utc)
            if record.is_expired(now):
                log.info(
                    "oauth.code.expired_on_consume",
                    extra={
                        "event": "oauth.code.expired_on_consume",
                        "client_id": record.client_id,
                    },
                )
                return None
            record.used = True
            return record

    async def peek(self, code_value: str) -> AuthorizationCode | None:
        async with self._lock:
            return self._codes.get(code_value)


class RedisCodeStore:
    """Redis-backed code store. Production implementation pending Aether
    ``src/backend/redis/pool.py``. ``SET oauth:code:<code> <json> NX PX
    <ttl_ms>`` for insert, ``GETDEL oauth:code:<code>`` for atomic consume.
    """

    def __init__(self, redis_client: object) -> None:
        self._redis = redis_client

    async def put(self, code: AuthorizationCode) -> None:
        raise NotImplementedError("RedisCodeStore pending Aether redis pool")

    async def consume(self, code_value: str) -> AuthorizationCode | None:
        raise NotImplementedError("RedisCodeStore pending Aether redis pool")

    async def peek(self, code_value: str) -> AuthorizationCode | None:
        raise NotImplementedError("RedisCodeStore pending Aether redis pool")


_store: CodeStore = InMemoryCodeStore()


def get_store() -> CodeStore:
    return _store


def set_store(store: CodeStore) -> None:
    global _store
    _store = store


def reset_store_for_tests() -> None:
    global _store
    _store = InMemoryCodeStore()
