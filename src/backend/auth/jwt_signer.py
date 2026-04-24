"""RS256 JWT signer + rotating JWKS publisher.

Owner: Khronos. Contract: ``docs/contracts/oauth_dcr.contract.md`` Section 4.4
+ ``docs/contracts/mcp_server.contract.md`` Section 4.2.

Design
------
Maintains an ordered list of ``_KeyEntry`` records. The head of the list is
the ACTIVE key used for signing; subsequent entries are RETIRING keys kept
in JWKS during a grace window so tokens issued before rotation stay
verifiable. ``prune_retired()`` drops entries whose ``retires_at`` has
elapsed.

Pre-submission the signer runs with a single stable key loaded from
``OAUTH_JWT_PRIVATE_KEY_PEM`` env var. Absent the env var the signer
self-generates an ephemeral RSA 2048 keypair and emits a WARN log so
operators know token issuance will not survive a restart.
"""

from __future__ import annotations

import base64
import logging
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey, RSAPublicKey
from jose import jwt as jose_jwt
from jose.exceptions import ExpiredSignatureError, JWTClaimsError, JWTError

log = logging.getLogger(__name__)

ALGORITHM = "RS256"
DEFAULT_TTL_SECONDS = 3600
DEFAULT_ROTATION_WINDOW_DAYS = 30
DEFAULT_GRACE_WINDOW_DAYS = 7
RSA_KEY_SIZE = 2048


