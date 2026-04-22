---
name: Hecate v2 Debug Review
reviewer: Hecate-v2 (audit pass, P1 Registry Lead self-review)
target_commit: f875a0c
target_session: Hecate v1 (row 5 in _meta/TokenManager.md)
date: 2026-04-22
status: FIXED
---

# Hecate v2 Debug Review

## 1. Scope

Audit of Hecate v1 artifacts committed at `f875a0c`:

- `app/registry/schema/identity.schema.ts`
- `app/registry/trust/trust_types.ts`
- `app/registry/trust/trust_formula.ts`
- `app/registry/audit/audit_contract.ts`
- `app/registry/leads/hecate.output.md`
- `docs/hecate.decisions.md` (7 ADRs)

Audit targets per `.claude/agents/hecate.md` directive:

- Contract conformance against `agent_identity.contract.md` v0.1.0 and `trust_score.contract.md` v0.1.0.
- Trust formula determinism, band derivation, weight sum invariant, clamp behavior.
- `toDisplayPercent` helper correctness over boundary and edge inputs.
- Audit event topic strings match contract Section 5 verbatim.
- ADR integrity, especially `proposed` status preservation on ADR 0001 and ADR 0004 per the v2 guardrail.
- Shallow-by-design honored per NarasiGhaisan Section 6.

Guardrail: Hecate-v2 does not resolve ADR 0001 or ADR 0004 status. Those remain `proposed` pending V3 sign-off per `strategic_decision_hard_stop` in the Hecate prompt.

## 2. Verdict

Verdict: **FIXED**. Zero CRITICAL findings. Three MINOR issues surfaced, all three fixed in this session. Two observations documented as acceptable deferrals, no V3 ferry needed. Handoff to Apollo, Phoebe, Demeter, Tyche, Heracles, Ananke remains ready.

## 3. Contract Conformance Matrix

### 3.1 `identity.schema.ts` vs `agent_identity.contract.md` v0.1.0

| Contract Item | v1 Status |
|---|---|
| `IdentityKind` 4-variant union | pass |
| `CapabilityDeclaration` fields `tag` + `confidence_self_declared` | pass |
| `AgentIdentity` all 13 fields including optional hashes | pass |
| `AuditEntry` all 8 fields including optional `cost_usd` and `pipeline_run_id` | pass |
| `IdentityRegistry` all 6 methods | pass |
| Error classes `DuplicateHandleError`, `CapabilityRequiredError` | pass |
| Handle regex `^[a-z0-9_]{1,40}$` matches Section 7 rule | pass |
| SHA-256 hex regex `^[a-f0-9]{64}$` matches Section 7 rule | pass |
| File path `app/registry/schema/identity.schema.ts` | pass |
| Naming convention snake_case field names | pass |

Additive deviations, all contract-safe:
- Inline `vendor_origin` union extracted to named `VendorOrigin`.
- Inline `capabilities.tag` union extracted to named `CapabilityTag`.
- Inline `audit_summary` object literal extracted to named `AuditSummary` interface.
- Inline `AuditEntry.kind` and `AuditEntry.outcome` unions extracted to named `AuditEntryKind`, `AuditOutcome`.

None of these change the structural shape the contract dictates; they improve reusability for downstream consumers. Contract consumers that type-import inline unions would still compile because TypeScript unifies structural equivalents.

### 3.2 `trust_types.ts` + `trust_formula.ts` vs `trust_score.contract.md` v0.1.0

| Contract Item | v1 Status |
|---|---|
| `TrustBand` 5-variant union with documented cutoffs | pass |
| `TrustScore` all 6 fields including `stability` | pass |
| `TrustInputs` all 6 signal fields | pass |
| `TrustFormulaWeights` 4 fields summing 1.0 default | pass (0.20+0.30+0.30+0.20=1.00) |
| `TrustScoreCalculator` all 5 methods | pass |
| `calculate` pure with respect to score (accepts non-determinism of `computed_at`) | pass |
| Band derivation test (0.15/0.35/0.55/0.75/0.9 -> unverified/emerging/established/trusted/elite) | pass |
| Clamp inputs out of [0, 1] without throwing | pass |
| Determinism for fixed inputs returns identical `score` | pass |
| Provisional stability when `usage_count < 10` | pass (STABILITY_USAGE_THRESHOLD = 10) |
| Error class `InvalidInputError` on `usage_count < 0` | pass |
| Error class `UnknownIdentityError` declared for `recompute` implementors | pass |
| File paths `trust_types.ts` and `trust_formula.ts` per Section 6 | pass |
| `formula_weights.json` per Section 6 | v1 MISSING, v2 FIXED |
| Warning emission on clamp (Section 8) | v1 MISSING, v2 FIXED |
| Warning emission on weight fallback (Section 8) | v1 MISSING, v2 FIXED |

