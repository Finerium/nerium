"""UUID v7 utility tests.

Covers the invariants declared in ``src/backend/utils/uuid7.py``:

- Version bits are 7.
- Variant bits are RFC 4122 (``0b10``).
- Monotonic ordering across rapid calls.
- Timestamp round-trip via :func:`extract_timestamp_ms`.
- ``uuid7_from_ms`` produces the exact embedded timestamp.
"""

from __future__ import annotations

import time
from uuid import UUID

from src.backend.utils.uuid7 import (
    extract_timestamp_ms,
    uuid7,
    uuid7_from_ms,
    uuid7_timestamp_ms,
)


def test_uuid7_has_version_seven() -> None:
    uid = uuid7()
    assert uid.version == 7


def test_uuid7_has_rfc4122_variant() -> None:
    uid = uuid7()
    # uuid.UUID.variant returns a string; for RFC 4122 variant the value is
    # "specified in RFC 4122".
    assert uid.variant == "specified in RFC 4122"


def test_uuid7_monotonic_within_tight_loop() -> None:
    samples = [uuid7() for _ in range(1000)]
    for a, b in zip(samples, samples[1:]):
        assert a.int < b.int, f"UUID v7 monotonicity violated: {a} !< {b}"


def test_uuid7_monotonic_sorted_matches_generation_order() -> None:
    samples = [uuid7() for _ in range(500)]
    assert samples == sorted(samples, key=lambda u: u.int)


def test_uuid7_timestamp_round_trip() -> None:
    before = uuid7_timestamp_ms()
    uid = uuid7()
    after = uuid7_timestamp_ms()
    embedded = extract_timestamp_ms(uid)
    # The embedded timestamp must fall within the before/after window with
    # a one-ms tolerance for monotonic overflow bumps.
    assert before - 1 <= embedded <= after + 1


def test_uuid7_from_ms_produces_exact_timestamp() -> None:
    reference = 1_750_000_000_000  # mid-2025 epoch ms
    uid = uuid7_from_ms(reference)
    assert extract_timestamp_ms(uid) == reference
    assert uid.version == 7


def test_extract_timestamp_rejects_non_v7() -> None:
    # UUID v4 should raise.
    from uuid import uuid4

    v4 = uuid4()
    try:
        extract_timestamp_ms(v4)
    except ValueError:
        pass
    else:
        raise AssertionError("extract_timestamp_ms must reject non-v7 UUIDs")


def test_uuid7_generates_distinct_values() -> None:
    seen: set[UUID] = set()
    for _ in range(5000):
        uid = uuid7()
        assert uid not in seen, "UUID v7 collision within single process"
        seen.add(uid)


def test_uuid7_string_sort_matches_int_sort() -> None:
    # Hyphenated string sort must match integer sort for v7 because the
    # timestamp sits in the most significant bits. This is the property that
    # makes UUID v7 index-friendly.
    samples = [uuid7() for _ in range(200)]
    by_int = sorted(samples, key=lambda u: u.int)
    by_str = sorted(samples, key=str)
    assert by_int == by_str


def test_uuid7_survives_clock_backward_jump(monkeypatch) -> None:
    # Simulate a negative time delta between calls; monotonicity must still
    # hold because the generator keeps a local ``_last_ts_ms`` floor.
    # Import the submodule by full path because ``from src.backend.utils
    # import uuid7`` resolves to the re-exported function, not the module.
    import importlib

    uuid7_mod = importlib.import_module("src.backend.utils.uuid7")

    real_ms = uuid7_mod.uuid7_timestamp_ms()
    fake_now = {"v": real_ms}

    def _fake_ts():
        return fake_now["v"] & ((1 << 48) - 1)

    monkeypatch.setattr(uuid7_mod, "uuid7_timestamp_ms", _fake_ts)

    a = uuid7_mod.uuid7()
    fake_now["v"] = real_ms - 10_000  # wall clock went 10 seconds backward
    b = uuid7_mod.uuid7()
    assert a.int < b.int, "Monotonicity must hold across backward clock jumps"
