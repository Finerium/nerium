//
// app/creator/submit/page.tsx
//
// Creator submission entry. Server component that renders the harness
// chrome plus the client wizard shell. Phanes W2 NP P1 S2.
//
// Route layout
//   /creator/submit                  - create a fresh draft
//   /creator/submit?listing_id=...   - resume an existing draft
//

import { HarnessShell } from '../../_harness/HarnessShell';
import { WizardShell } from './wizard-shell';
import './wizard.css';

interface SubmitPageProps {
  searchParams: Promise<{ listing_id?: string }>;
}

export default async function CreatorSubmitPage({ searchParams }: SubmitPageProps) {
  const params = await searchParams;
  const listing_id = typeof params.listing_id === 'string' ? params.listing_id : null;
  return (
    <HarnessShell
      heading="Creator submission"
      sub="Publish an agent, content pack, infrastructure artifact, asset, service, dataset, or Premium listing. Seven steps. Drafts autosave every two seconds."
    >
      <WizardShell initial_listing_id={listing_id} />
    </HarnessShell>
  );
}
