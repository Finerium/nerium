"""Pydantic v2 request + response DTOs for ``/v1/ma/sessions``.

Owner: Kratos (W2 S1).

Mirrors ``ma_session_lifecycle.contract.md`` Section 3.2. Kept distinct
from the row projections in ``src.backend.models.ma.session`` so the
admin / MCP callers can pull just the wire shape without importing the
DB-backed row type.

Design notes
------------
- ``model`` is restricted to the three Anthropic IDs locked by
  ``agent_orchestration_runtime.contract.md`` Section 3.4 + Kratos
  hard-stop "Using Opus 4.6 or Sonnet 4.6 as user-visible default".
  ``claude-opus-4-7`` is the default; Sonnet + Haiku accepted only as
  per-session overrides for cheap sub-tasks or explicit user choice.
- ``budget_usd_cap`` uses ``float`` on the wire for ergonomic JSON
  consumption, but the DB column is ``numeric(10,4)`` so we re-quantise
  on the way in. Per-session cap max is 100 USD to keep hackathon judge
  runs bounded; global cap still applies per
  ``budget_monitor.contract.md`` Section 4.3.
- ``stream_url`` is computed server-side so clients do not need to
  hardcode the path; the contract pins ``/v1/ma/sessions/<id>/stream``.
- ``cancel_url`` points at the ``POST`` cancel endpoint per the contract
  Section 4.3; the ``DELETE`` on the same path is reserved for the soft
  delete surface (Section 4.7, not shipped in S1).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import Field

from src.backend.ma.state_machine import MASessionStatus
from src.backend.models.base import NeriumModel

_MODEL_LITERAL = Literal[
    "claude-opus-4-7",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
]


class CreateMASessionRequest(NeriumModel):
    """Body for ``POST /v1/ma/sessions``.

    ``prompt`` max 20 000 chars matches the contract body rule so
    oversize inputs surface as 422 at validation time instead of as
    tokenisation errors at Anthropic call time.
    """

    prompt: str = Field(..., min_length=1, max_length=20000)
    model: _MODEL_LITERAL = "claude-opus-4-7"
    max_tokens: int = Field(default=8192, ge=256, le=32768)
    budget_usd_cap: float = Field(default=5.0, ge=0.01, le=100.0)
    thinking: bool = False
    tools: list[str] = Field(default_factory=list)
    system_prompt: Optional[str] = Field(default=None, max_length=10000)
    mode: Literal["web", "tauri", "mcp"] = "web"


class CreateMASessionResponse(NeriumModel):
    """201 response body for ``POST /v1/ma/sessions``.

    ``status`` is surfaced as the raw literal instead of the full enum
    so the wire representation stays stable if the enum gains values in
    a later contract version (impossible today; locked at 7 per Kratos
    hard-stop).
    """

    session_id: str
    status: Literal["queued", "running"] = "queued"
    stream_url: str
    cancel_url: str
    created_at: datetime


class MASessionDetailResponse(NeriumModel):
    """Body for ``GET /v1/ma/sessions/{id}``.

    Mirrors ``ma_session_lifecycle.contract.md`` Section 3.2. Does NOT
    leak the raw prompt beyond the truncated preview so list / detail
    surfaces stay under the default log + audit budget.
    """

    session_id: str
    tenant_id: str
    user_id: str
    mode: Literal["web", "tauri", "mcp"]
    model: str
    status: MASessionStatus
    prompt_preview: str
    max_tokens: int
    budget_usd_cap: float
    thinking: bool
    tools: list[str]
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_write_tokens: int
    cost_usd: float
    stop_reason: Optional[str] = None
    error: Optional[dict[str, Any]] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None


class CancelMASessionResponse(NeriumModel):
    """Body for ``POST /v1/ma/sessions/{id}/cancel``.

    202 while the dispatcher acks the cancel flag; terminal states
    return 200 with the current status + ``cancelled: False`` so clients
    can distinguish "already terminal, no-op" from "cancel queued".
    """

    session_id: str
    status: MASessionStatus
    cancel_requested: bool
    cancelled_at_request: datetime


__all__ = [
    "CancelMASessionResponse",
    "CreateMASessionRequest",
    "CreateMASessionResponse",
    "MASessionDetailResponse",
]
