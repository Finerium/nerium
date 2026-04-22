---
agent: demeter
doc_type: adr_log
pillar: marketplace
phase: P1
version: 0.1.0
last_updated: 2026-04-22
---

# Demeter Architecture Decision Records

Linear append-only log. Each ADR states context, decision, consequences. No deletions; superseding entries reference the prior ADR number.

## ADR-01 VendorOrigin enum reconciliation and nerium_builder addition

**Context.** The Demeter prompt file `.claude/agents/demeter.md` mandates VendorOrigin enum entries with slugs `mcp_hubs`, `hugging_face`, `replit_agent`, `cloudflare_ai`, plus the additive `nerium_builder`. The Pythia authoritative contract `marketplace_listing.contract.md v0.1.0` Section 3 ships `mcp_hub`, `huggingface_space`, `replit`, `cloudflare_marketplace`, and does not include `nerium_builder`. The semantic intent is identical for the four overlapping entries; only the string literal differs.

**Decision.** Honor the Pythia contract naming as authoritative because the contract is the cross-pillar pinned interface consumed by Eos, Artemis, Coeus, Phoebe, Tyche, and Hecate. Add `nerium_builder` to the enum as a superset, non-breaking addition because Marketplace must represent agents minted by Builder itself. Document the reconciliation here so the prompt-vs-contract diff is traceable.

**Consequences.** Prompt-file hard constraint is semantically satisfied though the surface strings match the contract. Downstream Workers can pin against contract v0.1.0 with zero surprise. Future vendor additions follow the contract path: propose edit, bump PATCH version of the contract, regenerate schema file.

**Supersedes.** None.

## ADR-02 Pricing tier set (free, cheap, mid, premium, no enterprise)

**Context.** Prompt creative latitude listed five candidate bands (Free, Cheap, Mid, Premium, Enterprise). Tyche's billing meter contract is also being drafted in parallel P1. Enterprise tier implies custom pricing and off-catalog negotiation that no hackathon agent actually exercises.

**Decision.** Ship four bands (free, cheap, mid, premium) for hackathon scope. Defer enterprise tier to post-hackathon refactor when real enterprise buyers appear. This matches Pythia contract Section 3 exactly.

**Consequences.** Fewer moving parts for the demo. Tyche alignment risk is minimized. If Tyche independently ships enterprise, reconcile via a MINOR bump (non-breaking add). Listed in Post-Hackathon Refactor Notes in both contract and `demeter.output.md`.

## ADR-03 Default browse sort is trust-weighted with recency tie-break

**Context.** Strategic_decision_hard_stop in the Demeter prompt file asks for default sort order pick (recency vs trust-weighted vs curator-picked). Recency risks surfacing low-quality just-submitted listings. Pure curator-picked does not scale and injects Demeter bias into the frontpage. Trust-weighted aligns with the pain resolution (buyers need reliability signal).

**Decision.** Trust-weighted primary, recency_normalized tie-break. Curator-picked carousel runs as a separate non-ranked home rail for manual highlight. Recorded in `categories.json` under `featured_default_policy`.

**Consequences.** Newcomer listings without established trust may rank lower by default. Mitigation: the search ranker still respects semantic_similarity dominance in query flows, so newcomers surface on targeted queries even with low trust. Post-hackathon refactor lists a freshness-adjusted trust formula to prevent fossilization.

## ADR-04 Living-template param kinds limited to string, enum, number, boolean

**Context.** Prompt hard constraint mandates the minimum set string, enum, number. Builder (Athena) will emit templates with these kinds today. Composite kinds (nested objects, arrays) add schema complexity that hackathon Workers (Eos form rendering, Coeus customization surface) cannot absorb in the timeline.

**Decision.** Ship four param kinds (string, enum, number, boolean). Boolean added because toggle-style remix inputs are a common and cheap extension of the mandated minimum. No composite kinds.

**Consequences.** Remix surface stays visually coherent: text input, dropdown, number input, toggle. Post-hackathon can add `structured` kind with JSON subschema for advanced authors.

## ADR-05 Vendor-origin filter surfaced as user-facing browse dimension

**Context.** Strategic_decision_hard_stop asks whether vendor origin appears as a filterable dimension in the hackathon demo. Surfacing it increases Marketplace credibility because cross-vendor coverage is the pillar's core value proposition. Hiding it reduces UI complexity for Artemis but weakens the demo story.

**Decision.** Surface vendor origin as a filterable dimension in Artemis browse UI. Recommendation of the Demeter prompt file aligns with the pillar value prop.

**Consequences.** Artemis budget includes the vendor-facet chip rail. Ananke logs facet usage via `marketplace.search.executed` with `filter_vendor_origin`. Demo script can point to the facet as concrete evidence of neutral cross-vendor positioning.

## ADR-06 Pricing-tier alignment ferry to Tyche

**Context.** Prompt halt trigger: pricing-tier enumeration decision requires alignment with Tyche's billing model. Tyche is a sibling P1 Lead; outputs land in parallel.

**Decision.** Proactively align on the four bands (free, cheap, mid, premium) via the contract set shared through Pythia's `marketplace_listing.contract.md` and `billing_meter.contract.md`. Both contracts pin the same string literals. If Tyche returns with a different set, Apollo arbitrates; Marketplace downgrades to whichever common subset is safe and bumps PATCH.

**Consequences.** No Tyche handoff delay needed. Alignment artifact is the shared contract reference in both output specs. Surfaced to V3 in the post-session ferry note for parallel-P1 coordination visibility.

## ADR-07 Twelve verticals selected for hackathon taxonomy

**Context.** Prompt creative latitude gave a defensible set: agriculture, finance, customer support, dev tools, creative, education, ops, retail, healthcare, legal. Restaurant automation from NarasiGhaisan Section 5 needs a home.

**Decision.** Ship twelve verticals: add `research` (spans literature survey, data extraction, synthesis) and `other` (fallback) to the defensible ten. Restaurant automation lives under `retail` subcategory. All other suggested verticals shipped intact.

**Consequences.** Demo listings can populate across verticals without hitting an "other" bucket prematurely. Research is a natural sibling to dev_tools and finance for demo coverage.

## ADR-08 Weights JSON carries rationale inline rather than separate doc

**Context.** Ranking weights are tunable without code change per contract Section 7. Rationale for each signal weight aids future tuning.

**Decision.** Embed `rationale` field per signal in the JSON itself. Keeps auditability local to the weights artifact. Weight_version follows semver so Ananke can diff weight drift over time.

**Consequences.** Any weight bump requires updating rationale in the same edit, enforcing a small but useful discipline.

## ADR-09 Validator lives in schema file rather than separate module

**Context.** Hackathon scope keeps file count low. Zod is a contract-mentioned option but introduces a dependency. Hand-rolled validators satisfy the contract testing surface without dependency cost.

**Decision.** Ship `validateListingShape` inline in `listing.schema.ts`. Named error classes (`ListingValidationError`, `UnknownIdentityError`) shipped alongside. A Zod adapter can be added post-hackathon if typed schema composition becomes needed.

**Consequences.** No Zod runtime dependency. Catalog implementations (`SqliteCatalog`) call `validateListingShape(listing)` before write. Eos form layer can reuse the same validator for live client-side feedback.
