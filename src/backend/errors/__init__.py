"""RFC 7807 problem+json error envelope package.

Owner: Aether (W1 Session 2). Every backend endpoint converts failures
through this package so the wire format stays stable across agents.

Public surface::

    from src.backend.errors import (
        ProblemDetails,
        ProblemException,
        UnauthorizedProblem,
        ForbiddenProblem,
        NotFoundProblem,
        ConflictProblem,
        ValidationProblem,
        RateLimitedProblem,
        InternalServerProblem,
        register_problem_handlers,
    )
"""

from src.backend.errors.problem_json import (
    CONTENT_TYPE_PROBLEM_JSON,
    ConflictProblem,
    ForbiddenProblem,
    InternalServerProblem,
    NotFoundProblem,
    ProblemDetails,
    ProblemException,
    RateLimitedProblem,
    ServiceUnavailableProblem,
    UnauthorizedProblem,
    ValidationProblem,
    problem_response,
    register_problem_handlers,
)

__all__ = [
    "CONTENT_TYPE_PROBLEM_JSON",
    "ConflictProblem",
    "ForbiddenProblem",
    "InternalServerProblem",
    "NotFoundProblem",
    "ProblemDetails",
    "ProblemException",
    "RateLimitedProblem",
    "ServiceUnavailableProblem",
    "UnauthorizedProblem",
    "ValidationProblem",
    "problem_response",
    "register_problem_handlers",
]
