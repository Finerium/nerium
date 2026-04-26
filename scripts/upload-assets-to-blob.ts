//
// scripts/upload-assets-to-blob.ts
//
// Aether-Vercel T6 Phase 1.7.2: bulk upload of all 96 active AI-generated
// assets from `_Reference/ai_generated_assets/` to Vercel Blob (region iad1).
// Emits `public/asset_manifest.json` mapping stem (relative path without
// extension) to the public blob URL plus size and content type metadata.
//
// Run via: `npm run upload-assets` (after `vercel env pull .env.local`).
//
// Anti-pattern lock per CLAUDE.md: no em dash, no emoji.
//

import { put } from '@vercel/blob';
import { readFile, readdir, stat, writeFile } from 'fs/promises';
import { join, extname, relative } from 'path';
import { config } from 'dotenv';

config({ path: '.env.local' });

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!BLOB_TOKEN) {
  console.error(
    'BLOB_READ_WRITE_TOKEN missing in .env.local. Run vercel env pull first.',
  );
  process.exit(1);
}

const ASSET_ROOT = '_Reference/ai_generated_assets';
const SUBDIRS = ['backgrounds', 'characters', 'overlays', 'props', 'ui'];
const CONCURRENCY = 8;

interface ManifestEntry {
  stem: string;
  url: string;
  size: number;
  contentType: string;
}

const manifest: Record<string, ManifestEntry> = {};

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '_archive') continue;
      out.push(...(await walk(full)));
    } else if (e.isFile() && /\.(png|jpg|jpeg)$/i.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

function contentTypeFor(filename: string): string {
  const ext = extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function toPosix(p: string): string {
  return p.split(/[\\/]+/).filter(Boolean).join('/');
}

async function main() {
  let count = 0;
  const allFiles: { rel: string; full: string; ct: string; size: number }[] = [];
  for (const sub of SUBDIRS) {
    const subRoot = join(ASSET_ROOT, sub);
    const files = await walk(subRoot);
    for (const file of files) {
      const rel = toPosix(relative(ASSET_ROOT, file));
      const stats = await stat(file);
      allFiles.push({ rel, full: file, ct: contentTypeFor(file), size: stats.size });
    }
  }
  console.log(`Found ${allFiles.length} assets to upload.`);

  for (let i = 0; i < allFiles.length; i += CONCURRENCY) {
    const batch = allFiles.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (f) => {
        const buffer = await readFile(f.full);
        const stem = f.rel.replace(/\.(png|jpg|jpeg)$/i, '');
        const result = await put(f.rel, buffer, {
          access: 'public',
          token: BLOB_TOKEN,
          contentType: f.ct,
          allowOverwrite: true,
          cacheControlMaxAge: 31536000,
        });
        manifest[stem] = {
          stem,
          url: result.url,
          size: f.size,
          contentType: f.ct,
        };
        count += 1;
        console.log(`[${count}/${allFiles.length}] ${f.rel} -> ${result.url}`);
      }),
    );
  }

  await writeFile(
    'public/asset_manifest.json',
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
  console.log(
    `\nUploaded ${count} assets. Manifest written to public/asset_manifest.json (${Object.keys(manifest).length} entries).`,
  );
}

main().catch((err) => {
  console.error('Upload failed:', err);
  process.exit(1);
});
