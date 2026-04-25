"""Crypto helpers for Tethys agent identity (W2 NP P5 Session 1).

Covers the round-trip + tamper + wrong-key + malformed PEM matrix on
the three public helpers in :mod:`src.backend.registry.identity.crypto`.
The verify path is exception-safe; every failure returns ``False`` so
consumers can branch on a single bool.
"""

from __future__ import annotations

import pytest

from src.backend.registry.identity.crypto import (
    generate_ed25519_keypair,
    public_pem_to_raw_bytes,
    sign_message,
    verify_signature,
)


def test_generate_returns_two_pem_strings() -> None:
    public_pem, private_pem = generate_ed25519_keypair()
    assert public_pem.startswith("-----BEGIN PUBLIC KEY-----")
    assert public_pem.rstrip().endswith("-----END PUBLIC KEY-----")
    assert private_pem.startswith("-----BEGIN PRIVATE KEY-----")
    assert private_pem.rstrip().endswith("-----END PRIVATE KEY-----")
    # Distinct keys on every call (probabilistic but Ed25519 keyspace
    # is 2**256 wide so collision in test is impossible in practice).
    public_pem_2, _ = generate_ed25519_keypair()
    assert public_pem != public_pem_2


def test_sign_verify_roundtrip() -> None:
    public_pem, private_pem = generate_ed25519_keypair()
    payload = b"NERIUM W2 P5 Tethys identity test payload"
    signature = sign_message(private_pem, payload)
    assert isinstance(signature, bytes)
    assert len(signature) == 64  # Ed25519 signatures are 64 bytes.
    assert verify_signature(public_pem, payload, signature) is True


def test_verify_rejects_tampered_payload() -> None:
    public_pem, private_pem = generate_ed25519_keypair()
    payload = b"original payload"
    signature = sign_message(private_pem, payload)
    tampered = b"tampered payload"
    assert verify_signature(public_pem, tampered, signature) is False


def test_verify_rejects_tampered_signature() -> None:
    public_pem, private_pem = generate_ed25519_keypair()
    payload = b"a payload"
    signature = sign_message(private_pem, payload)
    # Flip a single byte of the signature.
    bad = bytearray(signature)
    bad[0] ^= 0xFF
    assert verify_signature(public_pem, payload, bytes(bad)) is False


def test_verify_rejects_wrong_public_key() -> None:
    _, private_pem = generate_ed25519_keypair()
    other_public_pem, _ = generate_ed25519_keypair()
    payload = b"a payload"
    signature = sign_message(private_pem, payload)
    assert verify_signature(other_public_pem, payload, signature) is False


def test_verify_rejects_malformed_pem_returns_false_not_raises() -> None:
    payload = b"a payload"
    # Pass garbage in place of a PEM and an obviously bad signature
    # blob; the helper must not raise.
    assert verify_signature("not-a-pem", payload, b"\x00" * 64) is False
    # Real signature with a junk public key.
    _, private_pem = generate_ed25519_keypair()
    sig = sign_message(private_pem, payload)
    assert verify_signature("garbage", payload, sig) is False


def test_sign_with_malformed_private_pem_raises_value_error() -> None:
    with pytest.raises(ValueError):
        sign_message("not-a-private-pem", b"payload")


def test_public_pem_to_raw_bytes_returns_32_bytes() -> None:
    public_pem, _ = generate_ed25519_keypair()
    raw = public_pem_to_raw_bytes(public_pem)
    assert isinstance(raw, bytes)
    assert len(raw) == 32
