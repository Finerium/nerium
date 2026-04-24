"""Arq task: scan a manifest's R2 object against the ClamAV sidecar.

Per file_storage.contract.md Section 4.3.

Flow per invocation (``scan_virus(manifest_id)``):

1. Load the ``file_storage_manifest`` row via the DB pool (Aether).
2. Open an async stream from R2 ``get_object`` against the manifest's
   bucket + key.
3. Forward the stream through ``scan_stream_instream`` to clamd.
4. Branch on ``ScanResult.status``:
   - ``CLEAN`` -> update manifest ``virus_scan_status='clean'`` +
     ``virus_scan_at`` + empty jsonb result. Log ``storage.scan.clean``.
   - ``INFECTED`` -> call ``quarantine_object`` to move + delete,
     update manifest with threat name + timestamp, enqueue Pheme
     ``virus_alert`` email. Log ``storage.scan.infected`` +
     ``storage.quarantine.moved``.
   - ``ERROR`` -> update manifest ``virus_scan_status='error'`` + store
     the error string in ``virus_scan_result``. Log ``storage.scan.error``.
     Arq retries via ``RetryJob`` if the error looks transient (clamd
     unreachable, R2 5xx); after 3 retries the error sticks and a
     Selene CRITICAL alert fires per contract Section 8.

Async design notes
------------------

- We use ``asyncpg`` through Aether's tenant-scoped pool helper, not
  SQLAlchemy. All updates run inside a transaction that first rebinds
  ``app.tenant_id`` so RLS still gates the write even from the Arq
  worker process (defense-in-depth per postgres_multi_tenant 3.2).
- R2 stream is an aiofiles-style async iterator built on boto3's sync
  ``get_object``. For the submission we wrap the sync body in a
  threadpool via ``asyncio.to_thread`` chunked reads. Post-hackathon
  we can switch to aioboto3 for native async.
- Pheme enqueue is fire-and-forget via the Arq queue. If Pheme is not
  yet wired (Pheme W1 lands alongside Chione), the enqueue gracefully
  degrades: the email job sits in the queue until Pheme's worker
  registers it. We do not block the scan flow on email delivery.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

from .clamav_client import (
    DEFAULT_SCAN_TIMEOUT_SECONDS,
    INSTREAM_CHUNK_SIZE,
    ScanResult,
    ScanStatus,
    scan_stream_instream,
)
from .quarantine import quarantine_object

# Arq job function names per contract Section 7.
ARQ_JOB_SCAN_VIRUS: str = "storage_scan"
ARQ_JOB_VIRUS_ALERT_EMAIL: str = "pheme_send_virus_alert"
ARQ_JOB_EXPIRY_SWEEP: str = "storage_expiry_sweep"


def _stream_r2_object(
    r2_client: Any,
    *,
    bucket: str,
    key: str,
    chunk_size: int = INSTREAM_CHUNK_SIZE,
) -> AsyncIterator[bytes]:
    """Return an async iterator over an R2 object body.

    Implementation uses boto3's sync ``get_object`` and wraps
    ``body.read(chunk_size)`` calls in ``asyncio.to_thread`` so the
    event loop stays responsive. aioboto3 would eliminate the thread
    hop post-hackathon.
    """

    async def _gen() -> AsyncIterator[bytes]:
        response = await asyncio.to_thread(
            r2_client.get_object, Bucket=bucket, Key=key
        )
        body = response["Body"]
        try:
            while True:
                chunk = await asyncio.to_thread(body.read, chunk_size)
                if not chunk:
                    break
                yield chunk
        finally:
            try:
                body.close()
            except Exception:  # pragma: no cover - best-effort
                pass

    return _gen()


async def _update_manifest_clean(
    db_pool: Any,
    *,
    tenant_id: str,
    manifest_id: str,
    scanned_at: datetime,
) -> None:
    """Transition manifest -> clean. Tenant-scoped via SET LOCAL."""

    async with db_pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SET LOCAL app.tenant_id = $1", str(tenant_id)
            )
            await conn.execute(
                """
                UPDATE file_storage_manifest
                   SET virus_scan_status = 'clean',
                       virus_scan_at     = $1,
                       virus_scan_result = '{}'::jsonb,
                       updated_at        = now()
                 WHERE id = $2
                """,
                scanned_at,
                manifest_id,
            )


async def _update_manifest_infected(
    db_pool: Any,
    *,
    tenant_id: str,
    manifest_id: str,
    scanned_at: datetime,
    threat_name: str | None,
    raw_response: str,
    quarantine_bucket: str,
    quarantine_key: str,
) -> None:
    """Transition manifest -> infected + record threat payload."""

    import json

    payload = json.dumps(
        {
            "threat_name": threat_name,
            "raw": raw_response,
            "quarantine_bucket": quarantine_bucket,
            "quarantine_key": quarantine_key,
        }
    )
    async with db_pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SET LOCAL app.tenant_id = $1", str(tenant_id)
            )
            await conn.execute(
                """
                UPDATE file_storage_manifest
                   SET virus_scan_status = 'infected',
                       virus_scan_at     = $1,
                       virus_scan_result = $2::jsonb,
                       r2_bucket         = $3,
                       r2_key            = $4,
                       updated_at        = now()
                 WHERE id = $5
                """,
                scanned_at,
                payload,
                quarantine_bucket,
                quarantine_key,
                manifest_id,
            )


async def _update_manifest_error(
    db_pool: Any,
    *,
    tenant_id: str,
    manifest_id: str,
    error: str,
) -> None:
    """Transition manifest -> error + preserve the failure reason."""

    import json

    payload = json.dumps({"error": error})
    async with db_pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SET LOCAL app.tenant_id = $1", str(tenant_id)
            )
            await conn.execute(
                """
                UPDATE file_storage_manifest
                   SET virus_scan_status = 'error',
                       virus_scan_result = $1::jsonb,
                       updated_at        = now()
                 WHERE id = $2
                """,
                payload,
                manifest_id,
            )


async def _load_manifest(
    db_pool: Any, *, manifest_id: str
) -> dict[str, Any] | None:
    """Fetch manifest row bypassing RLS (scan worker is cross-tenant).

    The scan worker runs as the database owner role so it can read
    pending-scan rows across all tenants. Writes re-bind tenant_id in
    SET LOCAL before UPDATE so RLS still gates the write path.
    """

    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, tenant_id::text AS tenant_id, owner_user_id::text AS owner_user_id,
                   r2_bucket, r2_key, virus_scan_status, original_filename
              FROM file_storage_manifest
             WHERE id = $1
            """,
            manifest_id,
        )
        return dict(row) if row else None