Weight sum invariant verified: `0.20 + 0.30 + 0.30 + 0.20 = 1.00` exact.

Band derivation trace against contract test expectations:

| Score | Descending cutoff scan | Derived band | Expected |
|---|---|---|---|
| 0.15 | 0.85 no, 0.60 no, 0.40 no, 0.20 no, 0.00 yes | unverified | unverified |
| 0.35 | 0.85 no, 0.60 no, 0.40 no, 0.20 yes | emerging | emerging |
| 0.55 | 0.85 no, 0.60 no, 0.40 yes | established | established |
| 0.75 | 0.85 no, 0.60 yes | trusted | trusted |
| 0.90 | 0.85 yes | elite | elite |

All five match contract Section 9.

`toDisplayPercent` edge cases:

| Input | Path | Output |
|---|---|---|
| 0.0 | clamp stays 0, round(0) | 0 |
| 0.50 | round(50) | 50 |
| 0.85 | round(85) | 85 |
| 1.0 | round(100) | 100 |
| 1.5 | clamp to 1.0, round(100) | 100 |
| -0.1 | clamp to 0, round(0) | 0 |
| NaN | clamp returns 0, round(0) | 0 |

Monotonic, integer-valued, within `[0, 100]` for every finite input. Correct.

### 3.3 `audit_contract.ts` vs `agent_identity.contract.md` v0.1.0 Section 5

| Contract Item | v1 Status |
|---|---|
| `registry.identity.created` topic string | pass (verbatim) |
| `registry.identity.updated` topic string | pass (verbatim) |
| `registry.audit.recorded` topic string | pass (verbatim) |
| `AuditStore` record + query surface | pass |
| `refreshAuditSummary` returns all 4 `AuditSummary` fields | pass |
| Entry builders for 3 of 4 `AuditEntryKind` values | pass (acceptable) |

`makeVersionBumpEntry` builder absent. Callers still build version-bump entries directly via the `AuditEntry` type, so this is a convenience gap rather than a contract violation. Flagged for Phase 2 Heracles implementer if frequently needed.

## 4. Findings

### 4.1 CRITICAL

None.

### 4.2 MINOR (all fixed in v2)

**M-1. `hecate.output.md` Section 8 strategic decisions list inconsistent with `decisions.md` Open Questions.**
- Pre-fix: Section 8 listed mock-vs-real (ADR 0004) and UI hash exposure (ADR 0005) as V3-blocked items, but ADR 0005 itself defers to Phoebe plus Harmonia not V3, and the actual V3-blocked ADR 0001 (trust formula weight split) was omitted.
- Fix: rewrote Section 8 to list ADR 0001 plus ADR 0004 as V3-blocked strategic decisions with recommended postures; moved ADR 0005 to a separate bullet noting the Phoebe plus Harmonia defer.
- Status: fixed.

**M-2. Missing `app/registry/trust/formula_weights.json` named by `trust_score.contract.md` Section 6.**
- Pre-fix: contract Section 6 names the path but Hecate task spec did not list it as an output, so v1 shipped only the in-code `DEFAULT_WEIGHTS` constant.
- Fix: shipped `formula_weights.json` mirroring `DEFAULT_WEIGHTS` with a schema-note that marks it as the runtime override point and directs contributors not to edit the in-code constant and JSON in parallel.
- Status: fixed.

**M-3. Silent clamp and silent weight-fallback deviate from contract Section 8 "with warning" language.**
- Pre-fix: `clamp01` inside `calculate` silently coerced out-of-range signals, and `normalizeWeights` silently substituted `DEFAULT_WEIGHTS` when inputs were negative or summed to zero. Contract Section 8 explicitly says "clamp with warning" and "falls back to defaults with warning".
- Fix: added `warnIfOutOfRange` helper that emits a single `console.warn` per `calculate` call listing the offending signal names plus identity context, and added a `console.warn` in `normalizeWeights` fallback branch with the offered weights payload. Single warn per call bounds noise.
- Status: fixed.

