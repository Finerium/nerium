---
owner: Hecate
pillar: Registry
phase: P1
version: 0.1.0
status: draft
last_updated: 2026-04-22
---

# Hecate Architectural Decision Record

Decisions are numbered monotonically. Each decision names the trigger, options considered, the pick, and the reversal trigger. Strategic decisions flagged `hard_stop` wait for V3 sign-off before lock.

---

## ADR 0001. Trust Formula Weight Split

**Status:** proposed, pending V3 sign-off.

**Context.** The Hecate prompt soft-guidance proposes weights `0.4 * usage_success_rate + 0.3 * review_ratio + 0.2 * verifier_attestation + 0.1 * recency_decay`. The `trust_score.contract.md` v0.1.0 Section 3 defines four signals: `usage`, `reviews`, `successful_execution`, `verifier_attestation`, with default weights `0.20, 0.30, 0.30, 0.20` summing to 1.0. The two specifications differ because the contract splits usage from successful-execution (soft-guidance conflates them) and defers recency decay to post-hackathon per contract Section 11.

**Options.**

- A. Follow the contract weights exactly: `{usage: 0.20, reviews: 0.30, successful_execution: 0.30, verifier_attestation: 0.20}`.
- B. Override with the prompt soft-guidance weights and add a recency term.
- C. Re-weight against B but keep the contract's four-signal decomposition.

**Decision.** Option A.

**Reasoning.** The contract is the load-bearing artifact; Workers downstream read the contract first. Deviating from it to match prompt soft-guidance creates a silent split where the formula file and the contract disagree. The soft-guidance bullet is explicitly flagged "Creative Latitude (Narrow Zones), propose in ADR, Ghaisan sign-off before lock" in the Hecate prompt, which is exactly this ADR. Recency decay is in the contract's post-hackathon refactor notes, so omitting it now is consistent.

**Reversal trigger.** V3 sign-off on a different weight split, or a demo-day signal that one axis is swamping others visually.

---

## ADR 0002. Score Storage `[0, 1]` Float, UI Displays 0 To 100 Integer

**Status:** locked.

**Context.** The Hecate prompt hard-constraint says "Trust score range 0 to 100 integer (cleaner UI than 0.0 to 1.0 float)". The `trust_score.contract.md` Section 3 defines `score: number` normalized to `[0, 1]`. Both must hold.

**Decision.** Internal storage and calculation use the contract's `[0, 1]` float. UI layer displays `0 to 100` via the helper `toDisplayPercent(score)` exported from `trust_formula.ts`. The contract is unchanged; the hard-constraint is satisfied at the UI boundary.

**Reasoning.** This is the standard split: models stay in normalized numeric space, presentation converts to human-readable percentage. Storing as an integer would lose precision during recompute and make formula math awkward. The contract governs schema; the prompt hard-constraint governs user-visible output. Both can be true.

**Reversal trigger.** Contract version bump that redefines `score` as integer. Would require Pythia ferry to V3 and a coordinated schema migration.

---

## ADR 0003. Usage Count Normalization Via `log1p`, Cap 10,000

**Status:** locked.

**Context.** Contract Section 3 requires `usage_count_normalized` in `[0, 1]`. Linear normalization is unfair (a 10,000-invocation veteran agent reads identical to a 10,001 one; first 10 invocations barely move the needle). Log-scale normalization gives early usage visible climb and saturates naturally.

**Decision.** `normalizeUsage(usage_count, cap = 10_000) = log1p(min(usage_count, cap)) / log1p(cap)`. Exported from `trust_formula.ts`.

**Reasoning.** Log normalization is industry standard for reputation signals. `cap = 10_000` is arbitrary but serviceable for hackathon seed data; post-hackathon the cap should come from observed usage distribution, not a guess.

**Reversal trigger.** Seed data shows cap too low (agents hit the ceiling immediately) or too high (even the top agents sit below 0.2). Tune per observed distribution.

---

## ADR 0004. Hybrid Mock Plus Real Signal Policy For Demo Identities

