"""Cursor pagination unit tests.

Covers:
- encode/decode roundtrip, base64 URL-safety, padding strip.
- Tamper-resistant: malformed cursors raise ``ValueError``.
- ``CursorPaginationParams`` limit clamp (1 <= limit <= 100).
- ``CursorPage`` generic envelope shape.
- ``keyset_where_clause`` fragment + binds for DESC pagination.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

import pytest
from pydantic import BaseModel, ValidationError

from src.backend.pagination import (
    CURSOR_SCHEMA_VERSION,
    CursorDirection,
    CursorPage,
    CursorPaginationParams,
    CursorPayload,
    decode_cursor,
    encode_cursor,
    keyset_where_clause,
)


def _sample_payload() -> CursorPayload:
    return CursorPayload(
        v=CURSOR_SCHEMA_VERSION,
        ts=datetime(2026, 4, 24, 12, 0, 0, tzinfo=timezone.utc),
        id=UUID("01926f12-3456-7abc-89de-f0123456789a"),
        dir=CursorDirection.NEXT,
    )


def test_encode_decode_roundtrip() -> None:
    payload = _sample_payload()
    token = encode_cursor(payload)
    assert isinstance(token, str)
    assert "=" not in token  # padding stripped per RFC 7515.
    decoded = decode_cursor(token)
    assert decoded.v == payload.v
    assert decoded.ts == payload.ts
    assert decoded.id == payload.id
    assert decoded.dir == payload.dir


def test_encode_from_dict() -> None:
    token = encode_cursor(
        {
            "v": 1,
            "ts": "2026-04-24T12:00:00Z",
            "id": "01926f12-3456-7abc-89de-f0123456789a",
            "dir": "next",
        }
    )
    decoded = decode_cursor(token)
    assert decoded.id == UUID("01926f12-3456-7abc-89de-f0123456789a")


def test_decode_empty_raises() -> None:
    with pytest.raises(ValueError):
        decode_cursor("")


def test_decode_malformed_base64_raises() -> None:
    with pytest.raises(ValueError):
        decode_cursor("!!!not base64!!!")


def test_decode_non_json_payload_raises() -> None:
    # Valid base64 but not JSON.
    import base64

    junk = base64.urlsafe_b64encode(b"\xff\xfe\xfd").rstrip(b"=").decode("ascii")
    with pytest.raises(ValueError):
        decode_cursor(junk)


def test_decode_unsupported_version_raises() -> None:
    import base64
    import json

    raw = json.dumps(
        {
            "v": 99,
            "ts": "2026-04-24T12:00:00Z",
            "id": "01926f12-3456-7abc-89de-f0123456789a",
            "dir": "next",
        }
    ).encode("utf-8")
    token = base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")
    with pytest.raises(ValueError):
        decode_cursor(token)


def test_params_clamp_limit() -> None:
    # Below minimum: pydantic rejects via ge constraint.
    with pytest.raises(ValidationError):
        CursorPaginationParams(limit=0)
    # Above maximum: pydantic rejects via le constraint.
    with pytest.raises(ValidationError):
        CursorPaginationParams(limit=500)
    # Default is 25.
    assert CursorPaginationParams().limit == 25
    # Valid values round-trip.
    assert CursorPaginationParams(limit=100).limit == 100


def test_params_decoded_returns_none_without_cursor() -> None:
    assert CursorPaginationParams().decoded() is None


def test_params_decoded_returns_payload() -> None:
    token = encode_cursor(_sample_payload())
    params = CursorPaginationParams(cursor=token)
    decoded = params.decoded()
    assert decoded is not None
    assert decoded.id == UUID("01926f12-3456-7abc-89de-f0123456789a")


def test_cursor_page_generic_envelope() -> None:
    class Item(BaseModel):
        id: str
        label: str

    page: CursorPage[Item] = CursorPage[Item](
        items=[Item(id="1", label="a"), Item(id="2", label="b")],
        next_cursor="abc",
        has_more=True,
    )
    dumped = page.model_dump()
    assert dumped["items"][0]["label"] == "a"
    assert dumped["next_cursor"] == "abc"
    assert dumped["has_more"] is True


def test_keyset_where_clause_empty_on_no_cursor() -> None:
    fragment, binds = keyset_where_clause(None)
    assert fragment == ""
    assert binds == []


def test_keyset_where_clause_next_uses_less_than() -> None:
    payload = _sample_payload()
    fragment, binds = keyset_where_clause(payload)
    assert "(created_at, id) < ($1, $2)" == fragment
    assert binds == [payload.ts, payload.id]


def test_keyset_where_clause_prev_uses_greater_than() -> None:
    payload = _sample_payload().model_copy(update={"dir": CursorDirection.PREV})
    fragment, _ = keyset_where_clause(payload)
    assert "(created_at, id) > ($1, $2)" == fragment


def test_keyset_where_clause_placeholder_offset() -> None:
    payload = _sample_payload()
    fragment, binds = keyset_where_clause(payload, start_placeholder=5)
    assert "($5, $6)" in fragment
    assert len(binds) == 2


def test_naive_timestamp_is_normalised_to_utc() -> None:
    naive = datetime(2026, 4, 24, 12, 0, 0)
    payload = CursorPayload(
        ts=naive,
        id=UUID("01926f12-3456-7abc-89de-f0123456789a"),
    )
    assert payload.ts.tzinfo == timezone.utc
