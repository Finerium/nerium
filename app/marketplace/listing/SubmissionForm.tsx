'use client';

//
// SubmissionForm.tsx (Eos P3a).
//
// Conforms to:
// - docs/contracts/listing_submission.contract.md v0.1.0 (SubmissionFormProps, step progression)
// - docs/contracts/marketplace_listing.contract.md v0.1.0 (AgentListing schema)
// - docs/contracts/design_tokens.contract.md v0.1.0 (styling via Tailwind tokens + var())
//
// Multi-step wizard that walks a creator through: identity gate, metadata,
// capabilities, pricing, living-template parameters, preview. Terminal
// publish_result step handed off to PublishConfirm.tsx by the parent mount
// after onPublish resolves. Pure presentation: props-in, callbacks-out. No
// network calls, no direct catalog writes.
//
// Edit buffer is Zustand-backed per soft guidance; source of truth remains
// props.draft.partial_listing. Zustand holds in-flight text typed by the
// creator that hasn't been committed via onStepComplete yet; on Next click we
// validate the buffer, compute a patch, and surface it to the parent.
// Re-initialisation on draft_id change keeps "resume draft" workflows clean.
//

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { create } from 'zustand';

import {
  CAPABILITY_TAGS,
  PRICING_TIERS,
  VENDOR_ORIGINS,
  type AgentListing,
  type CapabilityTag,
  type LivingTemplateParam,
  type PricingTier,
  type UsageUnit,
  type VendorOrigin,
} from '../schema/listing.schema';
import type {
  FieldError,
  SubmissionDraft,
  SubmissionFormProps,
  SubmissionStep,
  SubmissionStepKey,
} from './submission_types';
import {
  STEP_HELP,
  STEP_LABEL,
  VISIBLE_STEP_ORDER,
  DuplicateSlugError,
  ValidationError,
} from './submission_types';
import {
  errorsToFieldMap,
  validateFullListing,
  validateForStep,
} from './validation';
import PreviewCard from './PreviewCard';

import './styles.css';

type EditBufferState = {
  display_name: string;
  slug: string;
  short_description: string;
  long_description_markdown: string;
  vendor_origin: VendorOrigin | '';
  capability_tags: CapabilityTag[];
  pricing_tier: PricingTier | '';
  per_execution_unit: UsageUnit;
  low_usd: string;
  high_usd: string;
  living_template_params: LivingTemplateParam[];
  touched: Record<string, boolean>;
  hydrateFromDraft: (draft: SubmissionDraft) => void;
  setTouched: (field: string) => void;
  toggleCapability: (tag: CapabilityTag) => void;
  addLivingParam: () => void;
  updateLivingParam: (index: number, patch: Partial<LivingTemplateParam>) => void;
  removeLivingParam: (index: number) => void;
  reset: () => void;
};

const DEFAULT_USAGE_UNIT: UsageUnit = 'task';

function slugifyFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const useEditBufferStore = create<EditBufferState>((set, get) => ({
  display_name: '',
  slug: '',
  short_description: '',
  long_description_markdown: '',
  vendor_origin: '',
  capability_tags: [],
  pricing_tier: '',
  per_execution_unit: DEFAULT_USAGE_UNIT,
  low_usd: '0',
  high_usd: '0',
  living_template_params: [],
  touched: {},
  hydrateFromDraft: (draft: SubmissionDraft) => {
    const p = draft.partial_listing;
    set({
      display_name: p.display_name ?? '',
      slug: p.slug ?? '',
      short_description: p.short_description ?? '',
      long_description_markdown: p.long_description_markdown ?? '',
      vendor_origin: (p.vendor_origin as VendorOrigin | undefined) ?? '',
      capability_tags: [...(p.capability_tags ?? [])],
      pricing_tier: (p.pricing_tier as PricingTier | undefined) ?? '',
      per_execution_unit: p.usage_cost_hint?.per_execution_unit ?? DEFAULT_USAGE_UNIT,
      low_usd: String(p.usage_cost_hint?.estimate_range.low_usd ?? 0),
      high_usd: String(p.usage_cost_hint?.estimate_range.high_usd ?? 0),
      living_template_params: p.living_template_params
        ? p.living_template_params.map((param) => ({ ...param }))
        : [],
      touched: {},
    });
  },
  setTouched: (field: string) => {
    set((state) => ({ touched: { ...state.touched, [field]: true } }));
  },
  toggleCapability: (tag: CapabilityTag) => {
    const current = get().capability_tags;
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : current.length >= 5
        ? current
        : [...current, tag];
    set({ capability_tags: next });
  },
  addLivingParam: () => {
    const current = get().living_template_params;
    const defaultParam: LivingTemplateParam = {
      key: `param_${current.length + 1}`,
      label: '',
      kind: 'string',
      default_value: '',
      description: '',
    };
    set({ living_template_params: [...current, defaultParam] });
  },
  updateLivingParam: (index, patch) => {
    const current = get().living_template_params;
    const next = current.map((param, i) => {
      if (i !== index) return param;
      const merged: LivingTemplateParam = { ...param, ...patch };
      if (patch.kind !== undefined && patch.kind !== param.kind) {
        merged.default_value = defaultForKind(merged.kind, merged.enum_values);
        if (merged.kind !== 'enum') {
          delete (merged as { enum_values?: string[] }).enum_values;
        }
      }
      return merged;
    });
    set({ living_template_params: next });
  },
  removeLivingParam: (index) => {
    set((state) => ({
      living_template_params: state.living_template_params.filter((_, i) => i !== index),
    }));
  },
  reset: () => {
    set({
      display_name: '',
      slug: '',
      short_description: '',
      long_description_markdown: '',
      vendor_origin: '',
      capability_tags: [],
      pricing_tier: '',
      per_execution_unit: DEFAULT_USAGE_UNIT,
      low_usd: '0',
      high_usd: '0',
      living_template_params: [],
      touched: {},
    });
  },
}));