### 4.3 OBSERVATIONS (accepted deferrals, no fix)

**O-1. `calculate` includes `computed_at: new Date().toISOString()` which makes the returned `TrustScore` object non-deterministic even though `score` itself is deterministic.**
- Contract Section 9 determinism test only asserts `score` equality across repeat calls, so v1 is contract-conformant. `computed_at` is necessarily timestamp-based and cannot be pure without caller injection.
- Action: no fix. Acceptable per contract letter.

**O-2. `deriveStability` uses `inputs.positive_review_ratio === 0.5` as a heuristic for "no reviews exist".**
- Limitation: an identity with legitimately balanced reviews (for example 1 positive, 1 negative) would also match `0.5` and be marked `provisional`. Contract does not provide a separate review-count field to disambiguate.
- Action: no fix within this session. Post-hackathon change should extend `TrustInputs` with a `review_count` field via a contract version bump through Pythia, then stability can check for `review_count === 0` explicitly.

**O-3. `makeVersionBumpEntry` builder absent.**
- Not contract-mandated. Callers can construct `AuditEntry` directly with `kind: 'version_bump'`.
- Action: no fix. Heracles or Phase 2 implementer can add when their workflow demands it.

## 5. ADR Integrity Verification

| ADR | Title | Status v1 | Status v2 | Notes |
|---|---|---|---|---|
| 0001 | Trust formula weight split | proposed, pending V3 | proposed, pending V3 | Preserved. Contract defaults `{0.20, 0.30, 0.30, 0.20}` remain the recommended posture. |
| 0002 | Score storage `[0, 1]` float, UI 0 to 100 integer | locked | locked | Verified `toDisplayPercent` present and correct. |
| 0003 | Usage count normalization via `log1p`, cap 10,000 | locked | locked | Verified `normalizeUsage` matches the ADR formula. |
| 0004 | Hybrid mock plus real signal policy | proposed, pending V3 | proposed, pending V3 | Preserved. Hybrid posture applied in output.md Section 6. |
| 0005 | Defer hash UI exposure to Phoebe plus Harmonia | proposed, pending visual team | proposed, pending visual team | Preserved. Not a V3 item; moved correctly in output.md Section 8 fix. |
| 0006 | Audit summary derived, not stored | locked | locked | Verified `refreshAuditSummary` is the sole refresh path. |
| 0007 | Band cutoffs literal match | locked | locked | Verified `BAND_CUTOFFS` scan order and `deriveBand`. |

Seven ADRs, statuses preserved end-to-end. No unauthorized resolution.

## 6. Shallow-By-Design Sanity Check

Per NarasiGhaisan Section 6:

- No cryptographic signing. `prompt_hash` and `contract_hash` declared as advisory SHA-256 hex strings in schema comments. Confirmed.
- No real DNS. No DNS surface introduced. Confirmed.
- No blockchain. No blockchain surface introduced. Confirmed.
- Mock data primary, hybrid with live-run real signals per ADR 0004. Confirmed.

## 7. Fix Commits

Expected single commit with prefix `Hecate-v2 fix: ...` covering:

- `app/registry/leads/hecate.output.md` Section 8 rewrite.
- `app/registry/trust/formula_weights.json` new file.
- `app/registry/trust/trust_formula.ts` `warnIfOutOfRange` helper plus `normalizeWeights` warn branch.
- `docs/qa/hecate_v2_review.md` this review.

## 8. Remaining Open Questions To V3

Unchanged from v1. Only ADR 0001 and ADR 0004 await V3 sign-off; both safely default to the recommended posture so Phase 2 Worker spawn does not block.

## 9. Self-Check Summary

Self-check 19 of 19 pass.

- All hard constraints respected: no em dash, no emoji, English technical artifacts, model tier Opus 4.7, file paths per spec, contract conformance v0.1.0, honest-claim filter, daily rhythm window.
- ADR 0001 and ADR 0004 status unchanged.
- Fixes are additive (topic logs, missing JSON artifact, doc section rewrite); no v1 semantics broken.
- No contract drift initiated from this session; contract version bumps remain a Pythia responsibility.
