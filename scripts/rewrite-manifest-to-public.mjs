//
// T-ASSET A3 inline rescue: rewrite public/asset_manifest.json so every
// entry's `url` field points at /assets/ai/<stem>.<ext> (relative path
// served by Vercel CDN from public/) instead of the suspended Vercel
// Blob origin. Updates `size` to the post-downsize byte count so any
// downstream tooling that reads size stays accurate. Stem and contentType
// are preserved verbatim.
//
// Idempotent: re-running with already-rewritten URLs leaves the file
// unchanged (apart from possible size refresh if files changed).
//

import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const MANIFEST = 'public/asset_manifest.json';
const PUBLIC_ROOT = 'public/assets/ai';

async function main() {
  const raw = await readFile(MANIFEST, 'utf8');
  const manifest = JSON.parse(raw);

  let rewritten = 0;
  let unchanged = 0;
  let missingFile = 0;

  for (const [key, entry] of Object.entries(manifest)) {
    const ext = entry.contentType === 'image/jpeg' ? 'jpg' : 'png';
    const newUrl = `/assets/ai/${entry.stem}.${ext}`;
    const filePath = join(PUBLIC_ROOT, `${entry.stem}.${ext}`);

    let newSize = entry.size;
    try {
      const s = await stat(filePath);
      newSize = s.size;
    } catch {
      missingFile += 1;
      console.warn(`MISS  ${filePath} (size kept at ${entry.size})`);
    }

    if (entry.url === newUrl && entry.size === newSize) {
      unchanged += 1;
      continue;
    }

    entry.url = newUrl;
    entry.size = newSize;
    rewritten += 1;
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`Rewritten:    ${rewritten}`);
  console.log(`Unchanged:    ${unchanged}`);
  console.log(`Missing file: ${missingFile}`);
  console.log(`Total:        ${Object.keys(manifest).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
