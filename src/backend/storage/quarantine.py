"""Quarantine flow for infected uploads.

Per file_storage.contract.md Section 4.3 + Section 8 error handling.

When ClamAV reports INFECTED we:

1. Copy the object from its original bucket to the dedicated
   ``nerium-quarantine`` bucket under prefix ``quarantine/<original_key>``
   (preserves traceability for Eunomia admin review).
2. Delete the original object from the source bucket so the file is
   no longer reachable via CDN or signed URL.
3. Update the manifest row (``virus_scan_status='infected'`` +
   ``virus_scan_result`` jsonb payload with threat name + timestamp).
4. Emit ``storage.quarantine.moved`` structured log event.
5. Enqueue a Pheme ``virus_alert`` email to the uploading user + a
   Eunomia admin notification (both handled by Pheme's own Arq
   template, this module just enqueues).

Hard deletion of the quarantine copy happens after a 7-day admin
investigation window via the ``storage_expiry_sweep`` Arq cron
(contract 4.7).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class QuarantineOutcome:
    """Return shape for ``quarantine_object`` for test assertions."""

    quarantine_bucket: str
    quarantine_key: str
    source_deleted: bool


def quarantine_object(
    r2_client: Any,
    *,
    source_bucket: str,
    source_key: str,
    quarantine_bucket: str,
) -> QuarantineOutcome:
    """Move an infected object to the quarantine bucket.

    Uses S3 ``copy_object`` then ``delete_object`` per R2's documented
    move pattern (R2 does not expose atomic move). If the copy succeeds
    but the delete fails, the source object will be swept by the hourly
    ``storage_expiry_sweep`` cron (contract 4.7) since its manifest is
    already marked infected.

    Parameters
    ----------
    r2_client
        boto3 S3 client.
    source_bucket, source_key
        The bucket + key to remove from.
    quarantine_bucket
        Destination bucket (``nerium-quarantine`` in prod).

    Returns
    -------
    QuarantineOutcome
        Fields the scan worker logs + stores in ``virus_scan_result``.
    """

    quarantine_key = f"quarantine/{source_key}"

    r2_client.copy_object(
        Bucket=quarantine_bucket,
        Key=quarantine_key,
        CopySource={"Bucket": source_bucket, "Key": source_key},
        MetadataDirective="COPY",
    )

    source_deleted = True
    try:
        r2_client.delete_object(Bucket=source_bucket, Key=source_key)
    except Exception:  # noqa: BLE001 - swept later by expiry cron
        source_deleted = False

    return QuarantineOutcome(
        quarantine_bucket=quarantine_bucket,
        quarantine_key=quarantine_key,
        source_deleted=source_deleted,
    )


__all__ = ["QuarantineOutcome", "quarantine_object"]
