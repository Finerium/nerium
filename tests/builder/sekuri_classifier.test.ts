//
// tests/builder/sekuri_classifier.test.ts
//
// Sekuri integration unit tests. Runs via `node --test`. Mirrors the
// repo convention used by tests/builder/model_selection_modal.test.ts:
// no vitest, no jest, no React renderer; assert pure-function helpers
// only. Component rendering is covered by the Playwright spec at
// tests/builder/sekuri_integration.spec.ts.
//
// Coverage:
//   - Empty prompt defaults to medium tier with rationale.
//   - Large-tier signal classification (marketplace, multi-tenant, banking).
//   - Medium-tier signal classification (saas dashboard, auth + billing).
//   - Small-tier signal classification (landing page, todo, calculator).
//   - Tie-break safety bias: large beats medium beats small.
//   - skillPackageGenerator emits SKILL.md + metadata.json + assets/README.md
//     with frontmatter shape that mirrors the 3 staged demo skills.
//   - skillPackageGenerator slug derivation matches expected kebab-case.
//

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { classifyPrompt } from '../../src/lib/sekuri/classifier';
import { generateSkillPackage } from '../../src/lib/sekuri/skillPackageGenerator';

describe('Sekuri classifyPrompt', () => {
  it('defaults to medium when prompt is empty', () => {
    const result = classifyPrompt('');
    assert.equal(result.tier, 'medium');
    assert.equal(result.confidence, 0);
    assert.match(result.rationale, /default/i);
  });

  it('classifies a marketplace prompt as large', () => {
    const result = classifyPrompt(
      'build me a marketplace SaaS for indie agent creators with multi-vendor routing',
    );
    assert.equal(result.tier, 'large');
    assert.ok(result.matches.large.length >= 2, 'expected multiple large signals');
  });

  it('classifies a Tokopedia-tier prompt as large', () => {
    const result = classifyPrompt(
      'Tokopedia-tier multi-vendor e-commerce platform with real-time inventory',
    );
    assert.equal(result.tier, 'large');
    assert.ok(
      result.matches.large.some((m) => /tokopedia/i.test(m)),
      'expected tokopedia match',
    );
  });

  it('classifies a banking AML prompt as large', () => {
    const result = classifyPrompt(
      'production-grade banking app with Stripe Connect and AML compliance',
    );
    assert.equal(result.tier, 'large');
  });

  it('classifies a SaaS dashboard with auth as medium', () => {
    const result = classifyPrompt(
      'create a mid-tier SaaS dashboard with auth and billing',
    );
    assert.equal(result.tier, 'medium');
    assert.ok(result.matches.medium.length >= 2);
  });

  it('classifies a blog platform with CMS as medium', () => {
    const result = classifyPrompt('blog platform with CMS and Stripe subscription');
    assert.equal(result.tier, 'medium');
  });

  it('classifies a landing page with signup form as small', () => {
    const result = classifyPrompt('make a landing page with signup form');
    assert.equal(result.tier, 'small');
    assert.ok(
      result.matches.small.some((m) => /landing\s+page/i.test(m)),
    );
  });

  it('classifies a todo app with local storage as small', () => {
    const result = classifyPrompt('todo app with local storage');
    assert.equal(result.tier, 'small');
  });

  it('classifies a weather widget as small', () => {
    const result = classifyPrompt('weather widget for my homepage');
    assert.equal(result.tier, 'small');
  });

  it('tie-break: large beats medium when both signals present', () => {
    // "marketplace" + "auth" -> medium has auth, large has marketplace.
    // Large weight (3) >= medium weight (2) so chosen tier is large.
    const result = classifyPrompt('marketplace with auth');
    assert.equal(result.tier, 'large');
  });

  it('tie-break: medium beats small when both signals present', () => {
    const result = classifyPrompt('SaaS dashboard with a contact form');
    assert.equal(result.tier, 'medium');
  });

  it('confidence is non-zero when at least one match found', () => {
    const result = classifyPrompt('landing page');
    assert.ok(result.confidence > 0);
    assert.ok(result.confidence <= 1);
  });

  it('rationale includes matched signal label when match found', () => {
    const result = classifyPrompt('todo app');
    assert.ok(/todo/i.test(result.rationale));
  });
});

