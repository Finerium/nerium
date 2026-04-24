"""Unsubscribe HMAC token round-trip + tamper detection.

Contract: docs/contracts/email_transactional.contract.md Section 4.3.

Covers:
- Round trip: build_unsubscribe_token -> verify_unsubscribe_token
  returns the original email + category.
- Tamper: flipping a byte in the payload or signature raises
  :class:`InvalidUnsubscribeToken`.
- Age: tokens older than the 180-day window are rejected.
- Future-date tolerance: up to 5 min skew tolerated; beyond rejected.
- URL shape: ``build_unsubscribe_url`` returns a URL using the
  configured base URL + the ``token`` query parameter.
"""

from __future__ import annotations

import time

import pytest

from src.backend.email.unsubscribe import (
    InvalidUnsubscribeToken,
    TOKEN_MAX_AGE_SECONDS,
    build_unsubscribe_token,
    build_unsubscribe_url,
    verify_unsubscribe_token,
)


def test_token_round_trip(pheme_settings) -> None:
    token = build_unsubscribe_token(
        email="lumen@example.com",
        category="marketplace",
        settings=pheme_settings,
    )
    payload = verify_unsubscribe_token(token, settings=pheme_settings)
    assert payload.email == "lumen@example.com"
    assert payload.category == "marketplace"


def test_email_normalised_to_lowercase(pheme_settings) -> None:
    token = build_unsubscribe_token(
        email="Lumen@Example.COM",
        category="system_alert",
        settings=pheme_settings,
    )
    payload = verify_unsubscribe_token(token, settings=pheme_settings)
    assert payload.email == "lumen@example.com"


def test_token_tamper_signature_rejected(pheme_settings) -> None:
    token = build_unsubscribe_token(
        email="lumen@example.com",
        category="billing",
        settings=pheme_settings,
    )
    head, sig = token.split(".", 1)
    # Flip one character in the signature to invalidate HMAC.
    tampered_sig = ("B" if sig[0] != "B" else "C") + sig[1:]
    tampered = f"{head}.{tampered_sig}"
    with pytest.raises(InvalidUnsubscribeToken):
        verify_unsubscribe_token(tampered, settings=pheme_settings)


def test_token_tamper_payload_rejected(pheme_settings) -> None:
    token = build_unsubscribe_token(
        email="lumen@example.com",
        category="billing",
        settings=pheme_settings,
    )
    head, sig = token.split(".", 1)
    tampered_head = ("A" if head[0] != "A" else "B") + head[1:]
    tampered = f"{tampered_head}.{sig}"
    with pytest.raises(InvalidUnsubscribeToken):
        verify_unsubscribe_token(tampered, settings=pheme_settings)


def test_token_expires_after_max_age(pheme_settings) -> None:
    old_ts = int(time.time()) - TOKEN_MAX_AGE_SECONDS - 3600
    token = build_unsubscribe_token(
        email="lumen@example.com",
        category="marketplace",
        settings=pheme_settings,
        issued_at=old_ts,
    )
    with pytest.raises(InvalidUnsubscribeToken):
        verify_unsubscribe_token(token, settings=pheme_settings)


def test_token_future_skew_tolerated_small(pheme_settings) -> None:
    future_ts = int(time.time()) + 60  # 60 s in the future, within tolerance
    token = build_unsubscribe_token(
        email="lumen@example.com",
        category="marketplace",
        settings=pheme_settings,
        issued_at=future_ts,
    )
    payload = verify_unsubscribe_token(token, settings=pheme_settings)
    assert payload.email == "lumen@example.com"


def test_token_future_skew_rejected_large(pheme_settings) -> None:
    future_ts = int(time.time()) + 3600  # 1 h ahead
    token = build_unsubscribe_token(
        email="lumen@example.com",
        category="marketplace",
        settings=pheme_settings,
        issued_at=future_ts,
    )
    with pytest.raises(InvalidUnsubscribeToken):
        verify_unsubscribe_token(token, settings=pheme_settings)


def test_token_malformed_rejected(pheme_settings) -> None:
    with pytest.raises(InvalidUnsubscribeToken):
        verify_unsubscribe_token("not-a-valid-token", settings=pheme_settings)
    with pytest.raises(InvalidUnsubscribeToken):
        verify_unsubscribe_token("", settings=pheme_settings)
    with pytest.raises(InvalidUnsubscribeToken):
        verify_unsubscribe_token("one.two.three", settings=pheme_settings)


def test_build_unsubscribe_url_shape(pheme_settings) -> None:
    url = build_unsubscribe_url(
        email="lumen@example.com",
        category="marketplace",
        settings=pheme_settings,
    )
    assert url.startswith("https://test.nerium/unsubscribe?token=")


def test_build_list_unsubscribe_headers_contains_mailto(pheme_settings) -> None:
    from src.backend.email.unsubscribe import build_list_unsubscribe_headers

    headers = build_list_unsubscribe_headers(
        email="lumen@example.com",
        category="marketplace",
        settings=pheme_settings,
    )
    assert "List-Unsubscribe" in headers
    assert "mailto:unsubscribe@nerium.com" in headers["List-Unsubscribe"]
    assert headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
