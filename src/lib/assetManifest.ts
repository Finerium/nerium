//
// src/lib/assetManifest.ts
//
// Aether-Vercel T6 Phase 1.7.4: shared client-side helper for resolving
// AI-asset stems to Vercel Blob URLs via the manifest emitted by
// `scripts/upload-assets-to-blob.ts` (committed at `public/asset_manifest.json`).
//
// The Phaser game scenes have their own resolver path through
// `src/game/visual/asset_keys.ts` because Phaser preloads the manifest as a
// JSON asset in BootScene. React surfaces (marketplace, builder UI, etc.)
// fetch the manifest once and cache it module-scope.
//
// Anti-pattern lock per CLAUDE.md: no em dash, no emoji.
//

export interface AssetManifestEntry {
  stem: string;
  url: string;
  size: number;
  contentType: string;
}

let MANIFEST_PROMISE: Promise<Record<string, AssetManifestEntry>> | null = null;

/**
 * Returns a singleton promise that resolves to the parsed manifest. The first
 * caller triggers a single fetch; subsequent callers reuse the same promise.
 * The fetch path `/asset_manifest.json` is served by Next.js from `public/`.
 */
export function loadAssetManifest(): Promise<Record<string, AssetManifestEntry>> {
  if (MANIFEST_PROMISE) {
    return MANIFEST_PROMISE;
  }
  MANIFEST_PROMISE = fetch('/asset_manifest.json', { cache: 'force-cache' })
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Asset manifest fetch failed: HTTP ${res.status}`);
      }
      return res.json() as Promise<Record<string, AssetManifestEntry>>;
    })
    .catch((err) => {
      // Reset cache so a future call can retry; surface the error to caller.
      MANIFEST_PROMISE = null;
      throw err;
    });
  return MANIFEST_PROMISE;
}

/**
 * Best-effort synchronous lookup. Throws when the manifest is not yet loaded
 * OR the stem is missing. Use after `await loadAssetManifest()` in the same
 * component tree, or wrap in a hook (`useAssetUrl`) that suspends.
 */
export function assetUrlFromMap(
  m: Record<string, AssetManifestEntry>,
  stem: string,
): string {
  const entry = m[stem];
  if (!entry) {
    throw new Error(
      `Asset stem missing from manifest: "${stem}". Run npm run upload-assets to refresh.`,
    );
  }
  return entry.url;
}
