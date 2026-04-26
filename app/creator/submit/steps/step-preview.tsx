'use client';

//
// step-preview.tsx
//
// Step 6 - render a local projection of what the public listing card +
// detail page will look like. Drives exclusively off the draft state in
// the store; the server has not yet been asked to render anything.
//
// Sekuri integration (V6 Sekuri Part B): adds a "Generate Skill Package"
// button that runs the deterministic `.skills` generator client-side from
// the wizard form fields, surfaces a preview of the generated SKILL.md +
// metadata.json content, exposes 3 download buttons (manifest archive,
// SKILL.md alone, metadata.json alone), renders a Featured Examples
// sidebar referencing the 3 pre-baked demo skills at
// `public/sekuri/skill_examples/`, and shows the locked Sekuri attribution
// caption with an info hint explaining the auto-formatting.
//
// No live invocation. No Opus call. Generator is pure client-side regex +
// string templating.
//
// No em dash, no emoji.
//

import { useMemo, useState } from 'react';

import {
  CATEGORY_LABELS,
  LICENSE_LABELS,
  PRICING_MODEL_LABELS,
  SUBTYPE_LABELS,
} from '../lib/category-schemas';
import { validateForPublish } from '../lib/schema';
import { useWizardStore } from '../lib/store';
import {
  generateSkillPackage,
  downloadBlob,
  type SkillPackageOutput,
} from '../../../../src/lib/sekuri/skillPackageGenerator';
import { SEKURI_HONEST_CLAIM_CAPTION } from '../../../../src/lib/sekuri';

function fmtPricing(
  model: string,
  details: Record<string, unknown>,
): string {
  if (model === 'free') return 'Free';
  if (
    model === 'one_time' ||
    model === 'subscription_monthly' ||
    model === 'subscription_yearly'
  ) {
    const cents = Number(details.amount_cents ?? 0);
    const cur = String(details.currency ?? 'USD');
    const pretty = (cents / 100).toFixed(2);
    const suffix =
      model === 'subscription_monthly'
        ? ' / month'
        : model === 'subscription_yearly'
          ? ' / year'
          : '';
    return `${cur} ${pretty}${suffix}`;
  }
  if (model === 'usage_based') {
    const meter = String(details.meter ?? 'per_execution');
    const rate = Number(details.rate_cents ?? 0);
    const cur = String(details.currency ?? 'USD');
    return `${cur} ${(rate / 100).toFixed(4)} ${meter}`;
  }
  if (model === 'tiered') {
    const tiers = Array.isArray(details.tiers) ? details.tiers.length : 0;
    return `${tiers} tier${tiers === 1 ? '' : 's'}`;
  }
  return model;
}

function priceUsdFromPricingDetails(
  model: string,
  details: Record<string, unknown>,
): number {
  if (
    model === 'one_time' ||
    model === 'subscription_monthly' ||
    model === 'subscription_yearly'
  ) {
    const cents = Number(details.amount_cents ?? 0);
    return Math.round((cents / 100) * 100) / 100;
  }
  if (model === 'usage_based') {
    const rate = Number(details.rate_cents ?? 0);
    return Math.round((rate / 100) * 10000) / 10000;
  }
  if (model === 'tiered') {
    const tiers = Array.isArray(details.tiers) ? details.tiers : [];
    if (tiers.length > 0) {
      const first = tiers[0] as { amount_cents?: number } | undefined;
      const cents = Number(first?.amount_cents ?? 0);
      return Math.round((cents / 100) * 100) / 100;
    }
  }
  return 0;
}

interface FeaturedExample {
  slug: string;
  category: string;
  title: string;
  description: string;
  tags: ReadonlyArray<string>;
  price_label: string;
}

const FEATURED_EXAMPLES: ReadonlyArray<FeaturedExample> = [
  {
    slug: 'restaurant_automation_agent',
    category: 'agent',
    title: 'Restaurant Automation Agent',
    description:
      'End-to-end restaurant operations automation. Reservations, supplier orders, staff scheduling, customer feedback.',
    tags: ['restaurant', 'automation', 'hospitality', 'scheduling'],
    price_label: 'USD 25 / month',
  },
  {
    slug: 'indonesian_tax_calculator_mcp',
    category: 'mcp',
    title: 'Indonesian Tax Calculator MCP',
    description:
      'MCP server exposing PPh, PPN, PBJT calculation tools to any compatible agent. 2026 regulations.',
    tags: ['tax', 'indonesia', 'finance', 'mcp_server'],
    price_label: 'USD 5 / month',
  },
  {
    slug: 'stripe_connect_onboarding',
    category: 'skill',
    title: 'Stripe Connect Onboarding',
    description:
      'Conversational marketplace creator onboarding. Cuts setup time from 2 hours to 12 minutes.',
    tags: ['stripe', 'onboarding', 'marketplace', 'kyc'],
    price_label: 'USD 10 / onboarding',
  },
];

