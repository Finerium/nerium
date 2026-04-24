'use client';

//
// step-pricing.tsx
//
// Step 4 - pricing model + pricing_details shape + license. Switching the
// model resets pricing_details to an empty object so stale keys do not
// trip Pydantic's extra='forbid' on the next publish validation.
//

import { useMemo } from 'react';

import {
  LICENSE_LABELS,
  PRICING_MODEL_LABELS,
  licenseEnum,
  pricingModelEnum,
  type License,
  type PricingModel,
} from '../lib/category-schemas';
import { pricingStepSchemaFor } from '../lib/schema';
import { useWizardStore } from '../lib/store';

const PRICING_MODELS: PricingModel[] = pricingModelEnum.options as PricingModel[];
const LICENSES: License[] = licenseEnum.options as License[];

function initialDetailsFor(model: PricingModel): Record<string, unknown> {
  switch (model) {
    case 'free':
      return {};
    case 'one_time':
    case 'subscription_monthly':
    case 'subscription_yearly':
      return { amount_cents: 0, currency: 'USD' };
    case 'usage_based':
      return { meter: 'per_execution', rate_cents: 0, currency: 'USD' };
    case 'tiered':
      return {
        tiers: [{ name: 'Starter', max_units: 1000, amount_cents: 0 }],
        currency: 'USD',
      };
  }
}

