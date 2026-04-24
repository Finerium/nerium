"""Cloudflare R2 S3-compatible client factory.

Per file_storage.contract.md Section 1 + RV_NP_RESEARCH.md Section E.28.

Cloudflare R2 exposes an S3-compatible API at
``https://<ACCOUNT_ID>.r2.cloudflarestorage.com``. We use boto3 with
``signature_version='s3v4'`` and ``region='auto'`` per R2's documented
requirements. Credentials flow from pydantic-settings environment binding
(``R2_ACCESS_KEY_ID``, ``R2_SECRET_ACCESS_KEY``, ``R2_ACCOUNT_ID``,
``R2_BUCKET_PUBLIC``, ``R2_BUCKET_PRIVATE``, ``R2_BUCKET_QUARANTINE``,
``R2_CDN_BASE_URL``), which Aether seeds in ``src/backend/config.py``.

The client is constructed once per process lifespan by
``src/backend/main.py`` (Aether session 1) via ``get_r2_client()`` and
passed through FastAPI dependency injection to handlers. The factory is
idempotent and safe to call during test setup with mocked credentials.

No hardcoded secrets. No default bucket. No region other than ``auto``.

Design notes
------------
- Presigned POST is generated with a ``Content-Length-Range`` policy
  condition and an ``x-amz-meta-original-filename`` echoed back so R2
  rejects oversize uploads before the bytes touch disk.
- Default upload expiry is 900 seconds (15 minutes) per contract 4.1.
- Public-bucket GET URLs are served via Cloudflare CDN at
  ``R2_CDN_BASE_URL`` (custom domain bound via Cloudflare Workers), not
  via the raw R2 endpoint, to preserve zero-egress economics.
- Private-bucket GET URLs use presigned S3 ``get_object`` with 7-day TTL
  per contract 4.4. 7 days is the R2-documented maximum for v4 signatures.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

# boto3 is imported lazily inside the factory so the module remains
# importable in environments without AWS SDK (e.g., Aether session 1
# smoke tests that stub the client).
try:  # pragma: no cover - import guard
    import boto3
    from botocore.client import Config as BotoConfig
    from botocore.exceptions import ClientError
except ImportError:  # pragma: no cover - handled in tests via monkeypatch
    boto3 = None  # type: ignore[assignment]
    BotoConfig = None  # type: ignore[assignment]
    ClientError = Exception  # type: ignore[assignment,misc]


@dataclass(frozen=True)
class R2Settings:
    """Strongly-typed subset of environment config consumed by the factory.

    Aether's ``src/backend/config.py`` provides a pydantic-settings
    ``Settings`` object. We copy only the fields we need into a frozen
    dataclass so this module does not import pydantic-settings directly,
    keeping the dependency graph shallow (important for Arq workers that
    boot without the full FastAPI app).
    """

    account_id: str
    access_key_id: str
    secret_access_key: str
    bucket_public: str
    bucket_private: str
    bucket_quarantine: str
    cdn_base_url: str
    endpoint_url: str  # derived: https://<account_id>.r2.cloudflarestorage.com

    @classmethod
    def from_env_dict(cls, env: dict[str, str]) -> R2Settings:
        """Construct from a plain dict (e.g., os.environ or test fixture).

        Fails fast with ``KeyError`` if any required variable is missing.
        No defaults. No fallback to a public bucket for private config.
        """

        account_id = env["R2_ACCOUNT_ID"]
        return cls(
            account_id=account_id,
            access_key_id=env["R2_ACCESS_KEY_ID"],
            secret_access_key=env["R2_SECRET_ACCESS_KEY"],
            bucket_public=env["R2_BUCKET_PUBLIC"],
            bucket_private=env["R2_BUCKET_PRIVATE"],
            bucket_quarantine=env["R2_BUCKET_QUARANTINE"],
            cdn_base_url=env["R2_CDN_BASE_URL"].rstrip("/"),
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        )

    @classmethod
    def from_settings(cls, settings: Any) -> R2Settings:
        """Construct from Aether's pydantic-settings ``Settings`` object.

        Pulls the R2 fields added in Aether's ``config.py`` extension
        (``r2_account_id``, ``r2_access_key_id`` SecretStr, etc). Handles
        the ``SecretStr`` unwrap so the dataclass stores plain strings
        (boto3 does not accept SecretStr). The ``Settings`` type is not
        imported here to keep this module independent of pydantic; we
        duck-type the attribute access instead.
        """

        def _unwrap(v: Any) -> str:
            # pydantic SecretStr has ``get_secret_value``; plain strings do not.
            getter = getattr(v, "get_secret_value", None)
            return getter() if callable(getter) else str(v)

        account_id = str(settings.r2_account_id)
        return cls(
            account_id=account_id,
            access_key_id=_unwrap(settings.r2_access_key_id),
            secret_access_key=_unwrap(settings.r2_secret_access_key),
            bucket_public=str(settings.r2_bucket_public),
            bucket_private=str(settings.r2_bucket_private),
            bucket_quarantine=str(settings.r2_bucket_quarantine),
            cdn_base_url=str(settings.r2_cdn_base_url).rstrip("/"),
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        )


def build_r2_client(settings: R2Settings) -> Any:
    """Build a boto3 S3 client bound to the Cloudflare R2 endpoint.

    Returns the raw boto3 S3 client so callers can use the full S3
    surface (head_object, copy_object, delete_object, get_object,
    generate_presigned_post, generate_presigned_url). The client is
    thread-safe per boto3 documentation and can be shared across
    async handlers; asyncio integration lives in the ``aioboto3``
    wrapper when needed (we use threadpool offload for simple HEAD calls
    and pure-signing helpers which do not issue network I/O).

    Raises
    ------
    RuntimeError
        If boto3 is not installed in the current environment. This is
        only reachable in contrived test setups since Aether's
        ``pyproject.toml`` pins boto3 as a mandatory dependency.
    """

    if boto3 is None:
        raise RuntimeError(
            "boto3 is required for R2 client construction; ensure the "
            "backend environment is provisioned via Aether's pyproject"
        )

    config = BotoConfig(
        signature_version="s3v4",
        region_name="auto",
        # R2 does not honor AWS retry semantics identically; keep the
        # default 5 and rely on our own Tenacity-based retries in the
        # Arq worker for idempotent operations.
        retries={"max_attempts": 3, "mode": "standard"},
        s3={"addressing_style": "path"},
    )

    return boto3.client(
        "s3",
        endpoint_url=settings.endpoint_url,
        aws_access_key_id=settings.access_key_id,
        aws_secret_access_key=settings.secret_access_key,
        config=config,
        region_name="auto",
    )


@lru_cache(maxsize=1)
def _cached_client_for_settings(settings: R2Settings) -> Any:
    """Process-level cache keyed on the frozen settings dataclass.

    The ``lru_cache`` approach works because ``R2Settings`` is frozen
    and therefore hashable. Using a cache avoids constructing a new
    boto3 client on every request, which would leak file descriptors
    under load. Aether's lifespan manager may still hold a reference
    in ``app.state`` for explicit lifecycle control; this cache is a
    defensive second layer, not the primary owner.
    """

    return build_r2_client(settings)


def get_r2_client(settings: R2Settings) -> Any:
    """Public accessor; returns a cached boto3 S3 client.

    Consumers (routers, Arq workers, admin scripts) call this with a
    settings object constructed by Aether's config loader. In tests,
    pass a fake ``R2Settings`` and monkeypatch ``build_r2_client`` to
    return a ``moto`` or ``unittest.mock`` double.
    """

    return _cached_client_for_settings(settings)


def reset_client_cache() -> None:
    """Clear the cached client.

    Useful in test teardown and in ``lifespan.shutdown`` if the
    lifecycle owner wants explicit release of the boto3 internals.
    """

    _cached_client_for_settings.cache_clear()


def public_cdn_url(settings: R2Settings, r2_key: str) -> str:
    """Compose the unsigned CDN URL for a public-bucket object.

    Per contract Section 4.4: public-visibility files skip presigning
    and serve via Cloudflare CDN at ``cdn.nerium.com``. This preserves
    R2's free-egress path (Cloudflare to browser, R2 to Cloudflare
    cached after first miss).
    """

    return f"{settings.cdn_base_url}/{r2_key.lstrip('/')}"


__all__ = [
    "R2Settings",
    "build_r2_client",
    "get_r2_client",
    "reset_client_cache",
    "public_cdn_url",
    "ClientError",
]
