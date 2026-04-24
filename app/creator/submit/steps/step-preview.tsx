'use client';

//
// step-preview.tsx
//
// Step 6 - render a local projection of what the public listing card +
// detail page will look like. Drives exclusively off the draft state in
// the store; the server has not yet been asked to render anything.
//

import {
  CATEGORY_LABELS,
  LICENSE_LABELS,
  PRICING_MODEL_LABELS,
  SUBTYPE_LABELS,
} from '../lib/category-schemas';
import { validateForPublish } from '../lib/schema';
import { useWizardStore } from '../lib/store';

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

export function StepPreview() {
  const draft = useWizardStore((s) => s.draft);
  const advance = useWizardStore((s) => s.advance);
  const retreat = useWizardStore((s) => s.retreat);

  const validation = validateForPublish(draft);

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
