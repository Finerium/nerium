# Listing Submission

**Contract Version:** 0.1.0
**Owner Agent(s):** Eos (submission flow component author)
**Consumer Agent(s):** Demeter (ingests validated submissions into catalog), Phoebe (renders creator identity card on preview), Hecate (identity verification side check), Harmonia (aesthetic sweep)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the creator-facing submission flow components (form, validation, preview, publish confirmation) that allow a creator to list their agent on Marketplace, enforcing `marketplace_listing.contract.md` schema at the edge so invalid data never reaches the catalog.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 5 creator pain real-world framing)
- `CLAUDE.md` (root)
- `docs/contracts/marketplace_listing.contract.md` (destination schema)
- `docs/contracts/identity_card.contract.md` (creator identity render on preview)
- `docs/contracts/design_tokens.contract.md` (styling)

## 3. Schema Definition

```typescript
// app/marketplace/listing/submission_types.ts

import type { AgentListing, VendorOrigin, PricingTier, CapabilityTag } from '@/marketplace/schema/listing.schema';

export type SubmissionStep =
  | 'identity_check'
  | 'metadata_entry'
  | 'capability_selection'
  | 'pricing_configuration'
  | 'living_template_definition'
  | 'preview_confirm'
  | 'publish_result';

export interface SubmissionDraft {
  draft_id: string;
  creator_identity_id: string;
  current_step: SubmissionStep;
  partial_listing: Partial<AgentListing>;
  validation_errors: Record<string, string>;
  saved_at: string;                  // ISO-8601 UTC
}

export interface SubmissionFormProps {
  draft: SubmissionDraft;
  onStepComplete: (step: SubmissionStep, patch: Partial<AgentListing>) => Promise<void>;
  onSaveDraft: (draft: SubmissionDraft) => Promise<void>;
  onPublish: (final_listing: AgentListing) => Promise<{ listing_id: string; slug: string }>;
  onCancel: () => void;
}

export interface PreviewCardProps {
  listing: AgentListing;
  mode: 'preview' | 'published';
}

export interface PublishConfirmProps {
  listing_id: string;
  slug: string;
  onViewListing: () => void;
  onNewSubmission: () => void;
}
```

## 4. Interface / API Contract

- `<SubmissionForm>` is a multi-step wizard component implementing the `SubmissionStep` progression. Each step validates its own fields before allowing advance via `onStepComplete`.
- Draft save state persists to SQLite (via `Marketplace/listing/draft_store.ts`) so the creator can resume after reload.
- `onPublish` invokes `MarketplaceCatalog.upsert` with the completed listing and returns the created `listing_id` and `slug`.
- Validation reuses the Zod schema derived from `AgentListing` in `marketplace_listing.contract.md`.

## 5. Event Signatures

- `marketplace.submission.draft_saved` payload: `{ draft_id, current_step }`
- `marketplace.submission.published` payload: `{ listing_id, slug, creator_identity_id }`
- `marketplace.submission.cancelled` payload: `{ draft_id }`

## 6. File Path Convention

- Form root: `app/marketplace/listing/SubmissionForm.tsx`
- Preview: `app/marketplace/listing/PreviewCard.tsx`
- Publish confirm: `app/marketplace/listing/PublishConfirm.tsx`
- Validation: `app/marketplace/listing/validation.ts`
- Draft store: `app/marketplace/listing/draft_store.ts`
- Types: `app/marketplace/listing/submission_types.ts`

## 7. Naming Convention

- Step string values: lowercase `snake_case`.
- Component files: `PascalCase.tsx`.
- Validation error keys match listing field names (`display_name`, `pricing_tier`, etc.).

## 8. Error Handling

- Validation failure: `onStepComplete` rejects with a `ValidationError` whose `field_errors: Record<string, string>` populates `draft.validation_errors`; form renders inline messages.
- Publish failure (duplicate slug): `onPublish` rejects with `DuplicateSlugError`, form renders recoverable error state and focuses the slug field.
- Draft save failure (disk full, DB locked): shows a toast, retries automatically on next user action.
- Creator identity missing or unverified at `identity_check` step: block advance and render a link to Registry onboarding (Hecate-owned surface).

## 9. Testing Surface

- Wizard advance: complete steps 1 to 6 with valid data, assert `onPublish` invoked with a shape-valid `AgentListing`.
- Inline validation: enter invalid slug (with spaces), assert inline error present and advance blocked.
- Draft persistence: save draft, unmount, remount with the same draft_id, assert form state restored.
- Duplicate slug: mock `onPublish` to throw `DuplicateSlugError`, assert form re-focuses slug field and shows user-visible error.
- Cancel: click cancel, assert `marketplace.submission.cancelled` event emitted, no listing created.

## 10. Open Questions

- None at contract draft. Draft-save vs single-step publish decision is an Eos strategic_decision; contract supports both by allowing `onSaveDraft` to be optional (if not provided, draft persistence silently no-ops).

## 11. Post-Hackathon Refactor Notes

- Add image upload for agent preview thumbnails; pipe through a CDN with automated moderation.
- Support batch submission (creator ships 10 variants of an agent); introduces a separate `SubmissionBatch` schema.
- Add collaborative submission (multi-creator agents with co-owner identity) linking to Registry multi-signature identity.
- Integrate with the Protocol pillar so a submitted agent's `VendorOrigin` auto-populates supported adapter format metadata for Builder consumption.