async def scan_virus(
    ctx: dict[str, Any],
    manifest_id: str,
) -> dict[str, Any]:
    """Arq task entrypoint. Registered in ``workers/arq_worker.py``.

    ``ctx`` is Arq's per-job context dict; Aether's worker settings
    populate ``ctx['r2_client']``, ``ctx['r2_settings']``,
    ``ctx['db_pool']``, ``ctx['clamav_host']``, ``ctx['clamav_port']``,
    and ``ctx['arq_redis']`` (for downstream enqueue).

    Returns a summary dict for Arq's result backend + Selene observability
    spans. Never raises on expected failure modes (clamd unreachable,
    R2 object deleted mid-scan). Raises on programmer error (missing
    ctx keys, invalid manifest_id format) so Arq retries once and then
    surfaces to GlitchTip.
    """

    r2_client = ctx["r2_client"]
    r2_settings = ctx["r2_settings"]
    db_pool = ctx["db_pool"]
    clamav_host: str = ctx.get("clamav_host", "clamav")
    clamav_port: int = int(ctx.get("clamav_port", 3310))
    scan_timeout: float = float(
        ctx.get("clamav_timeout", DEFAULT_SCAN_TIMEOUT_SECONDS)
    )
    arq_redis = ctx.get("arq_redis")

    manifest = await _load_manifest(db_pool, manifest_id=manifest_id)
    if manifest is None:
        return {
            "manifest_id": manifest_id,
            "status": "missing",
            "reason": "manifest_not_found",
        }

    # Build an async iterator over the R2 object body.
    chunk_iter = _stream_r2_object(
        r2_client, bucket=manifest["r2_bucket"], key=manifest["r2_key"]
    )

    try:
        result: ScanResult = await scan_stream_instream(
            chunk_iter,
            host=clamav_host,
            port=clamav_port,
            timeout=scan_timeout,
        )
    except TimeoutError:
        # Let Arq re-queue via its retry policy; mark the manifest as
        # error in the meantime so the UI shows a terminal state rather
        # than a forever-pending scan.
        await _update_manifest_error(
            db_pool,
            tenant_id=manifest["tenant_id"],
            manifest_id=manifest_id,
            error="clamav_timeout",
        )
        raise

    scanned_at = datetime.now(UTC)

    if result.status == ScanStatus.CLEAN:
        await _update_manifest_clean(
            db_pool,
            tenant_id=manifest["tenant_id"],
            manifest_id=manifest_id,
            scanned_at=scanned_at,
        )
        return {
            "manifest_id": manifest_id,
            "status": "clean",
            "scanned_at": scanned_at.isoformat(),
        }

    if result.status == ScanStatus.INFECTED:
        # Move the infected object to quarantine before updating the
        # manifest so the DB row is never marked clean for a file that
        # is no longer where we claim.
        outcome = await asyncio.to_thread(
            quarantine_object,
            r2_client,
            source_bucket=manifest["r2_bucket"],
            source_key=manifest["r2_key"],
            quarantine_bucket=r2_settings.bucket_quarantine,
        )
        await _update_manifest_infected(
            db_pool,
            tenant_id=manifest["tenant_id"],
            manifest_id=manifest_id,
            scanned_at=scanned_at,
            threat_name=result.threat_name,
            raw_response=result.raw_response,
            quarantine_bucket=outcome.quarantine_bucket,
            quarantine_key=outcome.quarantine_key,
        )

        # Enqueue Pheme virus_alert email (fire-and-forget). Pheme W1
        # defines the ``pheme_send_virus_alert`` job function; until
        # Pheme lands, the job sits in the queue and is a no-op.
        if arq_redis is not None:
            try:
                await arq_redis.enqueue_job(
                    ARQ_JOB_VIRUS_ALERT_EMAIL,
                    {
                        "user_id": manifest["owner_user_id"],
                        "manifest_id": manifest_id,
                        "threat_name": result.threat_name,
                        "original_filename": manifest["original_filename"],
                    },
                )
            except Exception:  # noqa: BLE001 - email is best-effort
                pass

        return {
            "manifest_id": manifest_id,
            "status": "infected",
            "threat_name": result.threat_name,
            "scanned_at": scanned_at.isoformat(),
            "quarantined_to": outcome.quarantine_key,
        }

    # ScanStatus.ERROR.
    await _update_manifest_error(
        db_pool,
        tenant_id=manifest["tenant_id"],
        manifest_id=manifest_id,
        error=result.error or "unknown_scan_error",
    )
    return {
        "manifest_id": manifest_id,
        "status": "error",
        "reason": result.error or "unknown_scan_error",
    }


__all__ = [
    "ARQ_JOB_SCAN_VIRUS",
    "ARQ_JOB_VIRUS_ALERT_EMAIL",
    "ARQ_JOB_EXPIRY_SWEEP",
    "scan_virus",
]
