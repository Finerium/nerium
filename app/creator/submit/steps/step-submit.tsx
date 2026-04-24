'use client';

//
// step-submit.tsx
//
// Final step. Shows a confirmation summary, warns about the status flip,
// and fires POST /v1/marketplace/listings/{id}/publish. On 422 with RFC
// 7807 errors the per-field messages surface below the submit button and
// the wizard stays on this step so the creator can walk back.
//

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { ApiProblemError, createListing, publishListing } from '../lib/api';
import { toCreateBody, validateForPublish } from '../lib/schema';
import { useWizardStore } from '../lib/store';

export function StepSubmit() {
  const router = useRouter();
  const draft = useWizardStore((s) => s.draft);
  const listing_id = useWizardStore((s) => s.listing_id);
  const setListingId = useWizardStore((s) => s.setListingId);
  const reset = useWizardStore((s) => s.reset);
  const retreat = useWizardStore((s) => s.retreat);

  const [submitting, setSubmitting] = useState(false);
  const [server_issues, setServerIssues] = useState<
    { field: string; code: string; message: string }[] | null
  >(null);
  const [generic_error, setGenericError] = useState<string | null>(null);
  const [published_id, setPublishedId] = useState<string | null>(null);

  const client_validation = validateForPublish(draft);

  const handleSubmit = async () => {
    if (!client_validation.ok) return;
    setSubmitting(true);
    setServerIssues(null);
    setGenericError(null);
    try {
      let id = listing_id;
      if (!id) {
        const row = await createListing(toCreateBody(draft));
        id = row.id;
        setListingId(row.id);
      }
      const published = await publishListing(id);
      setPublishedId(published.id);
      reset();
      router.push(
        `/marketplace/listings/${published.id}?published=1`,
      );
    } catch (err) {
      if (err instanceof ApiProblemError) {
        if (err.problem.errors && err.problem.errors.length > 0) {
          setServerIssues(err.problem.errors);
        } else {
          setGenericError(err.problem.detail ?? err.problem.title ?? 'publish failed');
        }
      } else {
        setGenericError(
          err instanceof Error ? err.message : 'unknown publish error',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <h2 className="creator-wizard-heading">Submit</h2>
      <p className="creator-wizard-sub">
        Publish flips the listing from draft to published. Version history
        snapshots the current shape. Premium listings are blocked until the
        Hemera flag is flipped on post-GA.
      </p>

      <div className="creator-wizard-preview-card" aria-label="Submit summary">
        <h3 style={{ margin: 0 }}>Summary</h3>
        <p data-testid="submit-summary-title">
          Title: <strong>{draft.basics.title || '(untitled)'}</strong>
        </p>
        <p data-testid="submit-summary-category">
          Category: {draft.category ?? '(none)'} / {draft.subtype ?? '(none)'}
        </p>
        <p data-testid="submit-summary-pricing">
          Pricing: {draft.pricing_model} / license {draft.license}
        </p>
        <p data-testid="submit-summary-assets">
          Assets: {draft.asset_refs.length} ref(s), thumbnail{' '}
          {draft.thumbnail_r2_key ? 'set' : 'none'}
        </p>
      </div>

      {!client_validation.ok ? (
        <div
          className="creator-wizard-preview-card"
          aria-label="Pre-submit issues"
        >
          <h3 style={{ margin: 0 }}>Please resolve before submitting</h3>
          <ul data-testid="submit-client-issues">
            {client_validation.issues.map((i, idx) => (
              <li key={idx} className="creator-wizard-error">
                <code>{i.field}</code>: {i.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {server_issues ? (
        <div
          className="creator-wizard-preview-card"
          aria-label="Server validation errors"
        >
          <h3 style={{ margin: 0 }}>Server rejected publish</h3>
          <ul data-testid="submit-server-issues">
            {server_issues.map((i, idx) => (
              <li key={idx} className="creator-wizard-error">
                <code>{i.field}</code>: {i.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {generic_error ? (
        <p className="creator-wizard-error" data-testid="submit-generic-error">
          {generic_error}
        </p>
      ) : null}

      {published_id ? (
        <p data-testid="submit-success">
          Published. Redirecting to listing {published_id}...
        </p>
      ) : null}

      <div className="creator-wizard-footer">
        <button
          type="button"
          className="creator-wizard-btn"
          onClick={retreat}
          data-testid="wizard-back"
          disabled={submitting}
        >
          Back
        </button>
        <div className="creator-wizard-footer-actions">
          <button
            type="button"
            className="creator-wizard-btn"
            data-variant="primary"
            onClick={handleSubmit}
            data-testid="wizard-submit"
            disabled={!client_validation.ok || submitting}
          >
            {submitting ? 'Publishing...' : 'Publish listing'}
          </button>
        </div>
      </div>
    </>
  );
}
