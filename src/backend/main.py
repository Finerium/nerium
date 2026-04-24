"""NERIUM backend FastAPI app factory.

Owner: Aether (W1 production core). Downstream agents mount routers under
``/v1/<pillar>/*`` by importing :func:`create_app` or by importing the
shared app object returned from this module.

Session 1 baseline
------------------
- Lifespan context manager: open asyncpg pool on startup, close on shutdown.
- Settings load via ``get_settings``.
- TrustedHost and CORS middleware wired per contract Section 4.1 and 4.2.
- Healthz + readyz + version endpoints mounted at the root.
- OpenAPI 3.1 spec served at ``/openapi.json``; Swagger at ``/docs-swagger``
  (per contract 4.4 ``docs.public`` flag defaults true pre-GA); Redoc at
  ``/docs``.
- Router index placeholder ``/v1/__placeholder`` so downstream agents can
  ``app.include_router`` under the ``/v1`` prefix without scaffold churn.

Session 2 additions (Aether)
----------------------------
- Redis ``ConnectionPool`` opened + closed in lifespan, with Arq redis
  handle installed into :mod:`src.backend.workers.arq_redis` so
  request-time enqueue call sites see a process-wide handle.
- Selene correlation-id + access-log middleware wired (observability
  subsystem already shipped on disk).
- Aether auth, tenant-binding, rate-limit middleware wired in the
  contract-mandated order.
- RFC 7807 problem+json exception handlers registered for
  :class:`ProblemException`, pydantic ``RequestValidationError``,
  Starlette ``HTTPException``, and the catch-all ``Exception`` so every
  failure shape is consistent across agents.

Session 3 will add:
- Full schema migrations applied at boot (optional dev-mode flag).
- Seed data script.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from src.backend.auth.router import oauth_router
from src.backend.config import Settings, get_settings
from src.backend.db.pool import close_pool, create_app_pool, set_pool
from src.backend.errors import register_problem_handlers
from src.backend.healthz import router as healthz_router
from src.backend.mcp.server import mount_mcp
from src.backend.mcp.well_known import router as well_known_router
from src.backend.middleware.access_log import install_access_log
from src.backend.middleware.auth import install_auth
from src.backend.middleware.correlation_id import install_correlation_id
from src.backend.middleware.rate_limit import install_rate_limit
from src.backend.middleware.tenant_binding import install_tenant_binding
from src.backend.redis_client import (
    close_redis_pool,
    create_redis_pool,
    set_redis_pool,
)
from src.backend.workers.arq_redis import set_arq_redis

logger = logging.getLogger(__name__)


# The ``/v1`` prefix is locked per docs/contracts/rest_api_base.contract.md
# Section 3.1. All tenant + stateful endpoints from downstream agents mount
# under this prefix. Khronos (/mcp), OAuth well-knowns, and admin panel
# routes mount outside the prefix per their own contracts.
API_V1_PREFIX = "/v1"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """App lifespan. Open all shared pools on startup, close on shutdown.

    Startup sequence
    ----------------
    1. Resolve settings (raises early if required env vars are missing).
    2. Validate production secrets.
    3. Open the asyncpg pool sized per settings.
    4. Open the Redis :class:`ConnectionPool` and eagerly PING so
       lifespan fails fast when Redis is unreachable.
    5. Build an Arq ``create_pool`` redis handle (if ``arq`` is importable)
       and install it via :func:`set_arq_redis` so per-agent enqueue
       call sites see a process-wide handle.
    6. Stash settings + pools on ``app.state`` for FastAPI dependency access.
    7. Log a concise banner line with env + version.

    Shutdown sequence is the reverse. Partial-failure cleanup walks the
    already-opened handles, skipping any that never came up.
    """

    settings: Settings = get_settings()
    settings.validate_production_secrets()

    logger.info(
        "lifespan.startup.begin env=%s version=%s",
        settings.env,
        settings.version,
    )

    # 1) Postgres pool (required for all handlers).
    pool = await create_app_pool(settings)
    set_pool(pool)

    # 2) Redis pool (required for rate limit + session + arq enqueue).
    try:
        redis_pool = await create_redis_pool(settings)
    except Exception:
        # Unwind the DB pool so we don't leak connections if Redis is down.
        await close_pool()
        raise
    set_redis_pool(redis_pool)

    # 3) Arq redis handle. Kept optional so a minimal dev setup without
    #    Arq installed still boots; production always has arq pinned.
    arq_redis = None
    try:
        from arq import create_pool as arq_create_pool

        from src.backend.workers.arq_worker import build_redis_settings

        arq_redis = await arq_create_pool(build_redis_settings(settings))
        set_arq_redis(arq_redis)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "lifespan.arq.unavailable err=%s; background enqueues will raise",
            exc,
        )

    app.state.settings = settings
    app.state.db_pool = pool
    app.state.redis_pool = redis_pool
    app.state.arq_redis = arq_redis

    # 4) Hemera flag bootstrap + invalidation listener.
    # Bootstrap preloads every flag default into a process-local dict
    # so sync consumers (Khronos rate-limit boot-time registration) can
    # read without hitting DB. The listener drops cached entries +
    # refreshes the bootstrap when any worker publishes on
    # ``flag:invalidate``. Both are best-effort: if the hemera_flag
    # table has not been migrated yet (fresh dev DB before first
    # ``alembic upgrade``) the bootstrap swallows the failure so the
    # API still boots.
    flag_listener = None
    try:
        from src.backend.flags.invalidator import start_invalidation_listener
        from src.backend.flags.service import bootstrap_all_flags

        try:
            await bootstrap_all_flags()
        except Exception as exc:
            logger.warning(
                "lifespan.flags.bootstrap_deferred err=%s; "
                "run alembic upgrade + apply default_flags seed",
                exc,
            )
        flag_listener = await start_invalidation_listener()

        # Moros (W2 NP P3 S1) idempotent flag seed. Creates the three
        # budget flags if absent (ma.daily_budget_usd, ma.monthly_budget_usd,
        # ma.budget_cap_threshold). Existing rows are never overwritten so
        # admin tunings persist across restarts. The helper swallows DB
        # errors so the API still boots on a fresh dev DB.
        try:
            from src.backend.budget.hemera_seed import ensure_moros_flags

            await ensure_moros_flags()
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("lifespan.flags.moros_seed_failed err=%s", exc)

        # Refresh MCP rate-limit policies now that Hemera DB values are
        # loaded. Khronos's boot-time registration used env-var fallback;
        # the refresh path reads the live default from the bootstrap
        # cache and re-registers via REGISTRY.replace.
        try:
            from src.backend.middleware.rate_limit_mcp import (
                refresh_mcp_rate_limit_policies_from_flags,
            )

            await refresh_mcp_rate_limit_policies_from_flags()
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning(
                "lifespan.flags.mcp_policy_refresh_failed err=%s", exc
            )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("lifespan.flags.bootstrap_failed err=%s", exc)

    app.state.flag_listener = flag_listener

    # 5) Nike realtime ConnectionManager. Installed after Redis so it
    #    can grab a pub/sub subscriber connection. Best-effort: a
    #    failure here logs + continues so the API still boots when the
    #    realtime subsystem is degraded.
    try:
        from src.backend.realtime.lifespan import install_realtime

        await install_realtime()
        app.state.realtime_up = True
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("lifespan.realtime.install_failed err=%s", exc)
        app.state.realtime_up = False

    logger.info(
        "lifespan.startup.complete pool_min=%d pool_max=%d redis_max=%d arq=%s flags=%s realtime=%s",
        settings.database_pool_min_size,
        settings.database_pool_max_size,
        settings.redis_max_connections,
        "up" if arq_redis is not None else "off",
        "up" if flag_listener is not None else "off",
        "up" if getattr(app.state, "realtime_up", False) else "off",
    )

    try:
        yield
    finally:
        logger.info("lifespan.shutdown.begin")
        try:
            from src.backend.realtime.lifespan import shutdown_realtime

            await shutdown_realtime()
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("lifespan.realtime.shutdown_failed err=%s", exc)
        if flag_listener is not None:
            try:
                from src.backend.flags.invalidator import (
                    stop_invalidation_listener,
                )

                await stop_invalidation_listener()
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("lifespan.flags.listener_stop_failed err=%s", exc)
        if arq_redis is not None:
            try:
                await arq_redis.close(close_connection_pool=True)
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning("lifespan.arq.close_failed err=%s", exc)
            set_arq_redis(None)
        await close_redis_pool()
        await close_pool()
        app.state.db_pool = None
        app.state.redis_pool = None
        app.state.arq_redis = None
        app.state.flag_listener = None
        app.state.realtime_up = False
        logger.info("lifespan.shutdown.complete")


def _install_middleware(app: FastAPI, settings: Settings) -> None:
    """Register the middleware stack in the contract-mandated order.

    FastAPI / Starlette apply middleware in **reverse registration
    order**: the last ``add_middleware`` call produces the outermost
    wrapper. Per ``rest_api_base.contract.md`` Section 4.1 the request
    path (outermost to innermost) must be

        CORS -> TrustedHost -> CorrelationId -> AccessLog -> RateLimit
             -> Auth -> TenantBinding -> route handler

    so the registration order below is the reverse of that chain.

    Middleware ownership
    --------------------
    - CORS, TrustedHost, RateLimit, Auth, TenantBinding: Aether.
    - CorrelationId, AccessLog: Selene (observability). Aether wires
      them here so the request-id contextvar is available to every
      downstream middleware and route handler.
    """

    # 7) Tenant binding (innermost). Runs LAST on request path.
    install_tenant_binding(app)

    # 6) Auth. Khronos injects the RS256 / JWKS verifier so bearer tokens
    # minted via the OAuth DCR flow (src/backend/auth/) validate against
    # the rotating JWKS. Aether's HS256 fallback remains available in the
    # verifier module but is not wired in production.
    from src.backend.mcp.auth import khronos_rs256_verifier

    install_auth(app, settings=settings, verifier=khronos_rs256_verifier)

    # 5) Rate limit. Khronos registers per-path policies for /mcp and
    # /oauth before the middleware dispatches so the first request gets
    # the right bucket.
    from src.backend.middleware.rate_limit_mcp import register_mcp_rate_limit_policies

    register_mcp_rate_limit_policies()
    install_rate_limit(app)

    # 4) Access log (Selene).
    install_access_log(app)

    # 3) Correlation id (Selene).
    install_correlation_id(app)

    # 2) Trusted host.
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings.trusted_hosts,
    )

    # 1) CORS (outermost). Runs FIRST on request path.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "authorization",
            "content-type",
            "idempotency-key",
            "x-request-id",
        ],
        expose_headers=[
            "x-request-id",
            "ratelimit",
            "ratelimit-policy",
            "retry-after",
            "idempotency-replayed",
        ],
        max_age=3600,
    )


def _build_v1_placeholder_router() -> APIRouter:
    """Placeholder router mounted at ``/v1`` so downstream agents can
    ``app.include_router(..., prefix="/v1")`` cleanly.

    The placeholder endpoint returns a short list of mounted sub-routers
    so Nemea-RV-v2 smoke tests can assert that expected pillars are
    loaded. Wave 2 agents replace or extend this router as they ship.
    """

    router = APIRouter()

    @router.get(
        "/__placeholder",
        summary="Router mount probe",
        include_in_schema=False,
    )
    async def placeholder(request: Request) -> dict[str, object]:
        # Surface the Session 3 mount report so Nemea E2E can assert
        # that a given pillar loaded. ``app.state.v1_mount_report`` is
        # populated by ``mount_v1_routers`` at app construction time.
        raw_report = getattr(request.app.state, "v1_mount_report", []) or []
        mounted = [label for (label, status) in raw_report if status == "mounted"]
        return {
            "api_version": "v1",
            "mounted_subrouters": mounted,
            "mount_report": [
                {"label": label, "status": status} for (label, status) in raw_report
            ],
            "note": (
                "Downstream NP agents (Khronos, Phanes, Hyperion, Kratos, Nike, "
                "Plutus, Iapetus, Tethys, Crius, Astraea, Chione, Pheme, Hemera, "
                "Eunomia, Moros, Marshall) register their routers via "
                "src.backend.routers.v1.mount_v1_routers."
            ),
        }

    return router


def create_app(settings: Settings | None = None) -> FastAPI:
    """Construct the FastAPI application.

    Parameters
    ----------
    settings
        Optional explicit ``Settings`` instance. Tests use this to override
        env-driven config without polluting the process env. When ``None``
        the app reads ``get_settings()`` at lifespan startup.

    Returns
    -------
    FastAPI
        Ready to be served by ``uvicorn`` via
        ``uvicorn --factory src.backend.main:create_app``.
    """

    resolved = settings or get_settings()

    app = FastAPI(
        title="NERIUM API",
        description=(
            "Infrastructure for the AI agent economy. FastAPI production core, "
            "Postgres 16 multi-tenant with Row-Level Security, Redis 7, Arq "
            "background queue."
        ),
        version=resolved.version,
        lifespan=lifespan,
        openapi_url="/openapi.json",
        docs_url="/docs-swagger",
        redoc_url="/docs",
        openapi_tags=[
            {"name": "health", "description": "Liveness, readiness, version probes."},
        ],
    )

    # Pin OpenAPI 3.1 per contract Section 4.4. FastAPI 0.115+ defaults to
    # 3.1 but we declare it explicitly to guard against upstream defaults.
    app.openapi_version = "3.1.0"

    _install_middleware(app, resolved)

    # RFC 7807 problem+json exception handlers. Registered after
    # middleware so the correlation-id contextvar is available when the
    # handler pulls it into the envelope.
    register_problem_handlers(app)

    # Platform-level endpoints outside /v1 per contract Section 3.1.
    app.include_router(healthz_router)

    # Khronos (W1 MCP + OAuth 2.1 DCR). /oauth/* + /.well-known/oauth-* mount
    # outside /v1 per docs/contracts/mcp_server.contract.md Section 3.1. The
    # /mcp Streamable HTTP surface is mounted as an ASGI sub-app via
    # mount_mcp(app) so FastMCP's request handling bypasses FastAPI's body
    # parsing per MCP spec revision 2025-06-18.
    app.include_router(oauth_router)
    app.include_router(well_known_router)
    mount_mcp(app)

    # Pheme (W1 transactional email). Three routers ship:
    #   * unsubscribe: ``GET /unsubscribe`` landing (public, no prefix)
    #     and ``POST /v1/email/unsubscribe`` RFC 8058 one-click.
    #   * webhook:     ``POST /v1/email/webhooks/resend`` Resend callback.
    #   * preview:     ``GET /v1/email/preview/...`` dev-only, 404s in
    #     production via ``email_env`` settings gate.
    # See docs/contracts/email_transactional.contract.md Section 4.3 + 4.4.
    from src.backend.routers.v1.email import (
        preview_router as _email_preview_router,
        unsubscribe_router as _email_unsubscribe_router,
        webhook_router as _email_webhook_router,
    )

    app.include_router(_email_unsubscribe_router)
    app.include_router(_email_webhook_router)
    app.include_router(_email_preview_router)

    # /v1 placeholder so downstream agents can mount without repo churn.
    # Kept for back-compat with Session 1 + 2 mount-probe tests; the
    # Session 3 mount index below supersedes it for real pillar
    # routers. The placeholder remains ``include_in_schema=False`` so
    # OpenAPI stays clean.
    app.include_router(_build_v1_placeholder_router(), prefix=API_V1_PREFIX)

    # Session 3 resilient pillar router mount. Each registered router
    # imports lazily; a pillar that has not shipped yet is logged and
    # skipped rather than crashing the app factory. Production mount
    # order is deterministic per ``_PILLAR_REGISTRY``.
    from src.backend.routers.v1 import mount_v1_routers

    app.state.v1_mount_report = mount_v1_routers(app, prefix=API_V1_PREFIX)

    return app


# Module-level app instance. Convenience for ``uvicorn src.backend.main:app``
# invocations, particularly during interactive development. Production runs
# use the factory form ``--factory src.backend.main:create_app`` so tests
# and alembic can import this module without triggering app construction.
# We intentionally defer instantiation: downstream tools that only need the
# module (e.g. alembic env.py importing config) should not pay the cost.


def _instantiate_default_app() -> FastAPI:
    """Lazy default app for single-command uvicorn invocations."""

    return create_app()


__all__ = ["API_V1_PREFIX", "create_app", "lifespan"]
