"""Tenant API key envelope encryption helpers.

Owner: Crius (W2 NP P5 Session 2).

Threat model
------------
Tenants register vendor API keys for their own accounts (e.g. a tenant
that holds an OpenAI org key for their custom Hyperion fallback chain).
The keys MUST never persist in plaintext. The hot path here uses the
NIST SP 800-38F AES-Key-Wrap-with-Padding (RFC 5649) construction:

- KEK: 256-bit master key loaded from ``NERIUM_CRIUS_KEK_BASE64``.
- DEK: random 256-bit key generated per record at insert time.
- ``secret_ciphertext = AES-256-GCM(DEK, plaintext, nonce=12_bytes)``
- ``wrapped_dek = AES-Key-Wrap-with-Padding(KEK, DEK)``

Decrypting reverses the chain: unwrap the DEK with the KEK, then
AES-GCM decrypt the secret with the DEK + nonce. Both operations are
constant-time on the cryptography library's primitives.

KEK rotation is the post-S2 hardening described in
``docs/contracts/vendor_adapter.contract.md`` Section 3.2: dual-KEK
grace window where the retiring KEK accepts unwrap and the new KEK
encrypts writes. S2 ships the single-KEK path; the wire format is
forward-compatible because the wrapped DEK is opaque bytes that a
future ``kek_kid`` column can disambiguate without changing the
``seal_secret`` / ``open_secret`` signatures.

Distinction from ``envelope.py``
--------------------------------
- :mod:`src.backend.protocol.envelope` is the inter-agent SEALED
  envelope (X25519 ECDH + ephemeral DEK + Ed25519 sign). One-pass.
- This module is the AT-REST tenant API key store (KEK + RFC 5649
  wrapped DEK + AES-GCM). Repeatedly openable by the same KEK.

Both ride AES-256-GCM for symmetric encryption but the surrounding
key management differs by use case.
"""

from __future__ import annotations

import base64
import os
from dataclasses import dataclass

from cryptography.hazmat.primitives import keywrap
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from src.backend.config import get_settings

__all__ = [
    "SealedSecret",
    "load_kek",
    "open_secret",
    "seal_secret",
]


KEK_LENGTH_BYTES = 32
"""AES-256 KEK length. ``crius_kek_base64`` MUST decode to this."""

DEK_LENGTH_BYTES = 32
"""AES-256 DEK length. Generated fresh per record."""

GCM_NONCE_LENGTH_BYTES = 12
"""AES-GCM canonical nonce length."""


@dataclass(frozen=True)
class SealedSecret:
    """Wire format for a single sealed tenant API key.

    ``ciphertext`` is the AES-256-GCM output INCLUDING the trailing
    16-byte tag (cryptography returns the concatenated form). ``nonce``
    is the 12-byte AES-GCM nonce. ``wrapped_dek`` is the RFC 5649
    AES-Key-Wrap-with-Padding output of the per-record DEK.

    All three blobs persist as separate ``bytea`` columns in
    ``vendor_adapter_secret`` (migration 054) so a partial corruption
    of any one column surfaces deterministically as InvalidTag /
    InvalidUnwrap rather than an undefined behaviour.
    """

    ciphertext: bytes
    nonce: bytes
    wrapped_dek: bytes


def load_kek() -> bytes:
    """Return the 32-byte raw KEK from ``NERIUM_CRIUS_KEK_BASE64``.

    Raises
    ------
    RuntimeError
        ``crius_kek_base64`` is empty or decodes to a non-32-byte
        value. We refuse to operate on a half-configured KEK because
        the AES-Key-Wrap construction is only safe with a 256-bit
        wrapping key per RFC 5649 Section 2.

    The KEK is loaded fresh per call so a settings reload (e.g. via
    pydantic-settings hot reload) propagates without process restart.
    Production tunes the FastAPI lifespan to call this once at boot
    so a misconfigured deploy fails fast.
    """

    settings = get_settings()
    encoded = settings.crius_kek_base64.get_secret_value()
    if not encoded:
        raise RuntimeError(
            "NERIUM_CRIUS_KEK_BASE64 is empty. Crius secret_store cannot "
            "seal or open tenant API keys until the KEK env var is set. "
            "Provision a 32-byte AES-256 key, base64-encode it, and "
            "place it in /etc/nerium/kek.env (chmod 600)."
        )
    try:
        kek = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise RuntimeError(
            "NERIUM_CRIUS_KEK_BASE64 is not valid base64. "
            "Re-encode a 32-byte key with ``base64`` and update the env."
        ) from exc
    if len(kek) != KEK_LENGTH_BYTES:
        raise RuntimeError(
            f"NERIUM_CRIUS_KEK_BASE64 must decode to {KEK_LENGTH_BYTES} "
            f"bytes; got {len(kek)} bytes."
        )
    return kek


def seal_secret(plaintext: bytes) -> SealedSecret:
    """Encrypt ``plaintext`` under a fresh per-record DEK wrapped by the KEK.

    Flow
    ----
    1. ``dek = os.urandom(32)``
    2. ``nonce = os.urandom(12)``
    3. ``ciphertext = AES-256-GCM(dek).encrypt(nonce, plaintext, None)``
    4. ``wrapped_dek = AES-Key-Wrap-with-Padding(kek, dek)``
    5. Return :class:`SealedSecret`. The plaintext DEK is dropped after
       this function returns; callers MUST NOT keep it.

    Parameters
    ----------
    plaintext
        The raw secret bytes (typically a UTF-8 encoded API key).

    Raises
    ------
    RuntimeError
        KEK env var is empty or invalid. See :func:`load_kek`.
    ValueError
        ``plaintext`` is empty. We refuse to seal an empty secret to
        avoid producing rows that decrypt to "" silently and confuse
        operators triaging missing keys.
    """

    if not plaintext:
        raise ValueError("seal_secret: plaintext must not be empty.")

    kek = load_kek()
    dek = os.urandom(DEK_LENGTH_BYTES)
    nonce = os.urandom(GCM_NONCE_LENGTH_BYTES)

    ciphertext = AESGCM(dek).encrypt(nonce, plaintext, associated_data=None)
    wrapped_dek = keywrap.aes_key_wrap_with_padding(kek, dek)

    return SealedSecret(
        ciphertext=ciphertext,
        nonce=nonce,
        wrapped_dek=wrapped_dek,
    )


def open_secret(sealed: SealedSecret) -> bytes:
    """Reverse :func:`seal_secret`. Returns the original plaintext bytes.

    Failure modes
    -------------
    - Wrong KEK -> ``cryptography.exceptions.InvalidUnwrap``.
    - Tampered ciphertext or nonce -> ``cryptography.exceptions.InvalidTag``.
    - KEK env var unset / malformed -> :class:`RuntimeError` from
      :func:`load_kek`.

    The function does NOT swallow exceptions; callers branch on the
    explicit cryptography exception types so an audit log can record
    the precise failure mode (key rotation drift vs storage tamper).
    """

    kek = load_kek()
    dek = keywrap.aes_key_unwrap_with_padding(kek, sealed.wrapped_dek)
    return AESGCM(dek).decrypt(sealed.nonce, sealed.ciphertext, associated_data=None)
