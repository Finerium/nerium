"""ClamAV scan worker + quarantine tests.

Covers file_storage.contract Section 4.3 + Section 8:

- Parser correctness on the three canonical clamd INSTREAM responses
  (``OK``, ``<name> FOUND``, ``<reason> ERROR``).
- EICAR test string triggers the infected branch end-to-end (no
  real malware shipped; EICAR is the industry-standard non-malicious
  signature).
- On INFECTED, ``quarantine_object`` is invoked and the manifest row
  is updated to ``virus_scan_status='infected'`` with the threat name
  recorded in ``virus_scan_result``.
- On CLEAN, the manifest is updated to ``virus_scan_status='clean'``
  and NO quarantine copy is issued.
- Pheme virus-alert enqueue is attempted on INFECTED only.
- Scan worker tolerates missing ``arq_redis`` (best-effort email).
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.backend.storage.clamav_client import (
    EICAR_TEST_STRING,
    ScanStatus,
    _parse_clamd_response,
    bytes_to_chunks,
    scan_stream_instream,
)
from src.backend.storage.clamav_scan import (
    ARQ_JOB_VIRUS_ALERT_EMAIL,
    scan_virus,
)
from src.backend.storage.quarantine import quarantine_object
from src.backend.storage.r2_client import R2Settings

# ---------------------------------------------------------------------------
# clamd response parser
# ---------------------------------------------------------------------------


def test_parse_clean_response() -> None:
    r = _parse_clamd_response("stream: OK\n")
    assert r.status == ScanStatus.CLEAN
    assert r.threat_name is None


def test_parse_infected_response_eicar() -> None:
    r = _parse_clamd_response("stream: Win.Test.EICAR_HDB-1 FOUND\n")
    assert r.status == ScanStatus.INFECTED
    assert r.threat_name == "Win.Test.EICAR_HDB-1"


def test_parse_error_response() -> None:
    r = _parse_clamd_response("stream: internal crash ERROR\n")
    assert r.status == ScanStatus.ERROR
    assert r.error == "internal crash"


def test_parse_empty_response_is_error() -> None:
    r = _parse_clamd_response("")
    assert r.status == ScanStatus.ERROR
    assert r.error == "empty_response"


def test_parse_unparseable_response_is_error() -> None:
    r = _parse_clamd_response("totally unexpected reply")
    assert r.status == ScanStatus.ERROR


# ---------------------------------------------------------------------------
# INSTREAM transport (mocked asyncio.open_connection)
# ---------------------------------------------------------------------------


class _FakeReader:
    def __init__(self, line: bytes) -> None:
        self._line = line

    async def readline(self) -> bytes:
        return self._line


class _FakeWriter:
    def __init__(self) -> None:
        self.buffer = bytearray()
        self.closed = False

    def write(self, data: bytes) -> None:
        self.buffer.extend(data)

    async def drain(self) -> None:  # pragma: no cover - trivial
        return None

    def close(self) -> None:
        self.closed = True

    async def wait_closed(self) -> None:
        return None


@pytest.mark.asyncio
async def test_scan_stream_eicar_flags_infected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    writer = _FakeWriter()
    reader = _FakeReader(b"stream: Win.Test.EICAR_HDB-1 FOUND\n")

    async def _fake_open(host: str, port: int):
        assert host == "clamav"
        assert port == 3310
        return reader, writer

    monkeypatch.setattr(asyncio, "open_connection", _fake_open)

    result = await scan_stream_instream(
        bytes_to_chunks(EICAR_TEST_STRING),
        host="clamav",
        port=3310,
        timeout=5.0,
    )

    assert result.status == ScanStatus.INFECTED
    assert result.threat_name == "Win.Test.EICAR_HDB-1"
    # zINSTREAM prelude + at least one length-prefixed chunk + zero
    # terminator landed in the writer buffer.
    assert writer.buffer.startswith(b"zINSTREAM\x00")
    assert writer.buffer.endswith(b"\x00\x00\x00\x00")


@pytest.mark.asyncio
async def test_scan_stream_clean_on_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    writer = _FakeWriter()
    reader = _FakeReader(b"stream: OK\n")

    async def _fake_open(host: str, port: int):
        return reader, writer

    monkeypatch.setattr(asyncio, "open_connection", _fake_open)

    result = await scan_stream_instream(
        bytes_to_chunks(b"hello-world"),
        host="clamav",
        port=3310,
        timeout=5.0,
    )
    assert result.status == ScanStatus.CLEAN


@pytest.mark.asyncio
async def test_scan_stream_connect_failure_is_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_open(host: str, port: int):
        raise OSError("connection refused")

    monkeypatch.setattr(asyncio, "open_connection", _fake_open)

    result = await scan_stream_instream(
        bytes_to_chunks(b"x"),
        host="clamav",
        port=3310,
        timeout=5.0,
    )
    assert result.status == ScanStatus.ERROR
    assert result.error is not None
    assert "clamd_connect_failed" in result.error


# ---------------------------------------------------------------------------
# quarantine_object
# ---------------------------------------------------------------------------


def test_quarantine_object_copies_then_deletes(fake_r2_client: MagicMock) -> None:
    outcome = quarantine_object(
        fake_r2_client,
        source_bucket="nerium-private-test",
        source_key="listing_asset/listing-1/mid.zip",
        quarantine_bucket="nerium-quarantine-test",
    )
    assert outcome.quarantine_bucket == "nerium-quarantine-test"
    assert outcome.quarantine_key == (
        "quarantine/listing_asset/listing-1/mid.zip"
    )
    assert outcome.source_deleted is True
    fake_r2_client.copy_object.assert_called_once()
    fake_r2_client.delete_object.assert_called_once()


def test_quarantine_object_tolerates_delete_failure(
    fake_r2_client: MagicMock,
) -> None:
    fake_r2_client.delete_object.side_effect = RuntimeError("r2_500")
    outcome = quarantine_object(
        fake_r2_client,
        source_bucket="nerium-private-test",
        source_key="k",
        quarantine_bucket="nerium-quarantine-test",
    )
    assert outcome.source_deleted is False
    # The quarantine copy still succeeded so the object is safe.
    fake_r2_client.copy_object.assert_called_once()


# ---------------------------------------------------------------------------
# scan_virus end-to-end: clean branch vs infected branch
# ---------------------------------------------------------------------------


class _FakeConn:
    """Minimal asyncpg connection double for scan_virus updates."""

    def __init__(self) -> None:
        self.executed: list[tuple[str, tuple]] = []
        self.fetchrow_result: dict[str, Any] | None = None

    async def execute(self, query: str, *args: Any) -> str:
        self.executed.append((query, args))
        return "OK"

    async def fetchrow(self, query: str, *args: Any):
        return self.fetchrow_result

    def transaction(self) -> _FakeConn:  # type: ignore[override]
        return self

    async def __aenter__(self) -> _FakeConn:
        return self

    async def __aexit__(self, *a: Any) -> None:
        return None


class _FakeAcquire:
    def __init__(self, conn: _FakeConn) -> None:
        self._conn = conn

    async def __aenter__(self) -> _FakeConn:
        return self._conn

    async def __aexit__(self, *a: Any) -> None:
        return None


class _FakePool:
    def __init__(self, conn: _FakeConn) -> None:
        self._conn = conn

    def acquire(self) -> _FakeAcquire:
        return _FakeAcquire(self._conn)


@pytest.fixture
def scan_ctx(
    r2_settings: R2Settings, fake_r2_client: MagicMock
) -> tuple[dict[str, Any], _FakeConn, AsyncMock]:
    """Build a scan_virus ``ctx`` dict with fake db + queue."""

    conn = _FakeConn()
    conn.fetchrow_result = {
        "id": "mid-1",
        "tenant_id": "00000000-0000-0000-0000-000000000001",
        "owner_user_id": "00000000-0000-0000-0000-000000000002",
        "r2_bucket": r2_settings.bucket_private,
        "r2_key": "listing_asset/listing-1/mid-1.zip",
        "virus_scan_status": "pending",
        "original_filename": "pack.zip",
    }
    pool = _FakePool(conn)
    arq_redis = AsyncMock()

    ctx: dict[str, Any] = {
        "r2_client": fake_r2_client,
        "r2_settings": r2_settings,
        "db_pool": pool,
        "clamav_host": "clamav",
        "clamav_port": 3310,
        "clamav_timeout": 5.0,
        "arq_redis": arq_redis,
    }
    return ctx, conn, arq_redis


@pytest.mark.asyncio
async def test_scan_virus_clean_updates_manifest(
    monkeypatch: pytest.MonkeyPatch, scan_ctx
) -> None:
    ctx, conn, arq_redis = scan_ctx

    async def _fake_scan(chunk_iter, *, host, port, timeout):
        # Drain the iterator to simulate reading.
        async for _ in chunk_iter:
            pass
        from src.backend.storage.clamav_client import ScanResult

        return ScanResult(status=ScanStatus.CLEAN, raw_response="stream: OK")

    monkeypatch.setattr(
        "src.backend.storage.clamav_scan.scan_stream_instream", _fake_scan
    )

    result = await scan_virus(ctx, "mid-1")

    assert result["status"] == "clean"
    # The UPDATE to ``virus_scan_status='clean'`` was executed.
    assert any(
        "virus_scan_status = 'clean'" in stmt
        for stmt, _ in conn.executed
    )
    # Pheme email NOT enqueued on clean.
    arq_redis.enqueue_job.assert_not_called()


@pytest.mark.asyncio
async def test_scan_virus_infected_quarantines_and_alerts(
    monkeypatch: pytest.MonkeyPatch, scan_ctx
) -> None:
    ctx, conn, arq_redis = scan_ctx

    async def _fake_scan(chunk_iter, *, host, port, timeout):
        async for _ in chunk_iter:
            pass
        from src.backend.storage.clamav_client import ScanResult

        return ScanResult(
            status=ScanStatus.INFECTED,
            threat_name="Win.Test.EICAR_HDB-1",
            raw_response="stream: Win.Test.EICAR_HDB-1 FOUND",
        )

    monkeypatch.setattr(
        "src.backend.storage.clamav_scan.scan_stream_instream", _fake_scan
    )

    result = await scan_virus(ctx, "mid-1")

    assert result["status"] == "infected"
    assert result["threat_name"] == "Win.Test.EICAR_HDB-1"
    assert result["quarantined_to"].startswith("quarantine/")

    # Manifest update reflects infected + new bucket/key point at quarantine.
    assert any(
        "virus_scan_status = 'infected'" in stmt for stmt, _ in conn.executed
    )

    # Pheme virus_alert email enqueued.
    arq_redis.enqueue_job.assert_awaited_once()
    call_args = arq_redis.enqueue_job.await_args
    assert call_args.args[0] == ARQ_JOB_VIRUS_ALERT_EMAIL
    payload = call_args.args[1]
    assert payload["manifest_id"] == "mid-1"
    assert payload["threat_name"] == "Win.Test.EICAR_HDB-1"


@pytest.mark.asyncio
async def test_scan_virus_missing_manifest_returns_missing(scan_ctx) -> None:
    ctx, conn, _ = scan_ctx
    conn.fetchrow_result = None

    result = await scan_virus(ctx, "nonexistent")
    assert result == {
        "manifest_id": "nonexistent",
        "status": "missing",
        "reason": "manifest_not_found",
    }
