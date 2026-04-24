"""UUID v7 generator per RFC 9562 (formerly draft-peabody-dispatch-new-uuid-format).

Layout (128 bits, big-endian):

    0                   1                   2                   3
    0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |                           unix_ts_ms                          |
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |          unix_ts_ms           |  ver  |       rand_a          |
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |var|                        rand_b                             |
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |                            rand_b                             |
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+

Fields
------
- ``unix_ts_ms`` (48 bits): milliseconds since Unix epoch, big-endian.
- ``ver`` (4 bits): constant ``0b0111`` (version 7).
- ``rand_a`` (12 bits): per-invocation counter mixed with random bits, ensures
  strict monotonic ordering inside a single millisecond.
- ``var`` (2 bits): constant ``0b10`` (RFC 4122 variant).
- ``rand_b`` (62 bits): cryptographic random from ``secrets.token_bytes``.

Properties
----------
- Values are **time-ordered** when compared as big-endian unsigned 128-bit
  integers or as sorted hyphenated strings: this is why UUID v7 is preferred
  over UUID v4 for primary keys (B-tree index locality, range scans).
- **Monotonic within a process**: if two calls land inside the same millisecond
  the second value is greater than the first because ``rand_a`` is a per-ms
  counter on this generator. Cross-process collisions are vanishingly rare
  given 62 bits of entropy in ``rand_b``.
- **No external dependency**: pure stdlib. We intentionally avoid third-party
  ``uuid6`` / ``uuid-utils`` packages to keep the Session 1 scaffold minimal
  and to control monotonicity semantics.

Contract references
-------------------
- ``docs/contracts/rest_api_base.contract.md`` Section 3.5 UUID v7 identifiers.
- ``docs/contracts/postgres_multi_tenant.contract.md`` Section 3.2 uuid PK.

Author: Aether (NP Wave 1 Session 1).
"""

from __future__ import annotations

import os
import secrets
import threading
import time
from uuid import UUID

# Constants
_VERSION = 0x7  # 4 bits
_VARIANT = 0x2  # 2 bits (RFC 4122: 10xxxxxx)
_MAX_RAND_A = (1 << 12) - 1
_TS_MASK = (1 << 48) - 1

# Monotonic state guarded by a single lock so cross-thread calls stay strictly
# increasing. For multi-process deployments the per-process monotonicity is
# sufficient because rand_b contributes 62 bits of entropy; global clock skew
# is bounded by NTP so no process will issue timestamps more than a few ms out
# of order under normal operation.
_lock = threading.Lock()
_last_ts_ms: int = 0
_last_rand_a: int = 0


def uuid7_timestamp_ms() -> int:
    """Return the current Unix timestamp in milliseconds, clamped to 48 bits.

    Extracted so tests can monkeypatch the clock source.
    """

    return int(time.time() * 1000) & _TS_MASK


def _next_counter(now_ms: int) -> tuple[int, int]:
    """Advance the monotonic counter. Returns ``(ts_ms, rand_a)``.

    Behavior
    --------
    - If ``now_ms`` is strictly greater than the last stored timestamp, reset
      ``rand_a`` to a fresh random 12-bit seed and return ``(now_ms, seed)``.
    - If ``now_ms`` is equal to the last timestamp, bump ``rand_a`` by one.
      If the bump overflows the 12-bit field, advance the timestamp by 1 ms
      and reseed ``rand_a`` (small clock skew, still monotonic).
    - If ``now_ms`` is less than the last timestamp (clock went backward,
      possible on VM time sync), use ``last_ts_ms`` and bump the counter. This
      preserves monotonicity at the cost of generating values slightly into
      the future; the skew self-corrects as wall clock catches up.
    """

    global _last_ts_ms, _last_rand_a

    if now_ms > _last_ts_ms:
        ts = now_ms
        seed_bytes = secrets.token_bytes(2)
        rand_a = int.from_bytes(seed_bytes, "big") & _MAX_RAND_A
    elif now_ms == _last_ts_ms:
        ts = _last_ts_ms
        rand_a = _last_rand_a + 1
        if rand_a > _MAX_RAND_A:
            ts = _last_ts_ms + 1
            seed_bytes = secrets.token_bytes(2)
            rand_a = int.from_bytes(seed_bytes, "big") & _MAX_RAND_A
    else:
        ts = _last_ts_ms
        rand_a = _last_rand_a + 1
        if rand_a > _MAX_RAND_A:
            ts = _last_ts_ms + 1
            seed_bytes = secrets.token_bytes(2)
            rand_a = int.from_bytes(seed_bytes, "big") & _MAX_RAND_A

    _last_ts_ms = ts
    _last_rand_a = rand_a
    return ts, rand_a


def _compose(ts_ms: int, rand_a: int, rand_b: int) -> UUID:
    """Compose a 128-bit integer from the UUID v7 field layout."""

    ts_ms &= _TS_MASK
    rand_a &= _MAX_RAND_A
    rand_b &= (1 << 62) - 1

    value = (ts_ms & _TS_MASK) << 80
    value |= (_VERSION & 0xF) << 76
    value |= (rand_a & _MAX_RAND_A) << 64
    value |= (_VARIANT & 0x3) << 62
    value |= rand_b
    return UUID(int=value)


def uuid7() -> UUID:
    """Generate a fresh UUID v7.

    Thread-safe. Strictly monotonic within the process. Version bits and
    variant bits conform to RFC 9562.
    """

    now_ms = uuid7_timestamp_ms()
    with _lock:
        ts_ms, rand_a = _next_counter(now_ms)
    rand_b = int.from_bytes(secrets.token_bytes(8), "big") & ((1 << 62) - 1)
    return _compose(ts_ms, rand_a, rand_b)


def uuid7_from_ms(ts_ms: int) -> UUID:
    """Generate a UUID v7 anchored at an explicit timestamp.

    Used by tests that need deterministic ordering checks. The monotonic
    counter is NOT advanced for this call (callers that want monotonicity
    should use :func:`uuid7`).
    """

    if ts_ms < 0:
        raise ValueError("ts_ms must be non-negative")
    ts_ms &= _TS_MASK
    rand_bytes = secrets.token_bytes(10)
    rand_a = int.from_bytes(rand_bytes[:2], "big") & _MAX_RAND_A
    rand_b = int.from_bytes(rand_bytes[2:], "big") & ((1 << 62) - 1)
    return _compose(ts_ms, rand_a, rand_b)


def extract_timestamp_ms(value: UUID) -> int:
    """Recover the 48-bit millisecond timestamp embedded in a UUID v7.

    Raises ``ValueError`` if the input is not a UUID v7 (version bits != 7).
    """

    if value.version != 7:
        raise ValueError(f"UUID version {value.version} is not v7")
    return (value.int >> 80) & _TS_MASK


__all__ = [
    "uuid7",
    "uuid7_from_ms",
    "uuid7_timestamp_ms",
    "extract_timestamp_ms",
]


if __name__ == "__main__":  # pragma: no cover
    # Quick sanity dump; run ``python -m src.backend.utils.uuid7``.
    sample = [uuid7() for _ in range(5)]
    for uid in sample:
        ms = extract_timestamp_ms(uid)
        print(f"{uid}  ts_ms={ms}  version={uid.version}  variant={uid.variant}")
    assert sample == sorted(sample), "UUID v7 monotonicity violated"
    print(f"pid={os.getpid()} generated {len(sample)} monotonic UUID v7 values")
