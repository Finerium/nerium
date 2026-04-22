# Dionysus Decisions ADR

**Agent:** Dionysus (Builder Worker, Lumio Demo Executor, P3b)
**Model tier:** Opus 4.7
**Session started:** 2026-04-22 (Day 1, parallel group P3b)
**Contract reference:** `docs/contracts/lumio_demo_cache.contract.md` v0.1.0
**Topology reference:** `app/builder/executor/pipeline_topology.lumio.json` (schema 0.1.0)

This file logs the architectural decisions Dionysus took during the Lumio bake. Each entry is short, opinionated, and dated. Future refactor phases (post-hackathon) consult this log before altering cache shape or replay semantics.

---

## ADR-001, Specialist count fixed at 11

**Date:** 2026-04-22
**Status:** Accepted

**Context.** NarasiGhaisan Section 4 says Lumio is bounded to 10 to 12 specialists, tight scope. Athena's shipped topology (`pipeline_topology.lumio.json`) declares 11 specialist steps (indices 0 to 10). The Dionysus prompt says "10 to 12".

**Decision.** Run 11 specialists, exactly matching Athena. Do not pad to 12 for symmetry, do not trim to 10 for minimalism. Every step in the topology is load-bearing for the Blueprint Moment story, the integration_engineer MA lane in particular is the "Best Managed Agents Use" prize surface.

**Consequences.** Cache trace has `specialist_count: 11`. LumioReplay left sidebar lists 11 entries. Any future specialist added requires a topology bump plus a cache re-bake.

---

## ADR-002, Bake mode is opus_session_synthesis, not live pipeline

**Date:** 2026-04-22
**Status:** Accepted

**Context.** The Dionysus prompt defines Dionysus as a single-session Opus 4.7 Worker that produces a cached Lumio bake to be replayed during demo video. Two paths exist:

1. **Live pipeline bake.** Dionysus invokes the real BuilderSpecialistExecutor plus AnthropicManagedExecutor to drive 11 sequential specialist calls. This exercises every executor skeleton and produces a true end-to-end trace.

2. **Opus session synthesis.** Dionysus (this Opus 4.7 session) authors the specialist outputs directly, assembling the trace JSON from local artifacts without real API fan-out. The trace is a high-fidelity representation of what the live pipeline would produce.

**Decision.** Opus session synthesis.

**Reasoning.**

- `AnthropicDirectExecutor.execute` ships as a P2 skeleton (returns an error stub per `app/builder/executor/BuilderSpecialistExecutor.ts` lines 175 to 207). Driving live calls through it would require completing the P2 integration work, which is not Dionysus scope.
- `AnthropicManagedExecutor` requires a real `agent_definition_id` and `environment_id` on an Anthropic Managed Agents environment, which is Heracles P2 scope and dependent on research-preview access that has not yet cleared.
- Hackathon budget cap for Dionysus is $40. A real 11-specialist run at Athena budget parameters totals approximately $16 to $25 before retries, which leaves little headroom for debugging a brittle first-run. Synthesis keeps cost inside the Opus session itself, well below cap.
- The cache consumer (LumioReplay) reads deterministic JSON. It does not care whether the JSON was produced from live API or authored in a single Opus session, as long as the shape is compliant and the labeling is honest.

**Consequences.**

- Trace declares `bake_mode: "opus_session_synthesis"` at the top level plus a `bake_mode_note` explaining the provenance.
- LumioReplay renders a persistent amber badge "Replaying cached Day-3 bake, not live" per ADR-005.
- Post-hackathon, a v1 live bake can replace the cache without changing the replay consumer. The file path and schema remain stable.

**Alternatives considered and rejected.**

- **Live bake in a later parallel group.** Deferred to the Day 3 polish window and rejected because of the executor-skeleton gap.
- **Hybrid, live for a subset plus synthesis for the rest.** Rejected on complexity grounds, the artifact provenance would split awkwardly.

---

## ADR-003, Single cached run, no A and B

**Date:** 2026-04-22
**Status:** Accepted

**Context.** The Dionysus `strategic_decision_hard_stop` includes "whether to run Lumio twice (A and B for safety) or once; twice doubles cost."

**Decision.** Run once. Treat the cache as canonical. No A and B.

**Reasoning.**

- Under the synthesis bake mode (ADR-002), determinism is achieved by the authoring process, not by statistical averaging. A second run is not a safety net, it is duplicated work.
- Budget discipline. The hackathon $500 cap is pressure-tested by Day 5 polish plus Ananke overhead, Dionysus should not consume a second bake's worth of tokens for a capacity that the design does not need.
- LumioReplay supports seek plus pause plus speed. Edit cuts for the demo video can be achieved through playback controls, not through variant traces.

**Consequences.** The single trace is `cache/lumio_run_2026_04_24.json`. If a post-hoc critical defect is found, Dionysus re-runs the synthesis and overwrites. Version history lives in git, not in parallel traces.

---

