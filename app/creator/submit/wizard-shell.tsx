'use client';

//
// wizard-shell.tsx
//
// Client-side top-level shell for the creator submission wizard. Hydrates
// the Zustand store, boots autosave, renders the active step, and handles
// global navigation (back/next, reset, publish redirect).
//

import { useEffect, useMemo, useRef, useState } from 'react';

import { STEP_IDS, STEP_LABELS, type StepId } from './lib/schema';
import { useWizardStore } from './lib/store';
import {
  AUTOSAVE_DEBOUNCE_MS,
  createAutosaveController,
  isDraftSavable,
} from './lib/autosave';

import { StepCategory } from './steps/step-category';
import { StepBasics } from './steps/step-basics';
import { StepMetadata } from './steps/step-metadata';
import { StepPricing } from './steps/step-pricing';
import { StepAssets } from './steps/step-assets';
import { StepPreview } from './steps/step-preview';
import { StepSubmit } from './steps/step-submit';

export interface WizardShellProps {
  initial_listing_id: string | null;
}

// The wizard does not yet own user authentication; Aether's cookie is
// attached by same-origin fetch. A stable per-browser synthetic id keeps
// the localStorage namespace deterministic for the demo surface and
// Playwright fixtures.
function synthUserId(): string {
  if (typeof window === 'undefined') return 'anonymous';
  try {
    const key = 'nerium.creator.submit.synth_user';
    let v = window.localStorage.getItem(key);
    if (!v) {
      v =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `synth_${Date.now().toString(36)}`;
      window.localStorage.setItem(key, v);
    }
    return v;
  } catch {
    return 'anonymous';
  }
}

function stepComponent(step: StepId) {
  switch (step) {
    case 'category':
      return <StepCategory />;
    case 'basics':
      return <StepBasics />;
    case 'metadata':
      return <StepMetadata />;
    case 'pricing':
      return <StepPricing />;
    case 'assets':
      return <StepAssets />;
    case 'preview':
      return <StepPreview />;
    case 'submit':
      return <StepSubmit />;
  }
}

export function WizardShell({ initial_listing_id }: WizardShellProps) {
  const hydrate = useWizardStore((s) => s.hydrate);
  const step = useWizardStore((s) => s.step);
  const draft = useWizardStore((s) => s.draft);
  const save_state = useWizardStore((s) => s.save_state);
  const save_error = useWizardStore((s) => s.save_error);
  const listing_id = useWizardStore((s) => s.listing_id);
  const last_edited_at = useWizardStore((s) => s.last_edited_at);

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    hydrate({ user_id: synthUserId(), listing_id: initial_listing_id });
    setHydrated(true);
  }, [hydrate, initial_listing_id]);

  const controllerRef = useRef<ReturnType<typeof createAutosaveController> | null>(
    null,
  );
  useEffect(() => {
    if (!hydrated) return;
    controllerRef.current = createAutosaveController(
      {
        getDraft: () => useWizardStore.getState().draft,
        getListingId: () => useWizardStore.getState().listing_id,
        setListingId: (id) => useWizardStore.getState().setListingId(id),
        setSaveState: (s, err) => useWizardStore.getState().setSaveState(s, err),
      },
      AUTOSAVE_DEBOUNCE_MS,
    );
    return () => controllerRef.current?.cancel();
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !controllerRef.current) return;
    if (!isDraftSavable(draft)) return;
    controllerRef.current.trigger();
  }, [draft, hydrated, last_edited_at]);

  const stepperItems = useMemo(
    () =>
      STEP_IDS.map((id, idx) => ({
        id,
        label: STEP_LABELS[id],
        active: id === step,
        complete: STEP_IDS.indexOf(step) > idx,
      })),
    [step],
  );

  return (
    <section className="creator-wizard-shell" aria-label="Creator submission wizard">
      <nav className="creator-wizard-stepper" aria-label="Wizard progress">
        {stepperItems.map((item) => (
          <span
            key={item.id}
            className="creator-wizard-step-pip"
            data-active={item.active}
            data-complete={item.complete}
          >
            {item.label}
          </span>
        ))}
      </nav>

      <div className="creator-wizard-body" data-testid="creator-wizard-body">
        {!hydrated ? (
          <p className="creator-wizard-help">Loading draft...</p>
        ) : (
          stepComponent(step)
        )}
      </div>

      <footer className="creator-wizard-footer">
        <span
          className="creator-wizard-save-indicator"
          data-state={save_state}
          data-testid="creator-wizard-save-indicator"
        >
          {save_state === 'idle' && listing_id
            ? `Draft saved (id ${listing_id.slice(0, 8)}...)`
            : null}
          {save_state === 'idle' && !listing_id ? 'Draft not yet saved.' : null}
          {save_state === 'saving' ? 'Saving draft...' : null}
          {save_state === 'saved'
            ? `Draft saved${listing_id ? ` (id ${listing_id.slice(0, 8)}...)` : ''}.`
            : null}
          {save_state === 'error'
            ? `Autosave failed: ${save_error ?? 'unknown error'}`
            : null}
          {save_state === 'offline' ? 'Offline. Draft kept locally.' : null}
        </span>
      </footer>
    </section>
  );
}
