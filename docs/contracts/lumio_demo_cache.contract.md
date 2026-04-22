# Lumio Demo Cache

**Contract Version:** 0.1.0
**Owner Agent(s):** Dionysus (cache producer, Lumio demo executor)
**Consumer Agent(s):** Urania (reuses Lumio trace for Blueprint Moment reveal), Ghaisan directly (demo video recording), Nemea (QA replay-determinism verification)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the schema for the Lumio demo cache (bounded 10-specialist Builder pipeline trace produced once on Day 3, replayed deterministically during demo video recording) so the cache is replay-stable and referenceable by downstream components without re-running the expensive pipeline.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 4 token cost awareness, Section 8 demo-path-only discipline)
- `CLAUDE.md` (root)
- `docs/contracts/builder_specialist_executor.contract.md` (execution topology)
- `docs/contracts/event_bus.contract.md` (replay maps to event bus emission)
- `docs/contracts/pipeline_visualizer.contract.md` (replay target for Helios components)

## 3. Schema Definition

```typescript
// app/builder/lumio/cache_types.ts

import type { PipelineEvent } from '@/shared/events/pipeline_event';
import type { SpecialistOutput } from '@/builder/executor/BuilderSpecialistExecutor';

export interface LumioSpecialistStep {
  step_index: number;                 // 0..9 for a 10-specialist pipeline
  specialist_id: string;
  role: string;
  vendor_lane: 'anthropic_direct' | 'anthropic_managed';
  input_preview: string;              // first 300 chars of user prompt
  output: SpecialistOutput;
  duration_ms: number;
}

export interface LumioArtifact {
  path: string;                       // relative to cache/lumio_final/
  content_kind: 'html' | 'tsx' | 'css' | 'json' | 'md';
  bytes: number;
  content: string;                    // embedded directly for replay independence
}

export interface LumioRunTrace {
  trace_id: string;                   // e.g., 'lumio_run_2026_04_24'
  recorded_at: string;                // ISO-8601 UTC
  total_duration_ms: number;
  total_cost_usd: number;
  specialist_count: number;           // locked 10 per Metis demo spec
  steps: LumioSpecialistStep[];
  event_stream: PipelineEvent[];      // ordered replayable pipeline events
  final_artifacts: LumioArtifact[];   // landing page, signup flow, styles
  replay_compatibility_version: string; // semver for downstream replay consumers
}
```

## 4. Interface / API Contract

```typescript
export interface LumioReplayPlayer {
  loadTrace(trace_id: string): Promise<LumioRunTrace>;
  play(trace: LumioRunTrace, options?: { speed_multiplier?: number; onStep?: (step: LumioSpecialistStep) => void }): Promise<void>;
  pause(): void;
  reset(): void;
  seekTo(step_index: number): void;
}
```

- `play` re-emits the event stream into the live event bus at paced intervals matching the original `occurred_at` deltas multiplied by `speed_multiplier` (default 1.0).
- `pause` freezes emission; `reset` stops and returns to step 0.
- Pausing mid-play does not re-emit the already-emitted events on resume (exactly-once during a play session).

## 5. Event Signatures

- `lumio.replay.started` payload: `{ trace_id, speed_multiplier }`
- `lumio.replay.paused` payload: `{ trace_id, current_step_index }`
- `lumio.replay.completed` payload: `{ trace_id }`
- Underlying pipeline events during replay re-emit with an added `replay: true` meta flag (future envelope extension) so live subscribers can distinguish replay from real.

## 6. File Path Convention

- Trace file: `cache/lumio_run_{YYYY_MM_DD}.json`
- Artifact directory: `cache/lumio_artifacts/`
- Final artifacts: `cache/lumio_final/index.html`, `cache/lumio_final/signup.html`, plus supporting CSS and TSX
- Replay component: `app/builder/lumio/LumioReplay.tsx`
- Types: `app/builder/lumio/cache_types.ts`

## 7. Naming Convention

- Trace IDs: `lumio_run_{YYYY_MM_DD}` lowercase with underscore.
- Artifact paths: lowercase, kebab-case for HTML and CSS, PascalCase for TSX.
- Specialist IDs: `lumio_{role}_{sequence}` lowercase (e.g., `lumio_copywriter_01`).

## 8. Error Handling

- Trace file missing: `loadTrace` throws `TraceNotFoundError` with explicit path in message.
- Schema mismatch on load (older version): attempt migration via `replay_compatibility_version` adapter; if incompatible, throw `TraceSchemaIncompatibleError`.
- Replay bus publish failure: pause replay and surface a recoverable error; user can retry.
- Seek beyond last step: clamps to last step index.

## 9. Testing Surface

- Load round trip: write a trace, load, assert every field preserved including embedded artifact contents.
- Deterministic replay: play the same trace twice with `speed_multiplier: 10`, assert both plays emit identical sequences on the event bus.
- Seek: seek to step 3, play, assert replay resumes from step 3 emitting only remaining events.
- Schema evolve: bump version, attempt load with older adapter, assert migration succeeds or compatible error thrown.
- Artifact integrity: after load, assert every `LumioArtifact.bytes` equals `content.length`.

## 10. Open Questions

- None at contract draft. Single-run vs A/B dual-run is a Dionysus strategic_decision; both produce compatible traces.

## 11. Post-Hackathon Refactor Notes

- Migrate trace storage to SQLite with binary-safe artifact blobs rather than embedded strings once traces include images.
- Support partial replay (play from step N to step M) for fine-grained demo editing.
- Add trace diff view: compare two Lumio runs to see how agent choices differed.
- Integrate with Registry audit trail so replayed agents still update their audit summaries appropriately.
- Publish replay protocol spec so external clients can replay NERIUM runs for verification.
