---
name: athena.decisions
description: ADR-style log of architectural decisions Athena made during P1
type: adr_log
owner: athena
version: 0.1.0
last_updated: 2026-04-22
---

# Athena Decision Log

Short ADRs covering architectural pivots during Athena P1. Each entry gives date, decision, alternatives considered, tradeoff accepted, and rationale.

---

## ADR-001: Vendor-neutral signatures on the executor base class

**Date:** 2026-04-22

**Decision:** `BuilderSpecialistExecutor` abstract class takes and returns only Builder-internal types (`SpecialistInput`, `SpecialistOutput`). No Anthropic SDK types appear in the public signatures. Vendor-specific config is injected through a concrete class constructor (`AnthropicDirectConfig`, `AnthropicManagedConfig`).

**Alternatives considered:**

1. Expose `Anthropic.Messages.MessageCreateParams` as an overload. Saves marshaling.
2. Duck-typed `Record<string, unknown>` input. Maximum flexibility but no type safety.

**Tradeoff accepted:** Slight marshal cost at lane boundary, slight verbosity in Anthropic-specific lane code.

**Rationale:** NarasiGhaisan Section 3 is explicit that multi-vendor is a product feature, not post-hoc flexibility. If Anthropic types bleed into the base class, adding Gemini or Higgsfield later requires refactoring every consumer. Cost of marshaling is trivial; cost of a later refactor across Apollo, Cassandra, Helios, Tyche, Heracles call sites is not. Locking this at day one per contract Section 11 post-hackathon note.

---

## ADR-002: Framework choice not re-litigated

**Date:** 2026-04-22

**Decision:** Treat the Next.js 15 framework lock as settled per `builder_specialist_executor.contract.md` Section 10 ("Framework commit (Next.js 15 locked per Metis) removes prior ambiguity") and CLAUDE.md Tech Stack section. No halt emitted to V3 on framework.

**Alternatives considered:**

1. Halt to V3 per `strategic_decision_hard_stop` in Athena prompt file.
2. Propose Vite plus React as a lighter stack.

**Tradeoff accepted:** One less explicit ferry round, rely on the Pythia contract and Metis lock as the authoritative source.

**Rationale:** The hard stop in Athena's prompt exists for the case when the framework choice is genuinely open. Pythia contract Section 10 already records Next.js 15 as locked by Metis, and CLAUDE.md confirms at root. Re-asking V3 would be ceremonial and would cost wallclock against the Day 1 P1 budget. If V3 disagrees, a simple ferry swap at the scaffolding layer touches one import in the executor wiring, not the interface.

---

## ADR-003: Managed Agents lane is a P1 skeleton, not a functional stub

**Date:** 2026-04-22

**Decision:** `AnthropicManagedExecutor.execute` returns `status: 'error'` with a P1 skeleton message in this session. Heracles P2 replaces the body with real MA session orchestration (POST /v1/sessions, SSE consumption, Files API artifact pull).

**Alternatives considered:**

1. Seed a functional stub that returns canned `SpecialistOutput` so Helios UI dev can subscribe to events immediately.
2. Block Athena delivery on Heracles availability, produce executable MA code here.

**Tradeoff accepted:** Helios must mock pipeline events locally during P1 UI build rather than consume real emissions from the MA lane.

**Rationale:** Heracles is the MA domain owner per M2 Section 5.10. Authoring MA client code in the Lead pass duplicates ownership and risks drift when Heracles rewrites. Helios already needs to mock events for UI dev regardless of MA functional state because `AnthropicDirectExecutor` is also a P1 skeleton. The skeleton-only path is cleaner. Athena prompt file `strategic_decision_hard_stop` entry 3 defaults to exactly this choice.

---

## ADR-004: Lumio step count at 11, not 10 or 12

**Date:** 2026-04-22

**Decision:** Lumio pipeline topology ships with 11 specialists. Adds a `lumio_final_strategist` launch pass after `lumio_deployer`.

**Alternatives considered:**

1. Ten specialists, drop `lumio_final_strategist`.
2. Twelve specialists, add a dedicated `lumio_brand_designer` before `lumio_asset_designer`.

**Tradeoff accepted:** One extra Opus call per run, small budget impact.

**Rationale:** Launch strategist closes the narrative loop for the demo: brief, build, test, deploy, launch. Without it, the pipeline ends on a deploy plan that has no user-facing story attached. Adding a separate brand designer would add visual novelty but duplicates the asset designer role and creates an ambiguous handoff. Eleven stays inside the 10-to-12 bound in the prompt spec and gives the demo narrative a clean arc.

---

## ADR-005: Auto lane ships as a wrapper, not a router

**Date:** 2026-04-22

**Decision:** `AutoExecutor` wraps an inner executor and relabels `vendor_lane_used` to `auto` on the returned output. Inner executor is supplied at construction time. For the hackathon this is always `AnthropicDirectExecutor`. No routing logic ships.

**Alternatives considered:**

1. Inline routing logic inside `AutoExecutor` that picks a lane per input based on role plus config.
2. Skip `AutoExecutor` until post-hackathon.

**Tradeoff accepted:** Auto mode does nothing differently from direct mode during the hackathon demo. The UI chip is truthful because the label survives end-to-end via the relabeling.

**Rationale:** NarasiGhaisan Section 3 lists Auto as one of four user-facing strategies. Shipping the type hook now with an honest stub behavior is cheaper than adding a new executor class post-hackathon and rewiring callers. The wrapper pattern also preserves the single-responsibility rule: routing logic belongs in its own class once it exists, not tangled into the base executor.

---

## ADR-006: Event bus wildcard subscription reserved for Ananke only

**Date:** 2026-04-22

**Decision:** Document that `'*'` subscription, available per `event_bus.contract.md` Section 4, is reserved for Ananke's audit tap in the hackathon scope. Other subscribers take specific topics.

**Alternatives considered:**

1. Let any subscriber use wildcard freely.
2. Remove wildcard from the contract.

**Tradeoff accepted:** Restricts some convenience subscribers (e.g., debug panes) from using wildcard, at the cost of a small amount of discipline.

**Rationale:** Wildcard consumers are the most expensive event bus clients because they see every topic. If multiple subscribers take wildcard, a single slow handler can backpressure the bus. Per `event_bus.contract.md` Section 8, a handler throwing 3 times in 60s triggers auto-unsubscribe plus a `pipeline.run.failed` cascade. Limiting wildcard usage to one known-safe consumer (Ananke) keeps the cascade risk bounded. Not encoded in the contract itself; documented here as a soft convention for reviewers.

---

## Open items (not yet decided, surfaced to V3)

- Deployment platform lock (Ghaisan hold). `lumio_deployer` plans only, does not provision.
- Whether `multi_vendor` strategy UI chip should be visually greyed out to signal post-hackathon status, or fully interactive with a tooltip. Defer to Tyche plus Morpheus UI decision.
- Event bus replacement (in-memory vs Redis) is a post-hackathon refactor item per `event_bus.contract.md` Section 11. No decision needed now.