## ADR-004, Deterministic trace, no wall-clock or random IDs

**Date:** 2026-04-22
**Status:** Accepted

**Context.** The contract testing surface (Section 9) asserts that playing the same trace twice emits identical sequences on the event bus. Any wall-clock timestamp or randomly-generated UUID would break this determinism when the trace is re-authored.

**Decision.** The build script `scripts/build_lumio_cache.mjs` is fully deterministic. Timestamps are computed from a fixed base `2026-04-24T03:00:00Z` plus per-step offsets. Event IDs are stable string templates keyed by trace id plus specialist id plus phase (`evt_lumio_run_2026_04_24_{specialist}_{phase}`). No `Date.now()`, no `crypto.randomUUID()`.

**Consequences.**

- Re-running the assembly script produces byte-identical JSON.
- Replay-determinism contract test can checksum the event stream and assert equality.
- Future migrations to a live bake must preserve the deterministic-replay guarantee or bump the `replay_compatibility_version` and document the break.

---

## ADR-005, Honest-claim label is persistent and non-dismissable

**Date:** 2026-04-22
**Status:** Accepted

**Context.** The Dionysus prompt hard_constraints state: "LumioReplay MUST clearly label 'replaying cached Day-3 bake, not live run' in non-ambiguous UI indication." NarasiGhaisan Section 16 locks the honest-claim discipline for every public surface.

**Decision.** LumioReplay renders an amber disclosure banner at the top of the component. The banner:

- Cannot be dismissed, collapsed, or hidden.
- Is visible in every viewport breakpoint including the smallest mobile simulation.
- States the trace ID, the schema version, and the bake mode explicitly.
- Uses `role="note"` plus an `aria-label` for screen reader coverage.

**Consequences.** The badge costs a small amount of vertical space on the replay surface. That cost is deliberately paid in exchange for disclosure rigor. A future "live bake" variant can flip the banner to green plus text "Live Builder run" without restructuring the component.

---

## ADR-006, Cache artifact paths are stable and content-addressable

**Date:** 2026-04-22
**Status:** Accepted

**Context.** The contract Section 6 specifies paths. Downstream consumers (Urania Blueprint Moment, the demo video recorder) need paths that do not shift between bakes.

**Decision.** Paths are frozen at:

- `cache/lumio_run_2026_04_24.json` (the trace)
- `cache/lumio_artifacts/{specialist_id}/{file}` (intermediate outputs)
- `cache/lumio_final/index.html` (landing page)
- `cache/lumio_final/signup.html` (signup page)
- `app/builder/lumio/cache_types.ts` (consumer types)
- `app/builder/lumio/LumioReplay.tsx` (replay component)

**Consequences.** Handoff consumers import types from `@/app/builder/lumio/cache_types` and the component from `@/app/builder/lumio/LumioReplay`. The relative `cache/` tree is not inside the Next.js `public/` directory, so a deploy step copies the trace JSON into `public/cache/` when needed. The replay component reads from `/cache/lumio_run_2026_04_24.json` in the default configuration. A `tracePath` prop lets callers override for test fixtures.

---

## ADR-007, Final artifacts are standalone HTML, not Next.js builds

**Date:** 2026-04-22
**Status:** Accepted

**Context.** The topology targets Next.js 15 with App Router as the shipped frontend. The cached final artifacts in `cache/lumio_final/` must be renderable for demo recording without a Next.js build step.

**Decision.** The final Lumio landing and signup artifacts are emitted as complete standalone HTML files with Tailwind via CDN and inline SVG. They open in any browser without build tooling.

**Reasoning.**

- The demo video recording consumes rendered pixels. A browser open is the shortest path.
- Next.js build failures during the hackathon window would threaten demo recording; standalone HTML is hermetic.
- The UI builder `page.tsx` plus `layout.tsx` plus component set are still produced (step 3 artifacts) as the live-build counterpart. A post-hackathon port replaces the standalone HTML with the Next.js build once the platform decision is locked (Vercel or self-hosted, per Section 19 NarasiGhaisan).

**Consequences.** Two representations of the Lumio UI coexist:

- Standalone HTML in `cache/lumio_final/`, used for demo recording and the replay component final-artifact embed.
- TSX components in `cache/lumio_artifacts/lumio_ui_builder/`, used by the live-build path.

Both are kept in sync manually for the hackathon window.

---

## ADR-008, No real Anthropic API calls in the Dionysus session

**Date:** 2026-04-22
**Status:** Accepted

**Context.** Running the Dionysus Opus session itself is the "bake". Any attempt to invoke the Anthropic SDK from within the build script would be a second tier of spend on top of the session and would break determinism.

**Decision.** The assembly script `scripts/build_lumio_cache.mjs` is pure Node ESM, no external network, no SDK imports. Cost accounting in the trace reflects the Opus session itself, not a double-spend.

**Consequences.** The script can be re-run locally by any team member without an API key or network access. The output JSON is the artifact of record.

---

## End of Dionysus ADR log
