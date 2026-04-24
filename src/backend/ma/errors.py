"""MA-specific :class:`ProblemException` subclasses.

Owner: Kratos (W2 S1).

Each exception encodes the ``type`` slug + ``status`` + default
``title`` per the contract error table in
``agent_orchestration_runtime.contract.md`` Section 8 and
``ma_session_lifecycle.contract.md`` Section 8.

Slug registry additions (relative to the Aether baseline registry):

- ``builder_not_enabled`` (403) - Hemera ``builder.live`` flag false.
- ``budget_capped`` (429) - global or tenant cap tripped.
- ``too_many_active_sessions`` (429) - 3-session cap exceeded.
- ``idempotency_body_mismatch`` (422) - key reused with different body.
- ``invalid_event_id`` (400) - Last-Event-ID out of range.
- ``stream_gone`` (410) - session already terminal, stream closed.
- ``invalid_state_transition`` (500) - dispatcher attempted an illegal
  hop; indicates a bug, never a user error.

Design notes
------------
- The ``remaining_usd`` extension on :class:`BudgetCappedProblem` is
  populated when the pre-call budget guard knows the exact remaining
  headroom; a cold tenant with no local counter has it omitted. Client
  code handles both shapes per the RFC 7807 extension rules.
"""

from __future__ import annotations

from typing import Any, Mapping

from src.backend.errors import (
    ForbiddenProblem,
    ProblemException,
    RateLimitedProblem,
)


class BuilderNotEnabledProblem(ForbiddenProblem):
    """403 - Hemera ``builder.live`` flag false for the caller."""

    slug = "builder_not_enabled"
    title = "Builder not enabled for this account"
    status = 403

    def __init__(
        self,
        detail: str = (
            "Builder runtime is not enabled for your account. "
            "Contact the NERIUM team for whitelist access."
        ),
        **kwargs: Any,
    ) -> None:
        super().__init__(detail, **kwargs)


class BudgetCappedProblem(RateLimitedProblem):
    """429 - global or tenant budget cap tripped.

    Emits ``Retry-After`` pointing at the next UTC 00:00 rollover so
    well-behaved clients back off rather than hot-loop the endpoint.
    """

    slug = "budget_capped"
    title = "Budget cap exceeded"
    status = 429

    def __init__(
        self,
        detail: str = (
            "The daily spending cap for your tenant has been reached. "
            "Retry after the cap resets."
        ),
        *,
        scope: str = "tenant",
        remaining_usd: float | None = None,
        retry_after_seconds: int = 86400,
        **kwargs: Any,
    ) -> None:
        extensions: dict[str, Any] = dict(kwargs.pop("extensions", {}) or {})
        extensions.setdefault("scope", scope)
        if remaining_usd is not None:
            extensions.setdefault("remaining_usd_today", round(remaining_usd, 4))
        super().__init__(
            detail,
            retry_after_seconds=retry_after_seconds,
            extensions=extensions,
            **kwargs,
        )


class TooManyActiveSessionsProblem(RateLimitedProblem):
    """429 - per-user concurrent ``running|streaming`` session cap exceeded.

    Per ``agent_orchestration_runtime.contract.md`` Section 4.4 default
    cap is 3. Raised at session create so the UI can surface a "cancel
    an existing session" affordance.
    """

    slug = "too_many_active_sessions"
    title = "Too many active sessions"
    status = 429

    def __init__(
        self,
        detail: str = (
            "You already have the maximum number of active Builder sessions. "
            "Cancel one before starting another."
        ),
        *,
        active_count: int,
        limit: int,
        retry_after_seconds: int = 5,
        **kwargs: Any,
    ) -> None:
        extensions: dict[str, Any] = dict(kwargs.pop("extensions", {}) or {})
        extensions.setdefault("active_count", int(active_count))
        extensions.setdefault("limit", int(limit))
        super().__init__(
            detail,
            retry_after_seconds=retry_after_seconds,
            extensions=extensions,
            **kwargs,
        )


class IdempotencyBodyMismatchProblem(ProblemException):
    """422 - same Idempotency-Key, different body."""

    slug = "idempotency_body_mismatch"
    title = "Idempotency body mismatch"
    status = 422

    def __init__(
        self,
        detail: str = (
            "Idempotency-Key was seen previously with a different request "
            "body. Use a fresh key or resend the original body."
        ),
        **kwargs: Any,
    ) -> None:
        super().__init__(detail, **kwargs)


class InvalidStateTransitionProblem(ProblemException):
    """500 - dispatcher (or admin tool) attempted an illegal status hop.

    User-facing 500 because this indicates a bug in our side, not a
    client error. Selene captures the full stack via the catch-all
    unhandled handler wrapper.
    """

    slug = "invalid_state_transition"
    title = "Invalid MA session state transition"
    status = 500


class BudgetCapTripped(Exception):
    """Internal (non-HTTP) marker raised by the pre-call budget guard.

    Converted to :class:`BudgetCappedProblem` by the router; dispatcher
    also catches this to transition the session to ``budget_capped``.
    """

    def __init__(
        self,
        reason: str,
        *,
        remaining_usd: float | None = None,
        scope: str = "tenant",
    ) -> None:
        self.reason = reason
        self.remaining_usd = remaining_usd
        self.scope = scope
        super().__init__(reason)


__all__ = [
    "BudgetCapTripped",
    "BudgetCappedProblem",
    "BuilderNotEnabledProblem",
    "IdempotencyBodyMismatchProblem",
    "InvalidStateTransitionProblem",
    "TooManyActiveSessionsProblem",
]
