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

    # Nike realtime ticket signing key. In development an empty value
    # falls back to :attr:`secret_key` so the dev + test harness keeps
    # working; in production the lifespan hook validates this is set to
    # a non-empty dedicated secret (see :meth:`validate_production_secrets`).
    # Environment variable: ``NERIUM_REALTIME_TICKET_SECRET``.
    realtime_ticket_secret: SecretStr = Field(
        default=SecretStr(""),
        description=(
            "Nike realtime ticket HS256 signing key. Empty = dev fallback "
            "to secret_key. Production MUST override via env."
        ),
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

    # Transactional email (Pheme consumer; Aether exposes config knobs so the
    # Settings class stays the single source of truth per the add-only rule).
    # Per email_transactional.contract.md Section 3.3 + 4.1 we ship Resend as
    # the primary provider with Mailtrap available in dev via EMAIL_ENV=dev.
    # The API key + DKIM CNAME are applied by Ghaisan post-deploy; the code
    # fails closed at send time with a clear error when the key is unset.
    resend_api_key: SecretStr = Field(
        default=SecretStr(""),
        description=(
            "Resend API key (re_...). Populated by Ghaisan after the "
            "mail.nerium.com DKIM CNAME propagates and the domain verifies "
            "in the Resend dashboard. Empty string fails closed at send."
        ),
    )
    resend_from_email: str = Field(
        default="noreply@mail.nerium.com",
        description=(
            "Default From header for system transactional mail. Must sit on "
            "the mail.nerium.com subdomain so DKIM + SPF align."
        ),
    )
    resend_reply_to_email: str = Field(
        default="support@nerium.com",
        description=(
            "Default Reply-To header. Separate from From so replies land on "
            "the main domain (Cloudflare Email Routing forwards to Ghaisan)."
        ),
    )
    resend_webhook_secret: SecretStr = Field(
        default=SecretStr(""),
        description=(
            "HMAC secret used by Resend to sign webhook payloads. Populated "
            "by Ghaisan from the Resend dashboard Webhooks tab."
        ),
    )
    email_env: Literal["dev", "staging", "production"] = Field(
        default="dev",
        description=(
            "Email routing environment. 'dev' pipes all sends to Mailtrap "
            "(no real delivery). 'staging' + 'production' use Resend."
        ),
    )
    email_warmup_start: str = Field(
        default="",
        description=(
            "ISO-8601 date (YYYY-MM-DD) capturing when warmup began. Empty "
            "string disables the warmup cap (pre-launch dev mode). Pheme "
            "consults this to compute the per-day cap schedule."
        ),
    )
    email_unsubscribe_base_url: str = Field(
        default="https://nerium.com",
        description=(
            "Base URL used to construct one-click unsubscribe tokens. "
            "Combined with ``/unsubscribe?token=<hmac>`` per contract 4.3."
        ),
    )
    mailtrap_inbox_id: str = Field(
        default="",
        description="Mailtrap sandbox inbox id. Only read when EMAIL_ENV=dev.",
    )
    mailtrap_api_token: SecretStr = Field(
        default=SecretStr(""),
        description="Mailtrap sandbox API token. Only read when EMAIL_ENV=dev.",
    )

    # Downstream hooks (optional, not used in Session 1)
    anthropic_api_key: SecretStr = Field(default=SecretStr(""))
    hemera_bootstrap_builder_live: bool = Field(default=False)

    # Moros (Chronos budget daemon, NP P3 S1) knobs. The Admin API key
    # is org-scoped (distinct from ``anthropic_api_key`` which is the
    # runtime Messages API key used by Kratos). If unset the poller
    # logs a warning and skips the cycle rather than crashing so the
    # daemon degrades gracefully in dev / test harnesses.
    anthropic_admin_api_key: SecretStr = Field(
        default=SecretStr(""),
        description=(
            "Anthropic Admin API key (org-scoped) used by Moros to poll "
            "``/v1/organizations/cost_report`` + ``/usage_report/messages``. "
            "Empty = poller logs warn + skips cycle."
        ),
    )
    anthropic_admin_api_base_url: str = Field(
        default="https://api.anthropic.com",
        description="Base URL for the Anthropic Admin API. Override in tests.",
    )
    chronos_poll_interval_seconds: int = Field(
        default=600,
        ge=60,
        le=3600,
        description=(
            "Moros usage_api_poller cadence. Contract calls for 5 min "
            "but the prompt directs 10 min default; keep the override knob "
            "so ops can tune on the fly without redeploy."
        ),
    )
    chronos_backoff_base_seconds: float = Field(
        default=30.0,
        gt=0.0,
        le=600.0,
        description="Exponential-backoff base delay when the Admin API errors.",
    )
    chronos_backoff_max_seconds: float = Field(
        default=600.0,
        gt=0.0,
        le=3600.0,
        description="Exponential-backoff ceiling for consecutive Admin API failures.",
    )
    chronos_consecutive_failure_alert: int = Field(
        default=5,
        ge=1,
        le=50,
        description=(
            "Alert threshold. After this many back-to-back poll failures "
            "Moros logs an ERROR and surfaces ``last_error`` via "
            "``GET /v1/admin/budget/status``."
        ),
    )
    chronos_admin_api_timeout_seconds: float = Field(
        default=15.0,
        gt=0.0,
        le=120.0,
        description="httpx request timeout for Admin API calls.",
    )

    # Plutus (W2 NP P4 S1) Stripe billing knobs. Test mode only pre-Atlas
    # per Gate 4 lock. Live mode is gated on the Hemera
    # ``billing.live_mode_enabled`` flag AND a non-empty live key; any
    # shipped-code path that attempts to hit live endpoints without the
    # flag flipped raises a 403 at the router. The test key here stays
    # empty in the dev default so a fresh clone boots without any
    # Stripe dashboard; consumers that need a real test session export
    # ``NERIUM_STRIPE_SECRET_KEY_TEST`` before ``uvicorn``.
    stripe_secret_key_test: SecretStr = Field(
        default=SecretStr(""),
        description=(
            "Stripe TEST MODE secret key (sk_test_...). Empty = skip "
            "Stripe init; any endpoint that needs the client raises 503. "
            "Populate from the Stripe test dashboard."
        ),
    )
    stripe_webhook_secret: SecretStr = Field(
        default=SecretStr(""),
        description=(
            "Stripe webhook signing secret (whsec_...). Verified via "
            "stripe.Webhook.construct_event on every POST /v1/billing/"
            "webhook/stripe. Empty = reject every webhook with 401."
        ),
    )
    stripe_api_version: str = Field(
        default="2024-09-30.acacia",
        description=(
            "Stripe API version pin. Updated explicitly via ferry; "
            "never auto-bumped at runtime."
        ),
    )
    # Plan Price IDs. Free has no Stripe Price (handled entirely in-app).
    # Populate from the Stripe dashboard test mode Prices tab.
    stripe_price_id_starter: str = Field(
        default="",
        description=(
            "Stripe Price id for the Starter tier (USD 19/month). Empty "
            "allowed in dev; /v1/billing/checkout returns 503 if the "
            "caller picks a tier whose price id is unset."
        ),
    )
    stripe_price_id_pro: str = Field(
        default="",
        description="Stripe Price id for the Pro tier (USD 49/month).",
    )
    stripe_price_id_team: str = Field(
        default="",
        description="Stripe Price id for the Team tier (USD 149/month).",
    )
    stripe_success_url: str = Field(
        default="https://nerium.com/billing/success",
        description=(
            "Default success_url passed to Stripe Checkout Sessions when "
            "the caller omits the override."
        ),
    )
    stripe_cancel_url: str = Field(
        default="https://nerium.com/billing/cancel",
        description="Default cancel_url for Stripe Checkout Sessions.",
    )

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
        realtime_secret = self.realtime_ticket_secret.get_secret_value()
        if not realtime_secret:
            raise RuntimeError(
                "NERIUM_REALTIME_TICKET_SECRET is unset in production. "
                "Generate a dedicated 64-byte key: "
                "python -c 'import secrets; print(secrets.token_urlsafe(64))'"
            )

    def effective_realtime_ticket_secret(self) -> str:
        """Return the realtime ticket signing key.

        Production returns :attr:`realtime_ticket_secret` (guaranteed
        non-empty by :meth:`validate_production_secrets`). Development
        + test fall back to :attr:`secret_key` so the fixture harness
        keeps working without a dedicated env var.
        """

        explicit = self.realtime_ticket_secret.get_secret_value()
        if explicit:
            return explicit
        return self.secret_key.get_secret_value()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide Settings singleton.

    Cache kept at module scope so FastAPI dependency injection reuses the same
    instance across requests. Tests call ``get_settings.cache_clear()`` to
    rebuild after env patches.
    """

    return Settings()
