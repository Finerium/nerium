---
agent: demeter-v2
doc_type: audit_review
target_commit: 6607123
target_agent: demeter (v1)
pillar: marketplace
phase: P1
reviewer_model: opus-4-7
effort: max
generated_at: 2026-04-22
verdict: PASS
---

# Demeter v2 Debug Review

Surgical audit of Demeter v1 Marketplace Lead output. Each artifact was compared against the authoritative Pythia contracts (`marketplace_listing.contract.md v0.1.0`, `search_ranking.contract.md v0.1.0`), the Demeter prompt file `.claude/agents/demeter.md` hard constraints, NarasiGhaisan voice rules, and cross-pillar sibling artifacts already shipped in P1.

## Files Audited

1. `app/marketplace/schema/listing.schema.ts`
2. `app/marketplace/taxonomy/categories.json`
3. `app/marketplace/search/ranking_weights.json`
4. `app/marketplace/leads/demeter.output.md`
5. `docs/demeter.decisions.md` (9 ADRs)

Commit under review: `6607123`, landed 2026-04-22 by Demeter v1.

## Audit Matrix

### listing.schema.ts vs marketplace_listing.contract.md v0.1.0

| Check | Result |
|---|---|
| `AgentListing` shape matches contract Section 3 (all 16 fields, same types, same optionality) | CLEAN |
| `VendorOrigin` superset of contract (14 contract values all present, `nerium_builder` additive per ADR-01) | CLEAN |
| `PricingTier` matches contract (4 values, identical literals) | CLEAN |
| `CapabilityTag` matches contract (11 values, identical literals) | CLEAN |
| `UsageCostHint.estimate_range.low_usd`, `high_usd` shape | CLEAN |
| `LivingTemplateParam` fields (key, label, kind, enum_values?, default_value, description) | CLEAN |
| `ListingVisibility` matches contract (draft, public, unlisted, archived) | CLEAN |
| `MarketplaceCatalog` interface signatures (getListing, listBy with Partial filter, upsert, archive) | CLEAN |
| `ListingValidationError`, `UnknownIdentityError` classes | CLEAN |
| Validator enforces slug kebab-case lowercase alphanumeric, max 60 chars | CLEAN |
| Validator enforces short_description <= 280 chars | CLEAN |
| Validator enforces capability_tags count in [1, 5] | CLEAN |
| Validator enforces enum kind requires non-empty enum_values | CLEAN |
| Validator enforces estimate_range.low >= 0 and high >= low | CLEAN |
| Event topic constants match contract Section 5 (`marketplace.listing.{created,updated,archived}`) | CLEAN |
| File path matches contract Section 6 (`app/marketplace/schema/listing.schema.ts`) | CLEAN |
| Naming convention (snake_case string literals, PascalCase types) | CLEAN |
| File header comments reference contract v0.1.0 | CLEAN |

### categories.json vs marketplace_listing.contract.md Section 4 plus soft guidance

| Check | Result |
|---|---|
| Schema version, contract_ref, owner_agent, generated_at metadata present | CLEAN |
| Taxonomy depth 2 levels (category then subcategory) per soft guidance | CLEAN |
| Verticals count 12, all with >=1 subcategory | CLEAN |
| Restaurant automation placed under retail vertical (anchors NarasiGhaisan Section 5 example) | CLEAN |
| Vendors key set matches VENDOR_ORIGINS exactly (15 entries, one-to-one) | CLEAN |
| Pricing bands 4 entries matching PricingTier and Tyche tier_model.json (cross-pillar aligned) | CLEAN |
| Pricing band USD ranges non-negative and monotonic within each band | CLEAN |
| featured_default_policy documented (trust_weighted mode, recency tie-break, curator carousel separate rail) | CLEAN |

### ranking_weights.json vs search_ranking.contract.md v0.1.0

| Check | Result |
|---|---|
| Schema version, contract_ref, owner_agent, weights_version metadata present | CLEAN |
| 5 signal weights present: semantic_similarity, trust_score, popularity, recency, pricing_tier_affinity | CLEAN |
| Each weight in [0.0, 1.0] | CLEAN |
| Sum invariant 1.0 (0.55 + 0.25 + 0.10 + 0.05 + 0.05 = 1.00) | CLEAN, verified numerically |
| Rationale field per signal | CLEAN |
| tie_breakers documented (recency_normalized desc, listing_id lexicographic asc) matches contract Section 4 | CLEAN |
| Normalization strategy documented (min_max_over_candidates) matches contract Section 4 | CLEAN |
| weights_version follows semver | CLEAN |

### demeter.output.md vs spec compliance

| Check | Result |
|---|---|
| Frontmatter present (agent, tier, pillar, phase, parallel_group, model, contract_refs, version, status, last_updated) | CLEAN |
| Mission recap references NarasiGhaisan Section 5 pain anchor | CLEAN |
| Shipped artifacts list matches 5 produced files | CLEAN |
| Schema shape summary accurate to listing.schema.ts | CLEAN |
| Taxonomy summary accurate to categories.json (12 verticals, 15 vendors, 4 bands) | CLEAN |
| Ranking weights summary accurate to ranking_weights.json | CLEAN |
| Handoff matrix covers Apollo, Eos, Artemis, Coeus, Tyche, Hecate per prompt Handoff Target | CLEAN |
| Cross-pillar coordination notes (Tyche, Athena, Hecate, Ananke) present | CLEAN |
| Contract conformance statement explicit | CLEAN |
| Honest-claim disclaimers per NarasiGhaisan Section 20 | CLEAN |
| Self-check summary referenced | CLEAN |

