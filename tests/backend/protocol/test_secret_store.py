"""Tenant API key envelope encryption (KEK + DEK) tests.

Covers :mod:`src.backend.protocol.secret_store`:
- ``seal_secret`` -> ``open_secret`` round trip with KEK from env.
- Tampered ciphertext fails AES-GCM tag validation.
- Wrong KEK fails AES-Key-Wrap unwrap.
- Empty plaintext is rejected.
- KEK env var unset / malformed surfaces RuntimeError.

The :mod:`tests.backend.protocol.conftest` autouse fixture seeds a
deterministic 32-byte test KEK; tests that need to exercise the
unset-KEK branch override the fixture explicitly.
"""

from __future__ import annotations

import base64

import pytest
from cryptography.exceptions import InvalidTag
from pydantic import SecretStr

from src.backend.protocol.secret_store import (
    SealedSecret,
    open_secret,
    seal_secret,
)


def test_seal_open_roundtrip() -> None:
    """A sealed secret opens to the same plaintext bytes."""

    plaintext = b"sk-test-1234-abcdefghijklmnop"
    sealed = seal_secret(plaintext)
    assert isinstance(sealed, SealedSecret)
    assert len(sealed.nonce) == 12
    # AES-Key-Wrap-with-Padding of a 32-byte DEK -> 40 bytes wrapped.
    assert len(sealed.wrapped_dek) == 40
    # ciphertext = plaintext + 16-byte GCM tag.
    assert len(sealed.ciphertext) == len(plaintext) + 16

    recovered = open_secret(sealed)
    assert recovered == plaintext


def test_two_seals_use_distinct_dek_and_nonce() -> None:
    """Per-record DEK + nonce uniqueness: same plaintext seals to distinct rows."""

    p = b"identical plaintext content"
    a = seal_secret(p)
    b = seal_secret(p)
    assert a.nonce != b.nonce
    assert a.wrapped_dek != b.wrapped_dek
    assert a.ciphertext != b.ciphertext
    assert open_secret(a) == open_secret(b) == p


def test_tampered_ciphertext_fails_aes_gcm_tag() -> None:
    """Flipping a byte in ciphertext fails the AEAD tag check."""

    sealed = seal_secret(b"tenant key plaintext")
    flipped = bytearray(sealed.ciphertext)
    flipped[0] ^= 0x01
    tampered = SealedSecret(
        ciphertext=bytes(flipped),
        nonce=sealed.nonce,
        wrapped_dek=sealed.wrapped_dek,
    )
    with pytest.raises(InvalidTag):
        open_secret(tampered)


def test_wrong_kek_fails_unwrap(monkeypatch: pytest.MonkeyPatch) -> None:
    """Switching the KEK between seal + open fails AES-Key-Wrap-Unwrap."""

    from cryptography.hazmat.primitives.keywrap import InvalidUnwrap

    sealed = seal_secret(b"plaintext under kek_a")

    # Swap the KEK to a different 32-byte value before opening. The
    # autouse fixture installs a per-test settings copy; we patch the
    # secret_store's get_settings to a fresh object with a different
    # base64 string so load_kek picks up the new value.
    other_kek_b64 = base64.b64encode(b"\x42" * 32).decode("ascii")
    from src.backend.config import get_settings as real_get_settings

    real_settings = real_get_settings()
    swapped = real_settings.model_copy(
        update={"crius_kek_base64": SecretStr(other_kek_b64)}
    )
    monkeypatch.setattr(
        "src.backend.protocol.secret_store.get_settings",
        lambda: swapped,
    )
    with pytest.raises(InvalidUnwrap):
        open_secret(sealed)


def test_empty_plaintext_rejected() -> None:
    """Sealing an empty payload raises ValueError."""

    with pytest.raises(ValueError, match="must not be empty"):
        seal_secret(b"")


def test_missing_kek_env_raises_runtime(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An empty NERIUM_CRIUS_KEK_BASE64 surfaces RuntimeError fast."""

    from src.backend.config import get_settings as real_get_settings

    real_settings = real_get_settings()
    blanked = real_settings.model_copy(
        update={"crius_kek_base64": SecretStr("")}
    )
    monkeypatch.setattr(
        "src.backend.protocol.secret_store.get_settings",
        lambda: blanked,
    )
    with pytest.raises(RuntimeError, match="empty"):
        seal_secret(b"will never get here")


def test_malformed_kek_b64_raises_runtime(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Non-base64 KEK env value raises RuntimeError with a clear message."""

    from src.backend.config import get_settings as real_get_settings

    real_settings = real_get_settings()
    bogus = real_settings.model_copy(
        update={"crius_kek_base64": SecretStr("not!base64!!")}
    )
    monkeypatch.setattr(
        "src.backend.protocol.secret_store.get_settings",
        lambda: bogus,
    )
    with pytest.raises(RuntimeError, match="base64"):
        seal_secret(b"x")


def test_short_kek_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    """A KEK that decodes to less than 32 bytes is rejected."""

    short_b64 = base64.b64encode(b"\x00" * 16).decode("ascii")
    from src.backend.config import get_settings as real_get_settings

    real_settings = real_get_settings()
    short = real_settings.model_copy(
        update={"crius_kek_base64": SecretStr(short_b64)}
    )
    monkeypatch.setattr(
        "src.backend.protocol.secret_store.get_settings",
        lambda: short,
    )
    with pytest.raises(RuntimeError, match="32"):
        seal_secret(b"x")
