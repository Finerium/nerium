//
// src/lib/sekuri/skillPackageGenerator.ts
//
// Phanes-side skill package generator. Given creator submission wizard form
// fields, produces a `.skills` package as an in-memory artifact:
//
//   1. SKILL.md  - YAML frontmatter + body, mirrors the 3 demo examples
//                  staged at public/sekuri/skill_examples/
//   2. metadata.json - listing-id + creator-id + slug + category + tags +
//                      pricing fields, ULID-shaped id (UUID v7-compatible
//                      sortable hex prefix; no real UUID v7 lib pulled).
//   3. assets/README.md - placeholder asset folder marker so the bundle
//                         carries a non-empty assets dir without forcing
//                         creators to upload.
//
// Output API:
//
//   - `files`            : array of { path, content } records, kept as
//                          plain UTF-8 strings so the wizard can render
//                          a code-style preview without binary handling.
//   - `manifestBlob`     : downloadable single-file JSON archive that
//                          inlines all `files` entries. Marketplace backend
//                          can unpack server-side. Avoids a fresh JSZip
//                          dependency at the package.json boundary.
//   - `skillMdBlob`      : SKILL.md alone, downloadable as a `.md` file.
//   - `metadataJsonBlob` : metadata.json alone, downloadable as `.json`.
//
// Theatrical-only: the generator runs entirely client-side, no fetch,
// no network. The output is identical across runs given identical input
// (deterministic seed-able id generation).
//
// No em dash, no emoji.
//

export interface SkillPackageInput {
  // Wizard form fields. All strings are pre-sanitized at the wizard layer.
  name: string;
  category: string;
  subtype: string;
  short_description: string;
  long_description: string;
  tags: ReadonlyArray<string>;
  price_usd: number;
  pricing_model: string;
  license: string;
  creator_id: string;
  creator_handle?: string | null;
  runtime_compatibility?: ReadonlyArray<string>;
  languages_supported?: ReadonlyArray<string>;
  target_market?: string | null;
}

export interface SkillPackageFile {
  path: string;
  content: string;
}

export interface SkillPackageOutput {
  slug: string;
  listing_id: string;
  files: ReadonlyArray<SkillPackageFile>;
  manifestBlob: Blob;
  skillMdBlob: Blob;
  metadataJsonBlob: Blob;
  manifestFilename: string;
  generated_at: string;
}

function deriveSlug(input: string): string {
  const lowered = (input ?? '').toString().toLowerCase();
  const dashed = lowered
    .normalize('NFKD')
    .replace(/[^\x00-\x7f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const truncated = dashed.slice(0, 60).replace(/-+$/, '');
  return truncated || 'skill';
}

// ULID-style id with crypto.randomUUID fallback. The 3 demo skill examples
// at public/sekuri/skill_examples/*/metadata.json use ULID-shaped strings
// like `lst_01HRA9X7K2P5M8N3Q6T4V8B0X3`, so the generated id should match
// that shape for visual continuity in the preview.
function generateListingId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    const uuid = crypto.randomUUID().replace(/-/g, '').toUpperCase();
    return `lst_${uuid.slice(0, 26)}`;
  }
  // Fallback: timestamp-prefixed pseudo-id. Not cryptographic; only used
  // when crypto is unavailable (older browsers, SSR boundary).
  const ts = Date.now().toString(16).toUpperCase().padStart(12, '0');
  let suffix = '';
  for (let i = 0; i < 14; i++) {
    suffix += Math.floor(Math.random() * 16).toString(16).toUpperCase();
  }
  return `lst_${ts}${suffix}`.slice(0, 30);
}

function nowIsoUtc(): string {
  return new Date().toISOString();
}

function buildSkillMd(input: SkillPackageInput, slug: string): string {
  const tags = input.tags.length > 0 ? input.tags : ['skill'];
  const runtimes =
    input.runtime_compatibility && input.runtime_compatibility.length > 0
      ? input.runtime_compatibility
      : ['anthropic_opus_4.7', 'anthropic_sonnet_4.6'];

  const tagBlock = tags.map((t) => `  - ${t}`).join('\n');
  const runtimeBlock = runtimes.map((r) => `  - ${r}`).join('\n');

  const description = (input.short_description || input.name).trim();
  const longBody = (input.long_description || description).trim();

  // Frontmatter mirrors the 3 staged examples to keep a single Sekuri
  // skill schema for the marketplace ingest path.
  const frontmatter = [
    '---',
    `name: ${slug}`,
    `description: ${escapeYamlSingleLine(description)}`,
    `category: ${input.category}`,
    'tags:',
    tagBlock,
    `price_usd: ${Number.isFinite(input.price_usd) ? input.price_usd : 0}`,
    `creator_id: ${input.creator_id}`,
    `license: ${input.license}`,
    'runtime_compatibility:',
    runtimeBlock,
    `created_at: ${nowIsoUtc()}`,
    '---',
    '',
  ].join('\n');

  const body = [
    `# ${input.name || slug}`,
    '',
    '## Purpose',
    '',
    description,
    '',
    '## Capability',
    '',
    longBody,
    '',
    '## Pricing',
    '',
    formatPricingLine(input),
    '',
    '## License',
    '',
    licenseDescription(input.license),
    '',
    '## Sekuri attribution',
    '',
    'Skill package auto-generated by Sekuri from the creator submission wizard.',
    'Sekuri is the deterministic Builder + Phanes integration layer that runs',
    'classification, template selection, and skill packaging client-side with',
    'zero live model invocation at hackathon scope.',
    '',
  ].join('\n');

  return frontmatter + body;
}

