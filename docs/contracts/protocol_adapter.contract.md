# Protocol Adapter

**Contract Version:** 0.1.0
**Owner Agent(s):** Proteus (adapter interface definer)
**Consumer Agent(s):** Triton (translation demo consumer), Morpheus (vendor adapter UI), Athena (BuilderSpecialistExecutor non-Anthropic lane consumer post-hackathon)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the abstract vendor adapter interface that converts canonical `AgentIntent` into vendor-native prompt formats (Claude XML-preserving, Gemini native-preserving, Higgsfield-native-preserving, generic fallback) and back, so Protocol pillar preserves each model's uniqueness rather than forcing a universal prompt language per NarasiGhaisan Section 3 and Section 6.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 3 model flexibility, Section 6 Protocol shallow-by-design)
- `CLAUDE.md` (root)
- `docs/contracts/agent_intent.contract.md` (canonical IR source)
- `docs/contracts/builder_specialist_executor.contract.md` (future integration point post-hackathon)

## 3. Schema Definition

```typescript
// app/protocol/adapters/VendorAdapter.ts

import type { AgentIntent } from '@/protocol/schema/agent_intent';

export type VendorId =
  | 'anthropic'
  | 'gemini'
  | 'higgsfield'
  | 'openai_generic'
  | 'llama_generic';

export interface VendorCapabilityProfile {
  vendor_id: VendorId;
  supports_xml_tagging: boolean;
  supports_system_prompt: boolean;
  supports_prompt_caching: boolean;
  supports_tool_use: boolean;
  supports_multimodal_input: boolean;
  supports_streaming: boolean;
  max_context_window_tokens: number;
  native_format_name: string;        // e.g., 'anthropic_messages_v1', 'gemini_generativelanguage_v1beta'
}

export interface VendorNativePrompt {
  vendor_id: VendorId;
  format_name: string;
  serialized: string;                // canonical serialized form in vendor-native format
  fidelity_notes: string[];          // any features of AgentIntent that could not be preserved
}

export interface VendorNativeResponse {
  vendor_id: VendorId;
  raw: string;                       // vendor-native response body
  extracted_text: string;            // best-effort plain text extraction
  tool_use_calls?: Array<{ name: string; input: Record<string, unknown> }>;
}

export abstract class VendorAdapter {
  abstract readonly profile: VendorCapabilityProfile;
  abstract serializeIntent(intent: AgentIntent): VendorNativePrompt;
  abstract parseResponse(raw: string): VendorNativeResponse;
  abstract isMock(): boolean;        // true for demo-only stubs
}
```

## 4. Interface / API Contract

- `serializeIntent` must preserve all `AgentIntent` fields that the vendor supports; features beyond vendor capability are surfaced in `fidelity_notes` rather than silently dropped.
- `parseResponse` must populate `extracted_text` even when the vendor response format is structured (JSON, protobuf, etc.).
- `isMock()` returns true for any hackathon stub adapter; downstream UI uses this to surface honest "demo execution Anthropic only" badge per NarasiGhaisan Section 16.
- Concrete adapters: `AnthropicAdapter` (real, uses Claude Messages API XML conventions), `GeminiAdapterMock` (mock serialization into Gemini-native format for demo only), `HiggsfieldAdapterMock` (placeholder stub), `OpenAIGenericAdapter` (placeholder post-hackathon).

## 5. Event Signatures

- `protocol.adapter.serialized` payload: `{ vendor_id, intent_hash, fidelity_notes_count }`
- `protocol.adapter.parsed` payload: `{ vendor_id, response_length }`
- Events are for instrumentation and Ananke audit; adapters do not publish events themselves, Triton demo composer does.

## 6. File Path Convention

- Abstract class: `app/protocol/adapters/VendorAdapter.ts`
- Anthropic: `app/protocol/adapters/anthropic_adapter.ts`
- Gemini mock: `app/protocol/adapters/gemini_adapter.mock.ts`
- Higgsfield mock: `app/protocol/adapters/higgsfield_adapter.mock.ts`
- Generic: `app/protocol/adapters/openai_generic_adapter.ts`

## 7. Naming Convention

- Vendor IDs: lowercase `snake_case` when compound, single word otherwise.
- Format names: `snake_case` with vendor prefix and version suffix.
- Class names: `PascalCase` suffix `Adapter`; mock variants suffix `AdapterMock` (the `.mock.ts` file extension doubles as intent marker).

## 8. Error Handling

- Unsupported feature in `AgentIntent` (e.g., multimodal input to a text-only adapter): populate `fidelity_notes` with a specific message; do not throw.
- Malformed `AgentIntent`: throws `IntentSchemaViolation` before adapter-specific logic.
- Malformed vendor response on `parseResponse`: returns a `VendorNativeResponse` with `extracted_text` empty and `raw` set; logs warning.
- Adapter produces an output exceeding `max_context_window_tokens`: throws `ContextOverflowError`; caller is expected to pre-split or rebalance content.

## 9. Testing Surface

- Round-trip fidelity: serialize a canonical `AgentIntent` for Anthropic, assert every field referenced appears in `VendorNativePrompt.serialized`.
- Gemini mock: serialize the same intent via `GeminiAdapterMock`, assert `isMock() === true` and the serialized string is recognizable as Gemini-native (includes `generationConfig` or equivalent marker).
- Fidelity notes: serialize an intent with prompt-caching metadata for a non-Anthropic vendor, assert `fidelity_notes` includes a caching-not-supported note.
- Parse robustness: feed malformed vendor JSON, assert response returned with empty `extracted_text` and no throw.
- Overflow: construct an intent too large for the vendor's context window, assert `ContextOverflowError` thrown.

## 10. Open Questions

- None at contract draft. Depth of Gemini mock (text-only stub vs multimodal-simulating) is a Proteus strategic_decision; contract supports either.

## 11. Post-Hackathon Refactor Notes

- Replace `GeminiAdapterMock` with real Google Generative Language API integration, preserving the same interface.
- Add `HiggsfieldAdapter` real integration for video generation workflows; re-evaluate whether `AgentIntent` needs video-specific field extensions.
- Introduce capability-profile-driven routing: NERIUM Builder auto-picks vendor per task based on `profile` scoring.
- Support bidirectional streaming adapters: current contract is request-response; streaming is a post-hackathon extension to method signatures.
- Formal licensing and TOS compliance per vendor: each adapter exposes `terms_url` for enterprise audit.
