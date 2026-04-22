//
// ma_files_api_client.ts
//
// Conforms to: docs/contracts/managed_agent_executor.contract.md v0.1.0
// Owner Agent: Heracles (Builder Worker, MA Integration Engineer, P2)
//
// Purpose: pull MA session artifacts via the Files API after the session
// completes. Per M1 MANAGED_AGENTS_RESEARCH.md Section C1 and the MA Data
// Analyst cookbook, artifacts written to `/mnt/session/outputs/` surface
// through the Files API scoped by the originating `session_id`. Listing is
// two-step: list metadata by scope, then fetch content per file_id.
//
// Cache policy per Heracles prompt Section "Creative Latitude": flat map by
// artifact path for demo replay. In-memory only; post-hackathon persists to
// disk for deterministic demo reruns.
//

import {
  ManagedSessionSpawner,
  MaAccessDeniedError,
  MaNetworkError,
  MaRateLimitedError,
  MaServerError,
} from './ma_session_spawner';

// ---------- Artifact shape ----------

export interface MaArtifact {
  readonly path: string;
  readonly content: string;
  readonly mime_type?: string;
  readonly size_bytes?: number;
}

interface RawFileMetadata {
  readonly id: string;
  readonly filename: string;
  readonly path?: string;
  readonly mime_type?: string;
  readonly bytes?: number;
  readonly scope_id?: string;
}

interface RawFileListResponse {
  readonly data: ReadonlyArray<RawFileMetadata>;
  readonly has_more?: boolean;
  readonly next_cursor?: string;
}

// ---------- Client configuration ----------

export interface MaFilesApiClientConfig {
  readonly spawner: ManagedSessionSpawner;
  readonly api_base_url: string;
  readonly max_retries: number;
  readonly enable_cache: boolean;
  readonly on_missing_content?: (file_id: string) => void;
}

export const DEFAULT_FILES_API_CONFIG: Omit<MaFilesApiClientConfig, 'spawner'> = {
  api_base_url: 'https://api.anthropic.com',
  max_retries: 2,
  enable_cache: true,
};

// ---------- Client implementation ----------

export class MaFilesApiClient {
  private readonly config: MaFilesApiClientConfig;
  private readonly artifact_cache: Map<string, ReadonlyArray<MaArtifact>> = new Map();

  constructor(config: Partial<MaFilesApiClientConfig> & Pick<MaFilesApiClientConfig, 'spawner'>) {
    this.config = {
      ...DEFAULT_FILES_API_CONFIG,
      ...config,
    };
  }

  // Pull all artifacts scoped to a session. Lists metadata then downloads
  // content per file_id. Returns array in discovery order.
  async pullArtifacts(session_id: string): Promise<ReadonlyArray<MaArtifact>> {
    if (this.config.enable_cache) {
      const cached = this.artifact_cache.get(session_id);
      if (cached) return cached;
    }

    const metadata_list = await this.listMetadata(session_id);
    const artifacts: MaArtifact[] = [];
    for (const meta of metadata_list) {
      const content = await this.downloadContent(meta.id);
      if (content === null) {
        if (this.config.on_missing_content) {
          this.config.on_missing_content(meta.id);
        }
        continue;
      }
      artifacts.push({
        path: meta.path ?? meta.filename,
        content,
        mime_type: meta.mime_type,
        size_bytes: meta.bytes,
      });
    }

    if (this.config.enable_cache) {
      this.artifact_cache.set(session_id, artifacts);
    }
    return artifacts;
  }

  clearCache(session_id?: string): void {
    if (session_id) {
      this.artifact_cache.delete(session_id);
    } else {
      this.artifact_cache.clear();
    }
  }

  private async listMetadata(session_id: string): Promise<ReadonlyArray<RawFileMetadata>> {
    const all: RawFileMetadata[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const query = new URLSearchParams();
      query.set('scope_id', session_id);
      if (cursor) query.set('after', cursor);
      const url = `${this.config.api_base_url}/v1/files?${query.toString()}`;
      const response = await this.getWithRetry(url);
      const body = (await response.json()) as RawFileListResponse;
      if (!body || !Array.isArray(body.data)) {
        throw new MaServerError('Malformed Files API list response', response.status);
      }
      all.push(...body.data);
      if (!body.has_more || !body.next_cursor) break;
      cursor = body.next_cursor;
    }
    return all;
  }

  private async downloadContent(file_id: string): Promise<string | null> {
    const url = `${this.config.api_base_url}/v1/files/${encodeURIComponent(file_id)}/content`;
    try {
      const response = await this.getWithRetry(url);
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new MaServerError(
          `Files API content fetch returned ${response.status}`,
          response.status,
        );
      }
      return await response.text();
    } catch (error) {
      if (error instanceof MaAccessDeniedError) throw error;
      if (error instanceof MaRateLimitedError) throw error;
      if (error instanceof MaServerError) {
        if (error.status_code === 404) return null;
        throw error;
      }
      throw error;
    }
  }

  private async getWithRetry(url: string): Promise<Response> {
    let last_error: unknown = null;
    for (let attempt = 0; attempt <= this.config.max_retries; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: this.config.spawner.headersForFilesApi(),
        });
        if (response.status === 403) {
          const body = await response.text().catch(() => '');
          throw new MaAccessDeniedError(`403 on GET ${url}: ${body.slice(0, 200)}`);
        }
        if (response.status === 429) {
          if (attempt >= this.config.max_retries) {
            throw new MaRateLimitedError(`429 on GET ${url} after ${attempt + 1} attempts`);
          }
          await sleep(backoffMs(attempt));
          continue;
        }
        if (response.status >= 500 && response.status <= 599) {
          if (attempt >= this.config.max_retries) {
            throw new MaServerError(`${response.status} on GET ${url}`, response.status);
          }
          await sleep(backoffMs(attempt));
          continue;
        }
        return response;
      } catch (error) {
        if (error instanceof MaAccessDeniedError) throw error;
        if (error instanceof MaRateLimitedError) throw error;
        if (error instanceof MaServerError) throw error;
        last_error = error;
        if (attempt >= this.config.max_retries) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new MaNetworkError(`Network failure on GET ${url}`, reason);
        }
        await sleep(backoffMs(attempt));
      }
    }
    throw last_error ?? new MaNetworkError(`Retry loop exhausted on GET ${url}`, 'no_cause');
  }
}

function backoffMs(attempt: number): number {
  if (attempt === 0) return 1000;
  if (attempt === 1) return 4000;
  return 10_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
