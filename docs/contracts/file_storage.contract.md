# File Storage

**Contract Version:** 0.1.0
**Owner Agent(s):** Chione (Cloudflare R2 authority, presigned upload, ClamAV virus scan sidecar, CDN delivery policy)
**Consumer Agent(s):** Phanes (sprite_pack + sound_pack + visual_theme + dataset listing assets), Iapetus (custom_build_service deliverables + creator upload), Eunomia (GDPR export ZIP + audit archive), Plutus (invoice PDF storage), Pheme (email attachments if needed), Kratos (MA session output archive), Boreas (chat attachment upload), Selene (trace per upload/download), Nemea-RV-v2 (presigned + virus scan E2E)
**Stability:** draft
**Last Updated:** 2026-04-24 (NP Wave 1, Pythia-v3 round 3)

## 1. Purpose

Defines the file storage surface backed by Cloudflare R2 (S3-compatible API). 10 GB free tier + 1M Class A + 10M Class B ops / month free + zero egress via Cloudflare CDN. Presigned POST upload flow (25 MB cap per upload). ClamAV sidecar virus scan on upload-complete event. CDN direct-serve for public images. Signed URL with 7-day TTL for private files.

No AWS S3 (egress cost). No Supabase Storage (bundled pricing unclear at scale). No GridFS. No local disk (ephemeral on Hetzner CX32).

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor)
- `CLAUDE.md` (root)
- `docs/phase_np/RV_NP_RESEARCH.md` (Section E.28 storage)
- `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Section 4.13 Chione)
- `docs/contracts/postgres_multi_tenant.contract.md` (tenant scoping on manifest table)
- `docs/contracts/rest_api_base.contract.md` (problem+json on upload errors)
- `docs/contracts/marketplace_listing.contract.md` (asset_refs field linkage)

## 3. Schema Definition

### 3.1 Database table

```sql
CREATE TABLE file_storage_manifest (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  owner_user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  r2_bucket         text NOT NULL,
  r2_key            text NOT NULL,                       -- object key within bucket
  original_filename text NOT NULL,
  content_type      text NOT NULL,                       -- MIME
  size_bytes        bigint NOT NULL,
  sha256            text NOT NULL,                       -- hex digest for dedupe + integrity
  virus_scan_status text NOT NULL DEFAULT 'pending' CHECK (virus_scan_status IN ('pending', 'clean', 'infected', 'error')),
  virus_scan_at     timestamptz,
  virus_scan_result jsonb,                               -- ClamAV payload
  visibility        text NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private', 'tenant_shared')),
  reference_type    text,                                -- 'listing_asset', 'invoice_pdf', 'ma_output', 'gdpr_export'
  reference_id      text,
  expires_at        timestamptz,                          -- for time-limited uploads (e.g., GDPR export)
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,                          -- soft delete for audit
  UNIQUE (r2_bucket, r2_key)
);
CREATE INDEX idx_manifest_tenant_reference ON file_storage_manifest(tenant_id, reference_type, reference_id);
CREATE INDEX idx_manifest_scan_pending ON file_storage_manifest(virus_scan_status) WHERE virus_scan_status = 'pending';
CREATE INDEX idx_manifest_expires ON file_storage_manifest(expires_at) WHERE expires_at IS NOT NULL;
```

RLS per tenant. Public-visibility rows bypass RLS via separate read policy for anonymous GET via CDN signed-url-less path.

### 3.2 R2 bucket layout

```
nerium-public/
  avatars/<user_id>/<uuid>.{png|jpg|webp}
  listing-thumbnails/<listing_id>/<uuid>.{png|jpg|webp}
  marketing/<path>

nerium-private/
  invoices/<tenant_id>/<invoice_id>.pdf
  gdpr-exports/<user_id>/<export_id>.zip
  ma-outputs/<tenant_id>/<session_id>/<uuid>.json
  listings/<listing_id>/assets/<uuid>.{zip|tar.gz|safetensors}
  tmp/<user_id>/<uploading_uuid>.partial
