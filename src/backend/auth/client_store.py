"""Registered client persistence.

Contract: ``docs/contracts/oauth_dcr.contract.md`` Section 6 + 3.1.

``InMemoryClientStore`` for tests + pre-Aether boot. ``AsyncpgClientStore``
production stub pending Aether ``src/backend/db/pool.py`` + migration.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Protocol, runtime_checkable

from src.backend.auth.models.client import RegisteredClient

log = logging.getLogger(__name__)


@runtime_checkable
class ClientStore(Protocol):
    async def insert(self, client: RegisteredClient) -> None: ...
    async def get(self, client_id: str) -> RegisteredClient | None: ...
    async def touch_last_used(self, client_id: str, at: datetime | None = None) -> None: ...
    async def count(self) -> int: ...


class InMemoryClientStore:
    def __init__(self) -> None:
        self._records: dict[str, RegisteredClient] = {}
        self._lock = asyncio.Lock()

    async def insert(self, client: RegisteredClient) -> None:
        async with self._lock:
            if client.client_id in self._records:
                raise ValueError(f"duplicate client_id {client.client_id}")
            self._records[client.client_id] = client
            log.info(
                "oauth.client.inserted",
                extra={
                    "event": "oauth.client.inserted",
                    "client_id": client.client_id,
                    "client_name": client.client_name,
                    "redirect_uri": str(client.redirect_uris[0]),
                    "auth_method": client.token_endpoint_auth_method,
                },
            )

    async def get(self, client_id: str) -> RegisteredClient | None:
        async with self._lock:
            return self._records.get(client_id)

    async def touch_last_used(self, client_id: str, at: datetime | None = None) -> None:
        async with self._lock:
            record = self._records.get(client_id)
            if record is None:
                return
            record.last_used_at = at or datetime.now(timezone.utc)

    async def count(self) -> int:
        async with self._lock:
            return len(self._records)

    async def preregister(self, client: RegisteredClient) -> None:
        async with self._lock:
            self._records[client.client_id] = client


class AsyncpgClientStore:
    """Postgres-backed client store. Pending Aether ``src/backend/db/pool.py``
    + ``oauth_client`` migration.
    """

    def __init__(self, pool: object) -> None:
        self._pool = pool

    async def insert(self, client: RegisteredClient) -> None:
        raise NotImplementedError(
            "AsyncpgClientStore pending Aether oauth_client migration"
        )

    async def get(self, client_id: str) -> RegisteredClient | None:
        raise NotImplementedError(
            "AsyncpgClientStore pending Aether oauth_client migration"
        )

    async def touch_last_used(self, client_id: str, at: datetime | None = None) -> None:
        raise NotImplementedError(
            "AsyncpgClientStore pending Aether oauth_client migration"
        )

    async def count(self) -> int:
        raise NotImplementedError(
            "AsyncpgClientStore pending Aether oauth_client migration"
        )


_store: ClientStore = InMemoryClientStore()


def get_store() -> ClientStore:
    return _store


def set_store(store: ClientStore) -> None:
    global _store
    _store = store


def reset_store_for_tests() -> None:
    global _store
    _store = InMemoryClientStore()
