'use client';

//
// step-basics.tsx
//
// Step 2 - title, short and long description, slug, capability tags. Slug
// auto-fills from title unless the creator has manually edited it.
//

import { useEffect, useState } from 'react';

import { basicsStepSchema, deriveSlug } from '../lib/schema';
import { useWizardStore } from '../lib/store';

export function StepBasics() {
  const draft = useWizardStore((s) => s.draft);
  const patchBasics = useWizardStore((s) => s.patchBasics);
  const advance = useWizardStore((s) => s.advance);
  const retreat = useWizardStore((s) => s.retreat);
  const field_errors = useWizardStore((s) => s.field_errors);
  const setFieldErrors = useWizardStore((s) => s.setFieldErrors);

  const [slug_touched, setSlugTouched] = useState(
    Boolean(draft.basics.slug?.length),
  );
  const [tag_input, setTagInput] = useState('');

  // Auto-derive slug from title until the creator types in the slug field.
  useEffect(() => {
    if (slug_touched) return;
    const next = draft.basics.title ? deriveSlug(draft.basics.title) : '';
    if (next !== draft.basics.slug) patchBasics({ slug: next });
  }, [draft.basics.title, draft.basics.slug, slug_touched, patchBasics]);

  const handleNext = () => {
    const parse = basicsStepSchema.safeParse(draft.basics);
    if (!parse.success) {
      const errs: Record<string, string> = {};
      for (const i of parse.error.issues)
        errs[i.path.join('.') || 'basics'] = i.message;
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    advance();
  };

  const addTag = () => {
    const t = tag_input.trim();
    if (!t) return;
    if (draft.basics.capability_tags.includes(t)) {
      setTagInput('');
      return;
    }
    if (draft.basics.capability_tags.length >= 32) return;
    patchBasics({ capability_tags: [...draft.basics.capability_tags, t] });
    setTagInput('');
  };

  const removeTag = (t: string) => {
    patchBasics({
      capability_tags: draft.basics.capability_tags.filter((x) => x !== t),
    });
  };

  return (
    <>
      <h2 className="creator-wizard-heading">Basics</h2>
      <p className="creator-wizard-sub">
        Listing title, two descriptions (card-sized plus detail page markdown),
        a slug, and up to 32 capability tags. long_description is required to
        publish but not to save the draft.
      </p>

      <label className="creator-wizard-field">
        <span className="creator-wizard-field-label">Title</span>
        <input
          type="text"
          className="creator-wizard-input"
          data-testid="basics-title"
          value={draft.basics.title}
          maxLength={200}
          onChange={(e) => patchBasics({ title: e.target.value })}
        />
        {field_errors['title'] ? (
          <span className="creator-wizard-error">{field_errors['title']}</span>
        ) : null}
      </label>

      <label className="creator-wizard-field">
        <span className="creator-wizard-field-label">
          Short description (max 280 characters)
        </span>
        <input
          type="text"
          className="creator-wizard-input"
          data-testid="basics-short-description"
          value={draft.basics.short_description}
          maxLength={280}
          onChange={(e) =>
            patchBasics({ short_description: e.target.value })
          }
        />
      </label>

      <label className="creator-wizard-field">
        <span className="creator-wizard-field-label">
          Long description (markdown)
        </span>
        <textarea
          className="creator-wizard-textarea"
          data-testid="basics-long-description"
          value={draft.basics.long_description}
          rows={8}
          onChange={(e) =>
            patchBasics({ long_description: e.target.value })
          }
        />
        <span className="creator-wizard-help">
          Markdown is rendered on the detail page. Required at publish.
        </span>
      </label>

      <label className="creator-wizard-field">
        <span className="creator-wizard-field-label">Slug</span>
        <input
          type="text"
          className="creator-wizard-input"
          data-testid="basics-slug"
          value={draft.basics.slug}
          maxLength={60}
          onChange={(e) => {
            setSlugTouched(true);
            patchBasics({ slug: e.target.value.toLowerCase() });
          }}
        />
        <span className="creator-wizard-help">
          lowercase kebab-case, max 60 chars. The server re-derives from the
          title if you leave this blank.
        </span>
        {field_errors['slug'] ? (
          <span className="creator-wizard-error">{field_errors['slug']}</span>
        ) : null}
      </label>

      <div className="creator-wizard-field">
        <span className="creator-wizard-field-label">Capability tags</span>
        <div className="creator-wizard-badge-row" data-testid="basics-tags">
          {draft.basics.capability_tags.map((t) => (
            <button
              key={t}
              type="button"
              className="creator-wizard-badge"
              onClick={() => removeTag(t)}
              aria-label={`Remove tag ${t}`}
            >
              {t} x
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="text"
            className="creator-wizard-input"
            value={tag_input}
            maxLength={40}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Type a tag and press Enter"
            data-testid="basics-tag-input"
          />
          <button
            type="button"
            className="creator-wizard-btn"
            onClick={addTag}
            disabled={!tag_input.trim()}
          >
            Add
          </button>
        </div>
      </div>

      <div className="creator-wizard-footer">
        <button
          type="button"
          className="creator-wizard-btn"
          data-testid="wizard-back"
          onClick={retreat}
        >
          Back
        </button>
        <div className="creator-wizard-footer-actions">
          <button
            type="button"
            className="creator-wizard-btn"
            data-variant="primary"
            data-testid="wizard-next"
            onClick={handleNext}
            disabled={!draft.basics.title.trim()}
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}
