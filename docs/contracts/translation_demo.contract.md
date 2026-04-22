# Translation Demo

**Contract Version:** 0.1.0
**Owner Agent(s):** Triton (demo composer component author)
**Consumer Agent(s):** Apollo (demo accessible from Advisor), Morpheus (composition with vendor adapter UI), Harmonia (aesthetic)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the two-panel side-by-side translation demo component (Claude native panel and Gemini mock panel) that visually showcases the Protocol pillar thesis: same `AgentIntent` rendered faithfully in each vendor's native format, preserving model-specific nuance.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 3 model flexibility and Section 6 Protocol shallow-by-design)
- `CLAUDE.md` (root)
- `docs/contracts/protocol_adapter.contract.md` (adapter interface used for rendering)
- `docs/contracts/agent_intent.contract.md` (IR displayed)
- `docs/contracts/design_tokens.contract.md` (styling)

## 3. Schema Definition

```typescript
// app/protocol/demo/translation_demo_types.ts

import type { AgentIntent } from '@/protocol/schema/agent_intent';
import type { VendorAdapter, VendorId, VendorNativePrompt, VendorNativeResponse } from '@/protocol/adapters/VendorAdapter';

export interface TranslationSplitProps {
  intent: AgentIntent;
  leftAdapter: VendorAdapter;
  rightAdapter: VendorAdapter;
  mode: 'prebaked' | 'live_query';
  prebakedResponse?: { left: VendorNativeResponse; right: VendorNativeResponse };
  onUserEditIntent?: (next: AgentIntent) => void;
}

export interface VendorPanelProps {
  vendor_id: VendorId;
  adapter: VendorAdapter;
  prompt: VendorNativePrompt;
  response?: VendorNativeResponse;
  isMock: boolean;                   // if true, overlay "demo execution Anthropic only" badge
}

export interface IntentEditorProps {
  intent: AgentIntent;
  onChange: (next: AgentIntent) => void;
  readonly?: boolean;
}
```

## 4. Interface / API Contract

- `<TranslationSplit>` renders left and right `<VendorPanel>` instances with a central divider exposing the shared `AgentIntent` and fidelity notes diff.
- In `prebaked` mode, responses come from the prop; the demo is fully deterministic for video recording.
- In `live_query` mode, the Claude side actually calls the Anthropic API (via `AnthropicAdapter.serializeIntent` and a small driver) while the Gemini side renders the mock serialization only; the panel clearly labels mock vs real.
- `<VendorPanel>` honors `adapter.isMock()` and surfaces the honest annotation badge so no viewer confuses mock for real.

## 5. Event Signatures

- `protocol.demo.rendered` payload: `{ mode, left_vendor_id, right_vendor_id }`
- `protocol.demo.intent_edited` payload: `{ intent_id, field_path }`
- `protocol.demo.live_query_executed` payload: `{ intent_id, vendor_id, tokens: number }` (only emitted when real API call happens)

## 6. File Path Convention

- Split root: `app/protocol/demo/TranslationSplit.tsx`
- Vendor panels: `app/protocol/demo/ClaudePanel.tsx`, `app/protocol/demo/GeminiMockPanel.tsx`
- Intent editor: `app/protocol/demo/IntentEditor.tsx`
- Types: `app/protocol/demo/translation_demo_types.ts`

## 7. Naming Convention

- Component files: `PascalCase.tsx`.
- Mode values: lowercase `snake_case` literal.
- Honest annotation text matches `vendor_adapter_ui.contract.md` phrasing for cross-surface consistency: `"demo execution Anthropic only, multi-vendor unlock post-hackathon"`.

## 8. Error Handling

- Adapter throws during `serializeIntent`: panel renders an error state with a short message, never crashes the split.
- `live_query` mode but no API key configured: fall back to prebaked response with a visible notice.
- Intent edit produces an invalid schema: inline validation error, no propagation.
- Missing prebaked response in `prebaked` mode: falls back to a minimal placeholder response and logs warning.

## 9. Testing Surface

- Prebaked render: supply prebaked responses, mount component, assert both panels show the expected serialized strings.
- Mock badge: render with Gemini mock adapter, assert the mock badge is visible on the right panel.
- Intent edit: edit the system message in `<IntentEditor>`, assert both panels re-render with the new serialization.
- Live query fallback: mock no API key, assert the component degrades to prebaked with a visible notice.
- Accessibility: panels exposed as `<section>` landmarks with descriptive `aria-label`.

## 10. Open Questions

- None at contract draft. Live-query vs prebaked-only for demo is a Triton strategic_decision; the contract supports both paths.

## 11. Post-Hackathon Refactor Notes

- Wire `GeminiAdapterMock` to real Google API when ready; the panel interface does not need changes.
- Support N-way panel comparison (Claude vs Gemini vs Higgsfield vs OpenAI) via a panel grid.
- Add a "fidelity diff" toggle showing exactly which IR fields were dropped or lossy-converted per panel.
- Offer a shareable permalink so viewers can open a frozen demo scenario at a specific intent edit state.
