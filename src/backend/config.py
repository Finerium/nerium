"""NERIUM backend runtime configuration.

pydantic-settings BaseSettings reading from the process environment with prefix
``NERIUM_``. See ``.env.example`` for the canonical variable list.

The settings object is instantiated once per process via :func:`get_settings`.
Tests MAY override by calling ``get_settings.cache_clear()`` and setting env
vars before the next call, or by constructing ``Settings`` directly.

Contract references
-------------------
- ``docs/contracts/rest_api_base.contract.md`` Section 4.2 CORS policy.
- ``docs/contracts/postgres_multi_tenant.contract.md`` Section 4.1 pool sizing.
- ``docs/contracts/redis_session.contract.md`` Section 4.1 connection.
- ``docs/contracts/observability.contract.md`` Section 4 hooks.

Aether W1 Session 1: Postgres + CORS + trusted host + basic HTTP config.
Session 2 adds Redis + Arq worker settings. Session 3 adds Alembic migration URL.
Field names are stable across sessions; adding fields only, no renames.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

EnvName = Literal["development", "staging", "production"]
LogLevel = Literal["DEBUG", "INFO", "WARN", "WARNING", "ERROR", "CRITICAL"]


class Settings(BaseSettings):
    """NERIUM backend settings bag.

    All fields have a default so ``Settings()`` succeeds in a bare dev shell,
    but production MUST override ``secret_key`` and the DSN URLs via real env
    vars. The :meth:`validate_production_secrets` validator enforces this.
    """

    model_config = SettingsConfigDict(
        env_prefix="NERIUM_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Environment discriminator
    env: EnvName = Field(
        default="development",
        description="Deployment environment: development, staging, or production.",
    )
    version: str = Field(
        default="0.1.0",
        description="Release version surfaced in OpenAPI info.version.",
    )
    log_level: LogLevel = Field(
        default="INFO",
        description="Minimum log level emitted by the root structlog logger.",
    )

    # Secrets
    secret_key: SecretStr = Field(
        default=SecretStr("dev-only-secret-do-not-use-in-production-generate-your-own"),
        description="Signing key for session cookies and CSRF tokens.",
    )

    # HTTP server
    http_host: str = Field(default="0.0.0.0", description="uvicorn bind host.")
    http_port: int = Field(default=3100, ge=1, le=65535, description="uvicorn bind port.")

    # TrustedHostMiddleware + CORSMiddleware inputs, comma-separated env strings
    # decoded by the :meth:`split_csv` validator below.
    trusted_hosts: list[str] = Field(
        default_factory=lambda: ["localhost", "127.0.0.1", "nerium.com", "*.nerium.com"],
        description="Allowed host header values. Non-match returns 400.",
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3100",
            "http://localhost:3000",
            "https://nerium.com",
            "https://claude.ai",
        ],
        description="Exact-origin allowlist for CORS credentialed requests.",
    )

    # Postgres
    database_url: str = Field(
        default="postgresql://nerium_api:nerium_api_pw@localhost:5432/nerium",
        description="asyncpg DSN for the app role. RLS enforced.",
    )
    database_migration_url: str = Field(
        default="postgresql://nerium_migration:nerium_migration_pw@localhost:5432/nerium",
        description="asyncpg DSN for the migration role. BYPASSRLS granted.",
    )
    database_pool_min_size: int = Field(default=2, ge=1, le=1000)
    database_pool_max_size: int = Field(default=20, ge=1, le=1000)
    database_statement_cache_size: int = Field(default=100, ge=0, le=10000)
    database_command_timeout_seconds: float = Field(default=30.0, gt=0.0, le=600.0)

    # Redis (Session 2 wires the client; field present here so config.py stays stable)
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        description="redis-py URL, decode_responses=True applied at client build.",
    )
    redis_max_connections: int = Field(default=50, ge=1, le=1000)

    # Cloudflare R2 storage (Chione owns; Aether exposes config knobs so the
    # settings class stays the single source of truth per the add-only rule).
    # Per file_storage.contract Section 3.2 we run three buckets: public (CDN-
    # served avatars + listing thumbnails), private (invoices, GDPR export,
    # listing asset packs), quarantine (infected objects pending admin review).
    r2_account_id: str = Field(
        default="",
        description="Cloudflare R2 account id; endpoint host is <id>.r2.cloudflarestorage.com.",
    )
    r2_access_key_id: SecretStr = Field(
        default=SecretStr(""),
        description="R2 API token access key id with read/write on the three buckets.",
    )
    r2_secret_access_key: SecretStr = Field(
        default=SecretStr(""),
        description="R2 API token secret access key paired with r2_access_key_id.",
    )
    r2_bucket_public: str = Field(
        default="nerium-public",
        description="CDN-fronted bucket for public avatars + listing thumbnails.",
    )
    r2_bucket_private: str = Field(
        default="nerium-private",
        description="Private bucket for invoices, GDPR export ZIPs, listing asset packs.",
    )
    r2_bucket_quarantine: str = Field(
        default="nerium-quarantine",
        description="Quarantine bucket where infected uploads land for admin review.",
    )
    r2_cdn_base_url: str = Field(
        default="https://cdn.nerium.com",
        description="Cloudflare CDN base URL fronting the public bucket; zero egress path.",
    )

    # ClamAV sidecar (Chione consumer; see file_storage.contract Section 4.3).
    # The default host ``clamav`` matches the docker-compose service name so
    # the FastAPI container and the Arq worker container resolve the sidecar
    # by Docker DNS. Local development may set ``NERIUM_CLAMAV_HOST=localhost``
    # when running the daemon natively.
    clamav_host: str = Field(default="clamav", description="ClamAV daemon hostname.")
    clamav_port: int = Field(default=3310, ge=1, le=65535, description="clamd TCP port.")
    clamav_timeout_seconds: float = Field(
        default=60.0,
        gt=0.0,
        le=300.0,
        description="Per-scan timeout. Halt trigger if breached on large archives.",
    )

    # Observability (Selene owns the wiring; Aether exposes config knobs)
    otel_enabled: bool = Field(default=False)
    otel_endpoint: str = Field(default="")
    grafana_otlp_token: SecretStr = Field(default=SecretStr(""))
    glitchtip_dsn: SecretStr = Field(default=SecretStr(""))

    # Downstream hooks (optional, not used in Session 1)
    anthropic_api_key: SecretStr = Field(default=SecretStr(""))
    hemera_bootstrap_builder_live: bool = Field(default=False)

    # --- Validators ---

    @field_validator("trusted_hosts", "cors_origins", mode="before")
    @classmethod
    def split_csv(cls, value: object) -> list[str]:
        """Accept a comma-separated env string or an already-parsed list.

        pydantic-settings by default fails on comma-separated values for list
        fields. This validator normalizes both shapes.
        """

        if value is None:
            return []
        if isinstance(value, str):
            trimmed = value.strip()
            if not trimmed:
                return []
            return [item.strip() for item in trimmed.split(",") if item.strip()]
        if isinstance(value, (list, tuple)):
            return [str(item).strip() for item in value if str(item).strip()]
        raise TypeError(f"Expected str or list for CSV-style field, got {type(value).__name__}")

    @field_validator("database_pool_max_size")
    @classmethod
    def check_pool_sizes(cls, max_size: int, info) -> int:  # type: ignore[no-untyped-def]
        min_size = info.data.get("database_pool_min_size", 2)
        if max_size < min_size:
            raise ValueError(
                f"database_pool_max_size ({max_size}) must be >= "
                f"database_pool_min_size ({min_size})."
            )
        return max_size

    # --- Derived properties ---

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def is_development(self) -> bool:
        return self.env == "development"

    def validate_production_secrets(self) -> None:
        """Raise if production is running with development defaults.

        Called by the lifespan startup hook. Kept separate from pydantic
        validation so tests can instantiate Settings() without env overrides.
        """

        if not self.is_production:
            return
        default_secret = "dev-only-secret-do-not-use-in-production-generate-your-own"
        if self.secret_key.get_secret_value() == default_secret:
            raise RuntimeError(
                "NERIUM_SECRET_KEY is still the development default. "
                "Generate a fresh key for production via: "
                "python -c 'import secrets; print(secrets.token_urlsafe(64))'"
            )
        if "localhost" in self.database_url:
            raise RuntimeError(
                "NERIUM_DATABASE_URL points at localhost in production. "
                "Update to the Hetzner CX32 internal DSN."
            )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide Settings singleton.

    Cache kept at module scope so FastAPI dependency injection reuses the same
    instance across requests. Tests call ``get_settings.cache_clear()`` to
    rebuild after env patches.
    """

    return Settings()
