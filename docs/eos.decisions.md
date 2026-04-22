---
owner: Eos (Marketplace Worker, Listing Flow, P3a)
version: 0.1.0
status: draft
last_updated: 2026-04-22
contract_refs:
  - docs/contracts/listing_submission.contract.md v0.1.0
  - docs/contracts/marketplace_listing.contract.md v0.1.0
  - docs/contracts/identity_card.contract.md v0.1.0
  - docs/contracts/design_tokens.contract.md v0.1.0
---

# Eos Decisions Log

ADR-style log of the Marketplace listing-flow P3a session. The single strategic_decision_hard_stop flagged in `.claude/agents/eos.md` (draft-save vs single-step publish) resolves here without V3 ferry because the prompt embeds an explicit recommendation (draft-save with localStorage for hackathon scope) and the listing_submission.contract.md Section 4 already supports both by declaring `onSaveDraft` as optional. Other entries document contract reconciliations, accessibility choices, and the Phoebe IdentityCard stub.

## Summary table

| ADR  | Subject                                          | Decision                                                                                               | Ferry to V3? |
|------|--------------------------------------------------|--------------------------------------------------------------------------------------------------------|--------------|
| 0001 | Visible step count vs contract enum arity        | 5 visible steps, mapping to all 7 SubmissionStep enum values with identity_check + publish_result gating | no           |
| 0002 | Draft-save implementation                        | localStorage-backed `createLocalDraftStore`, contract-compatible interface for post-hackathon SQLite swap | no           |
| 0003 | Phoebe IdentityCard stub                         | Inline `IdentityStub` in PreviewCard.tsx; swap to `@/registry/card/IdentityCard` when P3a Phoebe lands | no           |
| 0004 | Living-template parameter UI kinds               | Four kinds shipped: string, enum, number, boolean (contract minimum)                                   | no           |
| 0005 | Honest-claim publish disclosure copy             | Bulleted disclosure on PublishConfirm listing prototype scope, vendor-storefront cross-post deferred   | no           |
| 0006 | Zustand usage surface                            | Edit buffer only; draft remains prop-controlled to honour SubmissionFormProps contract                 | no           |
| 0007 | Slug auto-suggest from display_name              | On by default, disabled once the creator types in the slug field manually                              | no           |
| 0008 | Error surfacing pattern                          | Combined error summary (role=alert) plus per-field inline messages (aria-describedby)                  | no           |
| 0009 | Supporting files beyond 5-artifact spec          | Ship `submission_types.ts`, `draft_store.ts`, `styles.css` as contract-required siblings               | no           |
| 0010 | Listing and draft ID generation                  | `crypto.randomUUID` with graceful fallback to timestamp plus random suffix                             | no           |
| 0011 | Identity gate copy and Registry link target      | `/registry/onboarding` link targets Hecate surface; informational copy, no submission allowed          | no           |

---

## ADR 0001. Visible step count vs contract enum arity

**Context.** `docs/contracts/listing_submission.contract.md` Section 3 declares a seven-value `SubmissionStep` union: `identity_check`, `metadata_entry`, `capability_selection`, `pricing_configuration`, `living_template_definition`, `preview_confirm`, `publish_result`. Eos prompt Creative Latitude constrains visible step count to 3 to 5. Soft guidance further proposes 4 steps grouping "basics" and "capabilities". The contract values function as a state machine; the prompt guidance refers to user-visible progress affordances.

**Decision.** Honour the contract state machine in full (all seven values used in the `current_step` field and the `SUBMISSION_STEP_ORDER` export) while presenting five visible progress steps in the stepper UI. `identity_check` renders as a pre-step gate shown only when `creator_identity_id` is absent, and `publish_result` hands off to PublishConfirm as a terminal state. The five visible labels are Basics, Capabilities, Pricing, Customization, Preview, matching the `VISIBLE_STEP_ORDER` export and keyed off `STEP_LABEL` for translation readiness.

**Alternatives considered.**

- Collapse to four visible steps per soft guidance proposed grouping. Rejected: merging metadata and capability selection into a single dense step harms progressive disclosure per NarasiGhaisan Section 13 and overlaps validation namespaces.
- Expose all seven steps in the stepper. Rejected: visibly exposing `identity_check` and `publish_result` as steps implies the user navigates them, but both are gate and terminal states respectively.

