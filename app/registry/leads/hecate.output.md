---
owner: Hecate
pillar: Registry
phase: P1
model: opus-4-7
version: 0.1.0
status: draft
last_updated: 2026-04-22
---

# Hecate Registry Lead Output

## 1. Pillar Scope

Registry defines canonical identity and trust surface for every agent in NERIUM. The hackathon implementation is deliberately shallow per NarasiGhaisan Section 6: mock-populated SQLite store, advisory SHA-256 hashes, no blockchain, no DNS, no cryptographic signing. The Registry shipped in this hackathon proves the schema and the trust formula; real verifiers, cross-vendor attestation chains, and DID bridging are post-hackathon work.

Three artifacts define the pillar:

1. `app/registry/schema/identity.schema.ts` canonical `AgentIdentity` and `AuditEntry` types.
2. `app/registry/trust/trust_formula.ts` pure calculator for `TrustScore` plus band derivation.
3. `app/registry/audit/audit_contract.ts` append-and-query interface over audit entries.

Companion types file `app/registry/trust/trust_types.ts` is where `TrustScore`, `TrustBand`, and default weights live per `trust_score.contract.md` Section 6 file path convention.

## 2. Contract Conformance

- `agent_identity.contract.md v0.1.0`
- `trust_score.contract.md v0.1.0`

Both contracts are unchanged by this output. Hecate does not modify contracts. Any schema drift requires a contract version bump via Pythia, surfaced to V3.

## 3. Downstream Handoffs

| Consumer | What they read | Why |
|---|---|---|
| Phoebe | `identity.schema.ts`, `trust_formula.ts`, `toDisplayPercent` | Identity card UI in Marketplace, Search, and Advisor chat. |
| Demeter | `AgentIdentity.identity_id`, `trust_score_pointer` | Listings link to creator identity; search ranking reads trust. |
| Tyche | `AuditStore`, `makeInvocationEntry`, `cost_usd` field | Every transaction writes an invocation audit entry. |
| Heracles | `IdentityRegistry.upsert`, `recordAudit` | Managed Agents sessions self-register identity and log audit on each run. |
| Ananke | Audit store read surface | Daily orchestration log aggregates cost and outcome counts per identity. |

Apollo receives the cross-pillar handoff summary: Registry is ready to be consumed, no further blocker from Hecate.

## 4. Implementation Order For Consumers

Recommended Phase 2 execution order for Workers that depend on Registry:

1. Phoebe first. Identity card UI unblocks Artemis browse and Coeus search result list aesthetics. Phoebe consumes `AgentIdentity` plus `deriveBand` plus `toDisplayPercent`.
2. Demeter next. Search ranking formula wants a trust signal; can read `resolveTrustScore` fallback value while Phoebe finishes cards.
3. Tyche and Heracles in parallel. Tyche writes invocation entries on transaction commit; Heracles self-registers Managed Agent sessions. Both use the same audit store, no ordering conflict.
4. Ananke last. Reads the populated audit store for daily log; benefits from prior waves already having recorded entries.

## 5. Score Storage Versus Display

Internal storage and formula calculation use `number` in `[0, 1]` per `trust_score.contract.md`. UI layer displays the 0 to 100 integer percentage via `toDisplayPercent` in `trust_formula.ts`. This reconciles the contract constraint with the Hecate prompt hard-constraint that mentions a 0 to 100 integer for UI cleanliness. See `docs/hecate.decisions.md` ADR 0002 for the reasoning.

## 6. Mock Versus Real Signal Policy

Hybrid per ADR 0004. Most identity cards shipped in the demo seed are mock (Lumio copywriter specialist, Lumio landing specialist, plus a broader marketplace seed set). Identities spawned during a live Builder pipeline run (for example when the demo video triggers a real Heracles Managed Agent session) write real audit entries, so their scores trend toward `stable` after enough invocations. The UI does not distinguish mock from real at the card level; the `stability: 'provisional'` flag on `TrustScore` is the honest signal.

## 7. Shallow-By-Design Guardrails

- No cryptographic signing. `prompt_hash` and `contract_hash` are advisory SHA-256 hex strings that prove content equivalence, not authorship.
- No external identity provider integration. `IdentityKind` covers the scope needed for the demo: `creator`, `agent`, `platform`, `system`.
- No real verifier network. `verifier_attestation_count` and `verifier_attestation_weight` are populated from seed data plus any in-demo attestation entries.
- Audit trail UI exposure capped at latest N entries (recommend 20) to avoid visual clutter. Phoebe owns the exact N.

## 8. Strategic Decisions Surfaced

Two strategic decisions reach V3 for explicit sign-off before lock. Both currently default to the recommended posture so Phase 2 is unblocked.

1. Trust formula weight split (ADR 0001). Recommendation: contract defaults `{usage: 0.20, reviews: 0.30, successful_execution: 0.30, verifier_attestation: 0.20}`, Option A in the ADR. Awaiting V3 confirmation.
2. Mock-vs-real trust signal mix (ADR 0004). Recommendation: hybrid as in Section 6, seeded marketplace plus real scores on live-run identities. Awaiting V3 confirmation.

Separately, ADR 0005 (UI exposure of `prompt_hash` and `contract_hash` fields) is deferred to Phoebe plus Harmonia as a visual-team call rather than a V3 decision. Recommendation recorded there: hide by default, reveal in card expand.

Neither V3-blocked item prevents Phase 2 Worker spawn. If V3 redirects on either, Hecate reopens and adjusts artifacts in a follow-up session.

## 9. Self-Check Summary

See final session emit. 19-item protocol run silently before commit; results reported in the handoff line.

## 10. References

- `_meta/NarasiGhaisan.md` Section 6 Registry shallow-by-design, Section 15 trust plus delegation.
- `CLAUDE.md` root context.
- `docs/contracts/agent_identity.contract.md` v0.1.0.
- `docs/contracts/trust_score.contract.md` v0.1.0.
- `docs/phase_0/NERIUM_AGENT_STRUCTURE.md` Section 5.5 Hecate spec.
- `docs/hecate.decisions.md` ADR log.
