"""Refresh token rotation + reuse detection.

Contract: ``docs/contracts/oauth_dcr.contract.md`` Section 4.3 + 8.

Rotation: every ``/oauth/token`` refresh exchange mints a new opaque
token. Old record stays in the family graph linked via ``rotated_from``.
Presenting an already-rotated token triggers reuse detection: mark every
record in the family ``revoked_family = True`` and reject the exchange.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Protocol, runtime_checkable
from uuid import UUID, uuid4

from pydantic import HttpUrl

from src.backend.auth.models.token import RefreshToken

log = logging.getLogger(__name__)

REFRESH_TOKEN_TTL_DAYS = 30
REFRESH_TOKEN_NBYTES = 48


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _mint_token_value() -> str:
    return secrets.token_urlsafe(REFRESH_TOKEN_NBYTES)


@runtime_checkable
class RefreshStore(Protocol):
    async def insert(self, record: RefreshToken) -> None: ...
    async def get_by_hash(self, token_hash: str) -> RefreshToken | None: ...
    async def successor_of(self, token_hash: str) -> RefreshToken | None: ...
    async def revoke_family(self, family_id: UUID) -> int: ...


class InMemoryRefreshStore:
    def __init__(self) -> None:
        self._by_hash: dict[str, RefreshToken] = {}
        self._by_family: dict[UUID, list[RefreshToken]] = {}
        self._lock = asyncio.Lock()

    async def insert(self, record: RefreshToken) -> None:
        async with self._lock:
            self._by_hash[record.token_hash] = record
            self._by_family.setdefault(record.family_id, []).append(record)

    async def get_by_hash(self, token_hash: str) -> RefreshToken | None:
        async with self._lock:
            return self._by_hash.get(token_hash)

    async def successor_of(self, token_hash: str) -> RefreshToken | None:
        async with self._lock:
            for record in self._by_hash.values():
                if record.rotated_from == token_hash:
                    return record
            return None

    async def revoke_family(self, family_id: UUID) -> int:
        async with self._lock:
            family = self._by_family.get(family_id, [])
            for record in family:
                record.revoked_family = True
            return len(family)


class RefreshChain:
    def __init__(self, store: RefreshStore | None = None) -> None:
        self._store: RefreshStore = store or InMemoryRefreshStore()

    def set_store(self, store: RefreshStore) -> None:
        self._store = store

    async def issue_initial(
        self,
        *,
        client_id: str,
        user_id: UUID,
        scope: str,
        resource: HttpUrl,
    ) -> tuple[str, RefreshToken]:
        plaintext = _mint_token_value()
        now = datetime.now(timezone.utc)
        record = RefreshToken(
            token_hash=_hash_token(plaintext),
            family_id=uuid4(),
            client_id=client_id,
            user_id=user_id,
            scope=scope,
            resource=resource,
            expires_at=now + timedelta(days=REFRESH_TOKEN_TTL_DAYS),
            rotated_from=None,
            revoked_family=False,
            created_at=now,
        )
        await self._store.insert(record)
        log.info(
            "oauth.refresh.issued",
            extra={
                "event": "oauth.refresh.issued",
                "client_id": client_id,
                "family_id": str(record.family_id),
            },
        )
        return plaintext, record

    async def rotate(self, presented_token: str) -> tuple[str, RefreshToken]:
        old_hash = _hash_token(presented_token)
        old = await self._store.get_by_hash(old_hash)
        if old is None:
            raise InvalidRefreshError("unknown refresh token")

        now = datetime.now(timezone.utc)
        if old.is_expired(now):
            raise InvalidRefreshError("refresh token expired")

        if old.revoked_family:
            raise InvalidRefreshError("refresh family revoked")

        successor = await self._store.successor_of(old_hash)
        if successor is not None:
            revoked_count = await self._store.revoke_family(old.family_id)
            log.warning(
                "oauth.refresh.reuse_detected",
                extra={
                    "event": "oauth.refresh.reuse_detected",
                    "family_id": str(old.family_id),
                    "revoked_tokens_count": revoked_count,
                },
            )
            raise ReuseDetectedError(family_id=old.family_id)

        new_plaintext = _mint_token_value()
        new_record = RefreshToken(
            token_hash=_hash_token(new_plaintext),
            family_id=old.family_id,
            client_id=old.client_id,
            user_id=old.user_id,
            scope=old.scope,
            resource=old.resource,
            expires_at=now + timedelta(days=REFRESH_TOKEN_TTL_DAYS),
            rotated_from=old_hash,
            revoked_family=False,
            created_at=now,
        )
        await self._store.insert(new_record)
        log.info(
            "oauth.refresh.rotated",
            extra={
                "event": "oauth.refresh.rotated",
                "family_id": str(old.family_id),
                "client_id": old.client_id,
            },
        )
        return new_plaintext, new_record


class InvalidRefreshError(Exception):
    """Raised when a refresh token is malformed, expired, or unknown."""


class ReuseDetectedError(Exception):
    """Raised when the presented refresh token has already been rotated."""

    def __init__(self, family_id: UUID) -> None:
        super().__init__(f"refresh family revoked due to reuse: {family_id}")
        self.family_id = family_id


_chain = RefreshChain()


def get_chain() -> RefreshChain:
    return _chain


def reset_chain_for_tests() -> None:
    global _chain
    _chain = RefreshChain()
