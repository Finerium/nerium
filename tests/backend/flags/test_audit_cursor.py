"""Audit cursor encode/decode round-trip tests."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from src.backend.flags.audit import _decode_cursor, _encode_cursor


def test_round_trip_preserves_values() -> None:
    original_at = datetime(2026, 4, 24, 18, 5, 7, 123456, tzinfo=timezone.utc)
    original_id = 4242
    cursor = _encode_cursor(original_at, original_id)
    decoded_at, decoded_id = _decode_cursor(cursor)
    assert decoded_at == original_at
    assert decoded_id == original_id


def test_cursor_is_urlsafe() -> None:
    """Produced cursors contain only URL-safe base64 + stripped padding."""

    cursor = _encode_cursor(datetime(2026, 1, 1, tzinfo=timezone.utc), 1)
    allowed = set(
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"
    )
    assert set(cursor) <= allowed


def test_cursor_decode_rejects_garbage() -> None:
    with pytest.raises(ValueError):
        _decode_cursor("not-a-valid-cursor-!!!")


def test_cursor_decode_rejects_missing_keys() -> None:
    import base64
    import json

    raw = json.dumps({"foo": "bar"}).encode("utf-8")
    fake = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    with pytest.raises(ValueError):
        _decode_cursor(fake)


def test_cursor_naive_datetime_promoted_to_utc() -> None:
    """A naive datetime decodes as UTC-aware for deterministic comparison."""

    import base64
    import json

    payload = {"at": "2026-04-24T18:00:00", "id": 1}
    raw = json.dumps(payload).encode("utf-8")
    cursor = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    decoded_at, _ = _decode_cursor(cursor)
    assert decoded_at.tzinfo == timezone.utc