function defaultForKind(
  kind: LivingTemplateParam['kind'],
  enum_values?: string[],
): string | number | boolean {
  switch (kind) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'enum':
      return enum_values && enum_values.length > 0 ? enum_values[0] : '';
    default:
      return '';
  }
}

function bufferToMetadata(state: EditBufferState): Partial<AgentListing> {
  return {
    display_name: state.display_name.trim(),
    slug: state.slug.trim(),
    short_description: state.short_description.trim(),
    long_description_markdown: state.long_description_markdown.trim(),
    vendor_origin: state.vendor_origin === '' ? undefined : state.vendor_origin,
  };
}

function bufferToCapabilities(state: EditBufferState): Partial<AgentListing> {
  return { capability_tags: state.capability_tags };
}

function bufferToPricing(state: EditBufferState): Partial<AgentListing> {
  const low = Number(state.low_usd);
  const high = Number(state.high_usd);
  return {
    pricing_tier: state.pricing_tier === '' ? undefined : state.pricing_tier,
    usage_cost_hint: {
      per_execution_unit: state.per_execution_unit,
      estimate_range: {
        low_usd: Number.isFinite(low) ? low : 0,
        high_usd: Number.isFinite(high) ? high : 0,
      },
    },
  };
}

function bufferToLivingTemplate(state: EditBufferState): Partial<AgentListing> {
  if (state.living_template_params.length === 0) {
    return { living_template_params: undefined };
  }
  return { living_template_params: state.living_template_params.map((p) => ({ ...p })) };
}

function assembleListing(
  draft: SubmissionDraft,
  buffer: EditBufferState,
): Partial<AgentListing> {
  const now = new Date().toISOString();
  const listing_id = draft.partial_listing.listing_id ?? newListingId();
  const trust_pointer = draft.partial_listing.trust_score_pointer ??
    `registry://trust/${draft.creator_identity_id}`;
  const audit_summary = draft.partial_listing.audit_summary ?? 'New listing, no audit events yet.';
  const vendor_origin = buffer.vendor_origin === '' ? undefined : buffer.vendor_origin;
  const pricing_tier = buffer.pricing_tier === '' ? undefined : buffer.pricing_tier;
  return {
    listing_id,
    slug: buffer.slug.trim(),
    display_name: buffer.display_name.trim(),
    short_description: buffer.short_description.trim(),
    long_description_markdown: buffer.long_description_markdown.trim(),
    creator_identity_id: draft.creator_identity_id,
    vendor_origin,
    capability_tags: [...buffer.capability_tags],
    pricing_tier,
    usage_cost_hint: {
      per_execution_unit: buffer.per_execution_unit,
      estimate_range: {
        low_usd: Number(buffer.low_usd) || 0,
        high_usd: Number(buffer.high_usd) || 0,
      },
    },
    living_template_params:
      buffer.living_template_params.length > 0
        ? buffer.living_template_params.map((p) => ({ ...p }))
        : undefined,
    trust_score_pointer: trust_pointer,
    audit_summary,
    created_at: draft.partial_listing.created_at ?? now,
    updated_at: now,
    visibility: 'public',
  };
}

function finalizeListing(partial: Partial<AgentListing>): AgentListing {
  return partial as AgentListing;
}

// For read-only preview rendering before publish: fills missing values with
// placeholders so the card still renders legibly while the creator completes
// earlier steps. Never passed to onPublish; only to PreviewCard with
// mode="preview". Strict validation runs via validateFullListing separately.
function assembleForPreview(draft: SubmissionDraft, buffer: EditBufferState): AgentListing {
  const partial = assembleListing(draft, buffer);
  return {
    listing_id: partial.listing_id ?? 'preview-pending',
    slug: partial.slug ?? '',
    display_name: partial.display_name ?? '',
    short_description: partial.short_description ?? '',
    long_description_markdown: partial.long_description_markdown ?? '',
    creator_identity_id: partial.creator_identity_id ?? draft.creator_identity_id,
    vendor_origin: (partial.vendor_origin ?? 'other') as VendorOrigin,
    capability_tags: partial.capability_tags ?? [],
    pricing_tier: (partial.pricing_tier ?? 'free') as PricingTier,
    usage_cost_hint: partial.usage_cost_hint ?? {
      per_execution_unit: 'task',
      estimate_range: { low_usd: 0, high_usd: 0 },
    },
    living_template_params: partial.living_template_params,
    trust_score_pointer: partial.trust_score_pointer ?? '',
    audit_summary: partial.audit_summary ?? '',
    created_at: partial.created_at ?? new Date().toISOString(),
    updated_at: partial.updated_at ?? new Date().toISOString(),
    visibility: partial.visibility ?? 'draft',
  };
}

