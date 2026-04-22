# Living Template Customize

**Contract Version:** 0.1.0
**Owner Agent(s):** Coeus (living template chat surface and remix request composer)
**Consumer Agent(s):** Apollo (receives remix requests and orchestrates Builder remix pipeline), Demeter (listing source of living-template parameters), Athena (Builder executor receives remix topology), Eos (authors living-template params at submission)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the flow by which a buyer customizes an existing Marketplace listing ("ubah agent pertanian cabai jadi anggur") into a remixed variant by supplying values for the source listing's `living_template_params`, triggering a lightweight Builder pipeline run parameterized by those inputs per NarasiGhaisan Section 5 living template example.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 5 Marketplace living template example)
- `CLAUDE.md` (root)
- `docs/contracts/marketplace_listing.contract.md` (source `living_template_params` shape)
- `docs/contracts/advisor_interaction.contract.md` (remix dispatched through Apollo)
- `docs/contracts/builder_specialist_executor.contract.md` (remix pipeline executes via executor)
- `docs/contracts/search_ui.contract.md` (entry-point component)

## 3. Schema Definition

```typescript
// app/marketplace/customize/living_template_types.ts

export type ParamKind = 'string' | 'enum' | 'number' | 'boolean';

export interface LivingTemplateParamDefinition {
  key: string;                        // unique within a listing
  label: string;                      // human-readable
  kind: ParamKind;
  enum_values?: string[];
  default_value: string | number | boolean;
  description: string;
  required: boolean;
  validation_regex?: string;          // for string kind
  min?: number;                       // for number kind
  max?: number;
}

export interface LivingTemplateRemixRequest {
  request_id: string;                 // uuid v4
  source_listing_id: string;
  params: Record<string, string | number | boolean>; // keyed by param.key
  requested_by_identity_id?: string;  // buyer identity
  locale: 'en-US' | 'id-ID';
  submitted_at: string;
}

export interface LivingTemplateRemixResult {
  request_id: string;
  remix_pipeline_run_id: string;      // the triggered pipeline's run_id
  new_listing_id?: string;            // populated when remix produces a new published listing
  status: 'accepted' | 'rejected' | 'in_progress' | 'completed' | 'failed';
  validation_errors?: Record<string, string>;
  completed_at?: string;
}
```

## 4. Interface / API Contract

```typescript
export interface LivingTemplateCustomizer {
  validateParams(listing_id: string, params: Record<string, unknown>): Promise<{ valid: boolean; errors: Record<string, string> }>;
  submitRemix(request: LivingTemplateRemixRequest): Promise<LivingTemplateRemixResult>;
  getStatus(request_id: string): Promise<LivingTemplateRemixResult>;
}
```

- `submitRemix` first validates params against the source listing's `living_template_params` definitions; if invalid, returns `status: 'rejected'` with inline `validation_errors`.
- On valid input, dispatches to Apollo via `AdvisorAgent.dispatchToLead('builder', { mode: 'living_template_remix', request })` per `pillar_lead_handoff.contract.md`.
- Apollo routes the remix into a bounded Builder pipeline topology (smaller than full Lumio) with a cost cap, and emits `pipeline.run.started` with a remix context flag.
- When the remix pipeline completes, the resulting artifacts may be auto-submitted to Marketplace as a new listing (requires user confirmation) or used privately.

## 5. Event Signatures

- `marketplace.remix.requested` payload: `{ request_id, source_listing_id, param_count: number }`
- `marketplace.remix.accepted` payload: `{ request_id, remix_pipeline_run_id }`
- `marketplace.remix.rejected` payload: `{ request_id, error_fields: string[] }`
- `marketplace.remix.completed` payload: `{ request_id, new_listing_id?: string }`
- `marketplace.remix.failed` payload: `{ request_id, reason }`

## 6. File Path Convention

- Types: `app/marketplace/customize/living_template_types.ts`
- Customizer implementation: `app/marketplace/customize/Customizer.ts`
- Validation: `app/marketplace/customize/validation.ts`
- Remix pipeline topology fixture: `app/builder/executor/pipeline_topology.remix.json`

## 7. Naming Convention

- `ParamKind` values: lowercase single word.
- Request and result IDs: uuid v4.
- Status values: lowercase, underscore for compound.
- Field names: `snake_case`.

## 8. Error Handling

- Invalid param keys (keys not in the listing's defined params): returns `status: 'rejected'` with `validation_errors[extra_key] = 'not defined on source listing'`.
- Missing required params: rejected with explicit per-key error.
- Type mismatch (string sent for number kind): rejected with explicit per-key error.
- Source listing archived or not found: rejected with `validation_errors['_listing'] = 'listing_unavailable'`.
- Remix pipeline cost projection exceeds buyer wallet balance: rejected with actionable message directing to top-up.

## 9. Testing Surface

- Param validation pass: submit params matching the listing's definitions, assert `valid: true`.
- Param validation fail (missing required): submit without a required key, assert `valid: false` and error for that key.
- Enum validation: submit value not in `enum_values`, assert error.
- Remix dispatch: valid request, assert `submitRemix` returns `status: 'accepted'` with a `remix_pipeline_run_id`.
- Status poll: after accept, poll `getStatus`, assert status transitions from `accepted` to `in_progress` to `completed` (using mock pipeline execution for test).

## 10. Open Questions

- None at contract draft. Whether a remix auto-publishes as a new Marketplace listing is a user-level preference captured at remix submission, not a contract gap.

## 11. Post-Hackathon Refactor Notes

- Add param dependency expressions: later params can be conditionally required based on prior param values (e.g., if `kind: 'agriculture'` then `crop_type` required).
- Cache remix results: identical param sets remix same listing should replay cached output rather than re-run the pipeline.
- Integrate with Registry: remixed agents inherit a lineage pointer to the original listing's identity, enabling trust-score carry-over heuristics.
- Support collaborative remix (multi-user param supply) for enterprise workflows.
- Offer a guided remix wizard (Apollo-assisted multi-turn) for users unsure of which params to change.