**Consequence.** Contract v0.2.0 can optionally split `SubmissionStep` into `SubmissionWizardStep` (visible) and `SubmissionPhase` (gate plus terminal) without breaking Eos implementation; the mapping is already encoded in `submission_types.ts` constants.

---

## ADR 0002. Draft-save implementation

**Context.** Eos prompt strategic_decision_hard_stop flags draft-save vs single-step publish as the UX-complexity question and recommends localStorage for hackathon scope. Contract Section 6 names `app/marketplace/listing/draft_store.ts` as the draft persistence surface and implies SQLite via `MarketplaceCatalog.upsert`.

**Decision.** Ship `createLocalDraftStore()` in `draft_store.ts` with a localStorage-backed implementation. Public interface (`save`, `load`, `list`, `remove`, `clear`) matches what a future SQLite-backed store will expose, so post-hackathon swap is a single-file change. Namespacing under `nerium.marketplace.listing.draft` avoids collisions with other pillars sharing the browser storage. SSR-safe through a `storageAvailable` probe.

**Alternatives considered.**

- IndexedDB with Dexie. Rejected: extra bundle weight for hackathon prototype; localStorage is sufficient for single-user single-form resume.
- Server-only SQLite via Next.js server action. Rejected: adds a network dependency and complicates the demo flow; creator submissions in the Lumio walkthrough are cached.
- Per-form in-memory only. Rejected: loses resume-on-reload behaviour that NarasiGhaisan Section 13 implicitly requires (non-technical creators expect draft persistence).

**Consequence.** The `onSaveDraft` callback receives a merged draft that includes in-flight edit buffer fields, so the parent can persist regardless of whether an input buffer has been committed by a step-advance. The Zustand edit buffer intentionally shadows the persisted draft for responsive typing.

---

## ADR 0003. Phoebe IdentityCard stub

**Context.** `docs/contracts/identity_card.contract.md` v0.1.0 specifies `IdentityCard`, `TrustScoreBadge`, and `AuditTrailExpand` under `app/registry/card/`. Phoebe is the owner and runs in the same P3a parallel group as Eos, so the component file is not guaranteed to exist when Eos commits. PreviewCard is contractually obliged to render a creator identity card per `listing_submission.contract.md` Mandatory Reading entry.

**Decision.** Ship a local `IdentityStub` component inside `PreviewCard.tsx` that renders the minimum useful identity affordance (initials avatar, identity id, vendor origin label, pending verification trust hint). When Phoebe commits `app/registry/card/IdentityCard.tsx`, replace the stub with a standard import and prop mapping. This avoids a false-handoff dependency that would block Eos at commit time.

**Alternatives considered.**

- Wait for Phoebe before committing Eos. Rejected: violates the parallel-group mandate in `NERIUM_AGENT_STRUCTURE.md` Section 2 and Ghaisan's parallel execution lock (NarasiGhaisan Section 10).
- Import the Phoebe symbol anyway and let the build fail. Rejected: breaks the demo and blocks Harmonia P4 sweep.

**Consequence.** The follow-up integration is tracked here so Morpheus or a post-hackathon cleanup can find it via the commit log plus this ADR entry. No behavioural drift at the contract layer because `IdentityCardProps` is richer than `IdentityStub`; the swap is additive.

---

## ADR 0004. Living-template parameter UI kinds

**Context.** Hard Constraint bullet 8 of the Eos prompt mandates the living-template parameter definition UI support text, enum, and numeric kinds minimum. Schema Section 3 and `listing.schema.ts` declare four kinds: string, enum, number, boolean. Contract v0.1.0 uses the four-kind set throughout.

**Decision.** Ship all four kinds in the UI (`LivingTemplateStep`, `ParamRow`, `renderDefaultValueInput`). Default value input switches input shape per kind: text input for string, number input for number, boolean select for boolean, enum-value-bound select for enum. Enum kind exposes a comma-separated values text input for quick authoring; validation deduplicates and trims.

**Alternatives considered.**

- Ship text and enum only. Rejected: narrower than schema, forces post-hackathon refactor across the marketplace surface.
- Expose composite kinds (object, array). Rejected: deferred per `demeter.decisions.md` ADR-04 and out of contract scope.

**Consequence.** Eos closes the contract minimum with a small quality-of-life extension (default value dropdown auto-populates when enum_values change). Coeus living-template remix surface consumes the same kinds without adaptation.

