"""Tests for :mod:`src.backend.ma.sse_stream` envelope + helpers.

Owner: Kratos (W2 S2).

These tests exercise the **pure** SSE helpers (no live Postgres + Redis)
so they run in the default test profile. A full TestClient-driven end-
to-end smoke that spins up a fake PubSub lives in
``test_sse_stream_integration.py`` and is skip-gated on Redis availability.

Covered here:

- :func:`_format_sse_event` produces a canonical SSE frame for a given
  envelope.
- :func:`_format_heartbeat` + :func:`_format_retry` match the contract
  wire format.
- :func:`_parse_last_event_id` rejects malformed values with the
  ``invalid_event_id`` slug.
- :func:`resolve_sse_principal` preference order: ``request.state.auth``
  > raw bearer header > ticket param > :class:`UnauthorizedProblem`.
"""

from __future__ import annotations

import pytest
from types import SimpleNamespace

from src.backend.errors import ProblemException, UnauthorizedProblem
from src.backend.ma.sse_stream import (
    SSE_RETRY_MS,
    _format_heartbeat,
    _format_retry,
    _format_sse_event,
    _parse_last_event_id,
    resolve_sse_principal,
)
from src.backend.ma.ticket_verifier import set_ticket_verifier
from src.backend.middleware.auth import AuthPrincipal


# ---------------------------------------------------------------------
# Wire format helpers
# ---------------------------------------------------------------------


def test_format_sse_event_shape() -> None:
    envelope = {
        "id": 42,
        "type": "nerium.ma.delta",
        "data": {"session_id": "abc", "delta": "Hi"},
        "occurred_at": "2026-04-27T06:00:00Z",
        "version": 1,
    }
    frame = _format_sse_event(envelope)
    lines = frame.split("\n")
    assert lines[0] == "id: 42"
    assert lines[1] == "event: nerium.ma.delta"
    # Data line is a single compact JSON record, no embedded newlines.
    assert lines[2].startswith("data: ")
    assert "\n" not in lines[2][len("data: ") :]
    assert frame.endswith("\n\n")


def test_format_heartbeat_matches_contract() -> None:
    assert _format_heartbeat() == ": ping\n\n"


def test_format_retry_encodes_reconnect_cadence() -> None:
    frame = _format_retry()
    assert frame.startswith(f"retry: {SSE_RETRY_MS}")
    assert frame.endswith("\n\n")


# ---------------------------------------------------------------------
# Last-Event-ID parser
# ---------------------------------------------------------------------


@pytest.mark.parametrize("raw,expected", [(None, 0), ("", 0), ("0", 0), ("123", 123)])
def test_parse_last_event_id_accepts_valid(raw, expected) -> None:
    assert _parse_last_event_id(raw) == expected


def test_parse_last_event_id_rejects_non_integer() -> None:
    with pytest.raises(ProblemException) as excinfo:
        _parse_last_event_id("abc")
    assert excinfo.value.slug == "invalid_event_id"
    assert excinfo.value.status == 400


def test_parse_last_event_id_rejects_negative() -> None:
    with pytest.raises(ProblemException) as excinfo:
        _parse_last_event_id("-1")
    assert excinfo.value.slug == "invalid_event_id"


# ---------------------------------------------------------------------
# resolve_sse_principal preference order
# ---------------------------------------------------------------------


def _fake_request(
    *,
    auth: AuthPrincipal | None = None,
    authorization: str | None = None,
):
    """Build a minimal stand-in for :class:`starlette.requests.Request`."""

    headers: dict[str, str] = {}
    if authorization is not None:
        headers["authorization"] = authorization
    state = SimpleNamespace()
    if auth is not None:
        state.auth = auth
    return SimpleNamespace(state=state, headers=headers)


@pytest.fixture(autouse=True)
def _reset_ticket_verifier() -> None:
    set_ticket_verifier(None)
    yield
    set_ticket_verifier(None)


@pytest.mark.asyncio
async def test_state_auth_wins() -> None:
    principal = AuthPrincipal(user_id="u", tenant_id="t")
    request = _fake_request(auth=principal, authorization="Bearer ignored")
    resolved = await resolve_sse_principal(request, ticket="ignored")
    assert resolved is principal


@pytest.mark.asyncio
async def test_bearer_header_used_when_state_missing(
    test_settings,
    hs256_jwt_factory,
    monkeypatch,
) -> None:
    # Ensure get_settings returns our test settings for verify_bearer path.
    import src.backend.ma.sse_stream as sse_stream_module

    monkeypatch.setattr(
        sse_stream_module, "get_settings", lambda: test_settings
    )
    token = hs256_jwt_factory(
        user_id="aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa",
        tenant_id="bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb",
    )
    request = _fake_request(authorization=f"Bearer {token}")
    resolved = await resolve_sse_principal(request, ticket=None)
    assert isinstance(resolved, AuthPrincipal)
    assert resolved.user_id == "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa"


@pytest.mark.asyncio
async def test_ticket_param_used_when_no_header_no_state(
    test_settings,
    hs256_jwt_factory,
) -> None:
    # Install the HS256 dev verifier so we don't depend on Nike.
    from src.backend.ma.ticket_verifier import install_default_hs256_ticket_verifier

    install_default_hs256_ticket_verifier(test_settings)

    token = hs256_jwt_factory(
        user_id="cccccccc-cccc-7ccc-8ccc-cccccccccccc",
        tenant_id="dddddddd-dddd-7ddd-8ddd-dddddddddddd",
    )
    request = _fake_request()
    resolved = await resolve_sse_principal(request, ticket=token)
    assert resolved.user_id == "cccccccc-cccc-7ccc-8ccc-cccccccccccc"


@pytest.mark.asyncio
async def test_no_auth_returns_401() -> None:
    request = _fake_request()
    with pytest.raises(UnauthorizedProblem):
        await resolve_sse_principal(request, ticket=None)
