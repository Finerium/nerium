"""Ed25519 cryptographic primitives for Tethys agent identity.

Owner: Tethys (W2 NP P5 Session 1).

Wraps :mod:`cryptography.hazmat.primitives.asymmetric.ed25519` with three
helpers the rest of the registry pillar uses. Keeping the wrapper thin
ensures a single place to swap the backend if the hackathon's PyNaCl
fallback ever lands; today the standard library cryptography backend is
already a transitive dependency via ``python-jose[cryptography]`` so no
extra wheel is needed.

Contract refs
-------------
- ``docs/contracts/agent_identity.contract.md`` Sections 3.1 (32-byte
  Ed25519 pubkey + PEM serialisation) and 3.3 (artifact manifest sign +
  verify pattern).

Design notes
------------
- The PEM forms used are the same ones PyJWT consumes for ``algorithm=
  "EdDSA"`` in :mod:`src.backend.registry.identity.jwt_edd`. Private
  keys serialise as PKCS8 with no passphrase; public keys serialise as
  ``SubjectPublicKeyInfo``. Both shapes are RFC-aligned and consumed
  unchanged by the JWT EdDSA decoder.
- ``verify_signature`` is exception-safe: it returns ``False`` on any
  cryptography error rather than raising. This lets downstream callers
  (router, middleware, future Kratos tool_use hook) write a single
  branch instead of two.
- The cryptography backend's
  ``Ed25519PublicKey.verify`` uses libsodium-style constant-time
  primitives under the hood, which satisfies the side-channel
  requirement carried by the prompt's hard rule list.
- Private keys NEVER persist. ``generate_ed25519_keypair`` returns the
  PEM string back to the caller exactly once; the CRUD POST handler
  hands the private PEM to the API client in the response body and
  drops the in-memory copy as soon as the request returns.
"""

from __future__ import annotations

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519

__all__ = [
    "generate_ed25519_keypair",
    "sign_message",
    "verify_signature",
]


def generate_ed25519_keypair() -> tuple[str, str]:
    """Generate a fresh Ed25519 keypair as ``(public_pem, private_pem)``.

    Returns
    -------
    tuple[str, str]
        Two PEM-encoded strings. ``public_pem`` is a SubjectPublicKeyInfo
        block. ``private_pem`` is a PKCS8 block without a passphrase.

    The caller MUST treat ``private_pem`` as a single-use secret: it is
    surfaced to the agent owner exactly once on registration and never
    persisted server-side. Storing the private PEM (database, log,
    metric) breaks the contract's threat model.
    """

    private_key = ed25519.Ed25519PrivateKey.generate()
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


def sign_message(private_pem: str, payload: bytes) -> bytes:
    """Sign ``payload`` with the private PEM and return the raw signature.

    Parameters
    ----------
    private_pem
        PKCS8 PEM string emitted by :func:`generate_ed25519_keypair`.
    payload
        Raw bytes to sign. The contract Section 3.3 shape signs the
        ``sha256`` digest of artifacts; this helper does not assume a
        digest, so callers always pass in the already-digested bytes.

    Returns
    -------
    bytes
        64-byte raw Ed25519 signature suitable for base64url encoding
        on the API surface.

    Raises
    ------
    ValueError
        If the PEM is malformed or not an Ed25519 private key.
    """

    private_key = _load_private_pem(private_pem)
    return private_key.sign(payload)


def verify_signature(
    public_pem: str,
    payload: bytes,
    signature: bytes,
) -> bool:
    """Constant-time verify ``signature`` over ``payload`` with ``public_pem``.

    Returns ``True`` on a valid signature, ``False`` on any failure
    mode (bad signature, malformed PEM, wrong key class, byte-length
    mismatch). Never raises; the exception-safe contract lets
    consumers branch on a single bool.
    """

    try:
        public_key = _load_public_pem(public_pem)
    except (ValueError, TypeError):
        return False

    try:
        public_key.verify(signature, payload)
    except InvalidSignature:
        return False
    except (ValueError, TypeError):
        return False
    return True


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _load_private_pem(private_pem: str) -> ed25519.Ed25519PrivateKey:
    """Decode a PEM PKCS8 string into an Ed25519 private key.

    Raises ``ValueError`` if the bytes do not deserialise into an
    Ed25519 key. We refuse non-Ed25519 keys explicitly so a caller
    cannot silently sign with RSA or ECDSA via this helper (Tethys
    contract: Ed25519 only).
    """

    key = serialization.load_pem_private_key(
        private_pem.encode("ascii"),
        password=None,
    )
    if not isinstance(key, ed25519.Ed25519PrivateKey):
        raise ValueError(
            "private PEM must be Ed25519; got "
            f"{type(key).__name__}"
        )
    return key


def _load_public_pem(public_pem: str) -> ed25519.Ed25519PublicKey:
    """Decode a PEM SubjectPublicKeyInfo string into an Ed25519 pubkey."""

    key = serialization.load_pem_public_key(public_pem.encode("ascii"))
    if not isinstance(key, ed25519.Ed25519PublicKey):
        raise ValueError(
            "public PEM must be Ed25519; got "
            f"{type(key).__name__}"
        )
    return key


def public_pem_to_raw_bytes(public_pem: str) -> bytes:
    """Return the 32-byte raw form of a public PEM.

    Used by the DB service to populate the existing ``public_key bytea(32)``
    column added by 037 alongside the new ``public_key_pem`` column.
    """

    public_key = _load_public_pem(public_pem)
    return public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
