//
// api.ts
//
// Thin fetch wrappers for the marketplace listing routes Phanes shipped
// in S1 plus the Chione presigned upload endpoint shipped by W1.
//
// Contract refs
// - docs/contracts/marketplace_listing.contract.md Section 4 (CRUD).
// - docs/contracts/file_storage.contract.md (presigned upload + complete).
// - docs/contracts/rest_api_base.contract.md Section 3 (RFC 7807 problem+json).
//
// Design notes
// - Every non-2xx surfaces as a typed ApiProblem with the RFC 7807 envelope
//   the backend emits. The wizard UI renders field-level errors from the
//   `errors` extension and focus-scrolls to the first offending field.
// - Auth is assumed to live in a same-origin session cookie the Aether
//   middleware reads upstream. Tests override via a mocked fetch.
// - Nothing in this module directly touches R2 besides the opaque PUT of
//   the presigned form; Chione owns the bucket contract.
//

export interface ApiProblem {
  status: number;
  type?: string;
  title?: string;
  detail?: string;
  instance?: string;
  errors?: { field: string; code: string; message: string }[];
}

export class ApiProblemError extends Error {
  readonly problem: ApiProblem;
  constructor(problem: ApiProblem) {
    super(problem.detail ?? problem.title ?? 'request failed');
    this.name = 'ApiProblemError';
    this.problem = problem;
  }
}

async function parseProblem(resp: Response): Promise<ApiProblem> {
  let body: unknown = null;
  try {
    body = await resp.json();
  } catch {
    // Non-JSON error; fall back to status text.
  }
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    return {
      status: resp.status,
      type: typeof b.type === 'string' ? b.type : undefined,
      title: typeof b.title === 'string' ? b.title : undefined,
      detail: typeof b.detail === 'string' ? b.detail : undefined,
      instance: typeof b.instance === 'string' ? b.instance : undefined,
      errors: Array.isArray(b.errors)
        ? (b.errors as { field: string; code: string; message: string }[])
        : undefined,
    };
  }
  return { status: resp.status, detail: resp.statusText };
}

