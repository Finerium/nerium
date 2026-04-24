"""Tests for :mod:`src.backend.ma.ticket_verifier`.

Owner: Kratos (W2 S2).

The ticket verifier is the Nike-owned seam; until Nike lands we keep
the seam narrow + stub-friendly. The tests cover:

- No verifier installed -> 503 ``service_unavailable``.
- Installed verifier happy path returns the principal.
- Installed verifier ``ProblemException`` passes through unchanged.
- Installed verifier generic exception -> 401 with redacted detail.
- ``install_default_hs256_ticket_verifier`` delegates to Aether's
  existing HS256 verifier.
"""

from __future__ import annotations

import pytest

from src.backend.errors import (
    ServiceUnavailableProblem,
    UnauthorizedProblem,
)
from src.backend.ma.ticket_verifier import (
    get_ticket_verifier,
    install_default_hs256_ticket_verifier,
    set_ticket_verifier,
    verify_ticket,
)
from src.backend.middleware.auth import AuthPrincipal


@pytest.fixture(autouse=True)
def _reset_verifier() -> None:
    """Ensure every test starts with no verifier installed."""

    set_ticket_verifier(None)
    yield
    set_ticket_verifier(None)


def test_missing_verifier_raises_503() -> None:
    with pytest.raises(ServiceUnavailableProblem) as excinfo:
        verify_ticket("anything")
    assert excinfo.value.slug == "service_unavailable"
    assert "not configured" in excinfo.value.detail


def test_happy_path_returns_principal() -> None:
    principal = AuthPrincipal(
        user_id="aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa",
        tenant_id="bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb",
    )

    def verifier(ticket: str) -> AuthPrincipal:
        assert ticket == "jwt-goes-here"
        return principal

    set_ticket_verifier(verifier)
    assert verify_ticket("jwt-goes-here") is principal


def test_problem_exception_passes_through() -> None:
    def verifier(ticket: str) -> AuthPrincipal:
        raise UnauthorizedProblem(detail="custom-detail")

    set_ticket_verifier(verifier)
    with pytest.raises(UnauthorizedProblem) as excinfo:
        verify_ticket("jwt")
    assert excinfo.value.detail == "custom-detail"


def test_generic_exception_redacts_to_401() -> None:
    def verifier(ticket: str) -> AuthPrincipal:
        raise RuntimeError("internal decode failure with secret")

    set_ticket_verifier(verifier)
    with pytest.raises(UnauthorizedProblem) as excinfo:
        verify_ticket("jwt")
    assert "secret" not in excinfo.value.detail


def test_install_default_hs256_works_end_to_end(
    test_settings,
    hs256_jwt_factory,
) -> None:
    """Dev-mode path: install + verify round trip.

    Confirms the seam can exercise the full bearer shape without
    waiting on Nike's EdDSA ticket implementation.
    """

    install_default_hs256_ticket_verifier(test_settings)
    assert get_ticket_verifier() is not None

    token = hs256_jwt_factory(
        user_id="aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa",
        tenant_id="bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb",
        scopes=["builder:write"],
    )
    principal = verify_ticket(token)
    assert isinstance(principal, AuthPrincipal)
    assert principal.user_id == "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa"
    assert principal.tenant_id == "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb"
    assert "builder:write" in principal.scopes
