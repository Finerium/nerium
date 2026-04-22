# Pipeline Visualizer

**Contract Version:** 0.1.0
**Owner Agent(s):** Helios (component author)
**Consumer Agent(s):** Apollo (mounts visualizer via Erato slot), Urania (reuses pullback and node components for Blueprint Moment), Nemea (QA visual regression target)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the live pipeline visualizer component surface (agent node graph, handoff edges, tool-use ticker, Managed Agents console deep link, confidence overlay) so the Builder demo moment renders deterministically when fed the canonical event stream.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Sections 8 visual polish and 13 UX brevity)
- `CLAUDE.md` (root)
- `docs/contracts/event_bus.contract.md` (primary subscription source)
- `docs/contracts/builder_specialist_executor.contract.md` (understand the events being visualized)
- `docs/contracts/prediction_layer_surface.contract.md` (confidence overlay input)
- `docs/contracts/managed_agent_executor.contract.md` (MA deep link source)

## 3. Schema Definition

```typescript
// app/builder/viz/types.ts

export interface PipelineNode {
  node_id: string;                   // specialist_id or pillar Lead name
  label: string;                     // human-readable, e.g., "Athena, Builder Lead"
  tier: 'advisor' | 'lead' | 'worker' | 'ma_lane';
  pillar?: 'builder' | 'marketplace' | 'banking' | 'registry' | 'protocol';
  status: 'idle' | 'active' | 'completed' | 'failed' | 'halted';
  confidence?: number;               // 0.0 to 1.0 from prediction layer
  current_tool_call?: string;
  tokens_consumed?: number;
  cost_usd?: number;
}

export interface PipelineEdge {
  from_node_id: string;
  to_node_id: string;
  kind: 'handoff' | 'dependency' | 'ma_bridge';
  is_active: boolean;
}

export interface PipelineCanvasProps {
  pipeline_run_id: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  view_mode: 'compact' | 'expanded';
  onNodeClick?: (node_id: string) => void;
  consoleDeepLinks: Record<string, string>;   // ma session_id to console URL
  showConfidenceOverlay: boolean;
}

export interface ToolUseTickerProps {
  pipeline_run_id: string;
  max_visible_entries: number;       // default 8
}
```

## 4. Interface / API Contract

- `<PipelineCanvas>` is a client component that auto-subscribes to the event bus on mount and keeps `nodes`/`edges` props in sync internally via a Zustand slice. Props shown above reflect the declarative shape for Storybook and Blueprint Moment reuse.
- `<ToolUseTicker>` shows the most recent `pipeline.step.tool_use` events for the given run, auto-scrolling.
- `<MAConsoleDeepLink>` renders a button that opens `consoleDeepLinks[ma_session_id]` in a new tab with `rel="noopener noreferrer"`.
- Animation library: Framer Motion for node and edge transitions, GSAP for the camera pullback (used by Blueprint Moment).
- Rendering library: Pixi.js for the 2D pixel-world-aware node canvas; fallback to pure SVG for accessibility and Nemea regression snapshots.
- Target framerate: 60 FPS on reference laptop; graceful 30 FPS on mobile.

## 5. Event Signatures

Subscribes to (does not publish to) the pipeline event bus. Relevant topics:

- `pipeline.run.started`, `pipeline.run.completed`, `pipeline.run.failed` for run lifecycle
- `pipeline.step.started`, `pipeline.step.completed`, `pipeline.step.failed` for node state transitions
- `pipeline.step.tool_use` for the ticker
- `pipeline.handoff` for edge activation
- `pipeline.prediction.emitted` for confidence overlay updates

## 6. File Path Convention

- Canvas: `app/builder/viz/PipelineCanvas.tsx`
- Node: `app/builder/viz/AgentNode.tsx`
- Edge: `app/builder/viz/HandoffEdge.tsx`
- Ticker: `app/builder/viz/ToolUseTicker.tsx`
- MA deep link: `app/builder/viz/MAConsoleDeepLink.tsx`
- Stream subscriber: `app/builder/viz/stream_subscriber.ts`
- Types: `app/builder/viz/types.ts`
- Confidence overlay: `app/builder/viz/confidence_overlay.ts`

## 7. Naming Convention

- Component file basenames: `PascalCase.tsx`.
- Node IDs match the underlying specialist ID format (`snake_case`).
- Edge kinds: lowercase string literals in `snake_case`.
- Tier strings: single lowercase word (`advisor`, `lead`, `worker`, `ma_lane`).

## 8. Error Handling

- Event stream disconnection: visualizer displays a small "reconnecting" badge, auto-retries bus subscription with exponential backoff. Existing node state persists during the outage.
- Unknown `node_id` in incoming event: silently ignore and log a console warning (do not add stray nodes).
- Render exception in a single `AgentNode`: error boundary contains it, that node renders as a red placeholder with a "tap to retry" affordance. Other nodes unaffected.
- Excess tool-use events: the ticker drops the oldest when `max_visible_entries` is exceeded; never blocks rendering.

## 9. Testing Surface

- Deterministic replay: feed a recorded event sequence through `stream_subscriber`, assert final `nodes`/`edges` snapshot matches a golden JSON.
- Node state transitions: simulate a node going `idle -> active -> completed`, assert the rendered node shows the expected status icon and halo color.
- MA deep link: provide a fake console URL, assert the button renders an anchor with correct href and target attributes.
- Confidence overlay toggle: toggle `showConfidenceOverlay`, assert overlay opacity animates to `0` or full as expected within 300ms.

## 10. Open Questions

- None at contract draft. Default collapsed/expanded view and framerate ceiling remain strategic_decision_hard_stop items tracked in `helios.decisions.md`.

## 11. Post-Hackathon Refactor Notes

- Add 3D mode (Poseidon stretch) with Three.js r128 rendering; structure `PipelineCanvasProps` is intentionally mode-agnostic to support later lane.
- Performance: for pipelines with more than 50 nodes, switch to WebGL instanced rendering instead of per-node React components.
- Accessibility: provide a non-visual representation (screen reader live region) that narrates major pipeline state transitions in plain language.
- Allow users to record a pipeline run as a replayable artifact surface in Marketplace (creators can ship their pipeline topology as sell-able).
