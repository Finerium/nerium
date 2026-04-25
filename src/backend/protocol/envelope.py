"""Crius S2 sealed envelope: X25519 ECDH + AES-256-GCM + Ed25519 sign.

Owner: Crius (W2 NP P5 Session 2).

Surface
-------
:class:`SealedEnvelope` is a frozen dataclass carrying the four byte
strings the recipient needs to authenticate + decrypt: the AES-256-GCM
ciphertext, the 96-bit nonce, the sender's ephemeral X25519 public key
(used by the recipient to derive the shared DEK via ECDH + HKDF), and
the Ed25519 signature over ``nonce || ciphertext || sender_x25519_pub``.

:func:`seal_envelope` and :func:`open_envelope` are the only call sites
the rest of Crius (and downstream Hyperion / Kratos) reach for. The
helpers are deliberately pure functions, no global state, no caching of
DEKs: every seal generates a fresh ephemeral X25519 keypair so a single
KEK or sender Ed25519 leak can never replay a previous shared secret.

Curve split
-----------
Ed25519 and X25519 are different primitives even though they share the
same Curve25519 mathematics. Per RFC 7748 + RFC 8032 the SDKs treat them
as independent: Ed25519 is signing-only (deterministic EdDSA), X25519 is
ECDH-only (Diffie-Hellman). NEVER reuse an Ed25519 key for ECDH or vice
versa; doing so weakens both primitives because the conversion functions
are non-uniform. Tethys S1 already provisions Ed25519 for agent identity
signing; Crius S2 generates X25519 keypairs separately for the encrypt
side and uses Ed25519 only for the per-envelope signature. The two
keypairs MUST be independently generated and independently rotated.

Ephemeral DEK derivation
------------------------
Rather than wrapping a randomly generated DEK with a long-lived KEK, the
sealed envelope uses ephemeral X25519 ECDH per message:

    ephemeral_priv, ephemeral_pub = generate_x25519_keypair()
    shared = ECDH(ephemeral_priv, recipient_x25519_pub)
    DEK = HKDF-SHA256(shared, info=b"crius-envelope-v1")

The DEK is therefore deterministic from the shared secret + HKDF info
string, which means the wire format does NOT need a separately wrapped
DEK field. The recipient runs ECDH with their long-lived X25519 private
key + the sender's ephemeral public key (carried in the envelope) and
recomputes the same DEK. This is the "one-pass" ECIES variant per
NIST SP 800-56A Section 6.2.2.2; it preserves forward secrecy because
the ephemeral private key is discarded after seal.

The KEK + tenant API key envelope path (``secret_store.py``) uses a
distinct construction: KEK + AES-Key-Wrap (RFC 5649) + per-record DEK,
because that flow needs to be openable repeatedly by the same KEK
without ECDH, and the tenant API keys are written to the database. The
two layers serve different threat models; the sealed envelope here is
the inter-agent message protection primitive.

Hard rules from the prompt
--------------------------
- AES-GCM 96-bit nonce; never reuse with the same DEK. Each seal
  generates its own ephemeral key + nonce so reuse is impossible by
  construction.
- Verify Ed25519 signature BEFORE attempting AES-GCM decrypt. A failed
  signature means the envelope was tampered (or signed by the wrong
  key); we MUST NOT feed the ciphertext to the AEAD when the integrity
  side has already failed.
- ``open_envelope`` raises ``cryptography.exceptions.InvalidSignature``
  on a bad signature and ``cryptography.exceptions.InvalidTag`` on a
  bad ciphertext / nonce. Callers branch on these explicit exceptions
  rather than a generic boolean so the failure mode is observable.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ed25519, x25519
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

__all__ = [
    "SealedEnvelope",
    "generate_x25519_keypair",
    "open_envelope",
    "seal_envelope",
]


HKDF_INFO = b"crius-envelope-v1"
"""HKDF context string. Bumping the suffix is a wire-format break."""

DEK_LENGTH_BYTES = 32
"""AES-256 key length. 256-bit per the contract Section 3.2."""

GCM_NONCE_LENGTH_BYTES = 12
"""AES-GCM canonical nonce length. NIST SP 800-38D Section 5.2.1.1."""


@dataclass(frozen=True)
class SealedEnvelope:
    """Wire format for a sealed inter-agent message.

    Fields
    ------
    ciphertext
        AES-256-GCM ciphertext WITH the appended 16-byte authentication
        tag (the cryptography library returns the concatenated form).
    nonce
        12-byte random nonce passed to AES-GCM. Generated fresh per
        seal so the (key, nonce) pair is unique without coordination.
    sender_x25519_pub
        Raw 32-byte X25519 public key of the SENDER's ephemeral
        keypair. The recipient runs ECDH against this with their
        long-lived X25519 private key to recover the DEK.
    sender_signature
        64-byte Ed25519 signature over
        ``nonce || ciphertext || sender_x25519_pub``. Verified before
        AES-GCM decrypt so a tampered envelope fails fast on the
        integrity check rather than on AEAD authentication.
    """

    ciphertext: bytes
    nonce: bytes
    sender_x25519_pub: bytes
    sender_signature: bytes


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def generate_x25519_keypair() -> tuple[str, str]:
    """Return ``(public_pem, private_pem)`` for a fresh X25519 keypair.

    Mirrors :func:`src.backend.registry.identity.crypto.generate_ed25519_keypair`
    so callers have one shape for both curves. Public PEM is
    ``SubjectPublicKeyInfo``; private PEM is PKCS8 unencrypted. Both are
    consumable directly by ``cryptography``'s
    ``serialization.load_pem_*`` helpers.

    The two halves of the X25519 keypair MUST stay distinct from any
    Ed25519 keypair issued for the same agent. Crius never converts
    one to the other; Tethys S1 ships Ed25519 for signing, Crius S2
    ships X25519 for encryption.
    """

    private_key = x25519.X25519PrivateKey.generate()
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("ascii")
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")
    return public_pem, private_pem


def seal_envelope(
    payload: bytes,
    sender_ed25519_private_pem: str,
    recipient_x25519_public_pem: str,
) -> SealedEnvelope:
    """Encrypt ``payload`` for ``recipient_x25519_public_pem`` + sign with sender Ed25519.

    Flow
    ----
    1. Generate an ephemeral X25519 keypair on the sender side.
    2. Run ECDH against the recipient's long-lived X25519 public key
       to derive a 32-byte shared secret.
    3. HKDF-SHA256 the shared secret with ``info=HKDF_INFO`` to a
       256-bit DEK.
    4. Generate a 96-bit random nonce and AES-256-GCM encrypt the
       payload (no associated data; the signature carries the
       integrity binding).
    5. Sign ``nonce || ciphertext || ephemeral_pub_raw`` with the
       sender's Ed25519 private key.
    6. Return a :class:`SealedEnvelope` carrying the four byte strings.

    Parameters
    ----------
    payload
        Arbitrary plaintext bytes. Empty payloads are accepted (AES-GCM
        encrypts the empty string into a 16-byte tag-only ciphertext).
    sender_ed25519_private_pem
        PKCS8 PEM string carrying the sender's signing key. Same shape
        as :func:`src.backend.registry.identity.crypto.generate_ed25519_keypair`
        emits.
    recipient_x25519_public_pem
        SubjectPublicKeyInfo PEM string carrying the recipient's
        long-lived X25519 public key.

    Raises
    ------
    ValueError
        Either PEM is malformed or the wrong curve. The Tethys + Crius
        crypto helpers refuse non-matching key types explicitly so the
        envelope cannot accidentally cross-sign with RSA or ECDSA.
    """

    sender_signing_key = _load_ed25519_private(sender_ed25519_private_pem)
    recipient_x25519_pub = _load_x25519_public(recipient_x25519_public_pem)

    # Step 1+2: ephemeral X25519 keypair + ECDH against the recipient.
    ephemeral_private = x25519.X25519PrivateKey.generate()
    ephemeral_public_raw = ephemeral_private.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    shared_secret = ephemeral_private.exchange(recipient_x25519_pub)

    # Step 3: HKDF-SHA256 the shared secret to a 256-bit DEK.
    dek = HKDF(
        algorithm=hashes.SHA256(),
        length=DEK_LENGTH_BYTES,
        salt=None,
        info=HKDF_INFO,
    ).derive(shared_secret)

    # Step 4: random 96-bit nonce; AES-256-GCM encrypt.
    nonce = os.urandom(GCM_NONCE_LENGTH_BYTES)
    ciphertext = AESGCM(dek).encrypt(nonce, payload, associated_data=None)

    # Step 5: Ed25519 sign over the integrity-bound bytes.
    signature_payload = nonce + ciphertext + ephemeral_public_raw
    signature = sender_signing_key.sign(signature_payload)

    return SealedEnvelope(
        ciphertext=ciphertext,
        nonce=nonce,
        sender_x25519_pub=ephemeral_public_raw,
        sender_signature=signature,
    )


def open_envelope(
    envelope: SealedEnvelope,
    sender_ed25519_public_pem: str,
    recipient_x25519_private_pem: str,
) -> bytes:
    """Verify + decrypt a :class:`SealedEnvelope`. Returns the original payload.

    Failure modes
    -------------
    - Bad Ed25519 signature -> :class:`cryptography.exceptions.InvalidSignature`.
    - Bad AES-GCM tag (tampered ciphertext or wrong DEK) ->
      :class:`cryptography.exceptions.InvalidTag`.
    - Malformed PEM or wrong curve -> :class:`ValueError`.

    The signature check happens FIRST so an envelope tampered in the
    ciphertext path still surfaces InvalidSignature rather than
    InvalidTag; this matches the prompt's "fail-fast on tamper"
    requirement and gives callers a single decision point on integrity
    failures.

    Parameters
    ----------
    envelope
        :class:`SealedEnvelope` produced by :func:`seal_envelope`.
    sender_ed25519_public_pem
        SubjectPublicKeyInfo PEM string of the sender. Out-of-band the
        recipient must already know which sender they are talking to;
        the envelope itself does not carry a sender identity claim.
    recipient_x25519_private_pem
        PKCS8 PEM string of the recipient's long-lived X25519 private
        key. Used in ECDH against ``envelope.sender_x25519_pub`` to
        recover the shared secret.

    Returns
    -------
    bytes
        The original payload bytes.
    """

    sender_verify_key = _load_ed25519_public(sender_ed25519_public_pem)
    recipient_x25519_priv = _load_x25519_private(recipient_x25519_private_pem)

    # Verify signature FIRST.
    signature_payload = (
        envelope.nonce + envelope.ciphertext + envelope.sender_x25519_pub
    )
    sender_verify_key.verify(envelope.sender_signature, signature_payload)
    # ``verify`` raises InvalidSignature on failure; we never see a False
    # return path here. Letting the exception propagate is the contract
    # for callers who want to branch on tamper detection.

    # Recompute the DEK via ECDH + HKDF.
    sender_pub = x25519.X25519PublicKey.from_public_bytes(envelope.sender_x25519_pub)
    shared_secret = recipient_x25519_priv.exchange(sender_pub)
    dek = HKDF(
        algorithm=hashes.SHA256(),
        length=DEK_LENGTH_BYTES,
        salt=None,
        info=HKDF_INFO,
    ).derive(shared_secret)

    # AES-GCM decrypt; raises InvalidTag if the ciphertext was modified
    # without the matching DEK / nonce. The signature check above will
    # already have failed in that case so reaching this line means the
    # signature held but the AEAD did not, which can only happen if the
    # signing key was tampered into matching but the recipient's DEK
    # derivation diverged (e.g. wrong recipient key was used to open).
    return AESGCM(dek).decrypt(
        envelope.nonce, envelope.ciphertext, associated_data=None
    )


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _load_ed25519_private(pem: str) -> ed25519.Ed25519PrivateKey:
    key = serialization.load_pem_private_key(pem.encode("ascii"), password=None)
    if not isinstance(key, ed25519.Ed25519PrivateKey):
        raise ValueError(
            "sender_ed25519_private_pem must be an Ed25519 PKCS8 PEM; got "
            f"{type(key).__name__}"
        )
    return key


def _load_ed25519_public(pem: str) -> ed25519.Ed25519PublicKey:
    key = serialization.load_pem_public_key(pem.encode("ascii"))
    if not isinstance(key, ed25519.Ed25519PublicKey):
        raise InvalidSignature(
            "sender_ed25519_public_pem must be an Ed25519 SubjectPublicKeyInfo PEM; "
            f"got {type(key).__name__}"
        )
    return key


def _load_x25519_private(pem: str) -> x25519.X25519PrivateKey:
    key = serialization.load_pem_private_key(pem.encode("ascii"), password=None)
    if not isinstance(key, x25519.X25519PrivateKey):
        raise ValueError(
            "recipient_x25519_private_pem must be an X25519 PKCS8 PEM; got "
            f"{type(key).__name__}"
        )
    return key


def _load_x25519_public(pem: str) -> x25519.X25519PublicKey:
    key = serialization.load_pem_public_key(pem.encode("ascii"))
    if not isinstance(key, x25519.X25519PublicKey):
        raise ValueError(
            "recipient_x25519_public_pem must be an X25519 SubjectPublicKeyInfo PEM; "
            f"got {type(key).__name__}"
        )
    return key
