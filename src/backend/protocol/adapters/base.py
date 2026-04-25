"""Abstract vendor adapter contract for Crius dispatcher.

Owner: Crius (W2 NP P5 Session 1).

Every concrete adapter subclasses :class:`BaseVendorAdapter` and
declares a class-level ``vendor_slug`` matching its catalogue row in
``vendor_adapter_catalog`` (migration 053). The registry resolves the
concrete class by ``vendor_slug``; the dispatcher pipes a
:class:`VendorTask` through ``invoke`` and returns a typed
:class:`VendorResponse`.

S1 wire shape
-------------
Both envelopes use Pydantic v2 with ``extra='forbid'`` per the pack
prompt and per ``CLAUDE.md`` strict-validation discipline. Adding a
new field to either is a contract change; downstream consumers
(Kratos, Hyperion) will need to bump their import surface in lockstep.

Authentication
--------------
``invoke`` accepts an :class:`AgentPrincipal` so adapters that need to
attribute usage per agent identity can record it. The S1 stub + the
Anthropic chat adapter do not consume the principal beyond passing it
into structured logs; future adapters (OpenAI, Google) reserve the
parameter for tenant-scoped quota enforcement.

S2 deferral
-----------
- AES-256-GCM envelope encryption of vendor API keys.
- pybreaker circuit breaker around ``invoke`` calls.
- Tenacity retry chain on transient errors.

Those land on top of this contract without breaking the abstract
surface; concrete adapters keep the same ``invoke`` signature.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from src.backend.registry.identity import AgentPrincipal

__all__ = [
    "BaseVendorAdapter",
    "VendorResponse",
    "VendorTask",
]


class VendorTask(BaseModel):
    """Inbound dispatch envelope.

    Mirrors the request body of ``POST /v1/protocol/invoke``. The
    router validates this shape before dispatching, so adapters can
    rely on every field being present + well-typed.
    """

    model_config = ConfigDict(extra="forbid")

    task_type: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Capability label, e.g. chat, embedding, image_gen, tts.",
    )
    payload: dict[str, Any] = Field(
        default_factory=dict,
        description="Vendor-agnostic input. Anthropic chat expects "
        "``{messages: [...], max_tokens, temperature, model?}``.",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Caller-supplied context. Adapters may inspect "
        "``metadata.model`` to override the catalogue default model.",
    )


class VendorResponse(BaseModel):
    """Outbound dispatch envelope.

    Concrete adapters MUST populate ``vendor_slug`` + ``task_type`` +
    ``output``. ``usage`` is optional but strongly recommended so the
    Selene cost meter can attribute spend per vendor without re-parsing
    raw vendor responses.
    """

    model_config = ConfigDict(extra="forbid")

    vendor_slug: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Slug of the adapter that produced this response.",
    )
    task_type: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Echoes the inbound ``VendorTask.task_type`` so "
        "callers can correlate response to request without state.",
    )
    output: dict[str, Any] = Field(
        ...,
        description="Adapter-shaped result. Anthropic chat returns "
        "``{role, content}``; stub echoes the inbound payload.",
    )
    usage: dict[str, Any] | None = Field(
        default=None,
        description="Token + cost telemetry. Optional, but emitted when "
        "the upstream vendor reports it.",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Adapter-supplied passthrough (model id, finish "
        "reason, vendor request id) for downstream observability.",
    )


class BaseVendorAdapter(ABC):
    """Abstract class every concrete vendor adapter inherits from.

    Subclasses declare a class-level ``vendor_slug`` and implement
    :meth:`invoke`. The class-level slug is the registry lookup key
    AND the catalogue row identifier; mismatches between code-side
    slug + DB-side slug are caught at registry bootstrap.

    Threadsafety
    ------------
    Concrete adapters are instantiated once per process (registry
    singleton). Implementations MUST be safe to call concurrently from
    asyncio tasks.
    """

    vendor_slug: str
    """Per-class constant. Registry lookup key + catalogue row marker."""

    @abstractmethod
    async def invoke(
        self,
        task: VendorTask,
        agent: AgentPrincipal,
    ) -> VendorResponse:
        """Dispatch ``task`` to the underlying vendor and return the result.

        Parameters
        ----------
        task
            Validated :class:`VendorTask` from the router. Adapters
            must NOT mutate the task; they read fields and emit a
            fresh :class:`VendorResponse`.
        agent
            Authenticated agent identity from
            :func:`require_agent_jwt`. Adapters may consult
            ``agent.tenant_id`` + ``agent.owner_user_id`` for
            attribution / quota purposes.

        Returns
        -------
        VendorResponse
            Adapter-shaped output. Concrete subclasses document the
            exact ``output`` shape they return.

        Raises
        ------
        NotImplementedError
            Scaffold adapters (OpenAI, Google in S1) raise this until
            the vendor SDK + API key + circuit breaker land in S2.
        Exception
            Vendor-side failures bubble up as adapter-specific
            exceptions; the dispatcher (S2) translates these into
            problem+json envelopes after the circuit breaker decides.
        """
