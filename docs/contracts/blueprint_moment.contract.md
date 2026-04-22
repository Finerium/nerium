# Blueprint Moment

**Contract Version:** 0.1.0
**Owner Agent(s):** Urania (Blueprint reveal component author)
**Consumer Agent(s):** Apollo (triggers reveal during demo), Helios (reuses pullback animation helpers), Nemea (QA visual regression), Ghaisan (demo video recording)
**Stability:** draft
**Last Updated:** 2026-04-22 (Day 1, post-kickoff)

## 1. Purpose

Defines the cinematic Blueprint Moment component (camera pullback, narration overlay, Managed Agents lane highlight, full 22-agent DAG reveal) for the demo minute 1:30 to 2:10 beat that kills the "Claude Code alone cukup" plus "AI needs prompting skill" mispersepsi per BuilderDifferentiation_PerceptionProblem.pdf and NarasiGhaisan Section 8.

## 2. Mandatory Reading for Consumers

- `_meta/NarasiGhaisan.md` (anchor, Section 8 visual plus business first)
- `CLAUDE.md` (root)
- `docs/contracts/pipeline_visualizer.contract.md` (component reuse source)
- `docs/phase_0/agent_flow_diagram.html` (visual reference only, not imported)
- `docs/contracts/advisor_interaction.contract.md` (session state during reveal)

## 3. Schema Definition

```typescript
// app/builder/moment/types.ts

export interface BlueprintMomentDefinition {
  moment_id: string;                 // e.g., 'blueprint_lumio_2026_04_25'
  trigger: 'manual' | 'auto_on_pipeline_completion' | 'auto_on_timestamp';
  trigger_timestamp_ms_into_demo?: number; // when trigger === 'auto_on_timestamp'
  narration_overlay: Array<{
    start_ms: number;
    end_ms: number;
    text: string;                    // max 2 lines per overlay beat
  }>;
  camera_sequence: Array<{
    start_ms: number;
    end_ms: number;
    zoom_from: number;               // 1.0 is normal
    zoom_to: number;                 // typically 0.1 to 0.3 for pullback reveal
    ease: 'linear' | 'ease_in_out' | 'cubic';
  }>;
  highlight_nodes: string[];         // node_ids that pulse during reveal, MUST include MA lane 'heracles'
  visible_node_set: 'all_22' | 'builder_only' | 'pillar_map';
}

export interface BlueprintRevealProps {
  definition: BlueprintMomentDefinition;
  pipeline_run_id: string;
  onComplete: () => void;
  isPlaying: boolean;
}
```

## 4. Interface / API Contract

- `<BlueprintReveal>` is a client component that composes with `<PipelineCanvas>` from Helios, applying a camera transformation layer for the pullback.
- The reveal progresses through camera sequences; narration overlays render synced to the same timeline via `narration_overlay.ts` helper.
- On completion (last `camera_sequence[end_ms]` reached), fires `onComplete` callback exactly once.
- The Heracles MA lane node receives a special glow treatment via `ma_highlight.tsx` regardless of which `visible_node_set` is active.

## 5. Event Signatures

- Emits `advisor.moment.presented` event via bus when `onComplete` fires, payload `{ moment_id, pipeline_run_id }`.
- Does not subscribe to pipeline events directly; receives state via Helios composition and the Definition prop.

## 6. File Path Convention

- Root component: `app/builder/moment/BlueprintReveal.tsx`
- Camera helper: `app/builder/moment/camera_pullback.ts`
- Narration helper: `app/builder/moment/narration_overlay.ts`
- MA highlight: `app/builder/moment/ma_highlight.tsx`
- Definition fixtures (Lumio demo reveal): `app/builder/moment/fixtures/blueprint_lumio_2026_04_25.json`
- Types: `app/builder/moment/types.ts`

## 7. Naming Convention

- Moment IDs: `blueprint_{demo_name}_{YYYY_MM_DD}`.
- Camera sequence zoom values: floats `0.1` to `1.0` (smaller value = more zoomed-out reveal).
- Narration overlay text: sentence case, max 2 visual lines at standard font size.
- Timeline unit: milliseconds integer; never seconds-float.

## 8. Error Handling

- Missing `highlight_nodes` entries in the current pipeline: skip silently, log console warning. Do not abort the reveal.
- Narration overlay text exceeding 2 visual lines: truncate with ellipsis; log warning.
- Camera sequence with `end_ms <= start_ms`: skip that sequence, warn in console.
- If `isPlaying` is false mid-sequence: pause immediately, preserve position; resume when true again.

## 9. Testing Surface

- Deterministic playback: supply a fixed `BlueprintMomentDefinition` with 3 camera sequences spanning 0-3000ms, drive the component's virtual clock, assert `onComplete` fires at 3001ms.
- MA highlight: render with `highlight_nodes` including `heracles`, assert the MA node has the special glow class applied.
- Narration overlay sync: at t=1500ms with an overlay at 1000-2000ms, assert overlay text is visible.
- Pause/resume: pause mid-reveal, assert timeline frozen at current ms; resume, assert it continues from that point.
- Snapshot regression: capture component snapshot at key timestamps, compare with Nemea visual baseline.

## 10. Open Questions

- None at contract draft. Exact reveal timestamp within the 3-minute demo (proposed 1:30 to 2:10 per Urania strategic_decision) is a Ghaisan-sign-off item tracked in `urania.decisions.md`.

## 11. Post-Hackathon Refactor Notes

- Add voiceover audio track synced to narration overlay (hackathon: text overlay only).
- Support multiple Blueprint Moment definitions per demo (currently one per run); production demos may stack reveals (e.g., cross-pillar walk, Prediction Layer deep dive).
- Make the reveal interactively explorable: pause in mid-pullback and let the user click nodes for mini-tour.
- Persist reveal playback history to SQLite for A/B testing different narration phrasings with stakeholders.
