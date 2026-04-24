"""Tests for :mod:`src.backend.budget.redis_keys`.

Owner: Moros (W2 NP P3 S1).

Locks the canonical ``chronos:*`` key schema so a downstream writer
cannot silently drift the strings the Kratos pre-call gate reads.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from src.backend.budget import redis_keys as rk


def test_global_keys_match_contract() -> None:
    """Contract Section 3.2 names + Kratos guard mirror."""

    assert rk.GLOBAL_CAP_FLAG == "chronos:ma_capped"
    assert rk.LAST_POLL_HASH == "chronos:last_poll"
    assert rk.LAST_RECONCILE_TS == "chronos:last_reconcile_ts"
    assert rk.POLL_LOCK == "chronos:poll_lock"
    assert rk.CONSECUTIVE_FAILURES == "chronos:consecutive_failures"
    assert rk.LAST_ERROR == "chronos:last_error"
    assert rk.GLOBAL_AUTO_DISABLED_FLAG == "chronos:global_auto_disabled"
    assert rk.CAP_EVENTS_CHANNEL == "chronos:cap-events"


def test_tenant_key_templates_match_kratos_mirror() -> None:
    """Tenant key formats must match ``ma.budget_guard`` byte-for-byte."""

    from src.backend.ma.budget_guard import (
        CHRONOS_GLOBAL_CAP_KEY,
        CHRONOS_TENANT_CAP_KEY_FMT,
        CHRONOS_TENANT_CAP_USD_KEY_FMT,
        CHRONOS_TENANT_SPENT_KEY_FMT,
    )

    assert rk.GLOBAL_CAP_FLAG == CHRONOS_GLOBAL_CAP_KEY
    assert rk.TENANT_CAP_FLAG_FMT == CHRONOS_TENANT_CAP_KEY_FMT
    assert rk.TENANT_SPENT_TODAY_FMT == CHRONOS_TENANT_SPENT_KEY_FMT
    assert rk.TENANT_CAP_USD_FMT == CHRONOS_TENANT_CAP_USD_KEY_FMT


def test_cycle_audit_format_and_ttl() -> None:
    key = rk.CYCLE_AUDIT_FMT.format(cycle_id="abc")
    assert key == "chronos:cycle:abc"
    assert rk.CYCLE_AUDIT_TTL_SECONDS == 3600


def test_next_utc_midnight_rolls_forward_across_boundary() -> None:
    """23:59:59 on any day rolls to the next day at 00:00:00 UTC."""

    now = datetime(2026, 4, 24, 23, 59, 59, tzinfo=timezone.utc)
    got = rk.next_utc_midnight(now)
    assert got == datetime(2026, 4, 25, 0, 0, 0, tzinfo=timezone.utc)


def test_seconds_until_next_utc_midnight_positive() -> None:
    """TTL helper never returns 0 even right on the boundary."""

    boundary = datetime(2026, 4, 24, 0, 0, 0, tzinfo=timezone.utc)
    ttl = rk.seconds_until_next_utc_midnight(boundary)
    # 24h exactly -> 86400 seconds.
    assert ttl == 86400


def test_seconds_until_next_utc_midnight_minimum_one() -> None:
    """A microsecond-before-midnight input returns at least 1 second."""

    now = datetime(2026, 4, 24, 23, 59, 59, 999999, tzinfo=timezone.utc)
    ttl = rk.seconds_until_next_utc_midnight(now)
    assert ttl >= 1
