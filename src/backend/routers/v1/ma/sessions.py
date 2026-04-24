"""HTTP routes for ``/v1/ma/sessions``.

Owner: Kratos (W2 S1).

S1 ships CRUD only: ``POST``, ``GET /{id}``, ``POST /{id}/cancel``.
The SSE stream endpoint lands in S3 (``GET /{id}/stream``).

Wire contract
-------------
- ``docs/contracts/ma_session_lifecycle.contract.md`` Sections 4.1, 4.3,
  4.4.
- ``docs/contracts/agent_orchestration_runtime.contract.md`` Section 4.4
  pre-call gates order.
- ``docs/contracts/rest_api_base.contract.md`` Section 4.5 Idempotency-Key
  semantics; we honour the header here.

Gate order
----------

1. Auth via the Aether ``AuthMiddleware``; router depends on
   ``request.state.auth`` being populated.
2. Idempotency replay (Section 4.5 of rest_api_base) - if the caller
   resends the same key we short-circuit to the stored row.
3. Hemera whitelist gate (``builder.live``).
4. Chronos budget cap (global + tenant).
5. Concurrent session cap (3 per user default).
6. Insert + return ``CreateMASessionResponse``.

The dispatcher Arq enqueue happens after step 6 and is out of scope
for S1 (Session 2 ships the dispatcher); the session lands in
``queued`` and sits there until S2 picks it up. S1 tests use mocked
gates to exercise each failure path.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Header, Path, Query, Request, Response, status
from fastapi.responses import JSONResponse, StreamingResponse

from src.backend.db.pool import get_pool
from src.backend.db.tenant import tenant_scoped
from src.backend.errors import NotFoundProblem
from src.backend.ma.budget_guard import enforce_budget_cap
from src.backend.ma.errors import (
    BudgetCapTripped,
    BudgetCappedProblem,
    IdempotencyBodyMismatchProblem,
    TooManyActiveSessionsProblem,
)
from src.backend.ma.queries import (
    count_active_sessions,
    insert_session,
    select_session_by_id,
    select_session_by_idempotency_key,
    update_session_status,
)
from src.backend.ma.schemas import (
    CancelMASessionResponse,
    CreateMASessionRequest,
    CreateMASessionResponse,
    MASessionDetailResponse,
)
from src.backend.ma.sse_stream import sse_stream_handler
from src.backend.ma.state_machine import MASessionStatus, is_terminal
from src.backend.ma.whitelist_gate import enforce_whitelist_gate
from src.backend.middleware.auth import AuthPrincipal
from src.backend.redis_client import get_redis_client
from src.backend.utils.uuid7 import uuid7

logger = logging.getLogger(__name__)

sessions_router = APIRouter(
    prefix="/ma/sessions",
    tags=["ma"],
)

MAX_CONCURRENT_PER_USER: int = 3
"""Contract-locked default; raisable via Hemera flag post-hackathon."""

CANCEL_FLAG_KEY_FMT: str = "ma:cancel:{session_id}"
"""Redis key the dispatcher polls each event boundary; matches
``agent_orchestration_runtime.contract.md`` Section 4.3."""


def _require_auth(request: Request) -> AuthPrincipal:
    """Return the authenticated principal or raise 401.

    Aether's :class:`~src.backend.middleware.auth.AuthMiddleware` puts
    this on ``request.state.auth`` for every authenticated path; the
    router is mounted inside ``/v1`` which is NOT in the public path
    list so the middleware always fires before us.
    """

    auth = getattr(request.state, "auth", None)
    if auth is None:
        # The middleware would have returned 401 already; this branch
        # exists for defensive reasons (e.g. custom test client that
        # bypassed the middleware stack).
        raise NotFoundProblem(detail="no authenticated principal")
    return auth


def _idempotency_body_matches(
    existing: Any, req: CreateMASessionRequest
) -> bool:
    """Compare the normalised body fields against a prior session row.

    We only look at fields the user can set; server-assigned columns
    (timestamps, status, cost) are ignored so the replay path is
    robust against background updates that happen between the first
    create and the replay attempt.
    """

    def _same_tools(row_tools: Any, req_tools: list[str]) -> bool:
        import json

        if isinstance(row_tools, str):
            try:
                row_tools = json.loads(row_tools)
            except ValueError:
                row_tools = []
        return sorted(list(row_tools or [])) == sorted(req_tools)

    return all(
        [
            existing["prompt"] == req.prompt,
            existing["model"] == req.model,
            int(existing["max_tokens"]) == req.max_tokens,
            float(existing["budget_usd_cap"]) == req.budget_usd_cap,
            bool(existing["thinking"]) == req.thinking,
            (existing["system_prompt"] or None) == req.system_prompt,
            existing["mode"] == req.mode,
            _same_tools(existing["tools"], req.tools),
        ]
    )


def _detail_from_row(row: Any) -> MASessionDetailResponse:
    """Map an asyncpg row into the detail wire shape.

    ``tools`` round-trips through JSON so a row fetched straight from
    asyncpg (where jsonb arrives as a string without a custom codec)
    still surfaces as a proper list.
    """

    import json

    tools_raw = row["tools"]
    if isinstance(tools_raw, str):
        try:
            tools = json.loads(tools_raw)
        except ValueError:
            tools = []
    else:
        tools = list(tools_raw or [])

    error_raw = row["error"]
    if isinstance(error_raw, str):
        try:
            error = json.loads(error_raw)
        except ValueError:
            error = None
    else:
        error = error_raw

    return MASessionDetailResponse(
        session_id=str(row["id"]),
        tenant_id=str(row["tenant_id"]),
        user_id=str(row["user_id"]),
        mode=row["mode"],
        model=row["model"],
        status=MASessionStatus(row["status"]),
        prompt_preview=row["prompt_preview"] or "",
        max_tokens=int(row["max_tokens"]),
        budget_usd_cap=float(row["budget_usd_cap"]),
        thinking=bool(row["thinking"]),
        tools=tools,
        input_tokens=int(row["input_tokens"]),
        output_tokens=int(row["output_tokens"]),
        cache_read_tokens=int(row["cache_read_tokens"]),
        cache_write_tokens=int(row["cache_write_tokens"]),
        cost_usd=float(row["cost_usd"]),
        stop_reason=row["stop_reason"],
        error=error,
        created_at=row["created_at"],
        started_at=row["started_at"],
        ended_at=row["ended_at"],
    )


def _build_create_response(
    row: Any, *, include_created: bool = True
) -> tuple[dict[str, Any], int]:
    """Shape the 201 body + status code for a create or replay.

    ``include_created`` distinguishes a fresh insert (201) from an
    idempotency replay of an already-terminal row; the latter
    returns 200 per the contract.
    """

    session_id = str(row["id"])
    payload = CreateMASessionResponse(
        session_id=session_id,
        status="queued" if row["status"] == "queued" else "running",
        stream_url=f"/v1/ma/sessions/{session_id}/stream",
        cancel_url=f"/v1/ma/sessions/{session_id}/cancel",
        created_at=row["created_at"],
    ).model_dump(mode="json")
    return payload, (status.HTTP_201_CREATED if include_created else status.HTTP_200_OK)


@sessions_router.post(
    "",
    response_model=CreateMASessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_session(
    body: CreateMASessionRequest,
    request: Request,
    response: Response,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
) -> Any:
    """Create a new MA session after running the four pre-call gates."""

    auth = _require_auth(request)
    user_id = UUID(auth.user_id)
    tenant_id = UUID(auth.tenant_id)

    # --- Gate 1: Idempotency-Key replay ------------------------------
    if idempotency_key:
        pool = get_pool()
        async with tenant_scoped(pool, tenant_id) as conn:
            existing = await select_session_by_idempotency_key(
                conn, user_id=user_id, idempotency_key=idempotency_key
            )
        if existing is not None:
            if not _idempotency_body_matches(existing, body):
                raise IdempotencyBodyMismatchProblem()
            payload, code = _build_create_response(
                existing, include_created=False
            )
            return JSONResponse(status_code=code, content=payload)

    # --- Gate 2: Hemera whitelist ------------------------------------
    await enforce_whitelist_gate(user_id=user_id, tenant_id=tenant_id)

    # --- Gate 3: Chronos budget cap ----------------------------------
    try:
        await enforce_budget_cap(
            tenant_id=tenant_id,
            requested_usd_cap=Decimal(str(body.budget_usd_cap)),
        )
    except BudgetCapTripped as exc:
        raise BudgetCappedProblem(
            detail=f"Budget cap tripped: {exc.reason}",
            scope=exc.scope,
            remaining_usd=exc.remaining_usd,
        )

    # --- Gate 4: Concurrent session cap ------------------------------
    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        active = await count_active_sessions(conn, user_id=user_id)
        if active >= MAX_CONCURRENT_PER_USER:
            raise TooManyActiveSessionsProblem(
                active_count=active,
                limit=MAX_CONCURRENT_PER_USER,
            )

        # --- Insert ---------------------------------------------------
        session_id = uuid7()
        row = await insert_session(
            conn,
            session_id=session_id,
            tenant_id=tenant_id,
            user_id=user_id,
            mode=body.mode,
            model=body.model,
            prompt=body.prompt,
            max_tokens=body.max_tokens,
            budget_usd_cap=Decimal(str(body.budget_usd_cap)),
            thinking=body.thinking,
            tools=list(body.tools),
            system_prompt=body.system_prompt,
            idempotency_key=idempotency_key,
        )

    logger.info(
        "ma.session.created session_id=%s tenant_id=%s user_id=%s mode=%s model=%s",
        row["id"],
        row["tenant_id"],
        row["user_id"],
        row["mode"],
        row["model"],
    )

    payload, code = _build_create_response(row, include_created=True)
    response.status_code = code
    return payload


@sessions_router.get(
    "/{session_id}",
    response_model=MASessionDetailResponse,
)
async def get_session(
    request: Request,
    session_id: UUID = Path(..., description="MA session UUID v7"),
) -> MASessionDetailResponse:
    """Return the full session detail. Tenant isolation via RLS.

    Cross-tenant reads return 404 (the RLS policy silently filters the
    row out) so we do not leak existence across tenants.
    """

    auth = _require_auth(request)
    tenant_id = UUID(auth.tenant_id)

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        row = await select_session_by_id(conn, session_id=session_id)
    if row is None:
        raise NotFoundProblem(detail="ma session not found")
    return _detail_from_row(row)


@sessions_router.post(
    "/{session_id}/cancel",
    response_model=CancelMASessionResponse,
)
async def cancel_session(
    request: Request,
    session_id: UUID = Path(..., description="MA session UUID v7"),
) -> CancelMASessionResponse:
    """Request cancellation.

    - For ``queued`` sessions we transition straight to ``cancelled``
      because no dispatcher has picked them up yet.
    - For ``running`` / ``streaming`` we set the Redis cancel flag so
      the dispatcher notices on the next event boundary.
    - For terminal sessions we return 200 idempotent with the current
      status (per contract Section 4.3).
    """

    auth = _require_auth(request)
    tenant_id = UUID(auth.tenant_id)

    pool = get_pool()
    async with tenant_scoped(pool, tenant_id) as conn:
        row = await select_session_by_id(conn, session_id=session_id)
        if row is None:
            raise NotFoundProblem(detail="ma session not found")

        current = MASessionStatus(row["status"])
        if is_terminal(current):
            return CancelMASessionResponse(
                session_id=str(session_id),
                status=current,
                cancel_requested=False,
                cancelled_at_request=datetime.now(timezone.utc),
            )

        if current == MASessionStatus.QUEUED:
            row = await update_session_status(
                conn,
                session_id=session_id,
                to_status=MASessionStatus.CANCELLED,
                set_ended_at=True,
            )
            new_status = MASessionStatus.CANCELLED
        else:
            new_status = current  # no DB change; dispatcher reacts to flag

    # Redis cancel flag is set regardless of the initial status so a
    # queued-then-picked-up race still terminates the dispatcher loop
    # when S2 lands. The key has no TTL; Moros cleans it up on daily
    # rollover.
    try:
        redis = get_redis_client()
        await redis.set(
            CANCEL_FLAG_KEY_FMT.format(session_id=str(session_id)),
            "1",
        )
    except Exception:
        # Redis outage is not fatal here: the DB update (queued case)
        # already reflects cancelled; running/streaming flip will
        # surface on the next budget reconcile. Log + continue.
        logger.exception("ma.cancel.redis_outage session_id=%s", session_id)

    return CancelMASessionResponse(
        session_id=str(session_id),
        status=new_status,
        cancel_requested=True,
        cancelled_at_request=datetime.now(timezone.utc),
    )


@sessions_router.get(
    "/{session_id}/stream",
    response_class=StreamingResponse,
)
async def stream_session(
    request: Request,
    session_id: UUID = Path(..., description="MA session UUID v7"),
    last_event_id: Optional[str] = Header(None, alias="Last-Event-ID"),
    ticket: Optional[str] = Query(
        None,
        description=(
            "Nike realtime ticket JWT. Required when the caller is a "
            "browser using EventSource; server-to-server callers may "
            "use the Authorization header instead."
        ),
    ),
) -> StreamingResponse:
    """SSE endpoint: replay persisted events + live-tail live ones.

    Browser clients obtain the ``ticket`` via ``POST /v1/realtime/ticket``
    (Nike, W2) and pass it as a query param because ``EventSource``
    cannot set headers. Server + test + MCP callers use the standard
    ``Authorization: Bearer <jwt>`` header (Aether middleware path).

    Either authentication path resolves an :class:`AuthPrincipal`
    bound to the caller's tenant; tenant-scoped RLS then filters the
    session lookup so a cross-tenant id returns 404 rather than
    leaking existence.

    Resume semantics are driven by the ``Last-Event-ID`` header per
    the SSE spec. The contract trim window is 24 h; replay beyond
    that window returns HTTP 410 ``stream_gone``.
    """

    return await sse_stream_handler(
        request=request,
        session_id=session_id,
        last_event_id=last_event_id,
        ticket=ticket,
    )


__all__ = ["sessions_router"]