export function StepPricing() {
  const draft = useWizardStore((s) => s.draft);
  const patchDraft = useWizardStore((s) => s.patchDraft);
  const advance = useWizardStore((s) => s.advance);
  const retreat = useWizardStore((s) => s.retreat);
  const field_errors = useWizardStore((s) => s.field_errors);
  const setFieldErrors = useWizardStore((s) => s.setFieldErrors);

  const details = draft.pricing_details;

  const parsed = useMemo(() => {
    const schema = pricingStepSchemaFor(draft.pricing_model);
    return schema.safeParse(details);
  }, [draft.pricing_model, details]);

  const setModel = (model: PricingModel) => {
    if (model === draft.pricing_model) return;
    patchDraft({
      pricing_model: model,
      pricing_details: initialDetailsFor(model),
    });
  };

  const updateDetails = (patch: Record<string, unknown>) => {
    patchDraft({ pricing_details: { ...details, ...patch } });
  };

  const handleNext = () => {
    const parse = pricingStepSchemaFor(draft.pricing_model).safeParse(details);
    if (!parse.success) {
      const errs: Record<string, string> = {};
      for (const i of parse.error.issues)
        errs['pricing_details.' + i.path.join('.')] = i.message;
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    advance();
  };

  return (
    <>
      <h2 className="creator-wizard-heading">Pricing and license</h2>
      <p className="creator-wizard-sub">
        Pick how buyers pay, then declare the license. Pricing details shape
        changes with the model - switching wipes details so stale keys do not
        leak through.
      </p>

      <fieldset className="creator-wizard-grid" aria-label="Pricing model">
        {PRICING_MODELS.map((m) => (
          <button
            key={m}
            type="button"
            className="creator-wizard-option"
            data-selected={draft.pricing_model === m}
            data-testid={`pricing-model-${m}`}
            onClick={() => setModel(m)}
          >
            <span className="creator-wizard-option-title">
              {PRICING_MODEL_LABELS[m]}
            </span>
          </button>
        ))}
      </fieldset>

      {draft.pricing_model !== 'free' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {(draft.pricing_model === 'one_time' ||
            draft.pricing_model === 'subscription_monthly' ||
            draft.pricing_model === 'subscription_yearly') && (
            <>
              <label className="creator-wizard-field">
                <span className="creator-wizard-field-label">
                  Amount (cents)
                </span>
                <input
                  type="number"
                  className="creator-wizard-input"
                  data-testid="pricing-amount-cents"
                  value={Number((details as Record<string, unknown>).amount_cents) || 0}
                  min={0}
                  onChange={(e) =>
                    updateDetails({ amount_cents: Number(e.target.value) })
                  }
                />
              </label>
              <label className="creator-wizard-field">
                <span className="creator-wizard-field-label">
                  Currency (ISO 4217)
                </span>
                <input
                  type="text"
                  maxLength={3}
                  className="creator-wizard-input"
                  data-testid="pricing-currency"
                  value={String((details as Record<string, unknown>).currency ?? 'USD')}
                  onChange={(e) =>
                    updateDetails({ currency: e.target.value.toUpperCase() })
                  }
                />
              </label>
            </>
          )}

          {draft.pricing_model === 'usage_based' && (
            <>
              <label className="creator-wizard-field">
                <span className="creator-wizard-field-label">Meter</span>
                <select
                  className="creator-wizard-select"
                  data-testid="pricing-meter"
                  value={String((details as Record<string, unknown>).meter ?? 'per_execution')}
                  onChange={(e) => updateDetails({ meter: e.target.value })}
                >
                  <option value="per_execution">per_execution</option>
                  <option value="per_token">per_token</option>
                  <option value="per_minute">per_minute</option>
                </select>
              </label>
              <label className="creator-wizard-field">
                <span className="creator-wizard-field-label">
                  Rate (cents per unit)
                </span>
                <input
                  type="number"
                  className="creator-wizard-input"
                  data-testid="pricing-rate-cents"
                  value={Number((details as Record<string, unknown>).rate_cents) || 0}
                  min={0}
                  onChange={(e) =>
                    updateDetails({ rate_cents: Number(e.target.value) })
                  }
                />
              </label>
              <label className="creator-wizard-field">
                <span className="creator-wizard-field-label">
                  Currency (ISO 4217)
                </span>
                <input
                  type="text"
                  maxLength={3}
                  className="creator-wizard-input"
                  data-testid="pricing-currency"
                  value={String((details as Record<string, unknown>).currency ?? 'USD')}
                  onChange={(e) =>
                    updateDetails({ currency: e.target.value.toUpperCase() })
                  }
                />
              </label>
              <label className="creator-wizard-field">
                <span className="creator-wizard-field-label">
                  Free tier units (optional)
                </span>
                <input
                  type="number"
                  className="creator-wizard-input"
                  data-testid="pricing-free-tier"
                  value={
                    typeof (details as Record<string, unknown>).free_tier_units === 'number'
                      ? Number((details as Record<string, unknown>).free_tier_units)
                      : ''
                  }
                  min={0}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = { ...details } as Record<string, unknown>;
                    if (v === '') delete next.free_tier_units;
                    else next.free_tier_units = Number(v);
                    patchDraft({ pricing_details: next });
                  }}
                />
              </label>
            </>
          )}

          {draft.pricing_model === 'tiered' && (
            <TieredEditor
              value={details as Record<string, unknown>}
              onChange={(next) => patchDraft({ pricing_details: next })}
            />
          )}
        </div>
      ) : null}

      {!parsed.success ? (
        <div className="creator-wizard-field">
          <span className="creator-wizard-field-label">Pricing issues</span>
          <ul>
            {parsed.error.issues.map((i, idx) => (
              <li key={idx} className="creator-wizard-error">
                <code>{i.path.join('.') || '(root)'}</code>: {i.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h3 className="creator-wizard-heading" style={{ fontSize: '1.1rem' }}>
        License
      </h3>
      <fieldset className="creator-wizard-grid" aria-label="License">
        {LICENSES.map((lic) => (
          <button
            key={lic}
            type="button"
            className="creator-wizard-option"
            data-selected={draft.license === lic}
            data-testid={`license-${lic}`}
            onClick={() => patchDraft({ license: lic })}
          >
            <span className="creator-wizard-option-title">
              {LICENSE_LABELS[lic]}
            </span>
          </button>
        ))}
      </fieldset>

      {Object.entries(field_errors).length > 0 ? (
        <div className="creator-wizard-field">
          <ul>
            {Object.entries(field_errors).map(([k, v]) => (
              <li key={k} className="creator-wizard-error">
                <code>{k}</code>: {v}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
            onClick={handleNext}
            data-testid="wizard-next"
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}

function TieredEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const tiers = Array.isArray(value.tiers) ? (value.tiers as Record<string, unknown>[]) : [];
  const setTier = (idx: number, patch: Record<string, unknown>) => {
    const next = tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    onChange({ ...value, tiers: next });
  };
  const addTier = () => {
    const next = [...tiers, { name: '', max_units: 1, amount_cents: 0 }];
    onChange({ ...value, tiers: next });
  };
  const removeTier = (idx: number) => {
    const next = tiers.filter((_, i) => i !== idx);
    onChange({ ...value, tiers: next });
  };
  return (
    <>
      <label className="creator-wizard-field">
        <span className="creator-wizard-field-label">Currency (ISO 4217)</span>
        <input
          type="text"
          maxLength={3}
          className="creator-wizard-input"
          data-testid="pricing-currency"
          value={String(value.currency ?? 'USD')}
          onChange={(e) => onChange({ ...value, currency: e.target.value.toUpperCase() })}
        />
      </label>
      {tiers.map((t, idx) => (
        <fieldset
          key={idx}
          style={{
            display: 'grid',
            gap: '0.5rem',
            gridTemplateColumns: 'repeat(3, 1fr) auto',
            alignItems: 'end',
          }}
        >
          <label className="creator-wizard-field">
            <span className="creator-wizard-field-label">Name</span>
            <input
              type="text"
              className="creator-wizard-input"
              data-testid={`tier-${idx}-name`}
              value={String(t.name ?? '')}
              onChange={(e) => setTier(idx, { name: e.target.value })}
            />
          </label>
          <label className="creator-wizard-field">
            <span className="creator-wizard-field-label">Max units</span>
            <input
              type="number"
              className="creator-wizard-input"
              data-testid={`tier-${idx}-max`}
              value={Number(t.max_units ?? 0)}
              min={1}
              onChange={(e) =>
                setTier(idx, { max_units: Number(e.target.value) })
              }
            />
          </label>
          <label className="creator-wizard-field">
            <span className="creator-wizard-field-label">Amount cents</span>
            <input
              type="number"
              className="creator-wizard-input"
              data-testid={`tier-${idx}-amount`}
              value={Number(t.amount_cents ?? 0)}
              min={0}
              onChange={(e) =>
                setTier(idx, { amount_cents: Number(e.target.value) })
              }
            />
          </label>
          <button
            type="button"
            className="creator-wizard-btn"
            onClick={() => removeTier(idx)}
          >
            Remove
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="creator-wizard-btn"
        onClick={addTier}
        data-testid="tier-add"
      >
        Add tier
      </button>
    </>
  );
}