def _b64url_uint(value: int) -> str:
    """Encode integer as base64url bytes with no padding (RFC 7518 Section 2)."""

    if value < 0:
        raise ValueError("JWK integer parameters must be non-negative")
    byte_length = max(1, (value.bit_length() + 7) // 8)
    raw = value.to_bytes(byte_length, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _public_key_to_jwk(public_key: RSAPublicKey, kid: str, use: str = "sig") -> dict[str, Any]:
    numbers = public_key.public_numbers()
    return {
        "kty": "RSA",
        "use": use,
        "alg": ALGORITHM,
        "kid": kid,
        "n": _b64url_uint(numbers.n),
        "e": _b64url_uint(numbers.e),
    }


def _generate_keypair() -> tuple[RSAPrivateKey, bytes]:
    private = rsa.generate_private_key(
        public_exponent=65537, key_size=RSA_KEY_SIZE, backend=default_backend()
    )
    pem = private.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return private, pem


def _load_keypair_from_pem(pem_bytes: bytes) -> RSAPrivateKey:
    key = serialization.load_pem_private_key(pem_bytes, password=None, backend=default_backend())
    if not isinstance(key, RSAPrivateKey):
        raise ValueError("OAUTH_JWT_PRIVATE_KEY_PEM does not contain an RSA private key")
    return key


@dataclass
class _KeyEntry:
    kid: str
    private_key: RSAPrivateKey
    public_key: RSAPublicKey
    pem: bytes
    created_at: datetime
    retires_at: datetime | None = field(default=None)

    def is_active(self) -> bool:
        return self.retires_at is None

    def is_expired(self, now: datetime) -> bool:
        return self.retires_at is not None and now >= self.retires_at


class JwtSigner:
    """RS256 signer with rotating JWKS.

    Thread-safe for the read-heavy sign + verify path. Rotation briefly
    blocks readers during the swap.
    """

    def __init__(
        self,
        grace_window_days: int = DEFAULT_GRACE_WINDOW_DAYS,
        issuer: str = "https://nerium.com",
    ) -> None:
        self._lock = threading.RLock()
        self._keys: list[_KeyEntry] = []
        self._grace_window = timedelta(days=grace_window_days)
        self._issuer = issuer

    def bootstrap_from_env(self) -> None:
        with self._lock:
            if self._keys:
                return
            pem_env = os.environ.get("OAUTH_JWT_PRIVATE_KEY_PEM")
            kid = os.environ.get("OAUTH_JWT_KEY_ID", "v1")

            if pem_env:
                private = _load_keypair_from_pem(pem_env.encode("utf-8"))
                pem = private.private_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PrivateFormat.PKCS8,
                    encryption_algorithm=serialization.NoEncryption(),
                )
                log.info("oauth.jwt.key.loaded_from_env", extra={"kid": kid})
            else:
                private, pem = _generate_keypair()
                log.warning(
                    "oauth.jwt.key.ephemeral_generated",
                    extra={
                        "event": "oauth.jwt.key.ephemeral_generated",
                        "kid": kid,
                        "reason": "OAUTH_JWT_PRIVATE_KEY_PEM env var unset",
                    },
                )

            self._keys.append(
                _KeyEntry(
                    kid=kid,
                    private_key=private,
                    public_key=private.public_key(),
                    pem=pem,
                    created_at=datetime.now(timezone.utc),
                )
            )

    def sign(self, payload: dict[str, Any], ttl_seconds: int = DEFAULT_TTL_SECONDS) -> str:
        with self._lock:
            active = self._active_entry()
            now = int(time.time())
            claims: dict[str, Any] = dict(payload)
            claims.setdefault("iss", self._issuer)
            claims.setdefault("iat", now)
            claims.setdefault("exp", now + ttl_seconds)
            claims.setdefault("jti", str(uuid.uuid4()))
            headers = {"kid": active.kid, "typ": "JWT"}
            return jose_jwt.encode(claims, active.pem, algorithm=ALGORITHM, headers=headers)

    def verify(
        self,
        token: str,
        audience: str | None = None,
        issuer: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            now = datetime.now(timezone.utc)
            self._prune_retired_locked(now)
            candidates = list(self._keys)

        if not candidates:
            raise JWTError("no active signing keys")

        last_error: Exception | None = None
        for entry in candidates:
            public_jwk = _public_key_to_jwk(entry.public_key, entry.kid)
            try:
                return jose_jwt.decode(
                    token,
                    public_jwk,
                    algorithms=[ALGORITHM],
                    audience=audience,
                    issuer=issuer or self._issuer,
                    options={"require": ["exp", "iat", "iss"]},
                )
            except ExpiredSignatureError:
                raise
            except JWTClaimsError:
                raise
            except JWTError as exc:
                last_error = exc
                continue
        raise last_error or JWTError("signature did not match any known key")

    def rotate(self, new_pem: bytes | None = None, new_kid: str | None = None) -> str:
        with self._lock:
            if new_pem is None:
                private, pem = _generate_keypair()
            else:
                private = _load_keypair_from_pem(new_pem)
                pem = new_pem

            if new_kid is None:
                new_kid = self._next_kid_locked()

            now = datetime.now(timezone.utc)
            retires_at = now + self._grace_window
            for entry in self._keys:
                if entry.is_active():
                    entry.retires_at = retires_at

            new_entry = _KeyEntry(
                kid=new_kid,
                private_key=private,
                public_key=private.public_key(),
                pem=pem,
                created_at=now,
            )
            self._keys.insert(0, new_entry)
            log.info(
                "oauth.jwt.key.rotated",
                extra={
                    "event": "oauth.jwt.key.rotated",
                    "new_kid": new_kid,
                    "retiring_count": sum(1 for e in self._keys if not e.is_active()),
                },
            )
            return new_kid

    def prune_retired(self) -> int:
        with self._lock:
            return self._prune_retired_locked(datetime.now(timezone.utc))

    def jwks(self) -> dict[str, list[dict[str, Any]]]:
        with self._lock:
            now = datetime.now(timezone.utc)
            self._prune_retired_locked(now)
            keys = [
                _public_key_to_jwk(entry.public_key, entry.kid) for entry in self._keys
            ]
        return {"keys": keys}

    def active_kid(self) -> str:
        with self._lock:
            return self._active_entry().kid

    def _active_entry(self) -> _KeyEntry:
        for entry in self._keys:
            if entry.is_active():
                return entry
        raise RuntimeError(
            "JwtSigner has no active key. Call bootstrap_from_env() or rotate() first."
        )

    def _prune_retired_locked(self, now: datetime) -> int:
        before = len(self._keys)
        self._keys = [e for e in self._keys if not e.is_expired(now)]
        removed = before - len(self._keys)
        if removed:
            log.info(
                "oauth.jwt.key.pruned",
                extra={"event": "oauth.jwt.key.pruned", "pruned_count": removed},
            )
        return removed

    def _next_kid_locked(self) -> str:
        max_seen = 0
        for entry in self._keys:
            if entry.kid.startswith("v") and entry.kid[1:].isdigit():
                max_seen = max(max_seen, int(entry.kid[1:]))
        return f"v{max_seen + 1}"


_signer: JwtSigner | None = None
_signer_lock = threading.Lock()


def get_signer() -> JwtSigner:
    global _signer
    if _signer is not None:
        return _signer
    with _signer_lock:
        if _signer is None:
            signer = JwtSigner()
            signer.bootstrap_from_env()
            _signer = signer
    return _signer


def reset_signer_for_tests() -> None:
    global _signer
    with _signer_lock:
        _signer = None