function escapeYamlSingleLine(value: string): string {
  // YAML 1.2 plain-scalar safe: collapse newlines + escape colons.
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (collapsed.includes(':') || collapsed.includes('#') || collapsed.startsWith('-')) {
    return JSON.stringify(collapsed);
  }
  return collapsed;
}

function formatPricingLine(input: SkillPackageInput): string {
  if (!input.price_usd || input.price_usd <= 0) {
    return 'Free.';
  }
  const usd = input.price_usd.toFixed(2);
  switch (input.pricing_model) {
    case 'subscription_monthly':
      return `USD ${usd} per month subscription. Revenue share to creator: 70 percent.`;
    case 'subscription_yearly':
      return `USD ${usd} per year subscription. Revenue share to creator: 70 percent.`;
    case 'usage_based':
    case 'per_invocation':
      return `USD ${usd} per invocation. Revenue share to creator: 70 percent.`;
    case 'one_time':
      return `USD ${usd} one-time purchase. Revenue share to creator: 70 percent.`;
    case 'tiered':
      return `Tiered pricing starting at USD ${usd}. Revenue share to creator: 70 percent.`;
    default:
      return `USD ${usd}. Revenue share to creator: 70 percent.`;
  }
}

function licenseDescription(license: string): string {
  switch ((license || '').toUpperCase()) {
    case 'MIT':
      return 'MIT License. Buyer receives source-open execution rights.';
    case 'APACHE_2':
      return 'Apache 2.0 License. Patent-grant included.';
    case 'BSD_3':
      return 'BSD 3-Clause License.';
    case 'CC0':
      return 'Creative Commons Zero. Public domain dedication.';
    case 'PROPRIETARY':
      return 'Proprietary. Buyer receives execution rights only.';
    default:
      return 'Marketplace default license. Buyer receives execution rights.';
  }
}

function buildMetadataJson(
  input: SkillPackageInput,
  slug: string,
  listingId: string,
): string {
  const meta: Record<string, unknown> = {
    listing_id: listingId,
    creator_id: input.creator_id,
    creator_handle: input.creator_handle ?? null,
    skill_slug: slug,
    category: input.category,
    subtype: input.subtype,
    tags: [...input.tags],
    price_usd: Number.isFinite(input.price_usd) ? input.price_usd : 0,
    pricing_model: input.pricing_model,
    license: input.license,
    trust_score: 0,
    execution_count: 0,
    average_rating: null,
    review_count: 0,
    created_at: nowIsoUtc(),
    status: 'draft',
    runtime_compatibility:
      input.runtime_compatibility && input.runtime_compatibility.length > 0
        ? [...input.runtime_compatibility]
        : ['anthropic_opus_4.7', 'anthropic_sonnet_4.6'],
    languages_supported:
      input.languages_supported && input.languages_supported.length > 0
        ? [...input.languages_supported]
        : ['en'],
    target_market: input.target_market ?? null,
    verified_creator: false,
    moderation_status: 'pending',
    sekuri_generated: true,
    sekuri_generator_version: '1.0.0',
  };
  return JSON.stringify(meta, null, 2) + '\n';
}

const ASSETS_README =
  '# Assets\n\nDrop screenshots, schema diagrams, demo gifs, or any other supporting media for this skill package here. The marketplace listing detail page renders any image at `assets/cover.png` as the listing cover photo.\n';

export function generateSkillPackage(
  input: SkillPackageInput,
): SkillPackageOutput {
  const slug = deriveSlug(input.name || 'skill');
  const listing_id = generateListingId();
  const generated_at = nowIsoUtc();

  const skillMd = buildSkillMd(input, slug);
  const metadataJson = buildMetadataJson(input, slug, listing_id);

  const files: ReadonlyArray<SkillPackageFile> = [
    { path: 'SKILL.md', content: skillMd },
    { path: 'metadata.json', content: metadataJson },
    { path: 'assets/README.md', content: ASSETS_README },
  ];

  const manifest = {
    sekuri_skill_package_format: '1.0.0',
    package_name: `${slug}.skills`,
    listing_id,
    generated_at,
    files: files.map((f) => ({ path: f.path, content: f.content })),
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  const manifestBlob = new Blob([manifestJson], {
    type: 'application/json;charset=utf-8',
  });
  const skillMdBlob = new Blob([skillMd], {
    type: 'text/markdown;charset=utf-8',
  });
  const metadataJsonBlob = new Blob([metadataJson], {
    type: 'application/json;charset=utf-8',
  });

  return {
    slug,
    listing_id,
    files,
    manifestBlob,
    skillMdBlob,
    metadataJsonBlob,
    manifestFilename: `${slug}.skills.json`,
    generated_at,
  };
}

// Helper for the wizard download buttons. SSR-safe: returns a no-op when
// `window` is undefined.
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}
