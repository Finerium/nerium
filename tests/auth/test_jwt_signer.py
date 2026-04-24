"""JwtSigner unit tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from jose.exceptions import ExpiredSignatureError, JWTError

from src.backend.auth.jwt_signer import JwtSigner


def _fresh_signer(grace_days: int = 7) -> JwtSigner:
    signer = JwtSigner(grace_window_days=grace_days)
    signer.bootstrap_from_env()
    return signer


def test_sign_then_verify_happy_path() -> None:
    signer = _fresh_signer()
    token = signer.sign(
        payload={
            "sub": "01926f00-0000-7000-8000-000000000001",
            "aud": "https://nerium.com/mcp",
            "client_id": "01926f00-0000-7000-8000-000000000abc",
            "scope": "mcp:read",
        },
        ttl_seconds=60,
    )
    claims = signer.verify(token, audience="https://nerium.com/mcp")
    assert claims["sub"] == "01926f00-0000-7000-8000-000000000001"
    assert claims["aud"] == "https://nerium.com/mcp"
    assert claims["iss"] == "https://nerium.com"
    assert "jti" in claims
    assert "iat" in claims
    assert "exp" in claims


def test_verify_rejects_wrong_audience() -> None:
    signer = _fresh_signer()
    token = signer.sign(
        payload={"sub": "x", "aud": "https://nerium.com/mcp"},
        ttl_seconds=60,
    )
    with pytest.raises(JWTError):
        signer.verify(token, audience="https://evil.example/mcp")


def test_verify_rejects_expired_token() -> None:
    signer = _fresh_signer()
    token = signer.sign(
        payload={"sub": "x", "aud": "https://nerium.com/mcp"},
        ttl_seconds=-1,
    )
    with pytest.raises(ExpiredSignatureError):
        signer.verify(token, audience="https://nerium.com/mcp")


def test_rotation_previous_token_verifies_during_grace() -> None:
    signer = _fresh_signer(grace_days=7)
    old_kid = signer.active_kid()
    old_token = signer.sign(
        payload={"sub": "x", "aud": "https://nerium.com/mcp"},
        ttl_seconds=600,
    )
    new_kid = signer.rotate()
    assert new_kid != old_kid
    assert signer.active_kid() == new_kid
    claims = signer.verify(old_token, audience="https://nerium.com/mcp")
    assert claims["sub"] == "x"
    jwks = signer.jwks()
    kids = [k["kid"] for k in jwks["keys"]]
    assert old_kid in kids
    assert new_kid in kids


def test_prune_retired_after_grace_window_removes_old_key() -> None:
    signer = _fresh_signer(grace_days=0)
    signer.rotate()
    removed = signer.prune_retired()
    assert removed >= 1


def test_retired_key_beyond_grace_rejects_old_token() -> None:
    signer = _fresh_signer(grace_days=7)
    old_token = signer.sign(
        payload={"sub": "x", "aud": "https://nerium.com/mcp"},
        ttl_seconds=600,
    )
    signer.rotate()
    for entry in signer._keys:  # intentional private access for test
        if not entry.is_active():
            entry.retires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    with pytest.raises(JWTError):
        signer.verify(old_token, audience="https://nerium.com/mcp")


def test_jwks_n_and_e_are_base64url_no_padding() -> None:
    signer = _fresh_signer()
    jwks = signer.jwks()
    assert jwks["keys"]
    for entry in jwks["keys"]:
        assert "=" not in entry["n"]
        assert "=" not in entry["e"]
        assert entry["kty"] == "RSA"
        assert entry["alg"] == "RS256"
        assert entry["use"] == "sig"


def test_kid_increments_on_rotate() -> None:
    signer = _fresh_signer()
    assert signer.active_kid() == "v1"
    signer.rotate()
    assert signer.active_kid() == "v2"
    signer.rotate()
    assert signer.active_kid() == "v3"