### demeter.decisions.md 9 ADRs integrity

| ADR | Status |
|---|---|
| ADR-01 VendorOrigin reconciliation | CLEAN, context plus decision plus consequences complete |
| ADR-02 Pricing tier 4 bands | CLEAN, matches Pythia contract and Tyche tier_model.json |
| ADR-03 Trust-weighted default sort | CLEAN, strategic_decision_hard_stop resolved |
| ADR-04 Living-template param kinds | CLEAN, hard constraint satisfied |
| ADR-05 Vendor-origin filter surfaced | CLEAN, strategic_decision_hard_stop resolved |
| ADR-06 Pricing-tier alignment with Tyche | CLEAN, claim "Both contracts pin the same string literals" verified against `docs/contracts/billing_meter.contract.md` line 34 (`export type PricingTier = 'free' \| 'cheap' \| 'mid' \| 'premium';`) and Tyche `tier_model.json` tiers array (free, cheap, mid, premium) |
| ADR-07 12 verticals | CLEAN |
| ADR-08 Rationale embedded in weights JSON | CLEAN |
| ADR-09 Hand-rolled validator no Zod dependency | CLEAN |

### Voice and Style Audit

| Check | Result |
|---|---|
| Em dash (U+2014) absent | CLEAN, grep returned zero matches |
| Emoji and non-ASCII absent | CLEAN, LC_ALL=C grep returned zero non-ASCII |
| Register English technical in artifacts | CLEAN |
| Honest-claim filter: no claim Marketplace is live trading | CLEAN, disclaimer section 9 explicit |

### Cross-Pillar Compatibility Spot Checks

| Check | Result |
|---|---|
| Pricing tier string set alignment Marketplace vs Banking | CLEAN, identical `'free' \| 'cheap' \| 'mid' \| 'premium'` literals across `listing.schema.ts`, `billing_meter.contract.md`, `app/banking/pricing/tier_model.json` |
| creator_identity_id opaque handoff to Hecate | CLEAN, schema field is plain string pointer, Registry owns resolution |
| Event namespace non-collision | CLEAN, `marketplace.*` reserved per contract Section 5 |
| File path non-collision with sibling Leads | CLEAN, `app/marketplace/` tree exclusive to Demeter plus P2 marketplace Workers |

## Critical Fixes (Fix In Place)

None. No defects that break contracts, invariants, or honest-claim filter were found.

## Minor Observations (Noted, No Fix Applied)

### M1 Contract Section 8 advisory check not implemented

Contract states: "`pricing_tier` inconsistent with `usage_cost_hint.estimate_range`: logs warning, accepts (advisory)." The v1 validator is strict-throw only and does not emit the advisory warning for this specific mismatch. The contract flags this check as "advisory" not "required", so omission is contract-compliant, but a downstream Worker wanting pricing-consistency surface (for example Eos submission preview) would need to hand-roll the check or wait for a post-hackathon adapter.

Recommendation: add `checkPricingConsistencyAdvisory` as a separate non-throwing helper in `listing.schema.ts` in a future non-blocking edit when Eos surfaces the need. Not blocking.

### M2 ranking_types.ts not shipped by Demeter

Search ranking contract Section 3 shows the TypeScript types with a header comment referencing path `app/marketplace/search/ranking_types.ts`. Demeter v1 prompt output mandate lists `ranking_weights.json` only, not the types file. Coeus P2 will consume the types from the contract markdown or regenerate locally. This is compliant with the prompt spec, but ownership for `ranking_types.ts` creation is implicit rather than explicit.

Recommendation: clarify ownership in Coeus prompt file or have Demeter proactively ship `ranking_types.ts` as a thin re-export of the contract types in a future session. Not blocking for P1 close.

### M3 UnknownIdentityError class defined but never thrown from validator

The class is defined in `listing.schema.ts` so consumers have a stable error type to catch, but `validateListingShape` never throws it. Contract Section 8 says "`creator_identity_id` not found in Registry: throws `UnknownIdentityError`" which is a catalog-layer responsibility (requires Registry round-trip). Correct separation of concerns, but future readers might wonder why the class ships here.

Recommendation: add a one-line JSDoc above `UnknownIdentityError` noting it is thrown by `MarketplaceCatalog.upsert` implementations, not `validateListingShape`. Not blocking.

## Clean Confirmations

- Weights sum to exactly 1.00, verified via `json.load` plus numeric sum, all five weights within [0.0, 1.0].
- Zero em dash occurrences across all five artifacts.
- Zero non-ASCII code points across all five artifacts.
- 14 of 14 contract VendorOrigin values present in shipped enum; 1 additive entry (`nerium_builder`) documented in ADR-01.
- Pricing tier literal set matches Tyche's shipped `tier_model.json` one-to-one: free, cheap, mid, premium.
- All 5 output files produced per prompt spec, at the exact paths mandated.
- Cross-pillar coordination notes accurate against Tyche row 4 and Hecate row 5 shipped artifacts in TokenManager.
- Commit message for 6607123 follows project convention, references Demeter plus P1 Marketplace Lead.

## Verdict

**PASS.**

All five artifacts conform to contracts v0.1.0, honor honest-claim filter, and integrate cleanly with sibling P1 pillar outputs (Tyche Banking, Hecate Registry, Athena Builder, Proteus Protocol). The three minor observations above are optional improvements, not blockers. Demeter v1 output is ready for P2 Worker consumption (Eos, Artemis, Coeus).

No critical fix commit necessary. This review doc stands as the audit artifact.
