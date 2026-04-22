---
name: proteus.decisions
owner: Proteus (Protocol Lead, P1)
version: 0.1.0
status: draft
last_updated: 2026-04-22
---

# Proteus Architecture Decisions (ADR Log)

Decisions made during the Proteus P1 session. Each entry: context, options considered, decision, rationale, consequences. Following the ADR discipline called out in CLAUDE.md Section "Folder structure" (architecture docs per major decision).

---

## ADR-001: Adopt contract IR verbatim as shipping schema

**Context.** `agent_intent.contract.md` v0.1.0 already specifies the IR shape in detail. The prompt soft-guidance suggests a slimmer `AgentIntent` shape (`system_prompt`, `user_turns`, `tools`, `model_hint`, `response_format_hint`, `metadata`).

**Options considered.**
1. Ship the soft-guidance slim shape and ferry a contract revision.
2. Ship the contract-defined shape verbatim as v0.1.0.
3. Ship a third compromise shape.

**Decision.** Option 2. Ship the contract-defined shape.

**Rationale.** Pythia contracts are strict blockers per NarasiGhaisan Section 9. Adapters consumed by Triton, Morpheus, and (post-hackathon) Athena's BuilderSpecialistExecutor all key off contract v0.1.0. Re-litigating would require contract ferry and a Pythia v0.2.0 revision; both slow down P1 parallel groups. The contract shape is also richer (explicit `MessageContent` sequence, tool_result with `tool_call_id` backrefs, multimodal parts), which matters for faithful Claude round-trip.

**Consequences.** The prompt's soft-guidance fields are superseded. `system_prompt` maps to `messages[role='system']`. `user_turns` maps to `messages[role='user']`. `model_hint` maps to `vendor_preferences.preferred_vendor_id`. `response_format_hint` maps to `response_format`. No information loss.

---

## ADR-002: Preserve Claude-specific features as first-class IR fields

**Context.** A pure vendor-neutral IR would strip Claude-only features (XML tag wrapping, ephemeral cache markers). That would violate the "preserve each model's uniqueness" thesis from NarasiGhaisan Section 3.

**Options considered.**
1. Strictly neutral IR, push Claude-only features into `metadata` opaque blob.
2. First-class fields `xml_tag_preference` and `cache_marker` on `MessageContent`, safe-ignore on non-Claude adapters.
3. Vendor-extension escape hatch (`vendor_extensions: Record<string, unknown>`).

**Decision.** Option 2.

**Rationale.** `metadata` opaque blob is invisible to validators and adapters, so information gets lost silently. First-class fields let each adapter decide to honor, map, or annotate in `fidelity_notes`. Vendor-extension escape hatch is a post-hackathon refactor item in the contract (Section 11 of `agent_intent.contract.md`); shipping it now adds surface area that nobody will consume in P1.

**Consequences.** Anthropic adapter preserves both fields. Gemini mock surfaces fidelity notes when they appear. Callers stay contract-pure.

---

## ADR-003: Gemini mock depth is text plus image primary

**Context.** Strategic_decision_hard_stop item: text-only stub vs multimodal-simulating.

**Options considered.**
1. Text-only stub. Minimum viable mock.
2. Text plus image, other multimodal kinds mapped-with-note.
3. Full multimodal simulation (fetch assets, build plausible body).

**Decision.** Option 2.

**Rationale.** Triton demo should render visibly Gemini-like payloads to make the "preserve each model's uniqueness" thesis legible to judges. Text-only looks thin; full simulation invites scope creep and risks accidental external calls. Text plus image (covered natively via `file_data.file_uri`) hits the demo bar cheaply. Other kinds (pdf, audio, video) map to `file_data` with a kind-appropriate mime type, plus a `fidelity_notes` entry because we are not actually uploading to any file service.

**Consequences.** Gemini mock body always looks plausible; any asset beyond a referenced URI is honestly annotated. Morpheus can ship a Multi-vendor panel that shows all four multimodal kinds without mock-specific branches.

---

## ADR-004: Higgsfield deferred to post-hackathon

**Context.** Strategic_decision_hard_stop item: expose Higgsfield as third vendor option.

**Decision.** Reserve `higgsfield` as a `VendorId` constant; do not ship a file. Post-hackathon work adds `HiggsfieldAdapter` as a real implementation.

**Rationale.** Higgsfield is video-specific. Confusing the Triton two-panel translation demo (text in, text out) with a video adapter dilutes the narrative. Morpheus can still list Higgsfield as a selectable option labeled "video, post-hackathon" without an adapter file, since the Multi-vendor UI is a feature spec, not a live execution surface.

**Consequences.** No `higgsfield_adapter.mock.ts` file this session. `VendorId` keeps the id so post-hackathon addition is additive, not breaking.

---

## ADR-005: Synchronous hash via fingerprint, async hash via WebCrypto

**Context.** The contract's `AgentIntentValidator.hash(intent): string` is a synchronous signature. WebCrypto `subtle.digest` is async.

**Options considered.**
1. Change contract to async. Breaks consumers.
2. Ship sync surface with a non-crypto fingerprint; expose async crypto-grade `hash` beside it.
3. Block on WebCrypto availability and throw in sync environments.

**Decision.** Option 2.

**Rationale.** Consumers need a stable sync API for hot paths like logging and event keys. Audit-critical paths can call the async export. Post-hackathon migration to a fully async interface is documented in `agent_intent.contract.md` Section 11 (schema versioning notes apply here by extension).

**Consequences.** Two hashing surfaces. Fingerprint collisions are possible but acceptable for intra-session identity; audit consumers should prefer the async path. Doc in the file explicitly notes the distinction.

---

## ADR-006: Canonicalization strategy

**Context.** Equal intents must hash identically regardless of key order.

**Decision.** Deep alphabetic key sort, drop `undefined`, preserve arrays, preserve string contents verbatim.

**Rationale.** Standard deterministic JSON canonicalization pattern. Avoids RFC 8785 complexity (full Unicode normalization plus number canonicalization) that the hackathon does not need. Post-hackathon can upgrade to RFC 8785 if audit demands.

**Consequences.** Hash stable across call sites. Numeric edge cases (negative zero, large integers outside safe integer range) are not canonicalized; documented as out-of-scope for hackathon.

---

## ADR-007: Adapter overflow check runs before emission

**Context.** Where to enforce `max_context_window_tokens`.

**Decision.** Each concrete adapter calls `assertWithinWindow(serialized)` at the end of `serializeIntent`.

**Rationale.** Earlier checks (per-message pre-serialization) would duplicate tokenization logic across adapters and miss vendor-specific serialization overhead (JSON wrapping, wrapper keys). Post-emission gives an exact payload to measure. Heuristic of 4 chars per token is vendor-neutral and conservative.

**Consequences.** Overflow is detected before network emission, fulfilling contract Section 8. Callers are expected to pre-split content when they know their payload is near the limit.

---

## ADR-008: No em dash, no emoji, English technical register

Standing CLAUDE.md anti-patterns. Noted here for ADR auditability and to anchor future diff reviews. All Proteus artifacts conform.

---

## Open Questions (Ferry to Apollo or V3 when relevant)

- Cache marker granularity (per-block TTL hints). Contract Section 11 open item.
- Streaming surface. Current contract is request-response. Post-hackathon extension.
- RFC 8785 canonicalization upgrade if audit path demands cryptographic determinism across Unicode normalization.

End of Proteus decisions log.
