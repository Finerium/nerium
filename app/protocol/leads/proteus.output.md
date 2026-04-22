---
name: proteus.output
owner: Proteus (Protocol Lead, P1)
version: 0.1.0
status: draft
last_updated: 2026-04-22
---

# Proteus Output: Protocol Pillar Orchestration Spec

## 1. Scope and Thesis

The Protocol pillar preserves each model's uniqueness under translation rather than forcing a universal prompt language. Proteus owns the canonical Agent Intent IR and the per-vendor adapter interface that consumes it. NarasiGhaisan Section 3: "Claude tetap dapet XML tags, Gemini pake native-nya, dst. Bukan force satu bahasa universal." Section 6 scopes Protocol as shallow-by-design for the hackathon surface.

Hackathon execution is Anthropic-only. Non-Anthropic adapters ship as mocks with an explicit `isMock()` flag and an honest-claim badge hook for downstream UI.

## 2. Deliverables Produced

| Artifact | Path | Purpose |
|---|---|---|
| Canonical IR schema | `app/protocol/schema/agent_intent.ts` | `AgentIntent` types, validator, canonicalizer, hash |
| Adapter abstract | `app/protocol/adapters/VendorAdapter.ts` | Interface, capability profile, registry, overflow error |
| Anthropic adapter | `app/protocol/adapters/anthropic_adapter.ts` | Real Claude Messages API serialization |
| Gemini mock adapter | `app/protocol/adapters/gemini_adapter.mock.ts` | Gemini-native-looking serialization, no API call |
| ADR log | `docs/proteus.decisions.md` | Decisions, rationale, open questions |
| This spec | `app/protocol/leads/proteus.output.md` | Pillar orchestration surface |

Contracts referenced: `protocol_adapter.contract.md` v0.1.0, `agent_intent.contract.md` v0.1.0.

## 3. Canonical IR Design Summary

The IR preserves:

- Message role sequence including `tool_result` with `tool_call_id` backrefs.
- Claude-specific nuance: `xml_tag_preference` (per-message wrapping hint), `cache_marker` (maps to Anthropic `cache_control.ephemeral`), `multimodal_parts` with typed `kind`.
- Generation parameters distinct from response format.
- Vendor preferences (`preferred_vendor_id`, `avoid_vendor_ids`, `require_feature`) so a downstream router can skip non-capable vendors before serialization.
- Deterministic canonicalization via alphabetically sorted keys at every depth. Hash uses WebCrypto SHA-256 when available, with a non-crypto fingerprint fallback for sync callers.

Claude round-trip invariant holds: every populated field on a standard `AgentIntent` is either (1) serialized into the Anthropic Messages body, or (2) annotated in `fidelity_notes`. The only lossy path is `response_format.kind === 'json_object' | 'json_schema'` which Anthropic does not accept as a top-level field; the adapter records a fidelity note so downstream code can inject a system-instruction shim.

## 4. Adapter Interface Summary

`VendorAdapter` defines:

- `profile: VendorCapabilityProfile` for static capability discovery.
- `serializeIntent(intent): VendorNativePrompt` including `fidelity_notes` for any capability gap.
- `parseResponse(raw): VendorNativeResponse` with `extracted_text` always populated and optional `tool_use_calls`.
- `isMock(): boolean` for honest-claim UI badges.
- Protected `assertWithinWindow(serialized)` raises `ContextOverflowError` before emission.

A lightweight `VendorAdapterRegistry` factory lets Triton and Morpheus instantiate one registry and resolve adapters by `VendorId`.

## 5. Cross-Pillar Handoffs

| Consumer | What they receive | How they use it |
|---|---|---|
| Apollo | Adapter registry and canonical IR types | Orchestration-level routing choice in Advisor flow |
| Triton | `AnthropicAdapter`, `GeminiAdapterMock`, IR schema | Translation demo (two-panel Claude vs Gemini side-by-side) |
| Morpheus | Capability profiles, `isMock()` | Multi-vendor panel UI, honest-claim badge |
| Athena | `VendorAdapter` abstract | BuilderSpecialistExecutor non-Anthropic lane, post-hackathon |

Triton should call `GeminiAdapterMock.produceMockResponseFor(intent)` for the right-side demo pane. That method is explicitly marked as demo-only and is outside the adapter contract, so Athena's executor path does not bind to it.

## 6. Honest-Claim Filter Enforcement

Per NarasiGhaisan Section 16 and CLAUDE.md anti-patterns:

- `GeminiAdapterMock.isMock() === true`.
- Every `serializeIntent` call on the mock seeds `fidelity_notes` with "mock adapter, no real Gemini API call in hackathon scope".
- The serialized JSON carries `_mock_marker: 'proteus_gemini_mock_v0'` and `_honest_claim: 'mock, no real Gemini API call in hackathon scope'` as explicit fields so any copy-paste or audit preserves the disclosure.
- Morpheus multi-vendor UI MUST render a visible badge keyed off `isMock()`.

## 7. Testing Surface (Suggested Triton/Nemea Coverage)

- Round-trip fidelity: build canonical intent with system plus user plus tool_use plus tool_result plus image part plus cache_marker; serialize via `AnthropicAdapter`; assert body shape under `anthropic_messages_v1`.
- Mock identity: `GeminiAdapterMock.isMock() === true` and serialized payload contains `_honest_claim`.
- Fidelity notes: serialize an intent with `cache_marker: true` on the Gemini mock; assert `fidelity_notes` includes the caching-not-supported entry.
- Parse robustness: feed malformed vendor JSON to both `parseResponse` methods; assert no throw and `extracted_text === ''`.
- Overflow: construct an oversize intent and assert `ContextOverflowError` thrown.

## 8. Halt-and-Ferry Surface

Resolved strategic decisions (see `docs/proteus.decisions.md`):

- Gemini mock depth: text plus image (primary), pdf/audio/video mapped but annotated. No multimodal-simulating live asset fetch.
- Higgsfield: placeholder vendor id reserved, no adapter implementation this session, documented in ADR as post-hackathon.

Open questions deferred to Apollo plus V3:

- Cache marker granularity (per-block TTL hints) when more vendors adopt caching.
- Bidirectional streaming adapter surface (current contract is request-response).

## 9. Post-Hackathon Trajectory

Aligned with `protocol_adapter.contract.md` Section 11:

- Replace `GeminiAdapterMock` with real Google Generative Language integration, preserving interface.
- Ship `HiggsfieldAdapter` as real implementation when NERIUM Builder adds video workflows.
- Introduce capability-scored routing so Builder auto-selects vendor per task.
- Add `schema_version` to `AgentIntent` for staged migration.

End of Proteus pillar orchestration spec.