async function apiFetch<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  const resp = await fetch(path, {
    method,
    credentials: 'include',
    headers: body
      ? { 'content-type': 'application/json', ...(init?.headers ?? {}) }
      : (init?.headers ?? {}),
    body: body ? JSON.stringify(body) : undefined,
    ...init,
  });
  if (!resp.ok) {
    throw new ApiProblemError(await parseProblem(resp));
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

// ---------------------------------------------------------------------------
// Marketplace listing routes
// ---------------------------------------------------------------------------

export interface CreateListingRequest {
  category: string;
  subtype: string;
  title: string;
  short_description?: string;
  long_description?: string;
  slug?: string;
  capability_tags: string[];
  license: string;
  pricing_model: string;
  pricing_details: Record<string, unknown>;
  category_metadata: Record<string, unknown>;
  asset_refs: string[];
  thumbnail_r2_key?: string;
  version: string;
}

export interface UpdateListingRequest {
  title?: string;
  short_description?: string;
  long_description?: string;
  capability_tags?: string[];
  license?: string;
  pricing_model?: string;
  pricing_details?: Record<string, unknown>;
  category_metadata?: Record<string, unknown>;
  asset_refs?: string[];
  thumbnail_r2_key?: string;
  version?: string;
}

export interface ListingDetail {
  id: string;
  tenant_id: string;
  creator_user_id: string;
  category: string;
  subtype: string;
  slug: string | null;
  title: string;
  short_description: string | null;
  long_description: string | null;
  capability_tags: string[];
  license: string;
  pricing_model: string;
  pricing_details: Record<string, unknown>;
  category_metadata: Record<string, unknown>;
  asset_refs: string[];
  thumbnail_r2_key: string | null;
  status: string;
  version: string;
  version_history: unknown[];
  created_at: string;
  updated_at: string;
  published_at: string | null;
  archived_at: string | null;
}

export async function createListing(
  body: CreateListingRequest,
): Promise<ListingDetail> {
  return apiFetch<ListingDetail>('POST', '/v1/marketplace/listings', body);
}

export async function updateListing(
  id: string,
  body: UpdateListingRequest,
): Promise<ListingDetail> {
  return apiFetch<ListingDetail>('PATCH', `/v1/marketplace/listings/${id}`, body);
}

export async function publishListing(id: string): Promise<ListingDetail> {
  return apiFetch<ListingDetail>(
    'POST',
    `/v1/marketplace/listings/${id}/publish`,
  );
}

export async function getListing(id: string): Promise<ListingDetail> {
  return apiFetch<ListingDetail>('GET', `/v1/marketplace/listings/${id}`);
}

// ---------------------------------------------------------------------------
// Chione presigned upload flow
//
// Two-step: POST /v1/storage/uploads to mint a presigned POST form, then
// the caller POSTs the form + file to the returned R2 URL, then calls
// POST /v1/storage/uploads/{manifest_id}/complete to finalize + enqueue
// the ClamAV scan.
//
// Graceful degrade: when the dev harness lacks the storage endpoint we
// still let the wizard advance, flagging the ref as a TODO. The wizard
// component surfaces the fallback state so the creator knows the upload
// did not actually persist.
// ---------------------------------------------------------------------------

export interface PresignedPostPayload {
  url: string;
  fields: Record<string, string>;
}

export interface UploadInitResponse {
  manifest_id: string;
  presigned_post: PresignedPostPayload;
  expires_in: number;
  max_size_bytes: number;
}

export interface UploadCompleteResponse {
  manifest_id: string;
  virus_scan_status: 'pending' | 'clean' | 'infected' | 'error';
  r2_bucket: string;
  r2_key: string;
  size_bytes: number;
  sha256: string;
}

export interface RequestPresignedInitArgs {
  original_filename: string;
  content_type: string;
  size_bytes: number;
  visibility: 'public' | 'private' | 'tenant_shared';
  reference_type:
    | 'listing_asset'
    | 'invoice_pdf'
    | 'ma_output'
    | 'gdpr_export'
    | 'avatar'
    | 'listing_thumbnail'
    | 'generic';
  reference_id?: string | null;
}

export async function requestPresignedInit(
  args: RequestPresignedInitArgs,
): Promise<UploadInitResponse> {
  return apiFetch<UploadInitResponse>('POST', '/v1/storage/uploads', args);
}

export async function completePresignedUpload(
  manifest_id: string,
): Promise<UploadCompleteResponse> {
  return apiFetch<UploadCompleteResponse>(
    'POST',
    `/v1/storage/uploads/${manifest_id}/complete`,
  );
}

// Direct POST to the R2 presigned URL. We use fetch + FormData because
// multipart/form-data is exactly what boto3's generate_presigned_post emits.
export async function postToPresignedR2(
  presigned: PresignedPostPayload,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  // XHR path is the only way to observe upload progress in the browser
  // without pulling in a 3p dep. Fall back to fetch when progress is not
  // needed to keep the happy path simple.
  if (!onProgress) {
    const form = new FormData();
    for (const [k, v] of Object.entries(presigned.fields)) form.append(k, v);
    form.append('file', file);
    const resp = await fetch(presigned.url, { method: 'POST', body: form });
    if (!resp.ok) {
      throw new ApiProblemError({
        status: resp.status,
        title: 'r2_upload_failed',
        detail: `R2 responded ${resp.status} ${resp.statusText}`,
      });
    }
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', presigned.url);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress((ev.loaded / ev.total) * 100);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else
        reject(
          new ApiProblemError({
            status: xhr.status,
            title: 'r2_upload_failed',
            detail: `R2 responded ${xhr.status}`,
          }),
        );
    };
    xhr.onerror = () =>
      reject(
        new ApiProblemError({
          status: 0,
          title: 'r2_upload_network',
          detail: 'network error during R2 upload',
        }),
      );
    const form = new FormData();
    for (const [k, v] of Object.entries(presigned.fields)) form.append(k, v);
    form.append('file', file);
    xhr.send(form);
  });
}

// Convenience: one-call upload that negotiates presign, uploads, and
// finalizes. Returns both the manifest id + the virus scan status so the
// wizard can show a "scan pending" badge until Chione's worker clears it.
export interface UploadedAsset {
  manifest_id: string;
  r2_key: string;
  scan_status: UploadCompleteResponse['virus_scan_status'];
  size_bytes: number;
}

export async function uploadListingAsset(args: {
  file: File;
  listing_id?: string;
  visibility: RequestPresignedInitArgs['visibility'];
  reference_type: RequestPresignedInitArgs['reference_type'];
  onProgress?: (pct: number) => void;
}): Promise<UploadedAsset> {
  const init = await requestPresignedInit({
    original_filename: args.file.name,
    content_type: args.file.type || 'application/octet-stream',
    size_bytes: args.file.size,
    visibility: args.visibility,
    reference_type: args.reference_type,
    reference_id: args.listing_id ?? null,
  });
  await postToPresignedR2(init.presigned_post, args.file, args.onProgress);
  const done = await completePresignedUpload(init.manifest_id);
  return {
    manifest_id: done.manifest_id,
    r2_key: done.r2_key,
    scan_status: done.virus_scan_status,
    size_bytes: done.size_bytes,
  };
}