```

Two buckets (`nerium-public` + `nerium-private`) not one-bucket-with-ACLs because R2's public-access policy is bucket-level at submission.

### 3.3 Content-type allow-list

```python
ALLOWED_MIME = {
    # Images
    "image/png": 10 * 1024 * 1024,                       # 10 MB
    "image/jpeg": 10 * 1024 * 1024,
    "image/webp": 10 * 1024 * 1024,
    "image/gif": 5 * 1024 * 1024,
    "image/svg+xml": 2 * 1024 * 1024,
    # Documents
    "application/pdf": 25 * 1024 * 1024,                 # 25 MB presigned cap
    # Archives
    "application/zip": 25 * 1024 * 1024,
    "application/x-tar": 25 * 1024 * 1024,
    "application/gzip": 25 * 1024 * 1024,
    # Audio
    "audio/mpeg": 20 * 1024 * 1024,
    "audio/wav": 20 * 1024 * 1024,
    "audio/ogg": 20 * 1024 * 1024,
    # Text
    "text/plain": 5 * 1024 * 1024,
    "application/json": 5 * 1024 * 1024,
    "application/x-yaml": 5 * 1024 * 1024,
    # Model artifacts
    "application/octet-stream": 25 * 1024 * 1024,        # safetensors, onnx, etc.
}
```

Content-type verified server-side post-upload via `python-magic` (actual bytes vs claimed). Mismatch → quarantine + `infected` status flag.

## 4. Interface / API Contract

### 4.1 POST `/v1/storage/uploads`

Initiates a presigned upload.

```python
class UploadInitRequest(BaseModel):
    original_filename: str = Field(..., max_length=255)
    content_type: str
    size_bytes: int = Field(..., gt=0, le=25 * 1024 * 1024)
    visibility: Literal["public", "private", "tenant_shared"] = "private"
    reference_type: Literal["listing_asset", "invoice_pdf", "ma_output", "gdpr_export", "avatar", "listing_thumbnail", "generic"] = "generic"
    reference_id: str | None = None

class UploadInitResponse(BaseModel):
    manifest_id: str
    presigned_post: dict                                  # {url, fields: {key, Content-Type, x-amz-..., Policy, X-Amz-Signature}}
    expires_in: int                                       # seconds until POST expires
    max_size_bytes: int
```

Client POSTs directly to R2 with multipart/form-data using `presigned_post.fields` + file. R2 enforces size + content-type + expiry via the signed policy. Success redirects to `success_action_redirect` if provided.

### 4.2 POST `/v1/storage/uploads/{manifest_id}/complete`

Called by client after R2 upload succeeds. Triggers server-side verification:

1. HEAD R2 object, verify `Content-Length` matches claimed.
2. Compute SHA256 (streaming GET).
3. Enqueue `scan_virus` Arq job (ClamAV sidecar).
4. Return manifest row with `virus_scan_status: pending`.

### 4.3 ClamAV scan worker

```python
@arq_worker.task
async def scan_virus(ctx, manifest_id: UUID):
    manifest = await load(manifest_id)
    stream = await r2_client.get_object_stream(manifest.r2_bucket, manifest.r2_key)
    result = await clamav.scan_stream(stream)              # ClamAV sidecar at localhost:3310 (INSTREAM protocol)
    if result.status == "clean":
        await update(manifest_id, virus_scan_status="clean", virus_scan_at=now(), virus_scan_result={})
    elif result.status == "infected":
        await update(manifest_id, virus_scan_status="infected", virus_scan_result=result.payload)
        await quarantine(manifest)                        # move to nerium-quarantine bucket
    else:
        await update(manifest_id, virus_scan_status="error", virus_scan_result={"error": result.error})
```

Quarantined files deleted after 7-day investigation window (admin reviews via Eunomia). User notified via Pheme.

### 4.4 GET `/v1/storage/files/{manifest_id}/signed-url`

Returns a 7-day signed URL for private file download. Tenant-scoped: RLS ensures only owner's tenant can request.

```python
class SignedUrlResponse(BaseModel):
    url: HttpUrl
    expires_at: str
    content_type: str
    size_bytes: int
    sha256: str
```

Public-visibility files: return unsigned CDN URL `https://cdn.nerium.com/<path>`.

### 4.5 DELETE `/v1/storage/files/{manifest_id}`

Soft-deletes + schedules hard purge in 30 d (aligns with GDPR soft-delete cadence). Listing assets referenced by active listings cannot be deleted; returns 409 `file_in_use`.

### 4.6 GET `/v1/storage/files`

Paginated list of tenant's files. Filters: `?reference_type=...&visibility=...&virus_scan_status=...`.

### 4.7 Upload expiry sweep

Arq cron hourly `storage_upload_expiry_sweep`:

- `manifest.virus_scan_status=pending` + `created_at < now() - 1 hour` → mark `error` (upload abandoned).
- `manifest.expires_at < now()` → soft delete + R2 purge.

## 5. Event Signatures

Structured log:

| Event | Fields |
|---|---|
| `storage.upload.initiated` | `manifest_id`, `reference_type`, `size_bytes`, `content_type`, `tenant_id` |
| `storage.upload.completed` | `manifest_id`, `sha256`, `duration_upload_ms` |
| `storage.scan.queued` | `manifest_id` |
| `storage.scan.clean` | `manifest_id`, `duration_scan_ms` |
| `storage.scan.infected` | `manifest_id`, `threat_name`, `threat_signatures` |
| `storage.scan.error` | `manifest_id`, `error_kind` |
| `storage.download.signed` | `manifest_id`, `user_id`, `ttl_s` |
| `storage.quarantine.moved` | `manifest_id`, `threat_name` |
| `storage.cdn.served` | `r2_key`, `referer`, `user_agent_hash` |

OTel spans: `storage.upload.init`, `storage.scan`, `storage.download.sign`.

## 6. File Path Convention

