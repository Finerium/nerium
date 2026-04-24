"""RFC 7807 problem+json error envelope.

Owner: Aether (W1 Session 2). Every HTTP error surface in the NERIUM
backend converts exceptions to this envelope via the handlers registered
in :func:`register_problem_handlers`.

Contract references
-------------------
- ``docs/contracts/rest_api_base.contract.md`` Section 3.2 envelope shape
  and slug registry.
- ``docs/contracts/rest_api_base.contract.md`` Section 4.3 response
  content type ``application/problem+json``.
- ``docs/contracts/rest_api_base.contract.md`` Section 8 error handling
  rules (422 for validation, 500 for unhandled, stacktrace never bleeds).

Slug registry (initial, per contract Section 3.2):

- ``validation_failed`` (400)
- ``unauthorized`` (401)
- ``forbidden`` (403)
- ``not_found`` (404)
- ``conflict`` (409)
- ``unprocessable_entity`` (422)
- ``rate_limited`` (429)
- ``budget_capped`` (429)
- ``builder_not_enabled`` (403)
- ``tenant_isolation_violation`` (403)
- ``internal_error`` (500)
- ``service_unavailable`` (503)

Consumers MAY declare more by subclassing :class:`ProblemException` and
passing a fresh slug. Add the slug to the contract registry in the same
PR so downstream agents pick it up on re-read.

Design notes
------------
- Handlers emit ``Content-Type: application/problem+json`` explicitly.
- ``type`` is a URL built as ``https://nerium.com/problems/<slug>``.
- ``instance`` is the request path so operators can cross-reference the
  access log for the same request.
- ``request_id`` is sourced from the ``X-Request-Id`` contextvar populated
  by Selene's correlation middleware.
- Extension fields (``errors[]`` for validation, ``retry_after_seconds``
  for rate limit) flow through ``model_config = ConfigDict(extra='allow')``
  on :class:`ProblemDetails` so callers attach structured data without
  schema churn.
"""

from __future__ import annotations

import logging
from typing import Any, Mapping

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

CONTENT_TYPE_PROBLEM_JSON = "application/problem+json"
"""Per RFC 7807 Section 6.1 and the NERIUM REST API base contract."""

PROBLEM_TYPE_BASE_URL = "https://nerium.com/problems/"
"""Slug registry host. Pages may 404 but MUST NOT 500 per contract."""


class ProblemDetails(BaseModel):
    """RFC 7807 problem+json envelope.

    Required fields mirror the RFC (``type``, ``title``, ``status``,
    ``detail``, ``instance``). ``request_id`` is a NERIUM extension that
    Selene requires for log correlation. Extension fields are allowed so
    subclass exceptions (:class:`ValidationProblem`,
    :class:`RateLimitedProblem`) can attach ``errors[]`` or
    ``retry_after_seconds`` without schema churn.
    """

    model_config = ConfigDict(extra="allow")

    type: str = Field(
        description="URL reference identifying the problem type. Dereferencing "
        "provides human-readable documentation per RFC 7807."
    )
    title: str = Field(
        description="Short, human-readable summary of the problem type. SHOULD "
        "NOT change between occurrences of the same type."
    )
    status: int = Field(
        description="HTTP status code. Mirrors the response status line.",
        ge=100,
        le=599,
    )
    detail: str = Field(
        default="",
        description="Human-readable explanation specific to this occurrence.",
    )
    instance: str = Field(
        default="",
        description="URI reference identifying the specific occurrence. Usually "
        "the request path.",
    )
    request_id: str | None = Field(
        default=None,
        description="X-Request-Id correlation token. Populated by the exception "
        "handler from the asgi-correlation-id contextvar.",
    )


def _build_problem_type(slug: str) -> str:
    """Join the canonical problem base URL and a slug."""

    return f"{PROBLEM_TYPE_BASE_URL}{slug}"


class ProblemException(Exception):
    """Raise-able exception carrying a ready-to-serialise
    :class:`ProblemDetails` envelope.

    Consumers typically raise a subclass that pre-fills slug + title. For
    ad-hoc cases construct :class:`ProblemException` directly passing the
    full envelope via ``slug``/``title``/``status``.
    """

    slug: str = "internal_error"
    title: str = "Internal error"
    status: int = 500

    def __init__(
        self,
        detail: str = "",
        *,
        slug: str | None = None,
        title: str | None = None,
        status: int | None = None,
        headers: Mapping[str, str] | None = None,
        extensions: Mapping[str, Any] | None = None,
    ) -> None:
        self.detail = detail
        self.slug = slug or self.slug
        self.title = title or self.title
        self.status = status or self.status
        self.headers: dict[str, str] = dict(headers or {})
        self.extensions: dict[str, Any] = dict(extensions or {})
        super().__init__(detail or self.title)

    def to_problem(self, *, instance: str, request_id: str | None) -> ProblemDetails:
        """Materialise a :class:`ProblemDetails` instance for this error."""

        payload: dict[str, Any] = {
            "type": _build_problem_type(self.slug),
            "title": self.title,
            "status": self.status,
            "detail": self.detail,
            "instance": instance,
            "request_id": request_id,
        }
        payload.update(self.extensions)
        return ProblemDetails.model_validate(payload)


