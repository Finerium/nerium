'use client';

//
// step-metadata.tsx
//
// Step 3 - per-category metadata. The form shape is derived from the
// zod schema so adding a subtype doesn't require component edits. For
// fields with server-enforced typing we surface specialized controls
// (enums render as selects, UUID fields render as copyable inputs, etc.)
// and fall back to a plain textarea for free-form jsonb (dimensions,
// runtime_requirements, config_schema, issuance_workflow).
//

import { useMemo } from 'react';

import {
  CATEGORY_METADATA_SCHEMAS,
  type Category,
} from '../lib/category-schemas';
import { metadataStepSchemaFor } from '../lib/schema';
import { useWizardStore } from '../lib/store';

type MetaValue = unknown;

type MetaPatch = Record<string, MetaValue>;

function stringifyJson(v: unknown): string {
  if (v === undefined || v === null) return '';
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return '';
  }
}

function parseJsonLoose(raw: string): { ok: boolean; value?: unknown } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false };
  }
}

// Per-category field ordering + control hints. Keep this table tiny; the
// fallback below handles new fields without a schema shape change.
interface FieldHint {
  key: string;
  label: string;
  control: 'text' | 'textarea' | 'number' | 'select' | 'json';
  options?: readonly string[];
  required?: boolean;
  help?: string;
}

const FIELD_HINTS: Record<Category, FieldHint[]> = {
  core_agent: [
    {
      key: 'prompt_artifact_id',
      label: 'Prompt artifact id (UUID)',
      control: 'text',
      required: true,
      help: 'file_storage_manifest id that holds the .md system prompt blob.',
    },
    {
      key: 'runtime_requirements',
      label: 'Runtime requirements (JSON)',
      control: 'json',
      required: true,
      help: 'Free-form dict: model, tools, mcp_servers. Example: { "model": "claude-opus-4-7" }',
    },
    {
      key: 'example_inputs',
      label: 'Example inputs (JSON array)',
      control: 'json',
      help: 'Optional list of dict examples shown on the detail page.',
    },
    {
      key: 'success_criteria',
      label: 'Success criteria',
      control: 'textarea',
      help: 'Optional narrative of a successful run.',
    },
  ],
  content: [
    {
      key: 'content_format',
      label: 'Content format',
      control: 'select',
      required: true,
      options: ['markdown', 'json', 'yaml', 'text', 'mdx'],
    },
    { key: 'language', label: 'Language (BCP 47)', control: 'text' },
    { key: 'word_count', label: 'Word count', control: 'number' },
    { key: 'inline_preview', label: 'Inline preview (max 500)', control: 'textarea' },
  ],
  infrastructure: [
    {
      key: 'platform_compat',
      label: 'Platform compat (JSON array)',
      control: 'json',
      required: true,
      help: 'e.g. ["claude_code", "anthropic_api"]. At least one required.',
    },
    {
      key: 'config_schema',
      label: 'Config schema (JSON)',
      control: 'json',
      help: 'JSON-Schema-style shape of user-provided config.',
    },
    {
      key: 'install_instructions_md',
      label: 'Install instructions (markdown)',
      control: 'textarea',
    },
  ],
  assets: [
    {
      key: 'media_type',
      label: 'Media type',
      control: 'select',
      required: true,
      options: ['image', 'audio', 'video', 'font', '3d_model', 'animation'],
    },
    {
      key: 'file_format',
      label: 'File format',
      control: 'text',
      required: true,
      help: 'e.g. png, mp3, ttf, fbx.',
    },
    {
      key: 'dimensions',
      label: 'Dimensions (JSON)',
      control: 'json',
      help: '{ "width": 256, "height": 256 } for images, { "duration_s": 12 } for audio.',
    },
    { key: 'license_notes', label: 'License notes', control: 'textarea' },
  ],
  services: [
    {
      key: 'service_kind',
      label: 'Service kind',
      control: 'select',
      required: true,
      options: ['custom_build', 'consulting', 'integration', 'training'],
    },
    {
      key: 'delivery_time_days',
      label: 'Delivery time (days)',
      control: 'number',
      required: true,
    },
    {
      key: 'scope_description',
      label: 'Scope description',
      control: 'textarea',
      required: true,
    },
    {
      key: 'included_revisions',
      label: 'Included revisions',
      control: 'number',
    },
    { key: 'sla', label: 'SLA narrative', control: 'textarea' },
  ],
  premium: [
    {
      key: 'premium_kind',
      label: 'Premium kind',
      control: 'select',
      required: true,
      options: [
        'verified_certification',
        'priority_listing',
        'custom_domain_agent',
      ],
    },
    {
      key: 'issuance_workflow',
      label: 'Issuance workflow (JSON)',
      control: 'json',
      help: 'Pending per contract open question 5.',
    },
    { key: 'validity_days', label: 'Validity (days)', control: 'number' },
    { key: 'renewal_policy', label: 'Renewal policy', control: 'textarea' },
  ],
  data: [
    { key: 'size_mb', label: 'Size (MB)', control: 'number', required: true },
    {
      key: 'update_frequency',
      label: 'Update frequency',
      control: 'select',
      required: true,
      options: ['static', 'daily', 'weekly', 'monthly', 'on_demand'],
    },
    {
      key: 'source_attribution',
      label: 'Source attribution',
      control: 'textarea',
      required: true,
    },
    { key: 'row_count', label: 'Row count (datasets)', control: 'number' },
    {
      key: 'schema_json_url',
      label: 'Schema JSON URL',
      control: 'text',
    },
  ],
};