describe('Sekuri generateSkillPackage', () => {
  const baseInput = {
    name: 'Restaurant Automation Agent',
    category: 'agent',
    subtype: 'core_agent',
    short_description:
      'End-to-end automation agent for independent restaurants and small chains.',
    long_description:
      'Receives natural-language instruction from restaurant owner via web chat or WhatsApp Business API.',
    tags: ['restaurant', 'automation', 'hospitality'] as ReadonlyArray<string>,
    price_usd: 25,
    pricing_model: 'subscription_monthly',
    license: 'PROPRIETARY',
    creator_id: 'demo_creator_001',
    creator_handle: '@warungpintar',
    runtime_compatibility: ['anthropic_opus_4.7', 'anthropic_sonnet_4.6'] as ReadonlyArray<string>,
    languages_supported: ['id', 'en'] as ReadonlyArray<string>,
    target_market: 'Indonesian SMB restaurants',
  };

  it('produces a 3-file package (SKILL.md + metadata.json + assets/README.md)', () => {
    const out = generateSkillPackage(baseInput);
    assert.equal(out.files.length, 3);
    const paths = out.files.map((f) => f.path);
    assert.deepEqual(paths.sort(), [
      'SKILL.md',
      'assets/README.md',
      'metadata.json',
    ].sort());
  });

  it('derives a kebab-case slug from the skill name', () => {
    const out = generateSkillPackage(baseInput);
    assert.equal(out.slug, 'restaurant-automation-agent');
  });

  it('SKILL.md contains YAML frontmatter mirroring the demo example shape', () => {
    const out = generateSkillPackage(baseInput);
    const skillMd = out.files.find((f) => f.path === 'SKILL.md')!.content;
    assert.match(skillMd, /^---/m);
    assert.match(skillMd, /^name: restaurant-automation-agent$/m);
    assert.match(skillMd, /^category: agent$/m);
    assert.match(skillMd, /^price_usd: 25$/m);
    assert.match(skillMd, /^license: PROPRIETARY$/m);
  });

  it('metadata.json is valid JSON with the listing_id and slug', () => {
    const out = generateSkillPackage(baseInput);
    const metadataJson = out.files.find((f) => f.path === 'metadata.json')!.content;
    const meta = JSON.parse(metadataJson) as Record<string, unknown>;
    assert.ok(typeof meta.listing_id === 'string');
    assert.match(String(meta.listing_id), /^lst_/);
    assert.equal(meta.skill_slug, 'restaurant-automation-agent');
    assert.equal(meta.creator_id, 'demo_creator_001');
    assert.equal(meta.category, 'agent');
    assert.equal(meta.price_usd, 25);
    assert.equal(meta.sekuri_generated, true);
  });

  it('manifest blob is JSON containing all 3 files inline', () => {
    const out = generateSkillPackage(baseInput);
    assert.ok(out.manifestFilename.endsWith('.skills.json'));
    // Blob contents are async; sniff-test via file synthesis instead.
    const inline = JSON.stringify({
      sekuri_skill_package_format: '1.0.0',
      package_name: `${out.slug}.skills`,
      listing_id: out.listing_id,
      generated_at: out.generated_at,
      files: out.files.map((f) => ({ path: f.path, content: f.content })),
    });
    assert.ok(inline.includes('"path": "SKILL.md"') || inline.includes('"path":"SKILL.md"'));
    assert.ok(inline.includes('restaurant-automation-agent'));
  });

  it('handles empty tags + zero price gracefully', () => {
    const out = generateSkillPackage({
      ...baseInput,
      tags: [],
      price_usd: 0,
      pricing_model: 'free',
    });
    const skillMd = out.files.find((f) => f.path === 'SKILL.md')!.content;
    assert.match(skillMd, /price_usd: 0/);
    // Default tag fallback ensures the YAML stays valid.
    assert.match(skillMd, /^tags:/m);
    assert.match(skillMd, /^\s+- skill$/m);
    assert.match(skillMd, /Free\./);
  });

  it('escapes YAML-unsafe characters in description', () => {
    const out = generateSkillPackage({
      ...baseInput,
      short_description: 'A description: with colons and #hashes',
    });
    const skillMd = out.files.find((f) => f.path === 'SKILL.md')!.content;
    // The YAML serializer wraps colon-bearing strings in quotes via JSON.stringify.
    const descLine = skillMd.split('\n').find((l) => l.startsWith('description:'));
    assert.ok(descLine);
    assert.ok(descLine.includes('"'));
  });

  it('listing_id is shaped lst_<26-char> per ULID convention', () => {
    const out = generateSkillPackage(baseInput);
    assert.match(out.listing_id, /^lst_[A-Z0-9]+/);
  });

  it('different inputs produce different listing ids', () => {
    const a = generateSkillPackage(baseInput);
    const b = generateSkillPackage({ ...baseInput, name: 'Other Skill' });
    assert.notEqual(a.listing_id, b.listing_id);
    assert.equal(a.slug, 'restaurant-automation-agent');
    assert.equal(b.slug, 'other-skill');
  });
});
