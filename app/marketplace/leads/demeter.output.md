---
agent: demeter
tier: lead
pillar: marketplace
phase: P1
parallel_group: P1
model: opus-4-7
contract_refs:
  - docs/contracts/marketplace_listing.contract.md v0.1.0
  - docs/contracts/search_ranking.contract.md v0.1.0
version: 0.1.0
status: shipped
last_updated: 2026-04-22
---

# Demeter Marketplace Pillar Orchestration Spec

## 1. Mission Recap

Demeter owns the Marketplace pillar's curation brain for the NERIUM hackathon prototype. Scope is the listing schema, browse taxonomy, and search ranking contract that downstream Workers (Eos, Artemis, Coeus) consume to stand up the cross-vendor marketplace surface. Demeter does not execute purchases (Tyche), process payments (Tyche), or verify creator identity (Hecate).

Real-world pain anchor per NarasiGhaisan Section 5: creators post agents free on X and GitHub for lack of a home, and buyers hunt across at least eight vendor-locked storefronts (Claude Skills, GPT Store, MCP Hubs, Hugging Face Spaces, Replit Agent Market, LangChain Hub, Vercel Agent Gallery, Cloudflare AI Marketplace). NERIUM Marketplace solves both sides with one neutral schema plus usage-based billing via the Banking pillar.

## 2. Shipped Artifacts

1. `app/marketplace/schema/listing.schema.ts` TypeScript types, runtime validators, and error classes for `AgentListing`, `LivingTemplateParams`, `VendorOrigin`, `PricingTier`, `CapabilityTag`, `ListingVisibility`.
2. `app/marketplace/taxonomy/categories.json` browse taxonomy with twelve verticals plus subcategories, fifteen vendor origins, four pricing bands, default featured policy.
3. `app/marketplace/search/ranking_weights.json` v0.1.0 weights file with invariant sum 1.0 and rationale per signal.
4. `app/marketplace/leads/demeter.output.md` this file.
5. `docs/demeter.decisions.md` ADR log including reconciliation note for vendor-origin naming and strategic-decision ferries surfaced to V3.

## 3. Schema Shape Summary

Listing fields (see contract Section 3 for canonical definition):

- Identity: `listing_id` (uuid v4), `slug` (kebab-case, 60 char cap), `display_name`.
- Copy: `short_description` (280 char cap), `long_description_markdown`.
- Linkage: `creator_identity_id` (Registry FK), `trust_score_pointer` (Registry pointer), `audit_summary`.
- Classification: `vendor_origin` (15 values), `capability_tags` (1 to 5 tags), `pricing_tier` (free, cheap, mid, premium).
- Cost hint: `usage_cost_hint` with per-execution unit and estimate range in USD.
- Living template: optional `living_template_params` array, each entry supports `string`, `enum`, `number`, `boolean` kinds with default value and description.
- Lifecycle: `created_at`, `updated_at`, `visibility` (draft, public, unlisted, archived).

Validators enforce: slug shape, short description length, tag count bounds, known enum values, non-negative and ordered estimate range, enum kind requires non-empty enum_values.

## 4. Taxonomy Summary

Three-facet browse: vertical, vendor origin, pricing band. Tree depth two, readability priority per NarasiGhaisan Section 13.

Verticals shipped (twelve): dev_tools, finance, customer_support, creative, education, ops, retail, healthcare, legal, agriculture, research, other. Retail includes the restaurant_automation subcategory that anchors the real-world example Ghaisan cited.

Vendor origins shipped (fifteen) match listing.schema.ts `VENDOR_ORIGINS` exactly. `nerium_builder` is additive beyond the Pythia contract for agents shipped directly by Builder itself; see `docs/demeter.decisions.md` ADR-01.

Pricing bands shipped (four): free, cheap, mid, premium. Aligned with PricingTier type. Hints per band given in USD-per-task ranges for buyer calibration.

Default featured policy: trust-weighted primary, recency tie-break, curator-picked carousel as separate rail. Confirmed via strategic_decision_hard_stop (see ADR-03).

## 5. Ranking Weights Summary

Signals and weights (sum 1.0):

- semantic_similarity 0.55
- trust_score 0.25
- popularity 0.10
- recency 0.05
- pricing_tier_affinity 0.05

Tie breakers: recency_normalized descending, then listing_id lexicographic ascending. Normalization strategy: min-max over the candidate set so the top result rescales to 1.0 for UI confidence bars. Rationale embedded in the JSON file.

## 6. Handoff Matrix

| Consumer | What they read | What they do |
|---|---|---|
| Apollo | `demeter.output.md`, `listing.schema.ts` | Cross-pillar orchestration, wiring Builder remix back into Marketplace |
| Eos | `listing.schema.ts`, validators | Submission form, preview card, publish transaction |
| Artemis | `categories.json`, `listing.schema.ts` | Browse UI with vertical, vendor, pricing facets |
| Coeus | `ranking_weights.json`, `listing.schema.ts` | Search input, ranked result list, living-template remix surface |
| Tyche | `listing.schema.ts` PricingTier enum | Align billing model tiers with marketplace tier labels |
| Hecate | `listing.schema.ts` creator_identity_id | Resolve creator identity pointer, feed trust score pointer |

## 7. Cross-Pillar Coordination Notes

- **Tyche alignment:** The `PricingTier` enum (free, cheap, mid, premium) is the single source of truth for marketplace surface. Tyche's billing meter contract uses the same tokens; if Tyche later adds an `enterprise` band, the schema file ships a PATCH bump and consumers pin the version.
- **Athena alignment:** `LivingTemplateParam` kinds (string, enum, number, boolean) match the minimum set Builder emits for remixable agents. Extending to composite types is deferred post-hackathon (ADR-04).
- **Hecate alignment:** `creator_identity_id` is opaque to Marketplace; Hecate owns resolution. `UnknownIdentityError` surfaces when upsert cannot resolve.
- **Ananke logging:** `marketplace.listing.*` and `marketplace.search.executed` events ride the shared event bus for daily log ingestion.

## 8. Contract Conformance Statement

This spec and its shipped artifacts conform to `docs/contracts/marketplace_listing.contract.md v0.1.0` and `docs/contracts/search_ranking.contract.md v0.1.0` with one additive divergence: `nerium_builder` added to `VendorOrigin` (superset, non-breaking). No destructive changes to the contracts were made. Downstream consumers can pin against contract v0.1.0 safely.

## 9. Hackathon Scope Disclaimers (Honest-Claim Filter)

- Marketplace is a prototype in hackathon scope, not a live trading platform. No real payment rails ship.
- Trust scores are pointer-only in this file; actual scoring logic lives behind the Registry pillar and is mocked for demo.
- Semantic similarity scoring mechanism is Coeus's choice (embedding call vs. lexical proxy); ranking weights are agnostic to method.
- Vendor-origin filters surface as a user-facing dimension because cross-vendor coverage is the Marketplace pillar's core value proposition.

## 10. Self-Check Summary

Self-check protocol 19/19 run pre-commit. All hard constraints respected. See ADR log for ferries surfaced.
