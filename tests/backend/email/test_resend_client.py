"""Resend client error mapping + webhook signature verification.

Covers:
- Successful POST /emails returns a :class:`ResendResponse`.
- 500 response raises :class:`ResendError` with ``retriable=True``.
- 422 validation_error maps to ``is_hard_bounce=True``.
- Transport timeout raises retriable ResendError.
- Empty API key fails closed with ``status_code=0`` and retriable=False.
- Webhook signature verification honours HMAC-SHA256 compare.
"""

from __future__ import annotations

import hashlib
import hmac

import httpx
import pytest

from src.backend.email.resend_client import (
    ResendClient,
    ResendError,
    ResendResponse,
)


@pytest.mark.asyncio
async def test_send_success_returns_response(resend_client_ok: ResendClient) -> None:
    response = await resend_client_ok.send(
        to_email="lumen@example.com",
        subject="hello",
        html_body="<p>hi</p>",
    )
    assert isinstance(response, ResendResponse)
    assert response.provider_message_id == "resend_msg_test_12345"


@pytest.mark.asyncio
async def test_send_500_raises_retriable(resend_client_500: ResendClient) -> None:
    with pytest.raises(ResendError) as excinfo:
        await resend_client_500.send(
            to_email="lumen@example.com",
            subject="hello",
            html_body="<p>hi</p>",
        )
    assert excinfo.value.status_code == 500
    assert excinfo.value.retriable is True
    assert excinfo.value.is_hard_bounce is False


@pytest.mark.asyncio
async def test_send_422_maps_to_hard_bounce(
    resend_client_hard_bounce: ResendClient,
) -> None:
    with pytest.raises(ResendError) as excinfo:
        await resend_client_hard_bounce.send(
            to_email="bogus@nowhere.invalid",
            subject="hello",
            html_body="<p>hi</p>",
        )
    assert excinfo.value.status_code == 422
    assert excinfo.value.is_hard_bounce is True
    assert excinfo.value.retriable is False


@pytest.mark.asyncio
async def test_send_empty_api_key_fails_closed(pheme_settings) -> None:
    client = ResendClient(
        api_key="",  # intentionally empty
        from_email="noreply@mail.test.nerium",
    )
    with pytest.raises(ResendError) as excinfo:
        await client.send(
            to_email="lumen@example.com",
            subject="hello",
            html_body="<p>hi</p>",
        )
    assert excinfo.value.status_code == 0
    assert excinfo.value.retriable is False


@pytest.mark.asyncio
async def test_send_timeout_raises_retriable(pheme_settings) -> None:
    def _handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timeout", request=request)

    transport = httpx.MockTransport(_handler)
    http_client = httpx.AsyncClient(transport=transport)
    client = ResendClient(
        api_key="re_test",
        from_email="noreply@mail.test.nerium",
        http_client=http_client,
    )
    with pytest.raises(ResendError) as excinfo:
        await client.send(
            to_email="lumen@example.com",
            subject="hello",
            html_body="<p>hi</p>",
        )
    assert excinfo.value.status_code == 0
    assert excinfo.value.retriable is True


def test_verify_webhook_valid_signature() -> None:
    secret = "whsec_test"
    payload = b'{"type":"email.delivered","data":{}}'
    sig_hex = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    assert ResendClient.verify_webhook(
        payload_bytes=payload,
        signature_header=sig_hex,
        secret=secret,
    )


def test_verify_webhook_accepts_sha256_prefix() -> None:
    secret = "whsec_test"
    payload = b'{"type":"email.delivered"}'
    sig_hex = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    header = f"sha256={sig_hex}"
    assert ResendClient.verify_webhook(
        payload_bytes=payload,
        signature_header=header,
        secret=secret,
    )


def test_verify_webhook_invalid_signature() -> None:
    secret = "whsec_test"
    payload = b'{"type":"email.delivered"}'
    assert not ResendClient.verify_webhook(
        payload_bytes=payload,
        signature_header="deadbeef" * 8,
        secret=secret,
    )


def test_verify_webhook_empty_signature_or_secret() -> None:
    assert not ResendClient.verify_webhook(
        payload_bytes=b"x",
        signature_header="",
        secret="whsec_test",
    )
    assert not ResendClient.verify_webhook(
        payload_bytes=b"x",
        signature_header="deadbeef",
        secret="",
    )