- R2 client: `src/backend/storage/r2_client.py` (boto3 with Cloudflare R2 endpoint)
- Presigned generator: `src/backend/storage/presigned.py`
- Virus scan worker: `src/backend/workers/storage_scan.py` (Arq)
- ClamAV client: `src/backend/storage/clamav_client.py` (INSTREAM protocol)
- Quarantine handler: `src/backend/storage/quarantine.py`
- Expiry sweep: `src/backend/workers/storage_expiry_sweep.py` (Arq cron)
- Router: `src/backend/routers/v1/storage/*.py`
- Migration: `src/backend/db/migrations/XXX_file_storage_manifest.py`
- Docker Compose ClamAV service: `docker-compose.yml` addition
- Tests: `tests/storage/test_presigned_flow.py`, `test_virus_scan_clean.py`, `test_virus_scan_infected.py`, `test_expiry_sweep.py`, `test_content_type_mismatch.py`, `test_signed_url_tenant_scope.py`

## 7. Naming Convention

- R2 bucket: `nerium-public`, `nerium-private`, `nerium-quarantine`.
- Object key prefix: `<reference_type>/<scope_id>/<uuid>.<ext>`.
- Manifest visibility enum: lowercase (`public`, `private`, `tenant_shared`).
- Content-type: MIME format lowercase.
- Endpoint paths: `/v1/storage/*`.
- Arq job names: `storage_scan`, `storage_expiry_sweep`.
- Idempotency key for presigned init: `upload:<user_id>:<sha256_of_proposed_key>`.

## 8. Error Handling

- Content-type not in allow-list: HTTP 415 `unsupported_media_type`.
- Size exceeds per-type cap: HTTP 413 `payload_too_large`.
- Presigned upload expired: HTTP 410 `gone` + re-initialize hint.
- Upload size mismatch (R2 HEAD differs from claimed): quarantine + manifest `error` status + delete R2 object.
- ClamAV sidecar unreachable: scan_queue retries 3x with Tenacity; after exhaustion status `error` and operator alert (Selene CRITICAL + GlitchTip Sentry).
- Content-type spoofing (`image/png` claim + actual bytes are `.exe`): quarantine + `infected` status + user notification.
- R2 API 5xx: retry with exponential backoff; sustained → HTTP 502 `upstream_error`.
- R2 API rate limit: back off, queue Arq retry.
- Private file requested without tenant match: HTTP 404 (not 403 to prevent enumeration).
- Public file signed URL request: return unsigned CDN URL (not 400; forgiving UX).
- Cross-tenant public file request: allowed via CDN (intentional).
- Quota exceeded (free tier 10 GB): HTTP 507 `insufficient_storage`; admin alert to bump tier.

## 9. Testing Surface

- Presigned init → client POST to R2 → complete → manifest queued scan.
- Scan clean flow: ClamAV returns clean, status transitions `pending → clean`.
- Scan infected flow: EICAR test string → ClamAV flags → status `infected` + quarantine bucket.
- Content-type mismatch: upload PE file with `image/png` header → `python-magic` detects PE → quarantine.
- Size mismatch: claim 5 MB, actual upload 10 MB → R2 policy rejects (client sees 403 from R2).
- Upload expiry: pending > 1 h → sweep marks `error`.
- Signed URL tenant scope: user A file, user B request → 404.
- Public file CDN: create public file, GET unsigned CDN URL returns bytes without auth.
- File in use: attempt delete of listing asset referenced by active listing → 409.
- Virus scanner down: Arq retries, eventually marks `error`, admin notified.
- Concurrent uploads same filename: both succeed via UUID key disambiguation.
- GDPR export TTL: upload with `expires_at = now() + 7 days`, after 7 days swept + purged.
- R2 API 500 retry: mock, upload succeeds on retry 2.

## 10. Open Questions

- Cloudflare R2 free tier headroom: 10 GB is sufficient for submission scale (few hundred listings avg 50 KB + test images). Monitor.
- ClamAV daily signature DB update: cron `freshclam`. Submission-era: baseline signatures sufficient.
- Image transforms (thumbnail resize): defer post-hackathon; serve original at submission.
- Chunked upload for > 25 MB: defer post-hackathon; use multipart API if needed.

## 11. Post-Hackathon Refactor Notes

- Image transforms via Cloudflare Image Resizing (paid, $0.10/1000 requests) for on-the-fly thumbnail + format conversion (WebP/AVIF).
- Multipart upload for files > 25 MB (listing datasets, large model artifacts).
- Resumable upload protocol (tus.io) for flaky connection robustness.
- Server-side encryption with customer-managed keys (R2 supports via SSE-C).
- Content moderation for image uploads (NSFW detection via external API or open-source model).
- Expiring signed URLs shorter TTL (1 hour) for high-sensitivity files.
- Per-tenant quota enforcement + upgrade flow.
- Deduplication via sha256 (return existing manifest_id when identical content uploaded).
- Backup R2 to secondary cloud (Backblaze B2, AWS S3) nightly.
- CDN cache purge API for listing asset updates.
