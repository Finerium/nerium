"""Shared fixtures for storage tests.

Provides mock R2 clients, fake R2Settings, and an EICAR byte stream.
Storage tests avoid real boto3 + clamd dependencies so they run on CI
without infrastructure.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest

from src.backend.storage.r2_client import R2Settings


@pytest.fixture
def r2_settings() -> R2Settings:
    """Return a deterministic R2Settings for signing tests."""

    return R2Settings(
        account_id="testaccount123",
        access_key_id="AKIA_TEST",
        secret_access_key="secret_test",
        bucket_public="nerium-public-test",
        bucket_private="nerium-private-test",
        bucket_quarantine="nerium-quarantine-test",
        cdn_base_url="https://cdn.test.nerium",
        endpoint_url="https://testaccount123.r2.cloudflarestorage.com",
    )


@pytest.fixture
def fake_r2_client(r2_settings: R2Settings) -> MagicMock:
    """Return a MagicMock with the subset of boto3 S3 methods we exercise.

    ``generate_presigned_post`` returns a stable url + fields dict so
    assertions on the response payload are deterministic. ``head_object``,
    ``copy_object``, ``delete_object``, ``get_object`` have sensible
    defaults; individual tests override with ``side_effect`` when needed.
    """

    client = MagicMock()

    def _signed_post(
        Bucket: str,
        Key: str,
        Fields: dict[str, str],
        Conditions: list[Any],
        ExpiresIn: int,
    ) -> dict[str, Any]:
        merged_fields: dict[str, str] = {
            "key": Key,
            "bucket": Bucket,
            **Fields,
            "policy": "fake-policy-base64",
            "x-amz-algorithm": "AWS4-HMAC-SHA256",
            "x-amz-credential": "fake-credential",
            "x-amz-date": "20260424T000000Z",
            "x-amz-signature": "fake-signature",
        }
        return {
            "url": f"{r2_settings.endpoint_url}/{Bucket}",
            "fields": merged_fields,
        }

    client.generate_presigned_post.side_effect = _signed_post

    def _signed_get(
        ClientMethod: str, Params: dict[str, str], ExpiresIn: int
    ) -> str:
        return (
            f"{r2_settings.endpoint_url}/{Params['Bucket']}/"
            f"{Params['Key']}?X-Amz-Expires={ExpiresIn}&X-Amz-Signature=fake"
        )

    client.generate_presigned_url.side_effect = _signed_get

    client.head_object.return_value = {"ContentLength": 1024}
    client.copy_object.return_value = {"CopyObjectResult": {}}
    client.delete_object.return_value = {}
    # get_object body yields a small clean payload by default.
    body = MagicMock()
    read_side_effect = [b"x" * 64, b""]
    body.read.side_effect = read_side_effect
    body.close.return_value = None
    client.get_object.return_value = {"Body": body}

    return client
