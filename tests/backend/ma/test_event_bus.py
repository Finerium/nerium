"""Tests for :mod:`src.backend.ma.event_bus` helpers.

Owner: Kratos (W2 S2).

The event bus sits between Postgres ``ma_event`` and Redis (Streams +
Pub/Sub). The integration path requires a live DB + Redis, which is
skip-gated. This module exercises the **pure** helpers + the envelope
shape + the row->envelope converter so schema drift surfaces even in
the no-infra test profile.
"""

from __future__ import annotations

from datetime import datetime, timezone

from src.backend.ma.event_bus import (
    PUBSUB_CHANNEL_FMT,
    STREAM_KEY_FMT,
    STREAM_MAXLEN_APPROX,
    row_to_envelope,
    _build_envelope,
    _iso,
)


class _FakeRow:
    """Minimal stand-in for asyncpg ``Record`` with dict access."""

    def __init__(self, data: dict) -> None:
        self._data = data

    def __getitem__(self, key: str):  # noqa: D401 - dunder
        return self._data[key]


def test_stream_key_format() -> None:
    assert STREAM_KEY_FMT.format(session_id="abc") == "stream:ma:abc"


def test_pubsub_channel_format() -> None:
    assert PUBSUB_CHANNEL_FMT.format(session_id="xyz") == "ma:event:xyz"


def test_stream_maxlen_is_bounded() -> None:
    assert STREAM_MAXLEN_APPROX == 10_000


def test_build_envelope_shape() -> None:
    moment = datetime(2026, 4, 27, 6, 0, 0, tzinfo=timezone.utc)
    envelope = _build_envelope(
        event_id=7,
        event_type="nerium.ma.delta",
        payload={"session_id": "s1", "delta": "hello"},
        occurred_at=moment,
    )
    assert envelope == {
        "id": 7,
        "type": "nerium.ma.delta",
        "data": {"session_id": "s1", "delta": "hello"},
        "occurred_at": "2026-04-27T06:00:00Z",
        "version": 1,
    }


def test_iso_naive_datetime_is_treated_as_utc() -> None:
    naive = datetime(2026, 4, 27, 6, 0, 0)
    assert _iso(naive) == "2026-04-27T06:00:00Z"


def test_row_to_envelope_handles_json_string_payload() -> None:
    """asyncpg returns jsonb as a string without a codec; the helper
    parses the JSON string so consumers see a proper dict."""

    row = _FakeRow(
        {
            "id": 42,
            "event_type": "nerium.ma.tool_call",
            "payload": '{"tool_name":"search","tool_use_id":"t1"}',
            "created_at": datetime(2026, 4, 27, tzinfo=timezone.utc),
        }
    )
    envelope = row_to_envelope(row)
    assert envelope["id"] == 42
    assert envelope["type"] == "nerium.ma.tool_call"
    assert envelope["data"] == {"tool_name": "search", "tool_use_id": "t1"}


def test_row_to_envelope_handles_dict_payload() -> None:
    """When a custom codec is registered the payload arrives as a dict."""

    row = _FakeRow(
        {
            "id": 3,
            "event_type": "nerium.ma.delta",
            "payload": {"session_id": "s1", "delta": "hi"},
            "created_at": datetime(2026, 4, 27, tzinfo=timezone.utc),
        }
    )
    envelope = row_to_envelope(row)
    assert envelope["data"] == {"session_id": "s1", "delta": "hi"}


def test_row_to_envelope_graceful_on_bad_json() -> None:
    row = _FakeRow(
        {
            "id": 1,
            "event_type": "nerium.ma.delta",
            "payload": "not-valid-json",
            "created_at": datetime(2026, 4, 27, tzinfo=timezone.utc),
        }
    )
    envelope = row_to_envelope(row)
    assert envelope["data"] == {}
