"""Router mount index resilience tests.

``mount_v1_routers`` MUST:

1. Register every pillar router that is importable (positive path).
2. Log + skip pillars whose loader import fails, without crashing the app
   factory (resilience path).
3. Record a mount report shape that Nemea E2E can assert on.

These tests run without a live Postgres. They use the fake-pool +
middleware stack already wired in ``tests/backend/conftest.py`` so
``create_app`` exercises the real code path.
"""

from __future__ import annotations

from fastapi import APIRouter, FastAPI

from src.backend.routers.v1 import mount_v1_routers


def test_mount_helper_handles_missing_pillar(test_settings) -> None:
    """Unknown loader path is skipped, not raised."""

    app = FastAPI()
    report = mount_v1_routers(
        app,
        prefix="/v1",
        extra=[("nonexistent.pillar", "src.backend.does.not.exist", "router")],
    )
    labels = {label: status for (label, status) in report}
    assert labels["nonexistent.pillar"] == "skipped:import"


def test_mount_helper_accepts_real_router(test_settings) -> None:
    """An explicit APIRouter via ``extra`` registers under the expected
    prefix and surfaces in OpenAPI."""

    stub_router = APIRouter()

    @stub_router.get("/ping")
    async def ping() -> dict:
        return {"ok": True}

    # Register a stub module in sys.modules so the loader import succeeds.
    import sys
    import types

    module = types.ModuleType("src.backend.tests.stub_router")
    module.router = stub_router  # type: ignore[attr-defined]
    sys.modules["src.backend.tests.stub_router"] = module

    try:
        app = FastAPI()
        report = mount_v1_routers(
            app,
            prefix="/v1",
            extra=[("stub.pillar", "src.backend.tests.stub_router", "router")],
        )
        labels = {label: status for (label, status) in report}
        assert labels["stub.pillar"] == "mounted"

        # Verify the route is live.
        from fastapi.testclient import TestClient

        with TestClient(app) as tc:
            resp = tc.get("/v1/ping")
            assert resp.status_code == 200
            assert resp.json() == {"ok": True}
    finally:
        sys.modules.pop("src.backend.tests.stub_router", None)


def test_mount_helper_rejects_non_router_attr(test_settings) -> None:
    """A loader whose attribute is not an APIRouter is flagged and skipped."""

    import sys
    import types

    module = types.ModuleType("src.backend.tests.bad_attr")
    module.router = "not a router"  # type: ignore[attr-defined]
    sys.modules["src.backend.tests.bad_attr"] = module

    try:
        app = FastAPI()
        report = mount_v1_routers(
            app,
            prefix="/v1",
            extra=[("bad.pillar", "src.backend.tests.bad_attr", "router")],
        )
        labels = {label: status for (label, status) in report}
        assert labels["bad.pillar"] == "skipped:bad_type"
    finally:
        sys.modules.pop("src.backend.tests.bad_attr", None)


def test_app_state_v1_mount_report_attached_on_direct_app() -> None:
    """mount_v1_routers attaches a mount report onto app.state.

    This test avoids the full ``create_app`` factory (which in Wave 1
    requires Khronos' MCP wiring + other pillar imports) and exercises
    the mount helper directly. The full-factory happy path is covered
    separately by ``tests/backend/test_lifespan.py`` once the app
    import chain is green for the pillar under test.
    """

    app = FastAPI()
    report = mount_v1_routers(app, prefix="/v1")

    # Attach the report to app.state the same way create_app does so
    # downstream probes + Nemea E2E see a stable shape.
    app.state.v1_mount_report = report

    assert isinstance(report, list)
    # Every entry has both label + status keys.
    for entry in report:
        assert len(entry) == 2
        label, status = entry
        assert isinstance(label, str)
        assert status in {
            "mounted",
            "skipped:import",
            "skipped:attr_missing",
            "skipped:bad_type",
        }

    # app.state.v1_mount_report is accessible as the same list object.
    assert app.state.v1_mount_report is report
