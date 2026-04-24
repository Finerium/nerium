"""MCP tool: create_ma_session.

Contract: ``docs/contracts/mcp_tool_registry.contract.md`` Section 4.6 +
``docs/contracts/ma_session_lifecycle.contract.md``.

Gating chain (short-circuits on first failure):

1. Hemera ``builder.live`` must be truthy for the principal. Default is
   ``False`` pre-submission; the whitelist seed flips it to ``True`` for
   judges + Ghaisan + demo accounts.
2. Moros Chronos budget cap: when ``chronos:ma_capped`` is set in Redis
   the tool returns ``budget_capped`` with ``retry_after`` hint.
3. ``budget_usd_cap`` must not exceed the tenant's remaining daily
   allowance (Moros reconciliation authoritative; here we rely on the
   future ``budget_monitor`` DB view).

Dispatch: when gates pass, the tool inserts a row into ``ma_session``
with status=``queued`` and returns the SSE ``stream_url``. Kratos's Arq
worker picks up queued rows. Until Kratos + Nike land the insert degrades
gracefully: if ``ma_session`` table is missing, the tool returns HTTP 503
``service_unavailable`` per ma_session_lifecycle contract Section 8.
"""


import logging
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from src.backend.auth._uuid import uuid7_str
from src.backend.errors import ForbiddenProblem, RateLimitedProblem
from src.backend.errors.problem_json import ServiceUnavailableProblem
from src.backend.mcp.auth import current_mcp_principal
from src.backend.mcp.deps import db_fetchrow, hemera_flag, moros_budget_capped
from src.backend.mcp.server import mcp_server
from src.backend.mcp.tools._base import tool_wrap

log = logging.getLogger(__name__)


class CreateMaSessionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(..., min_length=1, max_length=20000)
    model: Literal["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"] = (
        "claude-opus-4-7"
    )
    max_tokens: int = Field(default=8192, ge=256, le=32768)
    budget_usd_cap: float = Field(default=5.0, ge=0.01, le=100.0)
    tools: list[str] = Field(default_factory=list, max_length=32)
    system_prompt: str | None = Field(default=None, max_length=20000)
    thinking: bool = False


class CreateMaSessionOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    status: Literal["queued", "running"]
    stream_url: str
    cancel_url: str
    created_at: str


# Insert query kept simple; Kratos's migration ships the full schema. The
# tool only writes the minimum columns required for the queue pickup.
_INSERT_QUERY = """
INSERT INTO ma_session (
    id, user_id, mode, model, status,
    system_prompt, tools,
    max_tokens, budget_usd_cap,
    created_at
)
VALUES ($1::uuid, $2::uuid, 'web', $3, 'queued', $4, $5::jsonb, $6, $7, now())
RETURNING id::text, status, created_at::text
"""


@mcp_server().tool(
    name="create_ma_session",
    title="Create Managed Agent Session",
    description=(
        "Start a Builder-mode Managed Agent session. Gated by Hemera builder.live "
        "whitelist flag and the Chronos daily budget cap. Returns a streaming SSE URL."
    ),
)
@tool_wrap("create_ma_session")
async def create_ma_session_tool(input: CreateMaSessionInput) -> CreateMaSessionOutput:
    principal = current_mcp_principal()

    # Gate 1: Hemera builder.live whitelist
    builder_live = await hemera_flag("builder.live", default=False)
    # Hemera supports per-user overrides; env shim returns global value,
    # sufficient for submission where whitelist is applied globally via
    # Eunomia admin ahead of demo.
    if not bool(builder_live):
        log.info(
            "mcp.builder.live.gate_deny",
            extra={
                "event": "mcp.builder.live.gate_deny",
                "sub": principal.user_id,
                "tenant_id": principal.tenant_id,
            },
        )
        raise ForbiddenProblem(
            detail=(
                "builder_not_enabled: Hemera flag 'builder.live' is false for this "
                "user. Admin must add a user-scope override to unlock the Builder."
            ),
        )

    # Gate 2: Moros Chronos daily cap
    if await moros_budget_capped(tenant_id=principal.tenant_id):
        log.info(
            "mcp.chronos.cap.deny",
            extra={
                "event": "mcp.chronos.cap.deny",
                "tenant_id": principal.tenant_id,
            },
        )
        raise RateLimitedProblem(
            detail=(
                "budget_capped: Managed Agent runs are paused platform-wide until "
                "00:00 UTC budget rollover."
            ),
            retry_after_seconds=3600,
        )

    # Gate 3: Per-tenant daily remaining budget (budget_monitor pending).
    # The full implementation of budget_monitor.remaining_usd_today is owned
    # by Moros. Until that surface exists we accept the caller's requested
    # cap as-is; Moros's 5-min reconciliation back-stops the cap.

    session_id = uuid7_str()

    try:
        import json

        row = await db_fetchrow(
            _INSERT_QUERY,
            session_id,
            principal.user_id,
            input.model,
            input.system_prompt,
            json.dumps(input.tools),
            input.max_tokens,
            float(input.budget_usd_cap),
            tenant_id=principal.tenant_id,
        )
    except Exception as exc:  # pragma: no cover - defensive
        log.error(
            "mcp.create_ma_session.insert_failed",
            extra={
                "event": "mcp.create_ma_session.insert_failed",
                "error_type": type(exc).__name__,
                "error_message": str(exc)[:200],
            },
        )
        raise ServiceUnavailableProblem(
            detail=(
                "ma_session_unavailable: the managed-agent runtime is still "
                "warming up. Retry in a few seconds."
            ),
        ) from exc

    if row is None:
        # UndefinedTable (Kratos migration pending) or empty return.
        raise ServiceUnavailableProblem(
            detail=(
                "ma_session_unavailable: Kratos managed-agent runtime is not yet "
                "provisioned in this environment."
            ),
        )

    stream_url = f"/v1/ma/sessions/{row['id']}/stream"
    cancel_url = f"/v1/ma/sessions/{row['id']}/cancel"

    log.info(
        "ma.session.created",
        extra={
            "event": "ma.session.created",
            "session_id": row["id"],
            "model": input.model,
            "tools_count": len(input.tools),
            "budget_usd_cap": float(input.budget_usd_cap),
        },
    )

    return CreateMaSessionOutput(
        session_id=row["id"],
        status=row["status"],
        stream_url=stream_url,
        cancel_url=cancel_url,
        created_at=row["created_at"],
    )


__all__ = ["CreateMaSessionInput", "CreateMaSessionOutput", "create_ma_session_tool"]