class UnauthorizedProblem(ProblemException):
    """401 - caller is not authenticated."""

    slug = "unauthorized"
    title = "Authentication required"
    status = 401


class ForbiddenProblem(ProblemException):
    """403 - caller is authenticated but lacks scope."""

    slug = "forbidden"
    title = "Forbidden"
    status = 403


class NotFoundProblem(ProblemException):
    """404 - target resource does not exist."""

    slug = "not_found"
    title = "Resource not found"
    status = 404


class ConflictProblem(ProblemException):
    """409 - request conflicts with current state (e.g. duplicate create)."""

    slug = "conflict"
    title = "Conflict"
    status = 409


class ValidationProblem(ProblemException):
    """422 - request body failed schema validation.

    Pydantic ``RequestValidationError`` objects are converted to this
    shape by the global handler in :func:`register_problem_handlers`.
    Callers raising this class directly MUST populate ``errors=[...]``
    in ``extensions`` so the envelope carries per-field detail.
    """

    slug = "unprocessable_entity"
    title = "Unprocessable entity"
    status = 422


class RateLimitedProblem(ProblemException):
    """429 - caller exceeded rate limit bucket.

    The rate limit middleware constructs this with ``retry_after_seconds``
    and a ``Retry-After`` header. Caller-side code may also raise when a
    business rule (budget cap) dictates 429 semantics.
    """

    slug = "rate_limited"
    title = "Too many requests"
    status = 429

    def __init__(
        self,
        detail: str = "Rate limit exceeded. Retry after the window resets.",
        *,
        retry_after_seconds: int = 1,
        rate_limit_header: str | None = None,
        rate_limit_policy_header: str | None = None,
        **kwargs: Any,
    ) -> None:
        extensions = dict(kwargs.pop("extensions", {}) or {})
        extensions.setdefault("retry_after_seconds", int(retry_after_seconds))
        headers = dict(kwargs.pop("headers", {}) or {})
        headers.setdefault("Retry-After", str(int(retry_after_seconds)))
        if rate_limit_header:
            headers.setdefault("RateLimit", rate_limit_header)
        if rate_limit_policy_header:
            headers.setdefault("RateLimit-Policy", rate_limit_policy_header)
        super().__init__(detail, extensions=extensions, headers=headers, **kwargs)


class InternalServerProblem(ProblemException):
    """500 - unhandled server error.

    Handler of last resort; stacktrace goes to Selene structlog + Sentry,
    NEVER to the response body.
    """

    slug = "internal_error"
    title = "Internal server error"
    status = 500


class ServiceUnavailableProblem(ProblemException):
    """503 - dependency down (Postgres, Redis, upstream vendor)."""

    slug = "service_unavailable"
    title = "Service unavailable"
    status = 503


