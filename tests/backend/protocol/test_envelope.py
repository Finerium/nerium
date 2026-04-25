"""Sealed envelope crypto roundtrip + tamper detection tests.

Covers :mod:`src.backend.protocol.envelope`:
- seal -> open returns the original payload byte-for-byte.
- Tampered ciphertext fails Ed25519 signature verification first
  (signature carries the integrity binding over nonce + ct + sender pub).
- Tampered signature fails verification.
- Wrong recipient X25519 key cannot derive the DEK; AEAD decrypt fails.
- Wrong sender Ed25519 public key fails signature verification.
- :func:`generate_x25519_keypair` round-trips through PEM
  serialisation.
"""

from __future__ import annotations

import pytest
from cryptography.exceptions import InvalidSignature, InvalidTag

from src.backend.protocol.envelope import (
    SealedEnvelope,
    generate_x25519_keypair,
    open_envelope,
    seal_envelope,
)
from src.backend.registry.identity.crypto import generate_ed25519_keypair


def _key_pair() -> tuple[str, str, str, str]:
    """Return ``(sender_ed_pub, sender_ed_priv, recipient_x_pub, recipient_x_priv)``."""

    sender_pub, sender_priv = generate_ed25519_keypair()
    recipient_pub, recipient_priv = generate_x25519_keypair()
    return sender_pub, sender_priv, recipient_pub, recipient_priv


def test_seal_open_roundtrip() -> None:
    """A sealed envelope opens to the same plaintext on the recipient side."""

    sender_pub, sender_priv, rcpt_pub, rcpt_priv = _key_pair()

    payload = b"hello crius envelope"
    sealed = seal_envelope(payload, sender_priv, rcpt_pub)
    assert isinstance(sealed, SealedEnvelope)
    assert len(sealed.nonce) == 12
    assert len(sealed.sender_x25519_pub) == 32
    assert len(sealed.sender_signature) == 64
    # ciphertext = ct + 16-byte tag, so length >= len(payload)+16.
    assert len(sealed.ciphertext) == len(payload) + 16

    recovered = open_envelope(sealed, sender_pub, rcpt_priv)
    assert recovered == payload


def test_tampered_ciphertext_fails_signature_first() -> None:
    """Flipping a single byte in ciphertext fails Ed25519 verify, not AES-GCM tag.

    The signature covers nonce + ciphertext + sender_pub so a ciphertext
    tamper invalidates the signature. We assert ``InvalidSignature``
    is raised (NOT ``InvalidTag``) so the fail-fast property is honoured.
    """

    sender_pub, sender_priv, rcpt_pub, rcpt_priv = _key_pair()
    sealed = seal_envelope(b"top secret", sender_priv, rcpt_pub)

    flipped = bytearray(sealed.ciphertext)
    flipped[0] ^= 0x01
    tampered = SealedEnvelope(
        ciphertext=bytes(flipped),
        nonce=sealed.nonce,
        sender_x25519_pub=sealed.sender_x25519_pub,
        sender_signature=sealed.sender_signature,
    )

    with pytest.raises(InvalidSignature):
        open_envelope(tampered, sender_pub, rcpt_priv)


def test_tampered_signature_fails_verification() -> None:
    """A modified signature byte fails verification."""

    sender_pub, sender_priv, rcpt_pub, rcpt_priv = _key_pair()
    sealed = seal_envelope(b"payload", sender_priv, rcpt_pub)

    flipped = bytearray(sealed.sender_signature)
    flipped[-1] ^= 0xFF
    tampered = SealedEnvelope(
        ciphertext=sealed.ciphertext,
        nonce=sealed.nonce,
        sender_x25519_pub=sealed.sender_x25519_pub,
        sender_signature=bytes(flipped),
    )

    with pytest.raises(InvalidSignature):
        open_envelope(tampered, sender_pub, rcpt_priv)


def test_wrong_recipient_key_fails_decrypt() -> None:
    """ECDH with the wrong recipient private key derives a different DEK.

    The signature still verifies because the sender's Ed25519 key
    signed the original bytes; what fails is the AES-GCM tag check
    after the wrong DEK is used to decrypt.
    """

    sender_pub, sender_priv, rcpt_pub, _rcpt_priv = _key_pair()
    sealed = seal_envelope(b"payload", sender_priv, rcpt_pub)

    # Generate an unrelated recipient keypair; its private key cannot
    # recover the shared secret because ECDH(other_priv, sender_pub) !=
    # ECDH(rcpt_priv, sender_pub).
    _other_pub, other_priv = generate_x25519_keypair()

    with pytest.raises(InvalidTag):
        open_envelope(sealed, sender_pub, other_priv)


def test_wrong_sender_pub_fails_signature_verification() -> None:
    """A different sender's Ed25519 public key fails signature verify."""

    _sender_pub, sender_priv, rcpt_pub, rcpt_priv = _key_pair()
    other_pub, _other_priv = generate_ed25519_keypair()
    sealed = seal_envelope(b"payload", sender_priv, rcpt_pub)

    with pytest.raises(InvalidSignature):
        open_envelope(sealed, other_pub, rcpt_priv)


def test_x25519_keypair_pem_roundtrip() -> None:
    """generate_x25519_keypair emits PEM strings that the helper consumes back."""

    pub_pem, priv_pem = generate_x25519_keypair()
    assert pub_pem.startswith("-----BEGIN PUBLIC KEY-----")
    assert priv_pem.startswith("-----BEGIN PRIVATE KEY-----")

    # A second pair seals + opens with the first; pem round-trip works
    # via the same load helpers used inside seal/open.
    sender_ed_pub, sender_ed_priv = generate_ed25519_keypair()
    payload = b"x25519 pem ok"
    sealed = seal_envelope(payload, sender_ed_priv, pub_pem)
    assert open_envelope(sealed, sender_ed_pub, priv_pem) == payload


def test_seal_empty_payload_is_authenticated_tag_only() -> None:
    """Empty payload still produces a 16-byte ciphertext (the GCM tag)."""

    sender_pub, sender_priv, rcpt_pub, rcpt_priv = _key_pair()
    sealed = seal_envelope(b"", sender_priv, rcpt_pub)
    assert len(sealed.ciphertext) == 16
    assert open_envelope(sealed, sender_pub, rcpt_priv) == b""


def test_sender_pub_is_ephemeral_per_seal() -> None:
    """Two seals from the same sender produce different ephemeral pubkeys."""

    _sender_pub, sender_priv, rcpt_pub, _rcpt_priv = _key_pair()
    a = seal_envelope(b"first", sender_priv, rcpt_pub)
    b = seal_envelope(b"second", sender_priv, rcpt_pub)
    assert a.sender_x25519_pub != b.sender_x25519_pub
    assert a.nonce != b.nonce