export function StepMetadata() {
  const draft = useWizardStore((s) => s.draft);
  const patchDraft = useWizardStore((s) => s.patchDraft);
  const advance = useWizardStore((s) => s.advance);
  const retreat = useWizardStore((s) => s.retreat);
  const field_errors = useWizardStore((s) => s.field_errors);
  const setFieldErrors = useWizardStore((s) => s.setFieldErrors);

  const category = draft.category;
  const hints = useMemo<FieldHint[]>(
    () => (category ? FIELD_HINTS[category] : []),
    [category],
  );
  const current = draft.category_metadata;

  if (!category) {
    return (
      <>
        <h2 className="creator-wizard-heading">Metadata</h2>
        <p className="creator-wizard-help">
          Pick a category first. Go back to step 1.
        </p>
        <div className="creator-wizard-footer">
          <button
            type="button"
            className="creator-wizard-btn"
            onClick={retreat}
          >
            Back
          </button>
        </div>
      </>
    );
  }

  const update = (patch: MetaPatch) => {
    patchDraft({ category_metadata: { ...current, ...patch } });
  };

  const clearField = (key: string) => {
    const next = { ...current } as Record<string, unknown>;
    delete next[key];
    patchDraft({ category_metadata: next });
  };

  const handleNext = () => {
    const schema = metadataStepSchemaFor(category);
    const parse = schema.safeParse(current);
    if (!parse.success) {
      const errs: Record<string, string> = {};
      for (const i of parse.error.issues)
        errs[i.path.join('.') || 'category_metadata'] = i.message;
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    advance();
  };

  return (
    <>
      <h2 className="creator-wizard-heading">Category metadata</h2>
      <p className="creator-wizard-sub">
        Shape per category per contract Section 3.5. Required fields are
        marked; JSON fields accept compact or pretty JSON.
      </p>

      {hints.map((hint) => {
        const raw = (current as Record<string, unknown>)[hint.key];
        const err = field_errors[hint.key] ?? field_errors['category_metadata.' + hint.key];
        return (
          <label key={hint.key} className="creator-wizard-field">
            <span className="creator-wizard-field-label">
              {hint.label}
              {hint.required ? ' *' : ''}
            </span>
            {hint.control === 'text' ? (
              <input
                type="text"
                className="creator-wizard-input"
                data-testid={`metadata-${hint.key}`}
                value={typeof raw === 'string' ? raw : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') clearField(hint.key);
                  else update({ [hint.key]: v });
                }}
              />
            ) : null}
            {hint.control === 'textarea' ? (
              <textarea
                className="creator-wizard-textarea"
                data-testid={`metadata-${hint.key}`}
                rows={4}
                value={typeof raw === 'string' ? raw : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') clearField(hint.key);
                  else update({ [hint.key]: v });
                }}
              />
            ) : null}
            {hint.control === 'number' ? (
              <input
                type="number"
                className="creator-wizard-input"
                data-testid={`metadata-${hint.key}`}
                value={typeof raw === 'number' ? raw : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') clearField(hint.key);
                  else update({ [hint.key]: Number(v) });
                }}
              />
            ) : null}
            {hint.control === 'select' ? (
              <select
                className="creator-wizard-select"
                data-testid={`metadata-${hint.key}`}
                value={typeof raw === 'string' ? raw : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') clearField(hint.key);
                  else update({ [hint.key]: v });
                }}
              >
                <option value="">Select...</option>
                {(hint.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : null}
            {hint.control === 'json' ? (
              <textarea
                className="creator-wizard-textarea"
                data-testid={`metadata-${hint.key}`}
                rows={5}
                spellCheck={false}
                value={stringifyJson(raw)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v.trim()) {
                    clearField(hint.key);
                    return;
                  }
                  const parsed = parseJsonLoose(v);
                  if (parsed.ok) update({ [hint.key]: parsed.value });
                  else {
                    // Keep the raw text visible; stash in a sibling key
                    // so autosave does not wipe the in-flight JSON. The
                    // downstream advance click re-parses.
                    update({ [hint.key]: v });
                  }
                }}
              />
            ) : null}
            {hint.help ? (
              <span className="creator-wizard-help">{hint.help}</span>
            ) : null}
            {err ? <span className="creator-wizard-error">{err}</span> : null}
          </label>
        );
      })}

      {/* Catch-all: let power users surface unknown keys via a raw JSON
          editor. Backend extra='forbid' will still reject garbage keys,
          but the preview step highlights them before the publish POST. */}
      <details>
        <summary className="creator-wizard-help">Advanced: raw JSON</summary>
        <textarea
          className="creator-wizard-textarea"
          data-testid="metadata-raw-json"
          rows={6}
          spellCheck={false}
          value={stringifyJson(current)}
          onChange={(e) => {
            const parsed = parseJsonLoose(e.target.value);
            if (parsed.ok && parsed.value && typeof parsed.value === 'object')
              patchDraft({
                category_metadata: parsed.value as Record<string, unknown>,
              });
          }}
        />
      </details>

      <CategoryMetadataIssues category={category} current={current} />

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

function CategoryMetadataIssues({
  category,
  current,
}: {
  category: Category;
  current: Record<string, unknown>;
}) {
  const schema = CATEGORY_METADATA_SCHEMAS[category];
  const parse = schema.safeParse(current);
  if (parse.success) return null;
  return (
    <div className="creator-wizard-field">
      <span className="creator-wizard-field-label">Pending issues</span>
      <ul>
        {parse.error.issues.slice(0, 6).map((i, idx) => (
          <li key={idx} className="creator-wizard-error">
            <code>{i.path.join('.') || '(root)'}</code>: {i.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