def problem_response(
    problem: ProblemDetails,
    *,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    """Render a :class:`ProblemDetails` as an ``application/problem+json``
    JSON response.

    Declared separately from :class:`ProblemException` so non-raising
    sites (WebSocket upgrades, SSE fallbacks) can still emit a canonical
    envelope.
    """

    merged_headers = {"content-type": CONTENT_TYPE_PROBLEM_JSON}
    if headers:
        merged_headers.update(headers)
    # JSONResponse overwrites the content-type so we need media_type too.
    return JSONResponse(
        status_code=problem.status,
        content=problem.model_dump(exclude_none=True),
        headers=merged_headers,
        media_type=CONTENT_TYPE_PROBLEM_JSON,
    )


def _extract_request_id(request: Request) -> str | None:
    """Return the active X-Request-Id if Selene's correlation middleware
    has already populated it; otherwise the inbound header if any.

    Selene's middleware runs outside this handler, so in the success path
    the contextvar is set. On handler-entry-before-middleware (rare) we
    fall back to the raw header.
    """

    try:
        from asgi_correlation_id.context import correlation_id

        rid = correlation_id.get()
        if rid:
            return rid
    except ImportError:  # pragma: no cover - enforced at deploy time
        pass
    return request.headers.get("x-request-id")


async def problem_exception_handler(
    request: Request,
    exc: ProblemException,
) -> JSONResponse:
    """Convert :class:`ProblemException` instances to problem+json."""

    request_id = _extract_request_id(request)
    instance = str(request.url.path)
    problem = exc.to_problem(instance=instance, request_id=request_id)
    return problem_response(problem, headers=exc.headers)


async def http_exception_handler(
    request: Request,
    exc: StarletteHTTPException,
) -> JSONResponse:
    """Convert plain ``HTTPException`` raises to problem+json.

    Most NERIUM code paths should use :class:`ProblemException`
    subclasses directly; this handler catches third-party libraries that
    still raise ``HTTPException`` (FastAPI security helpers, CORS edge
    cases). The slug inference is conservative: 4xx and 5xx map to the
    closest registered slug, unknown status falls back to
    ``internal_error``.
    """

    status = int(exc.status_code)
    slug_by_status: dict[int, str] = {
        400: "validation_failed",
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        405: "not_found",
        409: "conflict",
        422: "unprocessable_entity",
        429: "rate_limited",
        500: "internal_error",
        503: "service_unavailable",
    }
    slug = slug_by_status.get(status, "internal_error" if status >= 500 else "validation_failed")
    title = str(exc.detail or "HTTP error")

    problem = ProblemDetails(
        type=_build_problem_type(slug),
        title=title,
        status=status,
        detail=str(exc.detail or ""),
        instance=str(request.url.path),
        request_id=_extract_request_id(request),
    )
    headers = dict(exc.headers or {})
    return problem_response(problem, headers=headers)


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Convert pydantic ``RequestValidationError`` to problem+json 422.

    The Pydantic error shape (list of dicts with ``loc``/``msg``/``type``)
    is remapped to the contract ``errors: [{field, code, message}]``
    extension so client code stays stable across pydantic versions.
    """

    formatted_errors: list[dict[str, str]] = []
    for raw in exc.errors():
        loc = raw.get("loc", ())
        # Drop the leading "body"/"query"/"path" segment for readability;
        # clients already know the request they sent.
        field_parts = [str(part) for part in loc if part not in ("body", "query", "path")]
        field = ".".join(field_parts) if field_parts else ".".join(str(p) for p in loc)
        formatted_errors.append(
            {
                "field": field,
                "code": str(raw.get("type", "value_error")),
                "message": str(raw.get("msg", "")),
            }
        )

    problem = ProblemDetails(
        type=_build_problem_type("unprocessable_entity"),
        title="Unprocessable entity",
        status=422,
        detail="Request body failed validation. See 'errors' for field-level detail.",
        instance=str(request.url.path),
        request_id=_extract_request_id(request),
        errors=formatted_errors,
    )
    return problem_response(problem)


async def unhandled_exception_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    """Last-chance handler: log the traceback, emit redacted 500 envelope.

    The stacktrace NEVER bleeds into the response body per contract
    Section 8. Selene + Sentry capture it via the logger call below.
    """

    logger.exception(
        "http.request.unhandled",
        extra={"path": str(request.url.path), "method": request.method},
    )
    problem = ProblemDetails(
        type=_build_problem_type("internal_error"),
        title="Internal server error",
        status=500,
        detail="An unexpected error occurred.",
        instance=str(request.url.path),
        request_id=_extract_request_id(request),
    )
    return problem_response(problem)


def register_problem_handlers(app: FastAPI) -> None:
    """Register the three exception handlers on a FastAPI app.

    Idempotent for the same ``ProblemException`` class because FastAPI
    keeps a per-class dictionary; re-registration overwrites. Safe to
    call multiple times from tests.
    """

    app.add_exception_handler(ProblemException, problem_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    # Catch-all MUST be last; FastAPI walks the handler map in insertion
    # order when resolving by type.
    app.add_exception_handler(Exception, unhandled_exception_handler)


__all__ = [
    "CONTENT_TYPE_PROBLEM_JSON",
    "ConflictProblem",
    "ForbiddenProblem",
    "InternalServerProblem",
    "NotFoundProblem",
    "PROBLEM_TYPE_BASE_URL",
    "ProblemDetails",
    "ProblemException",
    "RateLimitedProblem",
    "ServiceUnavailableProblem",
    "UnauthorizedProblem",
    "ValidationProblem",
    "http_exception_handler",
    "problem_exception_handler",
    "problem_response",
    "register_problem_handlers",
    "unhandled_exception_handler",
    "validation_exception_handler",
]
