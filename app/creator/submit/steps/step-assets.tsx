'use client';

//
// step-assets.tsx
//
// Step 5 - Chione presigned upload. Accepts a thumbnail (stored as
// thumbnail_r2_key) plus up to 16 asset references. Uses the real Chione
// endpoint when reachable; degrades to a stub upload when the endpoint
// returns a 404 or 503 so the wizard keeps moving on a dev box that has
// not booted the storage surface.
//

import { useRef, useState } from 'react';

import { requestPresignedInit, uploadListingAsset, type UploadedAsset } from '../lib/api';
import { useWizardStore } from '../lib/store';

type LocalAsset = UploadedAsset & { original_filename: string };

export function StepAssets() {
  const draft = useWizardStore((s) => s.draft);
  const patchDraft = useWizardStore((s) => s.patchDraft);
  const advance = useWizardStore((s) => s.advance);
  const retreat = useWizardStore((s) => s.retreat);
  const listing_id = useWizardStore((s) => s.listing_id);

  const [assets, setAssets] = useState<LocalAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [upload_error, setUploadError] = useState<string | null>(null);
  const [stub_mode, setStubMode] = useState<boolean>(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const thumbRef = useRef<HTMLInputElement | null>(null);
  const [thumb, setThumb] = useState<LocalAsset | null>(null);

  // Preflight: probe the storage endpoint via a cheap init call with 0
  // bytes that should 4xx fast. If the route is absent entirely we flip
  // stub_mode and surface a TODO banner. The probe runs once lazily on
  // the first upload attempt.
  const probeChione = async (): Promise<boolean> => {
    try {
      await requestPresignedInit({
        original_filename: 'probe.png',
        content_type: 'image/png',
        size_bytes: 1,
        visibility: 'public',
        reference_type: 'listing_thumbnail',
        reference_id: listing_id ?? 'probe',
      });
      return true;
    } catch (err: unknown) {
      // 400/413/422 all imply the route is live; only 404/503 flip stub.
      const status =
        err && typeof err === 'object' && 'problem' in err
          ? ((err as { problem: { status: number } }).problem.status ?? 0)
          : 0;
      return !(status === 404 || status === 503 || status === 0);
    }
  };

  const handleAssetFile = async (file: File, isThumbnail: boolean) => {
    setUploading(true);
    setUploadError(null);
    try {
      if (!stub_mode) {
        const live = await probeChione();
        if (!live) setStubMode(true);
      }
      if (stub_mode) {
        // TODO(chione): replace with real upload once the storage router
        // is booted in the current dev server.
        const stub: LocalAsset = {
          manifest_id: crypto.randomUUID(),
          r2_key: `stub/${file.name}`,
          scan_status: 'pending',
          size_bytes: file.size,
          original_filename: file.name,
        };
        if (isThumbnail) {
          setThumb(stub);
          patchDraft({ thumbnail_r2_key: stub.r2_key });
        } else {
          setAssets((prev) => [...prev, stub]);
          patchDraft({ asset_refs: [...draft.asset_refs, stub.manifest_id] });
        }
        setUploading(false);
        return;
      }
      const done = await uploadListingAsset({
        file,
        listing_id: listing_id ?? undefined,
        visibility: 'public',
        reference_type: isThumbnail ? 'listing_thumbnail' : 'listing_asset',
      });
      const record: LocalAsset = { ...done, original_filename: file.name };
      if (isThumbnail) {
        setThumb(record);
        patchDraft({ thumbnail_r2_key: record.r2_key });
      } else {
        setAssets((prev) => [...prev, record]);
        patchDraft({ asset_refs: [...draft.asset_refs, record.manifest_id] });
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'upload failed; try again';
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  const removeAsset = (idx: number) => {
    const target = assets[idx];
    setAssets((prev) => prev.filter((_, i) => i !== idx));
    patchDraft({
      asset_refs: draft.asset_refs.filter((id) => id !== target.manifest_id),
    });
  };

  return (
    <>
      <h2 className="creator-wizard-heading">Assets</h2>
      <p className="creator-wizard-sub">
        Upload a thumbnail and any demo files. Uploads go through Chione to
        R2 with a ClamAV scan; assets may show as scan_status: pending for a
        few seconds after upload.
      </p>
      {stub_mode ? (
        <p className="creator-wizard-help" data-testid="stub-banner">
          Storage endpoint not reachable on this dev server. Uploads are
          stubbed; the returned ids are not usable for publish.
        </p>
      ) : null}

      <div className="creator-wizard-field">
        <span className="creator-wizard-field-label">Thumbnail</span>
        <input
          ref={thumbRef}
          type="file"
          accept="image/png, image/jpeg, image/webp, image/avif"
          data-testid="assets-thumbnail-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleAssetFile(f, true);
          }}
        />
        {thumb ? (
          <div className="creator-wizard-asset-row" data-testid="assets-thumbnail-row">
            <span>
              {thumb.original_filename} ({Math.round(thumb.size_bytes / 1024)} KB)
            </span>
            <span
              className="creator-wizard-scan-badge"
              data-state={thumb.scan_status}
            >
              scan: {thumb.scan_status}
            </span>
          </div>
        ) : null}
      </div>

      <div className="creator-wizard-field">
        <span className="creator-wizard-field-label">
          Asset files (max 16, 25 MB each)
        </span>
        <input
          ref={fileRef}
          type="file"
          data-testid="assets-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleAssetFile(f, false);
          }}
        />
        {assets.map((a, idx) => (
          <div
            key={a.manifest_id}
            className="creator-wizard-asset-row"
            data-testid={`assets-row-${idx}`}
          >
            <span>
              {a.original_filename} ({Math.round(a.size_bytes / 1024)} KB)
            </span>
            <span
              className="creator-wizard-scan-badge"
              data-state={a.scan_status}
            >
              scan: {a.scan_status}
            </span>
            <button
              type="button"
              className="creator-wizard-btn"
              onClick={() => removeAsset(idx)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {upload_error ? (
        <p className="creator-wizard-error" data-testid="assets-error">
          {upload_error}
        </p>
      ) : null}

      <div className="creator-wizard-footer">
        <button
          type="button"
          className="creator-wizard-btn"
          onClick={retreat}
          data-testid="wizard-back"
          disabled={uploading}
        >
          Back
        </button>
        <div className="creator-wizard-footer-actions">
          <button
            type="button"
            className="creator-wizard-btn"
            data-variant="primary"
            onClick={advance}
            data-testid="wizard-next"
            disabled={uploading}
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}
