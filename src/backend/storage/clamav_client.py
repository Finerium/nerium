"""ClamAV daemon INSTREAM client.

Per file_storage.contract.md Section 4.3. Connects to the ClamAV
sidecar over TCP (default ``clamav:3310`` inside Docker Compose, or
``localhost:3310`` when running tests against a local clamd). Uses the
INSTREAM command per ClamAV daemon protocol documentation.

INSTREAM protocol summary
-------------------------

After sending ``zINSTREAM\\0`` (null-terminated) the client writes one
or more 4-byte big-endian length-prefixed chunks followed by a zero-length
terminator. ClamAV returns a single response line of the form
``stream: OK`` on clean or ``stream: Win.Test.EICAR_HDB-1 FOUND`` on
infection, or ``stream: <error> ERROR`` on internal failure.

We implement this over ``asyncio.open_connection`` so the scanner
coroutine does not block the Arq worker's event loop while waiting on
ClamAV's response (typical scan time: 50 to 500 ms for files below
5 MB, up to several seconds for 25 MB archives).

Timeout defaults to 60 s per agent prompt halt trigger guidance
(``ClamAV clamdscan timeout on large files``).
"""

from __future__ import annotations

import asyncio
import struct
from collections.abc import AsyncIterator
from dataclasses import dataclass
from enum import Enum

# Chunk size for INSTREAM; ClamAV default ``StreamMaxLength`` is 25 MB
# which matches our per-upload cap. We read 64 KB at a time to keep
# memory flat and interact well with R2 streaming GET.
INSTREAM_CHUNK_SIZE: int = 64 * 1024

# Upper bound on the total scan call. Per agent prompt: large files
# (25 MB archives) need up to 60 s. Tune down in production if we
# observe tighter scan times in Grafana Cloud.
DEFAULT_SCAN_TIMEOUT_SECONDS: float = 60.0


class ScanStatus(str, Enum):
    """Three-way outcome matching contract 4.3 virus_scan_status."""

    CLEAN = "clean"
    INFECTED = "infected"
    ERROR = "error"


@dataclass(frozen=True)
class ScanResult:
    """Parsed clamd response for a single INSTREAM call."""

    status: ScanStatus
    # Threat signature name (e.g., ``Win.Test.EICAR_HDB-1``) when
    # infected. None on clean / error.
    threat_name: str | None = None
    # Raw response line (decoded UTF-8, stripped). Always set.
    raw_response: str = ""
    # Parser or transport failure reason when status is ERROR.
    error: str | None = None


async def _read_stream_into_instream(
    writer: asyncio.StreamWriter,
    source: AsyncIterator[bytes],
) -> None:
    """Forward chunks from ``source`` as length-prefixed INSTREAM frames.

    Terminates with a zero-length frame per clamd protocol.
    """

    async for chunk in source:
        if not chunk:
            continue
        writer.write(struct.pack("!I", len(chunk)))
        writer.write(chunk)
        await writer.drain()

    # Zero-length frame = end of stream.
    writer.write(struct.pack("!I", 0))
    await writer.drain()


def _parse_clamd_response(raw: str) -> ScanResult:
    """Interpret a single clamd INSTREAM response line.

    Examples:

    - ``stream: OK`` -> CLEAN
    - ``stream: Win.Test.EICAR_HDB-1 FOUND`` -> INFECTED, threat name
      ``Win.Test.EICAR_HDB-1``
    - ``stream: <something> ERROR`` -> ERROR

    Anything unparseable is mapped to ERROR for safety (deny-by-default).
    """

    line = raw.strip()
    if not line:
        return ScanResult(
            status=ScanStatus.ERROR,
            raw_response=line,
            error="empty_response",
        )

    # All clamd INSTREAM replies begin with ``stream:``.
    _, _, payload = line.partition(":")
    payload = payload.strip()

    if payload.endswith("OK"):
        return ScanResult(status=ScanStatus.CLEAN, raw_response=line)

    if payload.endswith("FOUND"):
        # ``<signature_name> FOUND``
        signature = payload[: -len("FOUND")].strip()
        return ScanResult(
            status=ScanStatus.INFECTED,
            threat_name=signature or None,
            raw_response=line,
        )

    if payload.endswith("ERROR"):
        reason = payload[: -len("ERROR")].strip() or "unknown_error"
        return ScanResult(
            status=ScanStatus.ERROR,
            raw_response=line,
            error=reason,
        )

    # Unknown shape: treat as error.
    return ScanResult(
        status=ScanStatus.ERROR,
        raw_response=line,
        error="unparseable_response",
    )


async def scan_stream_instream(
    chunk_iter: AsyncIterator[bytes],
    *,
    host: str,
    port: int,
    timeout: float = DEFAULT_SCAN_TIMEOUT_SECONDS,
) -> ScanResult:
    """Open a TCP connection to clamd and run INSTREAM against a stream.

    ``chunk_iter`` yields bytes (e.g., from an R2 ``get_object`` body
    wrapped by an async generator). The function returns when clamd
    responds, or raises ``asyncio.TimeoutError`` after ``timeout``.

    Any transport-level exception is caught and converted to a
    ``ScanResult(status=ERROR)`` so the caller can decide retry vs
    alert without a try/except wrap. Only ``asyncio.TimeoutError``
    propagates, so Arq can re-queue the job per its retry policy.
    """

    async def _run() -> ScanResult:
        try:
            reader, writer = await asyncio.open_connection(host, port)
        except OSError as exc:
            return ScanResult(
                status=ScanStatus.ERROR,
                raw_response="",
                error=f"clamd_connect_failed: {exc}",
            )

        try:
            writer.write(b"zINSTREAM\x00")
            await writer.drain()

            await _read_stream_into_instream(writer, chunk_iter)

            response_bytes = await reader.readline()
            response = response_bytes.decode("utf-8", errors="replace")
            return _parse_clamd_response(response)
        except (OSError, ConnectionError) as exc:
            return ScanResult(
                status=ScanStatus.ERROR,
                raw_response="",
                error=f"clamd_transport_error: {exc}",
            )
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:  # pragma: no cover - best-effort cleanup
                pass

    return await asyncio.wait_for(_run(), timeout=timeout)


async def bytes_to_chunks(
    payload: bytes, chunk_size: int = INSTREAM_CHUNK_SIZE
) -> AsyncIterator[bytes]:
    """Tiny helper for tests: yield an in-memory bytes object in chunks."""

    for offset in range(0, len(payload), chunk_size):
        yield payload[offset : offset + chunk_size]


# ``EICAR`` is the industry-standard non-malicious virus test string.
# ClamAV signature ``Win.Test.EICAR_HDB-1`` matches it. Used by
# ``test_virus_scan_quarantine.py`` to exercise the infected branch
# without shipping real malware. Safe to commit to git, per
# definition.
EICAR_TEST_STRING: bytes = (
    b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
)


__all__ = [
    "ScanStatus",
    "ScanResult",
    "INSTREAM_CHUNK_SIZE",
    "DEFAULT_SCAN_TIMEOUT_SECONDS",
    "scan_stream_instream",
    "bytes_to_chunks",
    "EICAR_TEST_STRING",
]
