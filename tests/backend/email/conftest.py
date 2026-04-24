"""Pheme test fixtures.

Scope:
- ``pheme_settings``    : deterministic Settings() tuned for email tests
  (``EMAIL_ENV=dev``, warmup start set 10 days ago so cap is at day 10
  which sits in steady state at 10 000, well above any single test).
- ``mock_resend_client`` : httpx.MockTransport-backed :class:`ResendClient`
  that echoes a deterministic provider id.
- ``frozen_time``       : freezegun-style patch on time.time() used by
  the unsubscribe token age check.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from src.backend.config import Settings
from src.backend.email.resend_client import ResendClient


@pytest.fixture
def pheme_settings() -> Settings:
    """Settings() tuned for Pheme offline tests."""

    warmup_start = (date.today() - timedelta(days=10)).isoformat()
    return Settings(
        env="development",
        secret_key="test-secret-key-for-pheme-unit-tests-do-not-use-in-production",
        resend_api_key="re_test_offline_key",
        resend_from_email="noreply@mail.test.nerium",
        resend_reply_to_email="support@test.nerium",
        resend_webhook_secret="whsec_test_secret",
        email_env="dev",
        email_warmup_start=warmup_start,
        email_unsubscribe_base_url="https://test.nerium",
        mailtrap_api_token="mailtrap_test_token",
        mailtrap_inbox_id="inbox_test",
    )


@pytest.fixture
def pheme_settings_warmup_day_0() -> Settings:
    """Settings() with warmup start = today so cap is 50."""

    return Settings(
        env="development",
        secret_key="test-secret-key-for-pheme-unit-tests-do-not-use-in-production",
        resend_api_key="re_test_offline_key",
        resend_from_email="noreply@mail.test.nerium",
        email_env="dev",
        email_warmup_start=date.today().isoformat(),
        email_unsubscribe_base_url="https://test.nerium",
    )


@pytest.fixture
def mock_transport_ok() -> httpx.MockTransport:
    """httpx transport that returns a canned Resend 200 payload."""

    def _handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            status_code=200,
            json={
                "id": "resend_msg_test_12345",
                "from": "noreply@mail.test.nerium",
                "to": ["lumen@example.com"],
                "created_at": "2026-04-24T17:30:00.000Z",
            },
        )

    return httpx.MockTransport(_handler)


@pytest.fixture
def mock_transport_500() -> httpx.MockTransport:
    """httpx transport that returns a retriable 500."""

    def _handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            status_code=500,
            json={"name": "internal_error", "message": "upstream failure"},
        )

    return httpx.MockTransport(_handler)


@pytest.fixture
def mock_transport_hard_bounce() -> httpx.MockTransport:
    """httpx transport that returns a 422 shaped like a hard-bounce."""

    def _handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            status_code=422,
            json={
                "name": "validation_error",
                "message": "invalid recipient",
            },
        )

    return httpx.MockTransport(_handler)


@pytest.fixture
def resend_client_ok(
    pheme_settings: Settings,
    mock_transport_ok: httpx.MockTransport,
) -> ResendClient:
    """Build a ResendClient backed by the 200-OK mock transport."""

    client = httpx.AsyncClient(transport=mock_transport_ok)
    return ResendClient(
        api_key=pheme_settings.resend_api_key.get_secret_value(),
        from_email=pheme_settings.resend_from_email,
        http_client=client,
    )


@pytest.fixture
def resend_client_500(
    pheme_settings: Settings,
    mock_transport_500: httpx.MockTransport,
) -> ResendClient:
    client = httpx.AsyncClient(transport=mock_transport_500)
    return ResendClient(
        api_key=pheme_settings.resend_api_key.get_secret_value(),
        from_email=pheme_settings.resend_from_email,
        http_client=client,
    )


@pytest.fixture
def resend_client_hard_bounce(
    pheme_settings: Settings,
    mock_transport_hard_bounce: httpx.MockTransport,
) -> ResendClient:
    client = httpx.AsyncClient(transport=mock_transport_hard_bounce)
    return ResendClient(
        api_key=pheme_settings.resend_api_key.get_secret_value(),
        from_email=pheme_settings.resend_from_email,
        http_client=client,
    )


@pytest.fixture
def fake_email_pool() -> MagicMock:
    """Fake asyncpg pool for email DB surface tests.

    Mirrors ``tests/backend/conftest.py::fake_pool`` but adds
    ``fetchrow`` with a scripted return value so ``is_unsubscribed``,
    ``send._insert_email_message``, and webhook processors can run
    without touching a real Postgres.
    """

    fake_conn = MagicMock()
    fake_conn.fetchval = AsyncMock(return_value=None)
    fake_conn.fetchrow = AsyncMock(return_value=None)
    fake_conn.fetch = AsyncMock(return_value=[])
    fake_conn.execute = AsyncMock(return_value="OK")

    class _Acquire:
        async def __aenter__(self_inner):
            return fake_conn

        async def __aexit__(self_inner, *args: Any) -> None:
            return None

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=_Acquire())
    mock_pool.close = AsyncMock(return_value=None)
    # Expose the conn for assertions inside individual tests.
    mock_pool._conn = fake_conn  # type: ignore[attr-defined]
    return mock_pool
