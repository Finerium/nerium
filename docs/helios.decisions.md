---
name: helios.decisions
description: Architecture decision log for Helios pipeline visualizer
type: decisions
owner: helios
version: 0.1.0
status: draft
contract_ref:
  - docs/contracts/pipeline_visualizer.contract.md v0.1.0
  - docs/contracts/event_bus.contract.md v0.1.0
  - docs/contracts/managed_agent_executor.contract.md v0.1.0
last_updated: 2026-04-22
---

# Helios Architecture Decisions

Purpose: capture the decisions taken while implementing the live pipeline visualizer so that downstream agents (Urania, Nemea, Harmonia) and the post-hackathon refactor can replay the reasoning without spelunking git history.

## ADR-01 Default view mode is expanded

Context. The pipeline_visualizer contract v0.1.0 surfaces `view_mode: 'compact' | 'expanded'` but leaves the default to the integrating surface. The Helios prompt `strategic_decision_hard_stop` lists this as a ferry item with the recommendation "expanded by default for demo, collapse-on-complete option".

Decision. Default is `expanded` in `PipelineCanvas` when no explicit value is passed by the parent. A header toggle flips the mode live; the store persists the toggle within a run. Collapse-on-complete is not auto-applied in v0.1.0; the toggle is manual so the demo operator stays in control during recording.

Consequences. Demo moment reads cleanly (every node visible, every handoff edge drawable). UI clutter risk is accepted since the Lumio topology caps at 11 specialist nodes plus Apollo plus Athena plus Heracles plus Cassandra, still well inside a single `960x560` viewport.

Ferry flag. Surface to V3 at end of session to allow explicit greenlight or override. Implementation is reversible in one prop change at the parent call site.

## ADR-02 Animation frame rate target is 60 FPS with reduced-motion honored

Context. Helios prompt `strategic_decision_hard_stop` also lists frame rate ceiling. Recommendation: "60 FPS + prefers-reduced-motion honored".

Decision. Framer Motion's default transition timing is used (matches the browser's `requestAnimationFrame`, capped at display refresh rate). Nodes animate pulse on `status === 'active'`, edges animate a flowing particle on `is_active === true`. Every animation path reads `useReducedMotion()` and falls back to a static render when `prefers-reduced-motion: reduce` is set or when the parent passes `reduceMotion` explicitly. This yields 30 FPS-equivalent perceived smoothness (zero animation, static status) on battery-constrained devices.

Consequences. Battery drain on judges' laptops stays low during demo playback. Accessibility audit (Nemea) will pass without motion-triggered vestibular concerns.

Ferry flag. Surface to V3 for explicit lock.

## ADR-03 SVG rendering over Pixi.js for v0.1.0

Context. Contract Section 4 mentions "Pixi.js for the 2D pixel-world-aware node canvas; fallback to pure SVG for accessibility and Nemea regression snapshots". Helios soft guidance calls Pixi optional if 22 plus nodes re-render bottleneck.

Decision. Ship v0.1.0 on pure SVG. Pixi is deferred to a later Helios-2 session or to Poseidon stretch per contract Section 11. Rationale:
- SVG is deterministic for Nemea snapshot-based regression (zero canvas-to-pixel variance).
- SVG keeps the DOM accessible (every node has `role="button"`, keyboard-navigable, aria-labeled) without a parallel accessibility mirror layer.
- Lumio topology has at most 15 visible nodes; React plus SVG re-renders comfortably.
- Pixi bootstrap cost (WebGL context, asset atlas) adds complexity not justified at this node count.

Consequences. If later demos exceed 50 nodes or target 3D, Pixi or WebGL instancing is drop-in replaceable because `PipelineCanvasProps` is rendering-agnostic. Contract Section 11 post-hackathon note already anticipates this.

## ADR-04 Store is local to canvas, not global

Context. Apollo and Urania both read pipeline state. Two options: a single global Zustand store hoisted into a shared context, or a per-canvas store created inside the component.

Decision. Use `createPipelineStore(...)` factory inside `PipelineCanvas` and hold it in a `useRef` so it survives re-renders. Exported factory lets Urania Blueprint Moment spin up a second detached store for the pullback animation without interfering with the live canvas.

Consequences. Two canvases on the same page (live plus Blueprint Moment reveal) cannot drift out of sync because each is fed by the same bus; they just maintain independent reducers. Memory cost is trivial. Post-hackathon a shared store can be introduced without API break because props remain the source of truth when no bus is passed.

## ADR-05 Confidence comes from the event bus, not a direct import of `cassandra.ts`

Context. Helios input file list names `app/builder/prediction/cassandra.ts` from Cassandra. At the time Helios authors the visualizer (Day 1, Cassandra still in P2 parallel), that file may not yet exist.

Decision. Helios does not import the Cassandra module directly. Confidence flows over `pipeline.prediction.emitted` events on the canonical bus (payload `PredictionEmittedPayload` defined in `handoff_events.ts`). If Cassandra never publishes, nodes show `band: 'unknown'` with a neutral ring, which degrades gracefully in the UI. Contract Section 3 already treats `confidence?: number` as optional.

