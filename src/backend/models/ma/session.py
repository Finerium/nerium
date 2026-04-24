"""Pydantic v2 row projections for ``ma_session``, ``ma_event``, ``ma_step``.

Owner: Kratos (W2 S1).

Mirrors the schema declared in ``docs/contracts/ma_session_lifecycle.contract.md``
Section 3.1 (tables) + ``agent_orchestration_runtime.contract.md`` Section
3.1 (runtime primitives). Each class maps 1:1 to a row in the respective
table so asyncpg ``Record`` instances deserialize via
``MASession.model_validate(row)``.

Design notes
------------
- The status column is surfaced as the full :class:`MASessionStatus`
  enum so downstream typecheckers catch illegal comparisons; Postgres
  stores the string, Pydantic v2 coerces it back through the enum.
- ``budget_usd_cap`` + ``cost_usd`` are ``Decimal`` on the wire to avoid
  the float-imprecision foot-gun for fractions-of-cent accounting; the
  Pydantic v2 default (``model_dump(mode="json")``) serialises them as
  strings so the JSON response retains exact digits.
- ``tools`` is surfaced as ``list[str]`` even though the DB column is
  ``jsonb``. The column stores a JSON array of tool names per the
  contract; we never stash structured tool schemas inline.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import Field

from src.backend.ma.state_machine import MASessionStatus
from src.backend.models.base import NeriumModel, TenantBaseModel


class MASession(TenantBaseModel):
    """Row projection of ``ma_session``.

    The table lives under RLS (tenant_id binding enforced at SET LOCAL
    time by the middleware). Column order mirrors the DDL so unpack by
    position from asyncpg stays deterministic.
    """

    user_id: UUID
    mode: Literal["web", "tauri", "mcp"] = "web"
    model: str = Field(
        ...,
        description="Anthropic model identifier. "
        "Defaults are enforced at the request schema layer (Opus 4.7 default).",
    )
    status: MASessionStatus = MASessionStatus.QUEUED
    system_prompt: Optional[str] = None
    prompt: str
    prompt_preview: str = Field(
        "",
        description="GENERATED ALWAYS AS (substring(prompt from 1 for 200)).",
    )
    max_tokens: int = Field(default=8192, ge=256, le=32768)
    budget_usd_cap: Decimal = Field(default=Decimal("5.0"), ge=Decimal("0.01"))
    thinking: bool = False
    tools: list[str] = Field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    cost_usd: Decimal = Decimal("0.0")
    anthropic_message_id: Optional[str] = None
    stop_reason: Optional[str] = None
    error: Optional[dict[str, Any]] = None
    idempotency_key: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None


class MAEvent(NeriumModel):
    """Append-only row projection of ``ma_event``.

    Populated by the dispatcher as Anthropic stream events flow through
    the normaliser. Used by the SSE resume endpoint to replay events
    after ``Last-Event-ID``.

    Not tenant-scoped directly (join through ``ma_session``); per the
    contract we also carry an RLS policy mirroring the parent for
    defence-in-depth, declared in the migration.
    """

    id: int = Field(..., description="Bigserial monotonic id; used as SSE id.")
    session_id: UUID
    seq: int = Field(..., description="Per-session monotonic sequence.")
    event_type: str
    payload: dict[str, Any]
    created_at: datetime


class MAStep(NeriumModel):
    """Row projection of ``ma_step`` (outer DAG state).

    Populated when the dispatcher splits a session into sub-steps
    (e.g. ``plan`` -> ``tool_search_marketplace`` -> ``synthesize``).
    Optional for Session 1 but included here so the schema stays
    consistent with ``agent_orchestration_runtime.contract.md`` Section
    3.1 runtime primitives.
    """

    id: UUID
    session_id: UUID
    name: str
    depends_on: list[UUID] = Field(default_factory=list)
    status: Literal["pending", "running", "completed", "failed", "skipped"] = "pending"
    result: Optional[dict[str, Any]] = None
    error: Optional[dict[str, Any]] = None
    attempts: int = 0
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None


__all__ = ["MAEvent", "MASession", "MAStep"]
