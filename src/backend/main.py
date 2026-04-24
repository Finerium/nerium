"""NERIUM backend FastAPI app factory.

Owner: Aether (W1 production core). Downstream agents mount routers under
``/v1/<pillar>/*`` by importing :func:`create_app` or by importing the
shared app object returned from this module.

Session 1 scope (this file)
---------------------------
- Lifespan context manager: open asyncpg pool on startup, close on shutdown.
- Settings load via ``get_settings``.
- TrustedHost and CORS middleware wired per contract Section 4.1 and 4.2.
  The remaining middleware layers (CorrelationId, AccessLog, RateLimit,
  Auth, TenantBinding) land in Session 2 alongside Selene's observability
  subsystem.
- Healthz + readyz + version endpoints mounted at the root.
- OpenAPI 3.1 spec served at ``/openapi.json``; Swagger at ``/docs-swagger``
  (per contract 4.4 ``docs.public`` flag defaults true pre-GA); Redoc at
  ``/docs``.
- Router index placeholder ``/v1/__placeholder`` so downstream agents can
  ``app.include_router`` under the ``/v1`` prefix without scaffold churn.

Session 2 will add:
- CorrelationIdMiddleware, AccessLogMiddleware wired from src.backend.obs.*.
- RateLimitMiddleware, AuthMiddleware, TenantBindingMiddleware.
- ProblemException handler translating HTTPException to RFC 7807.
- Redis + Arq lifespan hooks.

Session 3 will add:
- Full schema migrations applied at boot (optional dev-mode flag).
- Seed data script.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from src.backend.config import Settings, get_settings
from src.backend.db.pool import close_pool, create_app_pool, set_pool
from src.backend.healthz import router as healthz_router

logger = logging.getLogger(__name__)


# The ``/v1`` prefix is locked per docs/contracts/rest_api_base.contract.md
# Section 3.1. All tenant + stateful endpoints from downstream agents mount
# under this prefix. Khronos (/mcp), OAuth well-knowns, and admin panel
# routes mount outside the prefix per their own contracts.
API_V1_PREFIX = "/v1"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """App lifespan. Open pool on startup, close on shutdown.

    Startup sequence
    ----------------
    1. Resolve settings (raises early if required env vars are missing).
    2. Validate production secrets.
    3. Open the asyncpg pool sized per settings.
    4. Install the pool on ``src.backend.db.pool`` module so consumers can
       call :func:`get_pool` without threading the handle through every
       dependency.
    5. Stash settings + pool on ``app.state`` for FastAPI dependency access.
    6. Log a concise banner line with env + version.

    Shutdown sequence is the reverse.
    """

    settings: Settings = get_settings()
    settings.validate_production_secrets()

    logger.info(
        "lifespan.startup.begin env=%s version=%s",
        settings.env,
        settings.version,
    )

    pool = await create_app_pool(settings)
    set_pool(pool)

    app.state.settings = settings
    app.state.db_pool = pool

    logger.info(
        "lifespan.startup.complete pool_min=%d pool_max=%d",
        settings.database_pool_min_size,
        settings.database_pool_max_size,
    )

    try:
        yield
    finally:
        logger.info("lifespan.shutdown.begin")
        await close_pool()
        app.state.db_pool = None
        logger.info("lifespan.shutdown.complete")


def _install_middleware(app: FastAPI, settings: Settings) -> None:
    """Register the middleware stack.

    Order note: FastAPI applies middleware in reverse registration order, so
    the last ``add_middleware`` call runs first on the request path. Per
    ``rest_api_base.contract.md`` Section 4.1 CORS must run outermost, then
    TrustedHost. To achieve that ordering with FastAPI's reverse semantics
    we register TrustedHost first (innermost of the two) and CORS last
    (outermost). Future middleware authors must insert between these two
    anchors in the contract-specified order.
    """

    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings.trusted_hosts,
    )
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
    async def placeholder() -> dict[str, object]:
        return {
            "api_version": "v1",
            "mounted_subrouters": [],
            "note": (
                "Downstream NP agents (Khronos, Phanes, Hyperion, Kratos, Nike, "
                "Plutus, Iapetus, Tethys, Crius, Astraea, Chione, Pheme, Hemera, "
                "Eunomia, Moros, Marshall) replace this placeholder with their "
                "own sub-routers."
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

    # Platform-level endpoints outside /v1 per contract Section 3.1.
    app.include_router(healthz_router)

    # /v1 placeholder so downstream agents can mount without repo churn.
    app.include_router(_build_v1_placeholder_router(), prefix=API_V1_PREFIX)

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