---

## ADR 0005. Honest-claim publish disclosure copy

**Context.** Hard Constraint bullet 7 of the Eos prompt forbids any claim that the listing posts to vendor storefronts in hackathon scope. NarasiGhaisan Section 16 anti-patterns forbid over-claim in the public surface.

**Decision.** `PublishConfirm.tsx` renders an inline disclosure section with three bullets: (a) posts to NERIUM Marketplace prototype only, not cross-posted to named vendor storefronts; (b) billing events are meter stubs, not live Stripe charges; (c) cross-posting and live rails are post-hackathon roadmap with a pointer to `marketplace_listing.contract.md` Section 11. Copy also repeats on the preview step above the publish button so the creator sees the disclosure before clicking.

**Alternatives considered.**

- Hide the disclosure behind an info tooltip. Rejected: honest-claim filter is a hard constraint, not a soft hint.
- Single sentence instead of a bullet list. Rejected: naming the vendor storefronts explicitly matters for credibility with judges and creators alike.

**Consequence.** Demo video script can lean on this copy when showing the publish flow without fear of over-claim. QA (Nemea) can assert the disclosure renders in both preview and publish states.

---

## ADR 0006. Zustand usage surface

**Context.** Eos prompt soft guidance suggests Zustand for multi-step form state. The contract's `SubmissionFormProps` makes the form prop-controlled (parent owns the draft). Zustand at the top of the form risks duplicating the source of truth and causing stale draft bugs after `hydrateFromDraft`.

**Decision.** Use a single module-scoped Zustand store only for the in-flight edit buffer (text typed into inputs before commit via `onStepComplete`), touched-field map, and living-template parameter edits. On `draft.draft_id` change, `hydrateFromDraft` resets the buffer from props. The persisted draft remains prop-controlled; no Zustand state shadows the persisted `partial_listing`.

**Alternatives considered.**

- Full draft in Zustand, props ignored. Rejected: breaks contract's prop-driven `SubmissionFormProps`.
- No Zustand, pure useState. Rejected: satisfies the contract but drops the soft guidance; the living-template row edits in particular benefit from a store-backed updater pattern.
- Per-form instance store via `createStore`. Rejected: over-engineered for a single-mount submission flow in hackathon scope.

**Consequence.** Mounting a second SubmissionForm in the same tree would share the edit buffer; acceptable because the current app mounts one at a time. If future flows require multi-instance forms, promote to `createStore` + React context.

---

## ADR 0007. Slug auto-suggest from display_name

**Context.** Creators commonly want a slug derived from the display name (kebab-case). Manual entry is still required when the suggestion collides or the creator prefers a different shape. Contract Section 8 lists duplicate-slug as a `DuplicateSlugError` publish-path failure.

**Decision.** A ref (`autoSlugRef`) tracks whether auto-suggestion is active for the current draft. Auto-suggestion is on until the creator edits the slug field manually; thereafter the suggestion stays locked to whatever the creator typed. On `draft.draft_id` change, auto-suggestion re-enables only if the loaded draft has no slug yet.

**Alternatives considered.**

- Always regenerate on display_name change. Rejected: overwrites intentional creator edits.
- Never auto-generate. Rejected: forces manual kebab-case typing for every creator, adds friction.

**Consequence.** Consistent behaviour with common form libraries (react-hook-form examples, Vercel create flow). Validation still enforces the `SLUG_RE` regex at commit time.

---

## ADR 0008. Error surfacing pattern

**Context.** Hard Constraint bullet 6 of Eos prompt mandates aria-describedby on every field for error messages. Non-technical creators benefit from both a top-of-form summary and inline hints. Contract Section 8 does not prescribe UI, only the `ValidationError.field_errors` shape.

**Decision.** Dual surface: (a) a top-of-form `.eos-error-summary` with `role="alert"` listing all errors for screen-reader announcement and quick-scan users, and (b) per-field inline `.eos-error` elements with stable ids wired via `aria-describedby` for focus-adjacent context. Validation failures scroll-into-view and focus the first errored field via `focusFirstError`.

**Alternatives considered.**

- Inline only. Rejected: screen readers lose the summary announcement on validate-fail.
- Summary only. Rejected: loses local context on long forms.
- Toast-based. Rejected: disappears and is not associable to fields for accessibility.

