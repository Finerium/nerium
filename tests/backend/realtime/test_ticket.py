"""Tests for the realtime ticket verifier (S1 stub).

S2 will replace the verifier with the EdDSA mint flow; these tests
target the stub's behaviour today + the seam ``set_realtime_verifier``
that S2 swaps.
"""

from __future__ import annotations

import time

import pytest
from jose import jwt

from src.backend.config import Settings
from src.backend.errors import UnauthorizedProblem
from src.backend.middleware.auth import AuthPrincipal
from src.backend.realtime.ticket import (
    get_realtime_verifier,
    set_realtime_verifier,
    verify_ticket,
    verify_ticket_optional,
)


@pytest.fixture(autouse=True)
def _reset_verifier():
    set_realtime_verifier(None)
    yield
    set_realtime_verifier(None)


@pytest.fixture
def settings() -> Settings:
    return Settings(env="development")


def _mint(settings: Settings, *, exp_in: int = 60, **claims_override) -> str:
    now = int(time.time())
    claims = {
        "sub": "11111111-1111-7111-8111-111111111111",
        "tenant_id": "22222222-2222-7222-8222-222222222222",
        "iss": "nerium-test",
        "iat": now,
        "exp": now + exp_in,
        "scope": "realtime:*",
    }
    claims.update(claims_override)
    return jwt.encode(
        claims,
        settings.secret_key.get_secret_value(),
        algorithm="HS256",
    )


def test_default_verifier_accepts_valid_jwt(settings: Settings) -> None:
    token = _mint(settings)
    principal = verify_ticket(token, settings=settings)
    assert isinstance(principal, AuthPrincipal)
    assert principal.user_id.startswith("11111111")


def test_missing_ticket_raises(settings: Settings) -> None:
    with pytest.raises(UnauthorizedProblem) as exc:
        verify_ticket(None, settings=settings)
    assert exc.value.detail == "ticket_missing"


def test_expired_ticket_raises_unauthorized(settings: Settings) -> None:
    token = _mint(settings, exp_in=-10)
    with pytest.raises(UnauthorizedProblem):
        verify_ticket(token, settings=settings)


def test_signature_mismatch_raises_unauthorized(settings: Settings) -> None:
    other = jwt.encode({"sub": "x", "tenant_id": "y"}, "bogus-key", algorithm="HS256")
    with pytest.raises(UnauthorizedProblem):
        verify_ticket(other, settings=settings)


def test_optional_returns_none_for_empty_ticket() -> None:
    assert verify_ticket_optional(None) is None
    assert verify_ticket_optional("") is None


def test_set_realtime_verifier_swap(settings: Settings) -> None:
    captured = {}

    def fake(raw: str, cfg: Settings) -> AuthPrincipal:
        captured["raw"] = raw
        return AuthPrincipal(user_id="custom", tenant_id="tenant")

    set_realtime_verifier(fake)
    principal = verify_ticket("anything", settings=settings)
    assert captured["raw"] == "anything"
    assert principal.user_id == "custom"
    assert get_realtime_verifier() is fake
