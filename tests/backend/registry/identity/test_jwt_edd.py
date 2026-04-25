"""JWT EdDSA helpers for Tethys agent identity (W2 NP P5 Session 1).

Covers the round-trip + expiry + wrong-key + TTL cap matrix on the
two public helpers in :mod:`src.backend.registry.identity.jwt_edd`.
The TTL cap is the prompt's strategic-decision lock and must reject
``ttl_sec > 300`` with :class:`ValueError`.
"""

from __future__ import annotations

import time

import pytest

from src.backend.errors import UnauthorizedProblem
from src.backend.registry.identity.crypto import generate_ed25519_keypair
from src.backend.registry.identity.jwt_edd import (
    JWT_TTL_MAX_SEC,
    issue_jwt,
    verify_jwt,
)

_AGENT_UUID = "11111111-1111-7111-8111-111111111111"


def test_issue_verify_roundtrip() -> None:
    public_pem, private_pem = generate_ed25519_keypair()
    token = issue_jwt(
        agent_id=_AGENT_UUID,
        claims={"scope": "agent:tool_use"},
        ttl_sec=120,
        private_pem=private_pem,
    )
    claims = verify_jwt(token, public_pem)
    assert claims["sub"] == _AGENT_UUID
    assert claims["scope"] == "agent:tool_use"
    assert claims["exp"] > claims["iat"]
    assert claims["exp"] - claims["iat"] == 120


def test_issue_rejects_ttl_above_300_seconds() -> None:
    """Hard cap: 300s. Strategic-decision lock per Tethys prompt."""

    _, private_pem = generate_ed25519_keypair()
    with pytest.raises(ValueError) as excinfo:
        issue_jwt(
            agent_id=_AGENT_UUID,
            claims={},
            ttl_sec=JWT_TTL_MAX_SEC + 1,
            private_pem=private_pem,
        )
    assert "ttl_sec" in str(excinfo.value)


def test_issue_at_cap_succeeds() -> None:
    public_pem, private_pem = generate_ed25519_keypair()
    token = issue_jwt(
        agent_id=_AGENT_UUID,
        claims={},
        ttl_sec=JWT_TTL_MAX_SEC,
        private_pem=private_pem,
    )
    assert verify_jwt(token, public_pem)["sub"] == _AGENT_UUID


def test_issue_rejects_zero_or_negative_ttl() -> None:
    _, private_pem = generate_ed25519_keypair()
    for bad in (0, -1, -300):
        with pytest.raises(ValueError):
            issue_jwt(
                agent_id=_AGENT_UUID,
                claims={},
                ttl_sec=bad,
                private_pem=private_pem,
            )


def test_verify_rejects_expired_token(monkeypatch: pytest.MonkeyPatch) -> None:
    public_pem, private_pem = generate_ed25519_keypair()
    real_time = time.time

    # Issue at t=0, then advance the clock past expiry before verify.
    monkeypatch.setattr(
        "src.backend.registry.identity.jwt_edd.time.time",
        lambda: 1_000_000.0,
    )
    token = issue_jwt(
        agent_id=_AGENT_UUID,
        claims={},
        ttl_sec=10,
        private_pem=private_pem,
    )
    monkeypatch.setattr(
        "src.backend.registry.identity.jwt_edd.time.time",
        lambda: 1_000_999.0,  # well past 1_000_010
    )
    # PyJWT itself reads the system clock for ``exp`` validation, so
    # we restore the real clock and rely on the issued ``exp`` already
    # being in the past.
    monkeypatch.setattr(
        "src.backend.registry.identity.jwt_edd.time.time",
        real_time,
    )
    # The token's exp = 1_000_010 which is in the distant past now,
    # so PyJWT will raise ExpiredSignatureError -> UnauthorizedProblem.
    with pytest.raises(UnauthorizedProblem) as excinfo:
        verify_jwt(token, public_pem)
    assert "expired" in excinfo.value.detail.lower()


def test_verify_rejects_wrong_public_key() -> None:
    _, private_pem = generate_ed25519_keypair()
    other_public_pem, _ = generate_ed25519_keypair()
    token = issue_jwt(
        agent_id=_AGENT_UUID,
        claims={},
        ttl_sec=120,
        private_pem=private_pem,
    )
    with pytest.raises(UnauthorizedProblem) as excinfo:
        verify_jwt(token, other_public_pem)
    assert "signature" in excinfo.value.detail.lower()


def test_verify_rejects_malformed_token() -> None:
    public_pem, _ = generate_ed25519_keypair()
    with pytest.raises(UnauthorizedProblem):
        verify_jwt("not.a.jwt", public_pem)


def test_caller_supplied_sub_is_overwritten_by_agent_id() -> None:
    """``issue_jwt`` always pins ``sub`` to ``agent_id`` regardless of caller."""

    public_pem, private_pem = generate_ed25519_keypair()
    token = issue_jwt(
        agent_id=_AGENT_UUID,
        claims={"sub": "evil-spoof"},
        ttl_sec=60,
        private_pem=private_pem,
    )
    claims = verify_jwt(token, public_pem)
    assert claims["sub"] == _AGENT_UUID