function newListingId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `listing_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildFieldErrors(errors: ReadonlyArray<FieldError>): Record<string, string> {
  return errorsToFieldMap(errors);
}

function humanizeVendorOrigin(value: VendorOrigin): string {
  const overrides: Partial<Record<VendorOrigin, string>> = {
    hand_coded: 'Hand coded',
    claude_code: 'Claude Code',
    gpt_store: 'GPT Store',
    mcp_hub: 'MCP Hub',
    huggingface_space: 'Hugging Face Space',
    langchain_hub: 'LangChain Hub',
    vercel_gallery: 'Vercel Gallery',
    cloudflare_marketplace: 'Cloudflare Marketplace',
    nerium_builder: 'NERIUM Builder',
    claude_skills: 'Claude Skills',
  };
  if (overrides[value]) return overrides[value] as string;
  return value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function humanizeCapability(value: CapabilityTag): string {
  return value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function humanizePricingTier(value: PricingTier): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function SubmissionForm(props: SubmissionFormProps): ReactElement {
  const { draft, onStepComplete, onSaveDraft, onPublish, onCancel } = props;

  const buffer = useEditBufferStore();
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>(draft.validation_errors);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [publishError, setPublishError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const autoSlugRef = useRef<boolean>(!draft.partial_listing.slug);
  const headingId = useId();

  useEffect(() => {
    buffer.hydrateFromDraft(draft);
    autoSlugRef.current = !draft.partial_listing.slug;
    setFieldErrors(draft.validation_errors);
    setPublishError(null);
  }, [draft.draft_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoSlugRef.current) {
      const suggested = slugifyFromName(buffer.display_name);
      if (suggested !== buffer.slug) {
        useEditBufferStore.setState({ slug: suggested });
      }
    }
  }, [buffer.display_name]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentStep = draft.current_step;
  const stepIndex = useMemo(() => {
    if (currentStep === 'identity_check') return -1;
    if (currentStep === 'publish_result') return VISIBLE_STEP_ORDER.length;
    return VISIBLE_STEP_ORDER.indexOf(currentStep);
  }, [currentStep]);

  const patchForStep = useCallback(
    (step: SubmissionStep): Partial<AgentListing> => {
      switch (step) {
        case 'metadata_entry':
          return bufferToMetadata(buffer);
        case 'capability_selection':
          return bufferToCapabilities(buffer);
        case 'pricing_configuration':
          return bufferToPricing(buffer);
        case 'living_template_definition':
          return bufferToLivingTemplate(buffer);
        case 'preview_confirm':
          return {};
        default:
          return {};
      }
    },
    [buffer],
  );

  const handleAdvance = useCallback(
    async (step: SubmissionStep) => {
      if (isSubmitting) return;
      setIsSubmitting(true);
      setPublishError(null);
      try {
        const patchedDraft: SubmissionDraft = {
          ...draft,
          partial_listing: { ...draft.partial_listing, ...patchForStep(step) },
        };
        const result = validateForStep(step, patchedDraft);
        if (!result.valid) {
          const errs = buildFieldErrors(result.errors);
          setFieldErrors(errs);
          focusFirstError(formRef.current, errs);
          return;
        }
        setFieldErrors({});
        await onStepComplete(step, patchForStep(step));
      } catch (err) {
        if (err instanceof ValidationError) {
          setFieldErrors(err.field_errors);
          focusFirstError(formRef.current, err.field_errors);
        } else {
          setPublishError(err instanceof Error ? err.message : 'Step failed. Please try again.');
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [draft, isSubmitting, onStepComplete, patchForStep],
  );

  const handleSaveDraft = useCallback(async () => {
    if (saveStatus === 'saving') return;
    setSaveStatus('saving');
    try {
      const merged: SubmissionDraft = {
        ...draft,
        partial_listing: {
          ...draft.partial_listing,
          ...bufferToMetadata(buffer),
          ...bufferToCapabilities(buffer),
          ...bufferToPricing(buffer),
          ...bufferToLivingTemplate(buffer),
        },
      };
      await onSaveDraft(merged);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2_000);
    } catch {
      setSaveStatus('failed');
      setTimeout(() => setSaveStatus('idle'), 3_000);
    }
  }, [draft, buffer, onSaveDraft, saveStatus]);

  const handlePublish = useCallback(async () => {
    if (isSubmitting) return;
    const partial = assembleListing(draft, buffer);
    const result = validateFullListing(partial);
    if (!result.valid) {
      const errs = buildFieldErrors(result.errors);
      setFieldErrors(errs);
      focusFirstError(formRef.current, errs);
      return;
    }
    setIsSubmitting(true);
    setPublishError(null);
    try {
      await onPublish(finalizeListing(partial));
    } catch (err) {
      if (err instanceof DuplicateSlugError || (err instanceof Error && err.name === 'DuplicateSlugError')) {
        setFieldErrors({ slug: 'This slug is already taken. Pick another.' });
        focusFirstError(formRef.current, { slug: 'duplicate' });
      } else {
        setPublishError(err instanceof Error ? err.message : 'Publish failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [draft, buffer, isSubmitting, onPublish]);

  const handleFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (currentStep === 'preview_confirm') {
        void handlePublish();
      } else if (currentStep !== 'identity_check' && currentStep !== 'publish_result') {
        void handleAdvance(currentStep);
      }
    },
    [currentStep, handleAdvance, handlePublish],
  );

  const hasErrors = Object.keys(fieldErrors).length > 0;

  return (
    <section
      className="eos-submission-root"
      aria-labelledby={headingId}
      data-step={currentStep}
    >
      <header className="eos-submission-header">
        <h1 id={headingId} className="eos-submission-title">
          List an agent on NERIUM Marketplace
        </h1>
        <p className="eos-submission-subtitle">
          Creators ship cross-vendor, buyers pay per use. Cross-post friendly, vendor-lock free.
        </p>
      </header>

      <StepIndicator currentStep={currentStep} stepIndex={stepIndex} />

      {currentStep === 'identity_check' ? (
        <IdentityGate
          creator_identity_id={draft.creator_identity_id}
          onAdvance={() => void handleAdvance('identity_check')}
          isSubmitting={isSubmitting}
        />
      ) : currentStep === 'publish_result' ? (
        <div className="eos-step-body" role="status">
          <p>Listing published. Parent flow hands off to PublishConfirm.</p>
        </div>
      ) : (
        <form
          ref={formRef}
          className="eos-submission-form"
          onSubmit={handleFormSubmit}
          noValidate
        >
          {hasErrors && (
            <div
              className="eos-error-summary"
              role="alert"
              aria-live="assertive"
              tabIndex={-1}
            >
              <strong>Fix these before continuing.</strong>
              <ul>
                {Object.entries(fieldErrors).map(([field, message]) => (
                  <li key={field}>{message}</li>
                ))}
              </ul>
            </div>
          )}

          <AnimatePresence mode="wait">
            {currentStep === 'metadata_entry' && (
              <MetadataStep key="metadata" errors={fieldErrors} buffer={buffer} />
            )}
            {currentStep === 'capability_selection' && (
              <CapabilitiesStep key="capabilities" errors={fieldErrors} buffer={buffer} />
            )}
            {currentStep === 'pricing_configuration' && (
              <PricingStep key="pricing" errors={fieldErrors} buffer={buffer} />
            )}
            {currentStep === 'living_template_definition' && (
              <LivingTemplateStep key="living" errors={fieldErrors} buffer={buffer} />
            )}
            {currentStep === 'preview_confirm' && (
              <PreviewStep
                key="preview"
                listing={assembleForPreview(draft, buffer)}
                errors={fieldErrors}
                publishError={publishError}
              />
            )}
          </AnimatePresence>

          <div className="eos-submission-footer">
            <button
              type="button"
              className="eos-btn eos-btn-ghost"
              onClick={onCancel}
              disabled={isSubmitting}
              aria-label="Cancel submission and return to Marketplace"
            >
              Cancel
            </button>
            <div className="eos-submission-footer-spacer" />
            <button
              type="button"
              className="eos-btn eos-btn-secondary"
              onClick={handleSaveDraft}
              disabled={saveStatus === 'saving' || isSubmitting}
              aria-live="polite"
              aria-label="Save draft to resume later"
            >
              {saveStatus === 'saving'
                ? 'Saving...'
                : saveStatus === 'saved'
                  ? 'Draft saved'
                  : saveStatus === 'failed'
                    ? 'Save failed, retry'
                    : 'Save draft'}
            </button>
            <button
              type="submit"
              className="eos-btn eos-btn-primary"
              disabled={isSubmitting}
              aria-label={
                currentStep === 'preview_confirm' ? 'Publish listing to Marketplace' : 'Advance to next step'
              }
            >
              {currentStep === 'preview_confirm'
                ? isSubmitting
                  ? 'Publishing...'
                  : 'Publish to Marketplace'
                : isSubmitting
                  ? 'Advancing...'
                  : 'Next'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function focusFirstError(formEl: HTMLFormElement | null, errors: Record<string, string>): void {
  if (!formEl) return;
  const firstField = Object.keys(errors)[0];
  if (!firstField) return;
  const root = firstField.split('.')[0];
  const target = formEl.querySelector<HTMLElement>(`[data-field="${root}"]`);
  if (target) {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const focusable = target.matches('input, select, textarea, button')
      ? target
      : target.querySelector<HTMLElement>('input, select, textarea, button');
    focusable?.focus();
  }
}

interface StepIndicatorProps {
  currentStep: SubmissionStep;
  stepIndex: number;
}

function StepIndicator({ currentStep, stepIndex }: StepIndicatorProps): ReactElement {
  return (
    <nav className="eos-stepper" aria-label="Submission progress">
      <ol className="eos-stepper-list">
        {VISIBLE_STEP_ORDER.map((step, index) => {
          const key = step as SubmissionStepKey;
          const isActive = step === currentStep;
          const isCompleted = stepIndex > index;
          return (
            <li
              key={step}
              className="eos-stepper-item"
              data-active={isActive || undefined}
              data-completed={isCompleted || undefined}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className="eos-stepper-number" aria-hidden="true">
                {index + 1}
              </span>
              <span className="eos-stepper-label">{STEP_LABEL[key]}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

interface IdentityGateProps {
  creator_identity_id: string;
  onAdvance: () => void;
  isSubmitting: boolean;
}

function IdentityGate({ creator_identity_id, onAdvance, isSubmitting }: IdentityGateProps): ReactElement {
  const hasIdentity = creator_identity_id.trim().length > 0;
  return (
    <div className="eos-step-body" data-step="identity_check">
      <h2 className="eos-step-heading">Connect your creator identity</h2>
      <p className="eos-step-help">
        Listings carry a verifiable Registry identity so buyers know who they are paying.
      </p>
      {hasIdentity ? (
        <div className="eos-identity-ready" role="status">
          <p>
            Identity <code>{creator_identity_id}</code> is ready. Continue to metadata entry.
          </p>
          <button
            type="button"
            className="eos-btn eos-btn-primary"
            onClick={onAdvance}
            disabled={isSubmitting}
            aria-label="Begin metadata entry"
          >
            Begin submission
          </button>
        </div>
      ) : (
        <div className="eos-identity-missing" role="alert">
          <p>
            No creator identity is attached to this session. Complete Registry onboarding first, then return
            here to list.
          </p>
          <a className="eos-link" href="/registry/onboarding" aria-label="Open Registry onboarding">
            Open Registry onboarding
          </a>
        </div>
      )}
    </div>
  );
}

interface StepContentProps {
  errors: Record<string, string>;
  buffer: EditBufferState;
}

function MetadataStep({ errors, buffer }: StepContentProps): ReactElement {
  return (
    <motion.div
      className="eos-step-body"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      data-step="metadata_entry"
    >
      <h2 className="eos-step-heading">{STEP_LABEL.metadata_entry}</h2>
      <p className="eos-step-help">{STEP_HELP.metadata_entry}</p>

      <div className="eos-field" data-field="display_name">
        <label htmlFor="eos-display-name" className="eos-label">
          Display name
        </label>
        <input
          id="eos-display-name"
          type="text"
          className="eos-input"
          value={buffer.display_name}
          maxLength={80}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            useEditBufferStore.setState({ display_name: e.target.value })
          }
          aria-describedby={errors.display_name ? 'eos-error-display-name' : 'eos-help-display-name'}
          aria-invalid={Boolean(errors.display_name) || undefined}
          required
        />
        <p id="eos-help-display-name" className="eos-help">
          The public name buyers see. 3 to 80 characters.
        </p>
        {errors.display_name && (
          <p id="eos-error-display-name" className="eos-error">
            {errors.display_name}
          </p>
        )}
      </div>

      <div className="eos-field" data-field="slug">
        <label htmlFor="eos-slug" className="eos-label">
          Slug
        </label>
        <input
          id="eos-slug"
          type="text"
          className="eos-input"
          value={buffer.slug}
          maxLength={60}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            useEditBufferStore.setState({ slug: e.target.value });
          }}
          aria-describedby={errors.slug ? 'eos-error-slug' : 'eos-help-slug'}
          aria-invalid={Boolean(errors.slug) || undefined}
          required
        />
        <p id="eos-help-slug" className="eos-help">
          Lowercase, hyphen-separated. Shows up in the listing URL. Auto-filled from display name.
        </p>
        {errors.slug && (
          <p id="eos-error-slug" className="eos-error">
            {errors.slug}
          </p>
        )}
      </div>

      <div className="eos-field" data-field="short_description">
        <label htmlFor="eos-short-desc" className="eos-label">
          Short description
        </label>
        <textarea
          id="eos-short-desc"
          className="eos-textarea"
          value={buffer.short_description}
          maxLength={280}
          rows={2}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            useEditBufferStore.setState({ short_description: e.target.value })
          }
          aria-describedby={errors.short_description ? 'eos-error-short-desc' : 'eos-help-short-desc'}
          aria-invalid={Boolean(errors.short_description) || undefined}
          required
        />
        <p id="eos-help-short-desc" className="eos-help">
          Ships above the fold on browse cards. {280 - buffer.short_description.length} characters remaining.
        </p>
        {errors.short_description && (
          <p id="eos-error-short-desc" className="eos-error">
            {errors.short_description}
          </p>
        )}
      </div>

      <div className="eos-field" data-field="long_description_markdown">
        <label htmlFor="eos-long-desc" className="eos-label">
          Long description (Markdown)
        </label>
        <textarea
          id="eos-long-desc"
          className="eos-textarea eos-textarea-tall"
          value={buffer.long_description_markdown}
          rows={6}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            useEditBufferStore.setState({ long_description_markdown: e.target.value })
          }
          aria-describedby={
            errors.long_description_markdown ? 'eos-error-long-desc' : 'eos-help-long-desc'
          }
          aria-invalid={Boolean(errors.long_description_markdown) || undefined}
          required
        />
        <p id="eos-help-long-desc" className="eos-help">
          Walk a buyer through what this agent does, where it shines, and its limits. Markdown supported.
        </p>
        {errors.long_description_markdown && (
          <p id="eos-error-long-desc" className="eos-error">
            {errors.long_description_markdown}
          </p>
        )}
      </div>

      <div className="eos-field" data-field="vendor_origin">
        <label htmlFor="eos-vendor-origin" className="eos-label">
          Vendor origin
        </label>
        <select
          id="eos-vendor-origin"
          className="eos-input"
          value={buffer.vendor_origin}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            useEditBufferStore.setState({ vendor_origin: e.target.value as VendorOrigin })
          }
          aria-describedby={errors.vendor_origin ? 'eos-error-vendor-origin' : 'eos-help-vendor-origin'}
          aria-invalid={Boolean(errors.vendor_origin) || undefined}
          required
        >
          <option value="" disabled>
            Pick a vendor origin
          </option>
          {VENDOR_ORIGINS.map((origin) => (
            <option key={origin} value={origin}>
              {humanizeVendorOrigin(origin)}
            </option>
          ))}
        </select>
        <p id="eos-help-vendor-origin" className="eos-help">
          Which platform built this agent. NERIUM is cross-vendor by design; tell buyers the truth.
        </p>
        {errors.vendor_origin && (
          <p id="eos-error-vendor-origin" className="eos-error">
            {errors.vendor_origin}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function CapabilitiesStep({ errors, buffer }: StepContentProps): ReactElement {
  return (
    <motion.div
      className="eos-step-body"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      data-step="capability_selection"
    >
      <h2 className="eos-step-heading">{STEP_LABEL.capability_selection}</h2>
      <p className="eos-step-help">{STEP_HELP.capability_selection}</p>

      <fieldset className="eos-field" data-field="capability_tags">
        <legend className="eos-label">Pick 1 to 5 tags</legend>
        <div className="eos-chip-group" role="group" aria-describedby="eos-help-capability-tags">
          {CAPABILITY_TAGS.map((tag) => {
            const selected = buffer.capability_tags.includes(tag);
            const atMax = buffer.capability_tags.length >= 5 && !selected;
            return (
              <button
                key={tag}
                type="button"
                className="eos-chip"
                onClick={() => useEditBufferStore.getState().toggleCapability(tag)}
                aria-pressed={selected}
                aria-disabled={atMax || undefined}
                disabled={atMax}
              >
                {humanizeCapability(tag)}
              </button>
            );
          })}
        </div>
        <p id="eos-help-capability-tags" className="eos-help">
          Selected {buffer.capability_tags.length} of 5.
        </p>
        {errors.capability_tags && (
          <p className="eos-error" role="alert">
            {errors.capability_tags}
          </p>
        )}
      </fieldset>
    </motion.div>
  );
}

function PricingStep({ errors, buffer }: StepContentProps): ReactElement {
  return (
    <motion.div
      className="eos-step-body"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      data-step="pricing_configuration"
    >
      <h2 className="eos-step-heading">{STEP_LABEL.pricing_configuration}</h2>
      <p className="eos-step-help">{STEP_HELP.pricing_configuration}</p>

      <fieldset className="eos-field" data-field="pricing_tier">
        <legend className="eos-label">Pricing tier</legend>
        <div className="eos-radio-group" role="radiogroup" aria-describedby="eos-help-pricing-tier">
          {PRICING_TIERS.map((tier) => {
            const checked = buffer.pricing_tier === tier;
            return (
              <label
                key={tier}
                className="eos-radio-card"
                data-checked={checked || undefined}
              >
                <input
                  type="radio"
                  name="pricing_tier"
                  value={tier}
                  checked={checked}
                  onChange={() => useEditBufferStore.setState({ pricing_tier: tier })}
                />
                <span className="eos-radio-card-label">{humanizePricingTier(tier)}</span>
                <span className="eos-radio-card-help">{pricingTierBlurb(tier)}</span>
              </label>
            );
          })}
        </div>
        <p id="eos-help-pricing-tier" className="eos-help">
          Tier labels align with the Banking pillar so usage billing matches.
        </p>
        {errors.pricing_tier && (
          <p className="eos-error" role="alert">
            {errors.pricing_tier}
          </p>
        )}
      </fieldset>

      <div className="eos-field" data-field="usage_cost_hint.per_execution_unit">
        <label htmlFor="eos-per-unit" className="eos-label">
          Per-execution unit
        </label>
        <select
          id="eos-per-unit"
          className="eos-input"
          value={buffer.per_execution_unit}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            useEditBufferStore.setState({ per_execution_unit: e.target.value as UsageUnit })
          }
          aria-describedby={
            errors['usage_cost_hint.per_execution_unit']
              ? 'eos-error-per-unit'
              : 'eos-help-per-unit'
          }
          aria-invalid={Boolean(errors['usage_cost_hint.per_execution_unit']) || undefined}
        >
          <option value="token">per token</option>
          <option value="request">per request</option>
          <option value="minute">per minute</option>
          <option value="task">per task</option>
        </select>
        <p id="eos-help-per-unit" className="eos-help">
          How the Banking meter attributes usage.
        </p>
        {errors['usage_cost_hint.per_execution_unit'] && (
          <p id="eos-error-per-unit" className="eos-error">
            {errors['usage_cost_hint.per_execution_unit']}
          </p>
        )}
      </div>

      <div className="eos-cost-range">
        <div className="eos-field" data-field="usage_cost_hint.estimate_range.low_usd">
          <label htmlFor="eos-cost-low" className="eos-label">
            Low estimate (USD)
          </label>
          <input
            id="eos-cost-low"
            type="number"
            step="0.001"
            min="0"
            className="eos-input"
            value={buffer.low_usd}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              useEditBufferStore.setState({ low_usd: e.target.value })
            }
            aria-describedby={
              errors['usage_cost_hint.estimate_range.low_usd'] ? 'eos-error-cost-low' : undefined
            }
            aria-invalid={
              Boolean(errors['usage_cost_hint.estimate_range.low_usd']) || undefined
            }
          />
          {errors['usage_cost_hint.estimate_range.low_usd'] && (
            <p id="eos-error-cost-low" className="eos-error">
              {errors['usage_cost_hint.estimate_range.low_usd']}
            </p>
          )}
        </div>
        <div className="eos-field" data-field="usage_cost_hint.estimate_range.high_usd">
          <label htmlFor="eos-cost-high" className="eos-label">
            High estimate (USD)
          </label>
          <input
            id="eos-cost-high"
            type="number"
            step="0.001"
            min="0"
            className="eos-input"
            value={buffer.high_usd}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              useEditBufferStore.setState({ high_usd: e.target.value })
            }
            aria-describedby={
              errors['usage_cost_hint.estimate_range.high_usd'] ? 'eos-error-cost-high' : undefined
            }
            aria-invalid={
              Boolean(errors['usage_cost_hint.estimate_range.high_usd']) || undefined
            }
          />
          {errors['usage_cost_hint.estimate_range.high_usd'] && (
            <p id="eos-error-cost-high" className="eos-error">
              {errors['usage_cost_hint.estimate_range.high_usd']}
            </p>
          )}
        </div>
      </div>
      {errors['usage_cost_hint.estimate_range'] && (
        <p className="eos-error" role="alert">
          {errors['usage_cost_hint.estimate_range']}
        </p>
      )}
    </motion.div>
  );
}

function pricingTierBlurb(tier: PricingTier): string {
  switch (tier) {
    case 'free':
      return 'Free listing. No billing events emitted.';
    case 'cheap':
      return 'Lightweight agents. Roughly under 1 cent per task.';
    case 'mid':
      return 'Mid-complexity automation. A few cents to a quarter per task.';
    case 'premium':
      return 'Heavy Opus or multi-agent runs. Dollars per task.';
    default:
      return '';
  }
}

function LivingTemplateStep({ errors, buffer }: StepContentProps): ReactElement {
  const params = buffer.living_template_params;
  return (
    <motion.div
      className="eos-step-body"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      data-step="living_template_definition"
    >
      <h2 className="eos-step-heading">{STEP_LABEL.living_template_definition}</h2>
      <p className="eos-step-help">{STEP_HELP.living_template_definition}</p>

      {params.length === 0 ? (
        <div className="eos-empty" role="status">
          <p>No parameters yet. Add one to let buyers remix this agent without rewriting it.</p>
          <p className="eos-help">
            Example: a restaurant automation agent could expose a <code>cuisine</code> parameter so buyers
            pick "padang", "sushi", or "steakhouse" at checkout.
          </p>
        </div>
      ) : (
        <ol className="eos-param-list">
          {params.map((param, index) => (
            <ParamRow
              key={`${param.key}-${index}`}
              index={index}
              param={param}
              errors={errors}
            />
          ))}
        </ol>
      )}

      <button
        type="button"
        className="eos-btn eos-btn-secondary"
        onClick={() => useEditBufferStore.getState().addLivingParam()}
        aria-label="Add a living-template parameter"
      >
        Add parameter
      </button>
    </motion.div>
  );
}

interface ParamRowProps {
  index: number;
  param: LivingTemplateParam;
  errors: Record<string, string>;
}

function ParamRow({ index, param, errors }: ParamRowProps): ReactElement {
  const base = `living_template_params.${index}`;
  const fieldId = `eos-param-${index}`;
  return (
    <li className="eos-param-row" data-field={`living_template_params`}>
      <div className="eos-param-grid">
        <div className="eos-field">
          <label htmlFor={`${fieldId}-key`} className="eos-label">
            Key
          </label>
          <input
            id={`${fieldId}-key`}
            type="text"
            className="eos-input"
            value={param.key}
            onChange={(e) =>
              useEditBufferStore
                .getState()
                .updateLivingParam(index, { key: e.target.value.trim() })
            }
            aria-invalid={Boolean(errors[`${base}.key`]) || undefined}
            aria-describedby={errors[`${base}.key`] ? `${fieldId}-key-err` : undefined}
          />
          {errors[`${base}.key`] && (
            <p id={`${fieldId}-key-err`} className="eos-error">
              {errors[`${base}.key`]}
            </p>
          )}
        </div>
        <div className="eos-field">
          <label htmlFor={`${fieldId}-label`} className="eos-label">
            Label
          </label>
          <input
            id={`${fieldId}-label`}
            type="text"
            className="eos-input"
            value={param.label}
            onChange={(e) =>
              useEditBufferStore.getState().updateLivingParam(index, { label: e.target.value })
            }
            aria-invalid={Boolean(errors[`${base}.label`]) || undefined}
            aria-describedby={errors[`${base}.label`] ? `${fieldId}-label-err` : undefined}
          />
          {errors[`${base}.label`] && (
            <p id={`${fieldId}-label-err`} className="eos-error">
              {errors[`${base}.label`]}
            </p>
          )}
        </div>
        <div className="eos-field">
          <label htmlFor={`${fieldId}-kind`} className="eos-label">
            Kind
          </label>
          <select
            id={`${fieldId}-kind`}
            className="eos-input"
            value={param.kind}
            onChange={(e) =>
              useEditBufferStore
                .getState()
                .updateLivingParam(index, { kind: e.target.value as LivingTemplateParam['kind'] })
            }
            aria-invalid={Boolean(errors[`${base}.kind`]) || undefined}
          >
            <option value="string">string</option>
            <option value="enum">enum</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
          </select>
        </div>
      </div>
      {param.kind === 'enum' && (
        <div className="eos-field">
          <label htmlFor={`${fieldId}-enum`} className="eos-label">
            Enum values (comma separated)
          </label>
          <input
            id={`${fieldId}-enum`}
            type="text"
            className="eos-input"
            value={param.enum_values?.join(', ') ?? ''}
            onChange={(e) => {
              const parts = e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
              useEditBufferStore
                .getState()
                .updateLivingParam(index, { enum_values: parts });
            }}
            aria-invalid={Boolean(errors[`${base}.enum_values`]) || undefined}
            aria-describedby={errors[`${base}.enum_values`] ? `${fieldId}-enum-err` : undefined}
          />
          {errors[`${base}.enum_values`] && (
            <p id={`${fieldId}-enum-err`} className="eos-error">
              {errors[`${base}.enum_values`]}
            </p>
          )}
        </div>
      )}
      <div className="eos-param-grid">
        <div className="eos-field">
          <label htmlFor={`${fieldId}-default`} className="eos-label">
            Default value
          </label>
          {renderDefaultValueInput(param, index, `${fieldId}-default`)}
          {errors[`${base}.default_value`] && (
            <p className="eos-error">{errors[`${base}.default_value`]}</p>
          )}
        </div>
        <div className="eos-field eos-field-span-2">
          <label htmlFor={`${fieldId}-desc`} className="eos-label">
            Description
          </label>
          <input
            id={`${fieldId}-desc`}
            type="text"
            className="eos-input"
            value={param.description}
            onChange={(e) =>
              useEditBufferStore
                .getState()
                .updateLivingParam(index, { description: e.target.value })
            }
            aria-invalid={Boolean(errors[`${base}.description`]) || undefined}
          />
          {errors[`${base}.description`] && (
            <p className="eos-error">{errors[`${base}.description`]}</p>
          )}
        </div>
      </div>
      <div className="eos-param-actions">
        <button
          type="button"
          className="eos-btn eos-btn-ghost"
          onClick={() => useEditBufferStore.getState().removeLivingParam(index)}
          aria-label={`Remove parameter ${param.key}`}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

function renderDefaultValueInput(
  param: LivingTemplateParam,
  index: number,
  inputId: string,
): ReactElement {
  const store = useEditBufferStore.getState();
  switch (param.kind) {
    case 'number':
      return (
        <input
          id={inputId}
          type="number"
          className="eos-input"
          value={typeof param.default_value === 'number' ? param.default_value : 0}
          onChange={(e) =>
            store.updateLivingParam(index, { default_value: Number(e.target.value) })
          }
        />
      );
    case 'boolean':
      return (
        <select
          id={inputId}
          className="eos-input"
          value={String(Boolean(param.default_value))}
          onChange={(e) =>
            store.updateLivingParam(index, { default_value: e.target.value === 'true' })
          }
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    case 'enum':
      return (
        <select
          id={inputId}
          className="eos-input"
          value={String(param.default_value ?? '')}
          onChange={(e) =>
            store.updateLivingParam(index, { default_value: e.target.value })
          }
        >
          <option value="" disabled>
            Pick default
          </option>
          {(param.enum_values ?? []).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      );
    default:
      return (
        <input
          id={inputId}
          type="text"
          className="eos-input"
          value={typeof param.default_value === 'string' ? param.default_value : ''}
          onChange={(e) =>
            store.updateLivingParam(index, { default_value: e.target.value })
          }
        />
      );
  }
}

interface PreviewStepProps {
  listing: AgentListing;
  errors: Record<string, string>;
  publishError: string | null;
}

function PreviewStep({ listing, errors, publishError }: PreviewStepProps): ReactElement {
  return (
    <motion.div
      className="eos-step-body"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      data-step="preview_confirm"
    >
      <h2 className="eos-step-heading">{STEP_LABEL.preview_confirm}</h2>
      <p className="eos-step-help">{STEP_HELP.preview_confirm}</p>

      <PreviewCard listing={listing} mode="preview" />

      {Object.keys(errors).length > 0 && (
        <div className="eos-error-summary" role="alert">
          <strong>Fix these before publishing:</strong>
          <ul>
            {Object.entries(errors).map(([field, message]) => (
              <li key={field}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      {publishError !== null && (
        <p className="eos-error" role="alert">
          {publishError}
        </p>
      )}

      <p className="eos-disclosure" role="note">
        Publish posts this listing to the NERIUM Marketplace prototype only. It is not cross-posted to
        vendor storefronts in hackathon scope.
      </p>
    </motion.div>
  );
}

export type { SubmissionFormProps } from './submission_types';
