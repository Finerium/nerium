# Vendor Adapter UI

**Contract Version:** 0.1.0
**Owner Agent(s):** Morpheus (multi-vendor panel component author)
**Consumer Agent(s):** Erato (embeds panel in `<ModelStrategySelector>` multi-vendor slot), Apollo (surfaces honest annotation in Advisor context), Harmonia (aesthetic)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the Multi-vendor choice surface component (per-task vendor assignment grid, vendor badges, honest "demo execution Anthropic only" annotation) that lets users see the NERIUM Builder flexibility vision without overclaiming live multi-vendor execution for hackathon per NarasiGhaisan Section 3 and Section 16.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 3 flexibility + Section 16 honest framing)
- `CLAUDE.md` (root)
- `docs/contracts/protocol_adapter.contract.md` (adapter interface reference)
- `docs/contracts/advisor_ui.contract.md` (host component: `<ModelStrategySelector>`)
- `docs/contracts/design_tokens.contract.md` (styling)

## 3. Schema Definition

```typescript
// app/protocol/vendor/vendor_adapter_ui_types.ts

import type { VendorId, VendorCapabilityProfile } from '@/protocol/adapters/VendorAdapter';

export type TaskDimension =
  | 'strategy'
  | 'code_generation'
  | 'ui_design'
  | 'copywriting'
  | 'image_generation'
  | 'video_generation'
  | 'data_analysis'
  | 'research';

export interface VendorAssignment {
  task: TaskDimension;
  vendor_id: VendorId;
  execution_status: 'real' | 'mock';  // always 'mock' for non-anthropic during hackathon
  rationale?: string;                  // short user-visible why
}

export interface MultiVendorPanelProps {
  assignments: VendorAssignment[];
  availableVendors: VendorCapabilityProfile[];
  onAssignmentChange: (next: VendorAssignment[]) => void;
  annotation_text?: string;            // defaults to locked phrase
  readOnly?: boolean;
}

export interface TaskAssignmentGridProps {
  assignments: VendorAssignment[];
  availableVendors: VendorCapabilityProfile[];
  onToggle: (task: TaskDimension, vendor_id: VendorId) => void;
  readOnly?: boolean;
}

export interface HonestAnnotationProps {
  text: string;                        // default: "demo execution Anthropic only, multi-vendor unlock post-hackathon"
  severity?: 'info' | 'advisory';
  alwaysVisible?: boolean;             // default true; cannot be dismissed
}
```

## 4. Interface / API Contract

- `<MultiVendorPanel>` renders the honest annotation at the top, always visible, with the locked phrasing unless `annotation_text` override supplied (documented as advisory; changing the locked text requires halt-and-ferry).
- `<TaskAssignmentGrid>` is a 2D interactive grid: rows are `TaskDimension`, columns are vendor chips. Clicking assigns that vendor to that task.
- Non-Anthropic assignments automatically mark `execution_status: 'mock'` for hackathon scope per Ghaisan anti-pattern 7; switching execution_status to `real` is gated behind a post-hackathon feature flag.
- `<HonestAnnotation>` visual treatment: small badge with neutral color, not dismissible, accessible to screen readers via `role="note"`.

## 5. Event Signatures

- `protocol.vendor_ui.assignment_changed` payload: `{ task, previous_vendor_id, next_vendor_id }`
- `protocol.vendor_ui.annotation_rendered` payload: `{ location: 'multi_vendor_panel' | 'task_grid' | 'other' }` (QA instrumentation)

## 6. File Path Convention

- Panel: `app/protocol/vendor/MultiVendorPanel.tsx`
- Grid: `app/protocol/vendor/TaskAssignmentGrid.tsx`
- Annotation: `app/protocol/vendor/HonestAnnotation.tsx`
- Types: `app/protocol/vendor/vendor_adapter_ui_types.ts`
- Locked annotation text: `app/protocol/vendor/annotation_text.constant.ts`

## 7. Naming Convention

- Task dimensions: lowercase `snake_case`.
- Vendor IDs: same as `protocol_adapter.contract.md` (`anthropic`, `gemini`, `higgsfield`, `openai_generic`, `llama_generic`).
- Execution status: `real` or `mock` lowercase literals.

## 8. Error Handling

- Assignment to a vendor that does not support the task dimension: permitted but flagged with a warning badge; user can choose anyway, annotation notes mock execution.
- Missing `availableVendors`: render the panel with a minimal fallback showing only Anthropic.
- Invalid annotation override: falls back to locked default text and logs warning.
- Empty assignments: renders a gentle prompt to pick at least one task-vendor pair.

## 9. Testing Surface

- Annotation is always present: mount with any props, assert `<HonestAnnotation>` in the DOM.
- Annotation text match: assert default rendered text is exactly `"demo execution Anthropic only, multi-vendor unlock post-hackathon"`.
- Assignment flip: click a cell to switch vendor for a task, assert `onAssignmentChange` fired with the new assignment list.
- Execution status auto-mock: assign Gemini to `code_generation`, assert the resulting `VendorAssignment.execution_status === 'mock'`.
- Read-only: with `readOnly: true`, click a cell, assert no change event fires.

## 10. Open Questions

- None at contract draft. Vendor list breadth (just Gemini plus Higgsfield, or broader including Llama and GPT) is a Morpheus strategic_decision, contract supports any subset via the `availableVendors` prop.

## 11. Post-Hackathon Refactor Notes

- When multi-vendor execution goes live post-hackathon, remove the automatic `execution_status: 'mock'` enforcement and replace with per-vendor real integration flags.
- Add capability-driven recommendation: when user picks `image_generation`, suggest the vendors with `supports_multimodal_input: true`.
- Support saved presets: user saves their Multi-vendor assignment as a named preset usable across sessions.
- Formalize billing impact projection per assignment so users see per-task expected cost before running.
- The locked annotation text may relax once multi-vendor execution is actually available; change must pass honest-claim review per NarasiGhaisan Section 16.
