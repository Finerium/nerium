'use client';

//
// step-category.tsx
//
// Step 1 - pick a top-level category, then pick a subtype. Two-pass layout:
// the grid on the left shows the seven categories; selecting one reveals
// the subtype options for that category. Advances the wizard once both
// are chosen.
//

import { useMemo } from 'react';

import {
  ALLOWED_SUBTYPES,
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
  SUBTYPE_LABELS,
  categoryEnum,
  type Category,
  type Subtype,
} from '../lib/category-schemas';
import { categoryStepSchema } from '../lib/schema';
import { useWizardStore } from '../lib/store';

const CATEGORIES: Category[] = categoryEnum.options as Category[];

export function StepCategory() {
  const draft = useWizardStore((s) => s.draft);
  const patchDraft = useWizardStore((s) => s.patchDraft);
  const advance = useWizardStore((s) => s.advance);
  const setFieldErrors = useWizardStore((s) => s.setFieldErrors);
  const field_errors = useWizardStore((s) => s.field_errors);

  const subtypes = useMemo<Subtype[]>(
    () => (draft.category ? [...ALLOWED_SUBTYPES[draft.category]] : []),
    [draft.category],
  );

  const handleCategory = (c: Category) => {
    const current_sub = draft.subtype;
    const next_sub =
      current_sub && ALLOWED_SUBTYPES[c].includes(current_sub)
        ? current_sub
        : null;
    patchDraft({ category: c, subtype: next_sub });
  };

  const handleSubtype = (s: Subtype) => {
    patchDraft({ subtype: s });
  };

  const handleNext = () => {
    const parse = categoryStepSchema.safeParse({
      category: draft.category,
      subtype: draft.subtype,
    });
    if (!parse.success) {
      const errs: Record<string, string> = {};
      for (const i of parse.error.issues)
        errs[i.path.join('.')] = i.message;
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    advance();
  };

  return (
    <>
      <h2 className="creator-wizard-heading">Pick a category</h2>
      <p className="creator-wizard-sub">
        Category drives which metadata fields show up next and which pricing
        models make sense. You can change this later, but only before publish.
      </p>

      <fieldset
        className="creator-wizard-grid"
        aria-label="Categories"
        data-testid="category-grid"
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            className="creator-wizard-option"
            data-selected={draft.category === cat}
            data-testid={`category-option-${cat}`}
            onClick={() => handleCategory(cat)}
          >
            <span className="creator-wizard-option-title">
              {CATEGORY_LABELS[cat]}
            </span>
            <span className="creator-wizard-option-sub">
              {CATEGORY_DESCRIPTIONS[cat]}
            </span>
          </button>
        ))}
      </fieldset>

      {draft.category ? (
        <>
          <h3 className="creator-wizard-heading" style={{ fontSize: '1.1rem' }}>
            Pick a subtype for {CATEGORY_LABELS[draft.category]}
          </h3>
          <fieldset
            className="creator-wizard-grid"
            aria-label="Subtypes"
            data-testid="subtype-grid"
          >
            {subtypes.map((st) => (
              <button
                key={st}
                type="button"
                className="creator-wizard-option"
                data-selected={draft.subtype === st}
                data-testid={`subtype-option-${st}`}
                onClick={() => handleSubtype(st)}
              >
                <span className="creator-wizard-option-title">
                  {SUBTYPE_LABELS[st]}
                </span>
              </button>
            ))}
          </fieldset>
        </>
      ) : null}

      {field_errors['category'] ? (
        <p className="creator-wizard-error">{field_errors['category']}</p>
      ) : null}
      {field_errors['subtype'] ? (
        <p className="creator-wizard-error">{field_errors['subtype']}</p>
      ) : null}

      <div className="creator-wizard-footer">
        <span className="creator-wizard-help">
          {draft.category && draft.subtype
            ? 'Ready. Click Next to continue.'
            : 'Pick both a category and a subtype to continue.'}
        </span>
        <div className="creator-wizard-footer-actions">
          <button
            type="button"
            className="creator-wizard-btn"
            data-variant="primary"
            data-testid="wizard-next"
            onClick={handleNext}
            disabled={!draft.category || !draft.subtype}
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}