Consequences. Helios and Cassandra can ship in parallel without artifact-level blocking dependency. Integration is verified by publishing a `pipeline.prediction.emitted` event on an in-memory bus in a deterministic replay test (contract Section 9).

Ferry flag. If Cassandra later decides to expose a synchronous map helper instead of (or in addition to) events, Helios can add a second ingestion path without breaking the bus contract.

Addendum 2026-04-22 post-read of `app/builder/prediction/cassandra.ts`. Cassandra actually emits `pipeline.prediction.emitted` with payload `{ confidence_map: ConfidenceMap }` (nested per-specialist array). The sibling `PredictionEmittedPayload` in `app/builder/executor/handoff_events.ts` declares a flatter shape (p50/p90/confidence scalar) on the same topic. Both shapes are valid per the current bus contract but not unified. Helios subscriber now tolerates both: primary path reads `payload.confidence_map.per_specialist[*].confidence_score` and maps each specialist_id; fallback path reads `payload.confidence` scalar keyed by `event.source_agent`. Ferry flag to V3: the two shapes should converge in a contract v0.2.0 pass to avoid future subscriber drift.

## ADR-06 MA Console deep-link honesty filter

Context. Helios hard constraint: "MA Console deep-link MUST point to real session ID returned by `POST /v1/sessions` call, not mock URL; if MA run failed or offline, disable button with 'MA session unavailable' label."

Decision. `MAConsoleDeepLink` accepts a `Record<string, string>` keyed by session id. Heracles populates it with the `console_trace_url` returned from the real MA `POST /v1/sessions` call. `isReasonableConsoleUrl` rejects anything that is not an `https?://` URL under the `anthropic.com` (or subdomain) family with a path containing `session`. When the check fails, the button renders as a disabled pill labeled "MA session unavailable" and still occupies the header slot so the layout does not jump.

Consequences. Judges click a real trace or see an honest "unavailable" label. The failure mode cannot produce a Potemkin link.

## ADR-07 Stream subscriber is dependency-injected, not singleton

Context. Contract Section 6 reserves `app/shared/events/sse_bridge.ts` for a future shared subscriber but does not ship it. Helios is the first consumer that actually needs SSE.

Decision. `StreamSubscriber` takes an `EventBus`, `pipelineRunId`, and factories for `EventSource` and `WebSocket` via constructor options. It is not a singleton and is not exported as a hook; whoever mounts the visualizer owns its lifetime. PipelineCanvas itself does not instantiate the subscriber (transport lives in the runtime layer, not the UI). Tests inject mock factories to drive deterministic replays.

Consequences. When `app/shared/events/sse_bridge.ts` lands in a later milestone, `StreamSubscriber` can become a thin alias without API break. Integration surface for Heracles is stable.

## ADR-08 Error boundary per node, not per canvas

Context. Contract Section 8 requires that a single `AgentNode` render exception be contained with a "tap to retry" affordance, leaving other nodes intact.

Decision. A `NodeErrorBoundary` React.Component class wraps each `AgentNode` inside `PipelineCanvas`. On error it swaps in a small red placeholder SVG group with a retry handler that resets the boundary state. The broader canvas keeps rendering; edges that terminate at the failed node stay drawn (they fail gracefully to a path that ends at the fallback placeholder position).

Consequences. Single-node bugs do not take down the demo. Nemea's visual regression can assert the fallback render deterministically.

## ADR-09 Ticker state is a local ring buffer, not a global log

Context. `useToolUseRingBuffer` backs `<ToolUseTicker>` with a bus-subscribed state slice. Could instead be fed from Ananke's audit log.

Decision. Keep the ring buffer local. Ananke audit log is authoritative for cost plus compliance, but a React component reading `'*'` events from a cross-process log bus would add latency. The canvas already subscribes once; the ticker piggybacks. Ring buffer caps at `maxEntries * 2` in memory before trimming, so unbounded runs do not leak.

Consequences. Minimal memory, instantaneous UI. Audit log remains the source of truth for QA plus judges post-demo.

## ADR-10 Layout is deterministic tier rows (not force-directed)

Context. At 22 nodes the Lumio pipeline has a clean DAG. Force-directed layouts produce drift between runs, hostile to snapshot regression.

Decision. `layoutNodes` arranges nodes in fixed tier rows (advisor, lead, ma_lane, worker), evenly spacing within each row. Same inputs always produce same positions. `ma_lane` nodes have an extra radius so the Best Managed Agents Use lane is visually spotlighted during demo.

Consequences. Nemea snapshot test is trivially deterministic. Urania Blueprint Moment can reuse the same layout for its pullback start frame. Post-hackathon, a proper DAG layout (dagre or ELK) can swap in via a pure layout function without touching the component layer.

## Open items ferried to V3

1. ADR-01 default view mode and ADR-02 frame rate both await explicit V3 greenlight.
2. Whether the ToolUseTicker should surface cross-pillar events (Marketplace, Banking) or stay Builder-pure. Current scope keeps it Builder-pure per contract Section 5.
3. Whether `collapse-on-complete` auto-behavior should ship before submission (currently manual toggle only).