**Status:** proposed, pending V3 sign-off.

**Context.** The Hecate prompt `strategic_decision_hard_stop` names the mock-vs-real trust signals choice. Pure mock is safest for demo determinism. Pure real (only show identities created during live Builder runs) is honest but empty on demo open. Hybrid combines a seeded mock marketplace with any real identities spawned live.

**Decision.** Hybrid. Seed the Registry with mock identities for the demo marketplace browse surface (at least 12 identities across capability tags, trust bands, and vendor origins). Any identity created during a live Heracles Managed Agent session writes real audit entries and recomputes a real score.

**Reasoning.** Demo storytelling needs a populated marketplace on page load (non-technical viewer cannot parse an empty state). Pure mock contradicts the honest-claim filter because it hides the real audit trail capability. Hybrid lets the demo show "this card came from a live run" via the `stability: 'stable'` flag, while mocks carry `stability: 'provisional'` where applicable. No card lies; `stability` is the honest signal.

**Reversal trigger.** V3 directs pure mock to minimize demo risk, or live run data is sufficient to populate the marketplace without seeding.

---

## ADR 0005. Defer Hash And Signature UI Exposure To Phoebe

**Status:** proposed, pending Phoebe plus Harmonia visual decision.

**Context.** `prompt_hash` and `contract_hash` are SHA-256 hex strings on `AgentIdentity`. Exposing them in the identity card adds technical credibility (viewers see a real hash, feel the Registry is grounded) but can clutter the card and confuse non-technical users.

**Decision.** Ship the fields in the schema (already done, contract-mandated). Default card view hides them. Card expand optionally reveals them in a monospace block, at Phoebe and Harmonia's discretion. Hecate does not decide visual treatment.

**Reasoning.** Schema surface is Hecate's concern; UI rendering is Phoebe and Harmonia. Deferring correctly partitions responsibility. The schema is already ready for either visual outcome.

**Reversal trigger.** Phoebe ships a design that needs hash fields added or removed from the schema; handled via contract version bump through Pythia.

---

## ADR 0006. Audit Summary Derived, Not Stored As Source Of Truth

**Status:** locked.

**Context.** `AgentIdentity.audit_summary` contains `total_invocations`, `reported_incidents`, `first_seen`, `last_active`. These could be incrementally maintained on write (fast, drift-prone) or recomputed from the audit log on read (slower, always correct).

**Decision.** The underlying `AuditStore` is the source of truth. `audit_summary` on `AgentIdentity` is a snapshot refreshed by `refreshAuditSummary(store, identity_id)` in `audit_contract.ts`. Callers must not mutate `audit_summary` directly.

**Reasoning.** Hackathon scope is small enough that recompute cost is negligible. Drift bugs are the number-one risk with incremental counters, especially with `--dangerously-skip-permissions` parallel Workers writing audit entries concurrently. Single source of truth wins.

**Reversal trigger.** Measurable perf hit post-hackathon with a large audit log; introduce cache invalidation via the `registry.audit.recorded` event.

---

## ADR 0007. Band Cutoffs Literal Match To Contract

**Status:** locked.

**Context.** Contract Section 3 specifies `<0.2 unverified, 0.2-0.4 emerging, 0.4-0.6 established, 0.6-0.85 trusted, >=0.85 elite`. The contract test expectation (Section 9) verifies `0.15 -> unverified, 0.35 -> emerging, 0.55 -> established, 0.75 -> trusted, 0.9 -> elite`.

**Decision.** `BAND_CUTOFFS` in `trust_types.ts` encodes the cutoffs literally. `deriveBand` scans in descending order and returns the first match.

**Reasoning.** Contract conformance hard-constraint. No latitude.

**Reversal trigger.** Contract version bump.

---

## Open Questions Deferred To V3

- ADR 0001 weight split sign-off.
- ADR 0004 hybrid signal policy sign-off.

Both default to the recommended posture if V3 does not override before Phase 2 spawn.
