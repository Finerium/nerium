"""Tests for Stripe client singleton + Hemera live-mode gate.

Owner: Plutus (W2 NP P4 S1).
"""

from __future__ import annotations

import pytest
from pydantic import SecretStr

from src.backend.billing import stripe_client as stripe_mod
from src.backend.billing.stripe_client import (
    StripeLiveModeForbiddenProblem,
    StripeNotConfiguredProblem,
    ensure_live_mode_disabled,
    ensure_test_mode,
    get_stripe_client,
    is_configured,
    reset_stripe_client,
)
from src.backend.config import Settings, get_settings


@pytest.fixture
def missing_key_settings(monkeypatch: pytest.MonkeyPatch) -> Settings:
    """Settings with empty Stripe test key."""

    settings = Settings(
        env="development",
        stripe_secret_key_test=SecretStr(""),
    )
    monkeypatch.setattr("src.backend.config.get_settings", lambda: settings)
    monkeypatch.setattr("src.backend.billing.stripe_client.get_settings", lambda: settings)
    get_settings.cache_clear()
    reset_stripe_client()
    return settings


@pytest.fixture
def live_key_settings(monkeypatch: pytest.MonkeyPatch) -> Settings:
    """Settings carrying a live-prefixed key (must be rejected)."""

    settings = Settings(
        env="development",
        stripe_secret_key_test=SecretStr("sk_live_dangerkey"),
    )
    monkeypatch.setattr("src.backend.config.get_settings", lambda: settings)
    monkeypatch.setattr("src.backend.billing.stripe_client.get_settings", lambda: settings)
    get_settings.cache_clear()
    reset_stripe_client()
    return settings


# ---------------------------------------------------------------------------
# Client build + singleton
# ---------------------------------------------------------------------------


def test_is_configured_false_without_key(missing_key_settings) -> None:
    assert is_configured() is False


def test_is_configured_true_with_key(billing_settings) -> None:
    assert is_configured() is True


def test_get_stripe_client_raises_on_missing(missing_key_settings) -> None:
    with pytest.raises(StripeNotConfiguredProblem):
        get_stripe_client()


def test_get_stripe_client_builds_with_key(billing_settings) -> None:
    client = get_stripe_client()
    assert client is not None
    # Cached singleton: second call returns same object.
    client2 = get_stripe_client()
    assert client is client2


def test_reset_stripe_client_rebuilds(billing_settings) -> None:
    a = get_stripe_client()
    reset_stripe_client()
    b = get_stripe_client()
    assert a is not b


# ---------------------------------------------------------------------------
# ensure_test_mode
# ---------------------------------------------------------------------------


def test_ensure_test_mode_accepts_sk_test(billing_settings) -> None:
    # Must not raise.
    ensure_test_mode("sk_test_goodkey")


def test_ensure_test_mode_rejects_sk_live(live_key_settings) -> None:
    from src.backend.errors import ForbiddenProblem

    with pytest.raises(ForbiddenProblem):
        ensure_test_mode()


def test_ensure_test_mode_empty_is_noop(missing_key_settings) -> None:
    # Empty key path is a no-op (downstream not-configured handles it).
    ensure_test_mode("")


# ---------------------------------------------------------------------------
# ensure_live_mode_disabled + Hemera gate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_live_gate_allows_when_flag_false(flag_false) -> None:
    # Should not raise.
    await ensure_live_mode_disabled(user_id=None, tenant_id=None)


@pytest.mark.asyncio
async def test_live_gate_blocks_when_flag_true(flag_true) -> None:
    with pytest.raises(StripeLiveModeForbiddenProblem) as excinfo:
        await ensure_live_mode_disabled(user_id=None, tenant_id=None)
    assert excinfo.value.status == 403
    assert excinfo.value.slug == "stripe_live_disabled"


@pytest.mark.asyncio
async def test_live_gate_fails_safe_on_flag_lookup_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A flag-lookup exception must default to allow (fail-safe for dev)."""

    async def broken(*a, **k):
        raise RuntimeError("redis down")

    monkeypatch.setattr(
        "src.backend.billing.stripe_client.get_flag", broken
    )
    # Should not raise.
    await ensure_live_mode_disabled()
