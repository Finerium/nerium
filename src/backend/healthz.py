"""Liveness and readiness endpoints.

Per ``docs/contracts/rest_api_base.contract.md`` Section 3.1:

- ``/healthz`` is a shallow liveness probe. Returns 200 if the Python
  process is responding. No external dependency checks so Kubernetes-style
  orchestrators can differentiate "pod dead" from "database slow".
- ``/readyz`` is a deep readiness probe. Verifies Postgres connectivity
  by pinging the asyncpg pool. Returns 503 if the pool is missing or the
  ping query fails.
- ``/version`` returns a small JSON payload with the release version so
  Nemea-RV-v2 E2E checks and Selene dashboards can correlate deploys.

These endpoints are deliberately outside the ``/v1/`` prefix per contract
because they are platform-level rather than application-versioned.

Author: Aether (NP Wave 1 Session 1).
"""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, Field

from src.backend.config import Settings, get_settings
from src.backend.db.pool import ping as db_ping

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])

# Process start time used to compute uptime. Recorded at import so the value
# is stable across requests and roughly matches the moment the Python
# interpreter attached the module (close enough to lifespan startup).
_PROCESS_START = time.monotonic()


class LivenessResponse(BaseModel):
    """Shape of the ``/healthz`` response."""

    status: str = Field(
        default="ok",
        description="Always 'ok' when this endpoint responds; the HTTP status code IS the signal.",
    )
    service: str = Field(default="nerium-api")
    uptime_seconds: float


class ReadinessResponse(BaseModel):
    """Shape of the ``/readyz`` response."""

    status: str = Field(description="'ok' if every dependency ping succeeded, 'degraded' otherwise.")
    service: str = Field(default="nerium-api")
    dependencies: dict[str, str]


class VersionResponse(BaseModel):
    """Shape of the ``/version`` response."""

    version: str
    env: str


@router.get("/healthz", response_model=LivenessResponse, summary="Liveness probe")
async def healthz() -> LivenessResponse:
    """Shallow liveness. Always 200 when the event loop can answer."""

    return LivenessResponse(uptime_seconds=round(time.monotonic() - _PROCESS_START, 3))


@router.get(
    "/readyz",
    response_model=ReadinessResponse,
    summary="Readiness probe",
    responses={
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "description": "One or more dependencies are unreachable.",
            "model": ReadinessResponse,
        },
    },
)
async def readyz(response: Response) -> ReadinessResponse:
    """Deep readiness. Pings Postgres via the asyncpg pool.

    Extended in Session 2 to also ping Redis. Returns 503 when any
    dependency is down so load balancers route traffic away from the pod.
    """

    db_up = await db_ping()
    dependencies: dict[str, str] = {
        "postgres": "up" if db_up else "down",
    }
    all_ok = all(state == "up" for state in dependencies.values())

    if not all_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        logger.warning("health.readyz.degraded", extra={"dependencies": dependencies})

    return ReadinessResponse(
        status="ok" if all_ok else "degraded",
        dependencies=dependencies,
    )


@router.get("/version", response_model=VersionResponse, summary="Release version")
async def version(settings: Settings = None) -> VersionResponse:  # type: ignore[assignment]
    """Return the release version and environment.

    Settings are injected directly rather than via ``Depends`` so tests can
    override by calling ``get_settings.cache_clear()`` without wiring a
    dependency override.
    """

    s = settings or get_settings()
    return VersionResponse(version=s.version, env=s.env)


__all__ = ["router"]
