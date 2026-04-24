"""RFC 7807 problem+json envelope + handler tests.

Validates:
- ``ProblemDetails`` model shape matches contract Section 3.2.
- ``ProblemException`` subclasses carry the right slug + status + title.
- ``register_problem_handlers`` produces ``application/problem+json``.
- Pydantic ``RequestValidationError`` is remapped to 422 with
  ``errors[]`` extension fields.
- Starlette ``HTTPException`` flows through the handler.
- Catch-all ``Exception`` yields 500 without leaking stacktrace.
"""

from __future__ import annotations

from fastapi import Body, FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel
from starlette.exceptions import HTTPException

from src.backend.errors import (
    CONTENT_TYPE_PROBLEM_JSON,
    ConflictProblem,
    ForbiddenProblem,
    NotFoundProblem,
    ProblemDetails,
    ProblemException,
    RateLimitedProblem,
    UnauthorizedProblem,
    ValidationProblem,
    register_problem_handlers,
)
from src.backend.errors.problem_json import PROBLEM_TYPE_BASE_URL


class EchoBody(BaseModel):
    """Defined at module scope so FastAPI annotation inference under
    Python 3.14 treats it as a request body consistently across test
    runs. Nested class definitions inside a factory closure interact
    poorly with FastAPI's annotation cache on recent CPython."""

    name: str
    amount: int


def _build_app() -> TestClient:
    app = FastAPI()
    register_problem_handlers(app)

    @app.post("/echo")
    async def echo(body: EchoBody = Body(...)) -> dict:
        return {"name": body.name, "amount": body.amount}

    @app.get("/raise-problem")
    async def raise_problem() -> None:
        raise NotFoundProblem(detail="missing resource xyz")

    @app.get("/raise-http")
    async def raise_http() -> None:
        raise HTTPException(status_code=409, detail="already exists")

    @app.get("/raise-boom")
    async def raise_boom() -> None:
        raise RuntimeError("kaboom")

    return TestClient(app)


def test_problem_details_shape_conforms_to_contract() -> None:
    problem = ProblemDetails(
        type="https://nerium.com/problems/not_found",
        title="Resource not found",
        status=404,
        detail="item xyz not found",
        instance="/v1/things/xyz",
        request_id="01926f12-3456-7abc-89de-f0123456789a",
    )
    dumped = problem.model_dump()
    assert dumped["type"].startswith(PROBLEM_TYPE_BASE_URL)
    assert dumped["status"] == 404
    assert dumped["title"] == "Resource not found"
    assert dumped["instance"] == "/v1/things/xyz"
    assert dumped["request_id"].startswith("01926f12")


def test_problem_details_allows_extension_fields() -> None:
    problem = ProblemDetails(
        type="https://nerium.com/problems/unprocessable_entity",
        title="Unprocessable entity",
        status=422,
        detail="x",
        instance="/",
        errors=[{"field": "name", "code": "missing", "message": "name is required"}],
    )
    dumped = problem.model_dump()
    assert dumped["errors"][0]["field"] == "name"


def test_subclasses_carry_expected_slugs_and_status() -> None:
    assert UnauthorizedProblem().slug == "unauthorized"
    assert UnauthorizedProblem().status == 401
    assert ForbiddenProblem().status == 403
    assert NotFoundProblem().status == 404
    assert ConflictProblem().status == 409
    assert ValidationProblem().status == 422
    assert RateLimitedProblem().status == 429


def test_problem_exception_handler_returns_problem_json() -> None:
    client = _build_app()
    response = client.get("/raise-problem")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith(CONTENT_TYPE_PROBLEM_JSON)
    body = response.json()
    assert body["status"] == 404
    assert body["title"] == "Resource not found"
    assert body["detail"] == "missing resource xyz"
    assert body["instance"] == "/raise-problem"
    assert body["type"].endswith("/not_found")


def test_pydantic_validation_error_remaps_to_422() -> None:
    client = _build_app()
    # Missing required fields produces Pydantic validation error.
    response = client.post("/echo", json={})
    assert response.status_code == 422
    assert response.headers["content-type"].startswith(CONTENT_TYPE_PROBLEM_JSON)
    body = response.json()
    assert body["status"] == 422
    assert body["title"] == "Unprocessable entity"
    assert body["type"].endswith("/unprocessable_entity")
    assert isinstance(body["errors"], list)
    fields = {item["field"] for item in body["errors"]}
    assert "name" in fields
    assert "amount" in fields


def test_http_exception_flows_through_handler() -> None:
    client = _build_app()
    response = client.get("/raise-http")
    assert response.status_code == 409
    assert response.headers["content-type"].startswith(CONTENT_TYPE_PROBLEM_JSON)
    body = response.json()
    assert body["status"] == 409
    assert body["type"].endswith("/conflict")


def test_catch_all_500_does_not_leak_stacktrace() -> None:
    client = _build_app()
    # TestClient raises by default when the server raises; pass raise_server_exceptions=False.
    client = TestClient(client.app, raise_server_exceptions=False)
    response = client.get("/raise-boom")
    assert response.status_code == 500
    assert response.headers["content-type"].startswith(CONTENT_TYPE_PROBLEM_JSON)
    body = response.json()
    assert body["status"] == 500
    assert body["type"].endswith("/internal_error")
    assert "kaboom" not in body.get("detail", "")


def test_rate_limited_problem_emits_retry_after_header() -> None:
    exc = RateLimitedProblem(retry_after_seconds=7)
    assert exc.status == 429
    assert exc.headers["Retry-After"] == "7"
    problem = exc.to_problem(instance="/v1/x", request_id="rid")
    dumped = problem.model_dump()
    assert dumped["retry_after_seconds"] == 7


def test_problem_type_url_shape() -> None:
    problem = UnauthorizedProblem().to_problem(
        instance="/x",
        request_id=None,
    )
    assert problem.type == "https://nerium.com/problems/unauthorized"


def test_problem_exception_default_slug_is_internal_error() -> None:
    exc = ProblemException(detail="some generic failure")
    assert exc.status == 500
    assert exc.slug == "internal_error"