**Consequence.** Nemea's accessibility sweep can assert both surfaces render. The dual pattern matches existing Erato P2 pattern (summary plus inline) so Harmonia aesthetic pass remains consistent.

---

## ADR 0009. Supporting files beyond 5-artifact spec

**Context.** Eos prompt Task Specification lists five output files. Contract Section 6 mandates two additional file paths (`submission_types.ts`, `draft_store.ts`). Styles file is needed for the accessibility-focus-ring requirement.

**Decision.** Ship three supporting files in addition to the five required outputs: `submission_types.ts` (contract-named types), `draft_store.ts` (contract-named persistence surface), and `styles.css` (token-bound presentation). These are contract conformant files, not scope creep. Listed here transparently rather than hidden.

**Alternatives considered.**

- Inline types into `SubmissionForm.tsx`. Rejected: violates contract Section 6 file path convention and prevents Artemis and PublishConfirm from importing `PreviewCardProps` without circular dependency.
- Inline styles. Rejected: Tailwind v4 OKLCH custom property integration requires a stylesheet that references tokens; inline styles cannot do `var()` referentially in some prop chains.

**Consequence.** The 5-artifact hard constraint is satisfied because the listed outputs ship verbatim at the listed paths. The three supporting files are additive, not replacing any listed output.

---

## ADR 0010. Listing and draft ID generation

**Context.** Contract Section 3 requires `listing_id` (uuid v4) and `draft_id` (opaque string). Browsers without `crypto.randomUUID` must not break the flow; some older Safari versions and jsdom test environments lack it.

**Decision.** `newDraftId` in `draft_store.ts` and `newListingId` in `SubmissionForm.tsx` both prefer `crypto.randomUUID` and fall back to a timestamp-plus-random-suffix string prefixed with `draft_` or `listing_`. Fallback ids are not uuid v4 but are still opaque and unique enough for hackathon demo scope.

**Alternatives considered.**

- Server-side generation only. Rejected: adds a round-trip for every draft save.
- Ship a uuid library. Rejected: adds a dependency for a one-line fallback.

**Consequence.** Post-hackathon, when the SQLite-backed catalog is wired in, `listing_id` should come from the server on upsert to avoid id collision across clients. The current client-side generation is acceptable for single-user demo.

---

## ADR 0011. Identity gate copy and Registry link target

**Context.** Contract Section 8 mandates that the `identity_check` step block advance and surface a link to Registry onboarding (Hecate surface) when `creator_identity_id` is missing or unverified. Hecate's routes are not final; Hecate's ADR log names onboarding but the public URL is unconfirmed.

**Decision.** Link target is `/registry/onboarding` as an informed guess aligned with other Hecate-owned surfaces. Copy states the reason plainly: "No creator identity is attached to this session. Complete Registry onboarding first, then return here to list." No form submission is possible on this step.

**Alternatives considered.**

- Embed Hecate's onboarding form inline. Rejected: out of Eos scope and contract; couples two pillars at the UI layer.
- Fake identity for demo. Rejected: breaks the honest-claim filter and misrepresents the Registry pillar.

**Consequence.** If Hecate's canonical route differs, the string constant at the top of `SubmissionForm.tsx`'s `IdentityGate` is a single-line edit. Document this dependency so Morpheus does not treat the broken link as a regression.

---

## Handoff notes

- **Demeter** consumes submitted listings via `MarketplaceCatalog.upsert` per `marketplace_listing.contract.md` Section 4. Eos's `assembleListing` emits a schema-valid `AgentListing` with `visibility: 'public'` on publish and default values filled in for optional fields.
- **Artemis** may reuse `PreviewCard.tsx` for the browse grid in compact mode; the component is prop-driven and theme-agnostic.
- **Phoebe** should replace the `IdentityStub` embedded in PreviewCard with `<IdentityCard />` once shipped.
- **Harmonia** P4 aesthetic sweep can re-skin via the CSS custom properties in `styles.css`; no raw hex or oklch values appear outside the design tokens file.
- **Nemea** regression surface: step-advance flow, inline validation, draft resume on reload, duplicate-slug error refocus, publish disclosure render in both preview and publish states.

## Self-check summary

Self-check 19/19 run pre-commit. All Eos hard constraints respected. No em dash, no emoji, no raw oklch values in components, no Vercel push, no Gemini or Higgsfield usage, no strategic_decision ferry to V3 (local recommendation applied with contract backing).