export function StepPreview() {
  const draft = useWizardStore((s) => s.draft);
  const userId = useWizardStore((s) => s.user_id);
  const advance = useWizardStore((s) => s.advance);
  const retreat = useWizardStore((s) => s.retreat);

  const validation = validateForPublish(draft);

  const [skillPackage, setSkillPackage] = useState<SkillPackageOutput | null>(
    null,
  );
  const [showSekuriInfo, setShowSekuriInfo] = useState(false);

  const canGenerate = useMemo(() => {
    return Boolean(
      draft.basics.title?.trim() &&
        draft.basics.short_description?.trim() &&
        draft.category &&
        draft.subtype,
    );
  }, [draft]);

  const handleGenerate = () => {
    if (!canGenerate || !draft.category || !draft.subtype) return;
    const price_usd = priceUsdFromPricingDetails(
      draft.pricing_model,
      draft.pricing_details,
    );
    const pkg = generateSkillPackage({
      name: draft.basics.title,
      category: draft.category,
      subtype: draft.subtype,
      short_description: draft.basics.short_description,
      long_description: draft.basics.long_description,
      tags: [...draft.basics.capability_tags],
      price_usd,
      pricing_model: draft.pricing_model,
      license: draft.license,
      creator_id: userId ?? 'anonymous',
      creator_handle: null,
      runtime_compatibility: ['anthropic_opus_4.7', 'anthropic_sonnet_4.6'],
      languages_supported: ['en', 'id'],
      target_market: null,
    });
    setSkillPackage(pkg);
  };

  return (
    <>
      <h2 className="creator-wizard-heading">Preview</h2>
      <p className="creator-wizard-sub">
        Local render from the current draft. The server re-validates on
        publish; any server errors will be surfaced on the Submit step.
      </p>

      <div
        className="creator-wizard-preview-card"
        data-testid="preview-card"
        aria-label="Listing preview card"
      >
        <div className="creator-wizard-badge-row">
          {draft.category ? (
            <span className="creator-wizard-badge">
              {CATEGORY_LABELS[draft.category]}
            </span>
          ) : null}
          {draft.subtype ? (
            <span className="creator-wizard-badge">
              {SUBTYPE_LABELS[draft.subtype]}
            </span>
          ) : null}
          <span className="creator-wizard-badge">
            {LICENSE_LABELS[draft.license]}
          </span>
          <span className="creator-wizard-badge">
            {PRICING_MODEL_LABELS[draft.pricing_model]}
          </span>
        </div>
        <h3 style={{ margin: 0 }} data-testid="preview-title">
          {draft.basics.title || '(untitled)'}
        </h3>
        <p style={{ margin: 0, opacity: 0.8 }} data-testid="preview-short">
          {draft.basics.short_description || '(no short description yet)'}
        </p>
        <p style={{ margin: 0 }} data-testid="preview-pricing">
          {fmtPricing(draft.pricing_model, draft.pricing_details)}
        </p>
        <div className="creator-wizard-badge-row" aria-label="Capability tags">
          {draft.basics.capability_tags.map((t) => (
            <span key={t} className="creator-wizard-badge">
              {t}
            </span>
          ))}
        </div>
      </div>

      <div
        className="creator-wizard-preview-card"
        aria-label="Long description preview"
      >
        <h3 style={{ margin: 0 }}>Detail page</h3>
        <pre
          data-testid="preview-long"
          style={{
            whiteSpace: 'pre-wrap',
            margin: 0,
            font: 'inherit',
            opacity: 0.9,
          }}
        >
          {draft.basics.long_description || '(long description required for publish)'}
        </pre>
      </div>

      <div
        className="creator-wizard-preview-card"
        aria-label="Category metadata preview"
      >
        <h3 style={{ margin: 0 }}>Category metadata</h3>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            margin: 0,
            font: 'inherit',
            fontSize: '0.85rem',
            opacity: 0.85,
          }}
          data-testid="preview-metadata"
        >
          {JSON.stringify(draft.category_metadata, null, 2)}
        </pre>
      </div>

      <div
        className="creator-wizard-preview-card"
        aria-label="Sekuri skill package generator"
        data-testid="sekuri-skill-package-generator"
        style={{ borderColor: 'oklch(0.88 0.15 140 / 0.4)' }}
      >
        <header style={sekuriHeaderStyle}>
          <span style={sekuriEyebrowStyle}>NERIUM Marketplace // Sekuri</span>
          <button
            type="button"
            onClick={() => setShowSekuriInfo((v) => !v)}
            aria-label={
              showSekuriInfo
                ? 'Hide Sekuri auto-formatting info'
                : 'Show Sekuri auto-formatting info'
            }
            data-testid="sekuri-info-toggle"
            style={sekuriInfoBtnStyle}
          >
            ?
          </button>
        </header>
        <h3 style={{ margin: 0 }}>Generate Skill Package</h3>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Skill package auto-generated by Sekuri. The wizard form fields are
          wrapped into a SKILL.md frontmatter + body and a metadata.json
          listing record. Ready to drop into the marketplace catalog.
        </p>
        {showSekuriInfo ? (
          <div style={sekuriInfoBoxStyle} data-testid="sekuri-info-content">
            <p style={{ margin: 0 }}>
              Sekuri is the deterministic Builder + Phanes integration layer.
              Classification, template selection, and skill packaging run
              entirely client-side with zero live model invocation. The
              package format mirrors the 3 demo examples staged at
              <code> public/sekuri/skill_examples/</code>.
            </p>
            <p style={sekuriCaptionStyle}>{SEKURI_HONEST_CLAIM_CAPTION}</p>
          </div>
        ) : null}
        <div style={sekuriCtaRowStyle}>
          <button
            type="button"
            className="creator-wizard-btn"
            data-variant="primary"
            onClick={handleGenerate}
            disabled={!canGenerate}
            data-testid="sekuri-generate-button"
          >
            {skillPackage ? 'Regenerate package' : 'Generate skill package'}
          </button>
          {!canGenerate ? (
            <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>
              Title + short description + category + subtype required.
            </span>
          ) : null}
        </div>

        {skillPackage ? (
          <div
            style={sekuriPackagePreviewStyle}
            data-testid="sekuri-package-preview"
          >
            <div style={sekuriPackageMetaRowStyle}>
              <Stat label="Slug" value={skillPackage.slug} />
              <Stat label="Listing id" value={skillPackage.listing_id} />
              <Stat label="Files" value={String(skillPackage.files.length)} />
              <Stat
                label="Generated"
                value={skillPackage.generated_at.replace('T', ' ').replace(/\..*$/, ' UTC')}
              />
            </div>
            <div style={sekuriDownloadsRowStyle}>
              <button
                type="button"
                className="creator-wizard-btn"
                onClick={() =>
                  downloadBlob(
                    skillPackage.manifestBlob,
                    skillPackage.manifestFilename,
                  )
                }
                data-testid="sekuri-download-manifest"
              >
                Download {skillPackage.manifestFilename}
              </button>
              <button
                type="button"
                className="creator-wizard-btn"
                onClick={() =>
                  downloadBlob(skillPackage.skillMdBlob, 'SKILL.md')
                }
                data-testid="sekuri-download-skill-md"
              >
                Download SKILL.md
              </button>
              <button
                type="button"
                className="creator-wizard-btn"
                onClick={() =>
                  downloadBlob(skillPackage.metadataJsonBlob, 'metadata.json')
                }
                data-testid="sekuri-download-metadata"
              >
                Download metadata.json
              </button>
            </div>
            {skillPackage.files.map((f) => (
              <details
                key={f.path}
                style={sekuriFileBlockStyle}
                data-testid={`sekuri-file-${f.path.replace(/\W/g, '-')}`}
              >
                <summary style={sekuriFileSummaryStyle}>{f.path}</summary>
                <pre style={sekuriFileContentStyle}>{f.content}</pre>
              </details>
            ))}
            <p style={sekuriCaptionStyle}>{SEKURI_HONEST_CLAIM_CAPTION}</p>
          </div>
        ) : null}
      </div>

      <aside
        className="creator-wizard-preview-card"
        aria-label="Featured Sekuri skill examples"
        data-testid="sekuri-featured-examples"
      >
        <h3 style={{ margin: 0 }}>Featured examples</h3>
        <p style={{ margin: 0, opacity: 0.75, fontSize: '0.85rem' }}>
          Pre-baked demo skills shipped at
          <code> public/sekuri/skill_examples/</code>. Click a card to preview
          the SKILL.md template pattern in a new tab.
        </p>
        <div style={sekuriExamplesGridStyle}>
          {FEATURED_EXAMPLES.map((ex) => (
            <a
              key={ex.slug}
              href={`/sekuri/skill_examples/${ex.slug}.skills/SKILL.md`}
              target="_blank"
              rel="noopener noreferrer"
              style={sekuriExampleCardStyle}
              data-testid={`sekuri-example-${ex.slug}`}
            >
              <div className="creator-wizard-badge-row">
                <span className="creator-wizard-badge">{ex.category}</span>
                <span className="creator-wizard-badge">{ex.price_label}</span>
              </div>
              <strong style={{ fontSize: '0.95rem' }}>{ex.title}</strong>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                {ex.description}
              </span>
              <div className="creator-wizard-badge-row">
                {ex.tags.slice(0, 4).map((t) => (
                  <span key={t} className="creator-wizard-badge">
                    {t}
                  </span>
                ))}
              </div>
            </a>
          ))}
        </div>
      </aside>

      <div
        className="creator-wizard-preview-card"
        aria-label="Publish readiness"
      >
        <h3 style={{ margin: 0 }}>Publish readiness</h3>
        {validation.ok ? (
          <p data-testid="preview-readiness-ok">
            Draft looks good. The server may add additional checks at submit.
          </p>
        ) : (
          <ul data-testid="preview-readiness-issues">
            {validation.issues.map((i, idx) => (
              <li key={idx} className="creator-wizard-error">
                <code>{i.field}</code>: {i.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="creator-wizard-footer">
        <button
          type="button"
          className="creator-wizard-btn"
          onClick={retreat}
          data-testid="wizard-back"
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
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Inline helpers + styles for the Sekuri block. These are scoped tightly to
// the preview step so the rest of the wizard CSS stays unchanged.
// ---------------------------------------------------------------------------

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={statBoxStyle}>
      <span style={statLabelStyle}>{label}</span>
      <span style={statValueStyle}>{value}</span>
    </div>
  );
}

const sekuriHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const sekuriEyebrowStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'oklch(0.88 0.15 140)',
};

const sekuriInfoBtnStyle: React.CSSProperties = {
  appearance: 'none',
  width: '24px',
  height: '24px',
  borderRadius: '999px',
  background: 'transparent',
  border: '1px solid oklch(0.32 0.02 250)',
  color: 'inherit',
  fontSize: '0.85rem',
  cursor: 'pointer',
};

const sekuriInfoBoxStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem',
  borderRadius: '0.4rem',
  border: '1px dashed oklch(0.32 0.02 250)',
  background: 'oklch(0.18 0.015 250 / 0.55)',
  fontSize: '0.85rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
};

const sekuriCaptionStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.78rem',
  letterSpacing: '0.02em',
  color: 'oklch(0.78 0.13 150)',
};

const sekuriCtaRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  flexWrap: 'wrap',
};

const sekuriPackagePreviewStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem',
  padding: '0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid oklch(0.88 0.15 140 / 0.4)',
  background: 'oklch(0.18 0.015 250 / 0.45)',
};

const sekuriPackageMetaRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: '0.4rem',
};

const sekuriDownloadsRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.4rem',
};

const sekuriFileBlockStyle: React.CSSProperties = {
  borderRadius: '0.4rem',
  border: '1px solid oklch(0.32 0.02 250)',
  background: 'oklch(0.10 0.012 250 / 0.7)',
  padding: '0.5rem 0.7rem',
};

const sekuriFileSummaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  fontSize: '0.85rem',
  letterSpacing: '0.04em',
};

const sekuriFileContentStyle: React.CSSProperties = {
  marginTop: '0.5rem',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontSize: '0.78rem',
  opacity: 0.92,
  maxHeight: '320px',
  overflow: 'auto',
};

const sekuriExamplesGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '0.55rem',
};

const sekuriExampleCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  padding: '0.7rem',
  borderRadius: '0.4rem',
  border: '1px solid oklch(0.32 0.02 250)',
  background: 'oklch(0.10 0.012 250 / 0.6)',
  textDecoration: 'none',
  color: 'inherit',
};

const statBoxStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.15rem',
  padding: '0.45rem 0.6rem',
  borderRadius: '0.35rem',
  background: 'oklch(0.10 0.012 250 / 0.6)',
  border: '1px solid oklch(0.32 0.02 250)',
};

const statLabelStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  opacity: 0.7,
};

const statValueStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  fontFamily:
    "var(--font-jetbrains-mono, 'JetBrains Mono', 'Courier New', monospace)",
  wordBreak: 'break-all',
};
