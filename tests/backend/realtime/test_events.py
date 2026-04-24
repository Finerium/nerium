"""Tests for the generic realtime envelope helpers."""

from __future__ import annotations

import json

import pytest

from src.backend.realtime.events import (
    REALTIME_ENVELOPE_VERSION,
    RealtimeEvent,
    build_event,
    iter_resource_keys,
    normalise_resource_key,
    now_iso_utc,
)


def test_envelope_round_trips_to_json() -> None:
    event = build_event(
        event_id=42,
        event_type="nerium.test.delta",
        data={"value": "hi"},
    )
    blob = event.to_json()
    parsed = json.loads(blob)
    assert parsed["id"] == 42
    assert parsed["type"] == "nerium.test.delta"
    assert parsed["data"]["value"] == "hi"
    assert parsed["version"] == REALTIME_ENVELOPE_VERSION
    # ISO-8601 UTC with Z suffix.
    assert parsed["occurred_at"].endswith("Z")


def test_now_iso_utc_has_z_suffix() -> None:
    assert now_iso_utc().endswith("Z")


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("user:123", "user:123"),
        (" tenant:abc ", "tenant:abc"),
        ("Builder:Session:99", "builder:Session:99"),
    ],
)
def test_normalise_resource_key(raw: str, expected: str) -> None:
    assert normalise_resource_key(raw) == expected


@pytest.mark.parametrize(
    "raw",
    ["", "no-colon", "has space:foo", " :empty-scope"],
)
def test_normalise_resource_key_rejects_bad_inputs(raw: str) -> None:
    with pytest.raises(ValueError):
        normalise_resource_key(raw)


def test_iter_resource_keys_dedupes_preserving_order() -> None:
    out = iter_resource_keys(["user:1", "user:1", "session:5"])
    assert out == ["user:1", "session:5"]


def test_event_as_dict_carries_version() -> None:
    event = RealtimeEvent(
        id=1,
        type="x.y.z",
        data={},
        occurred_at="2026-04-24T00:00:00.000Z",
    )
    payload = event.as_dict()
    assert payload["version"] == REALTIME_ENVELOPE_VERSION
