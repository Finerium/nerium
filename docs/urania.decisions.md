---
name: Urania Decisions Log
version: 0.1.0
status: draft
owner: Urania (Blueprint Moment Worker, P3b)
last_updated: 2026-04-22
---

# Urania Decisions Log

ADR-format decision log for the Urania Blueprint Moment build. Each entry captures the decision, the reasoning, alternatives considered, and when a downstream Ghaisan sign-off or ferry is still required.

Contract conformance: `docs/contracts/blueprint_moment.contract.md v0.1.0`.

---

## ADR-00 Reveal timestamp within the 3-minute demo

**Status:** proposed, awaiting Ghaisan explicit lock.

**Decision:** Blueprint Moment triggers at video timestamp 1:30.000 (90000 ms into the 3-minute submission video) and runs for 40 seconds to 2:10.000. Fixture field `trigger_timestamp_ms_into_demo` = 90000.

**Reasoning:** NarasiGhaisan Section 8 and the Urania spec reference "minute 15-20" as the reveal window, scaled proportionally to a 3-minute total video this maps to 1:30 to 2:10. This slot gives the intro beat 30 seconds (adequate for thesis + origin credential pattern anchor per NarasiGhaisan Section 20) and the Lumio Builder live run 60 seconds before the reveal. Post-reveal leaves 50 seconds for Marketplace + Banking + Registry + Protocol beats plus meta-narrative close.

**Alternatives considered:**

- Earlier trigger (1:00): would compress Lumio run to 30 seconds, likely too fast to establish the Builder story. Rejected.
- Later trigger (2:00): would leave only 60 seconds for 4 pillar beats + close, too compressed for the Impact 30 percent weight coverage. Rejected.
- Split reveal (two shorter windows): would dilute the anchor moment. Blueprint Moment is THE judging-impact beat per Urania prompt Section "Context". Rejected.

**Ferry item:** Urania prompt Section "Strategic_decision_hard_stop" lists this as a Ghaisan confirm item. Deadline for lock: Day 3 afternoon, before Dionysus begins the Lumio cache bake. Later changes force Dionysus re-coordination.

---

## ADR-01 Voiceover audio versus overlay-only narration

**Status:** proposed, awaiting Ghaisan lock.

**Decision:** Overlay-only text narration for the Blueprint Moment in the hackathon submission. No voiceover audio track. Voiceover remains a post-hackathon refactor item per contract Section 11.

**Reasoning:** Ghaisan is recording solo. Voiceover requires an additional recording pass synced tight to the 40-second beat, with pronunciation retakes across bahasa-English code-switching (2 mispersepsi kill narrative mixes both registers). Overlay-only removes audio production variance entirely. Demo video beat stays deterministic and re-recordable from the cached fixture without voiceover re-sync.

**Alternatives considered:**

- Voiceover + overlay (both): adds audio variance, doubles edit cost. Rejected for hackathon scope.
- Voiceover-only (no overlay): demo video is viewed with volume off in some judging contexts (office review, muted playback). Overlay presence ensures the 2 mispersepsi kill lands even muted. Rejected.
- Music under overlay, no voice: possible stretch if Howler integration proves stable on Day 4. Not blocking for submission.

**Ferry item:** Urania prompt Section "Strategic_decision_hard_stop" lists voiceover inclusion as a Ghaisan confirm item. Recommendation documented. Await Ghaisan greenlight or override.

---

## ADR-02 Scene dimensions and viewport aspect ratio

**Status:** locked (implementation detail, not cross-cutting).

**Decision:** Inner scene layout 1800 x 1000 pixels. Outer viewport 960 x 560 pixels. Camera transform applied as CSS scale with center origin, scene div positioned centered in viewport via flex layout.

**Reasoning:** The pullback effect requires the scene to exceed the viewport at the initial zoom level so the viewer starts inside a cropped view and the pullback reveals edges. At zoom 1.0 the 1800 x 1000 scene overflows the 960 x 560 viewport on all sides, center third visible (Builder core cluster). At zoom 0.22 the scene scales to 396 x 220, comfortably fitting inside viewport with padding (full 22-agent reveal).

**Layout derivation:** Helios `layoutNodes` distributes 22 agents across 4 tiers (advisor, lead, ma_lane, worker). At width 1800 the 15 workers in a single row receive 115 pixels of column width, sufficient for 26-pixel radius nodes without label collision. Vertical tier spacing at height 1000 is 226 pixels per row, ample clearance.

**Alternatives considered:**

- Smaller scene 1400 x 800: pullback range too shallow, less dramatic zoom differential. Rejected.
- Larger scene 2400 x 1200: requires worker row split (pillar-aware layout) or extreme horizontal spread. Adds custom-layout complexity beyond Helios `layoutNodes` reuse. Rejected.
- SVG viewBox manipulation instead of CSS scale: harder to animate via Framer Motion, would require separate camera library. Rejected for hackathon scope.

---

## ADR-03 Camera easing curve selection

**Status:** locked.

**Decision:** Four-sequence camera timeline with ease pairing (linear hold, ease_in_out pullback start, cubic pullback end, linear hold).

**Reasoning:**

- Sequence 0 linear 1.0 to 1.0 (0 to 6.5s): holds Builder-core view while narration beat 1 reads. No motion during reading.
- Sequence 1 ease_in_out 1.0 to 0.55 (6.5 to 18s): symmetric easing for the first half of pullback, gentle both at start (still readable) and at end (graceful transition to accelerated phase).
- Sequence 2 cubic 0.55 to 0.22 (18 to 32s): ease_out_cubic feels like a camera physically pulled back from the scene, slow start then accelerating out. Emotional payoff of "holy shit that is more than I thought" lands in this segment.
- Sequence 3 linear 0.22 to 0.22 (32 to 40s): final hold at full reveal. Narration beats 4 and 5 fire here.

**Implementation:** `applyEase` in `camera_pullback.ts` maps contract ease identifiers (`linear`, `ease_in_out`, `cubic`) to `easeLinear`, `easeInOutCubic`, `easeOutCubic` respectively. "cubic" label in the contract resolves to ease-out-cubic specifically because a pullback feels more physical with ease-out than symmetric in-out.

**Alternatives considered:**

- All ease_in_out: safer but less dramatic. Rejected.
- Custom bezier per sequence: more precise but harder to reason about from fixture JSON. Rejected for hackathon scope.
- Ease-in only (aggressive start): feels jerky, not camera-like. Rejected.

---

## ADR-04 MA highlight as separate component, not AgentNode extension

**Status:** locked.

**Decision:** `ma_highlight.tsx` renders the Heracles treatment as a standalone SVG group placed on top of the PipelineCanvas via overlay SVG. It does not modify Helios `AgentNode`.

**Reasoning:** Three reasons (spelled out in file header comment):

1. `AgentNode` is snapshot-baseline by Nemea. Mutating it for reveal-only emphasis forks the visual diff across two consumers (live pipeline during normal runs + cinematic reveal during demo).
2. The Blueprint Moment needs animations tied to cinematic timing (intensity ramps with camera pullback progress), not to pipeline event state (which is what AgentNode animations respond to).
3. Contract Section 6 File Path Convention explicitly lists `ma_highlight.tsx` as a dedicated output file, separate from the shared viz module.

**Composition:** BlueprintReveal computes the Heracles x + y + radius using the exported `layoutNodes` helper from Helios (same layout the inner PipelineCanvas runs), then renders `MaHighlight` at those coordinates in an overlay SVG with matching viewBox. Scale transform is applied at the wrapper level so both PipelineCanvas and the highlight overlay scale in lockstep.

**Alternatives considered:**

- Extending `AgentNode` with an `isRevealMoment` prop: rejected for reasons above.
- Rendering MA highlight inside PipelineCanvas via a new injection slot: would require contract change on `pipeline_visualizer.contract.md`. Out of scope for Urania. Rejected.
- Absolute-positioned HTML div with CSS animations: coord alignment harder across scale transforms. SVG inside same viewBox tree is crisper. Rejected.

---

## ADR-05 Narration copy strategy, 2-mispersepsi kill narrative

**Status:** locked, with ferry item flagged for beat 4 wording.

**Decision:** Five narration beats totaling 40 seconds of text. Beat-to-mispersepsi mapping:

- Beat 2 ("22 agent. 21 Opus 4.7. 1 Sonnet. 9 fase.") visually invalidates "Claude Code alone cukup" by showing orchestration scale that Claude Code as a single tool does not handle.
- Beat 3 ("Heracles magenta = Managed Agents, real git PR.") surfaces the Best Managed Agents Use $5K prize target receipt, reinforces 25 percent Opus 4.7 Use judging weight.
- Beat 4 ("Claude Code solo gak orchestrate ini.") names misperception 1 directly. Ferry item: Ghaisan sign-off on confrontational framing against Anthropic judges. Alternative wording staged: "Satu agent solo gak orchestrate ini."
- Beat 5 ("Prompting skill ga dibutuhin. Lu tinggal approve.") kills misperception 2, plants Builder UX thesis.

**Voice:** Ghaisan gw-lu register with English tech nouns (agent, Opus, Managed Agents, orchestrate, approve). Matches NarasiGhaisan Section 13 brevity discipline + communication style.

**Character budget:** Each beat under 52 characters, well inside the 96-character 2-visual-line cap (48 chars per line times 2 lines). No truncation expected. Overlay component still guards with ellipsis fallback per contract Section 8.

**Alternatives considered:**

- Fewer beats (3 longer ones): less pacing variance, risks feeling static. Rejected.
- More beats (7+): attention budget exceeded for 40-second window. Rejected.
- Fully English narration: loses Ghaisan voice anchor per NarasiGhaisan Section 13. Rejected.
- Fully bahasa: alienates international judges unfamiliar with bahasa. Rejected. Mixed register preserved.

---

## ADR-06 Honest-claim verification on agent count and tier distribution

**Status:** locked, audit-safe.

**Decision:** Narration beat 2 claims "22 agent. 21 Opus 4.7. 1 Sonnet." These numbers verified against:

- `docs/phase_0/NERIUM_AGENT_STRUCTURE.md` Section 1 roster: 1 Advisor (Apollo) + 5 Leads + 7 Builder Workers + 3 Marketplace Workers + 2 Banking Workers + 1 Registry Worker + 2 Protocol Workers + 1 Cross-cutting Worker (Harmonia) = 22.
- Model tier lock: 21 agents on Opus 4.7 per CLAUDE.md Section "Budget" ("Opus 4.7: 21 of 22 product-side agents"). 1 agent on Sonnet 4.6 per V3 ferry: Cassandra, as the Prediction Layer high-volume Monte Carlo exception.
- 0 agents on Haiku 4.5 per V3 ferry override of V1 Section 3.8 three-tier routing lock.

"9 fase" refers to the 9 build phases Ghaisan personally ran for the Investment AI IDX blueprint (per NarasiGhaisan Section 20 origin credential pattern: "saya manually menjalankan pipeline 47-agent 9-fase 106-step"). This is a reference to the source lived experience, not a claim about the current NERIUM build phase count (which is 5 per CLAUDE.md Section "Submission"). Slight audience ambiguity acceptable because context (Blueprint Moment revealing the pipeline that built NERIUM) resolves it to the source experience.

**Anti-pattern filter:** No count inflation. No tier mischaracterization. No shipped-product mislabeling (Cassandra is Sonnet 4.6, surfaced as an exception, not hidden or rounded up to 22 Opus).

---

## ADR-07 Pipeline snapshot bundled vs. externally provided

**Status:** locked.

**Decision:** BlueprintReveal bundles `NERIUM_TEAM_NODES` (22 PipelineNode entries) and `NERIUM_TEAM_EDGES` (31 PipelineEdge entries) as module-level constants, used as defaults when the parent does not pass `nodes` / `edges` props. The Apollo handoff path invokes BlueprintReveal without explicit nodes/edges and accepts the defaults.

**Reasoning:** The Blueprint Moment reveals the NERIUM team itself, not the live Lumio pipeline that just ran. Lumio pipeline has 11 specialists per `pipeline_topology.lumio.json`, insufficient for the "22 agent" beat claim. Bundling the canonical NERIUM team snapshot in the component avoids asking Apollo or Dionysus to project it correctly. Prop override still available for Nemea visual regression snapshots that want a trimmed subset or alternate topology.

**Alternatives considered:**

- Separate JSON fixture for team nodes/edges: adds import complexity without clear payoff. Rejected.
- Query Athena pipeline topology at runtime for the team snapshot: Athena topology is per-Builder-run (Lumio is an instance), no global team topology endpoint. Rejected.
- Pure prop-driven (no defaults): forces every caller to pass the 22-agent list, couples Apollo to the team roster. Rejected for coupling.

---

## ADR-08 Virtual clock drivable by external timestamp for testing

**Status:** locked.

**Decision:** BlueprintReveal exposes `overrideElapsedMs` prop. When defined, bypasses the internal requestAnimationFrame loop and renders strictly from the external timestamp. When undefined, rAF loop advances elapsed time while `isPlaying` is true.

**Reasoning:** Contract Section 9 testing surface specifies "drive the component's virtual clock, assert onComplete fires at 3001ms". An internal rAF-only clock is not drivable from tests because test runners advance their own fake timers. Exposing a prop-based override aligns with the test-first interface while keeping the production path rAF-smooth.

**Alternatives considered:**

- Exporting the clock hook separately: over-engineering for hackathon scope. Rejected.
- jest.useFakeTimers: does not patch rAF by default, additional setup required per test. Rejected for fragility.

---

## ADR-09 Highlight pulse for non-MA nodes uses tier-aware accent colors

**Status:** locked, minor visual detail.

**Decision:** Non-Heracles entries in the `highlight_nodes` array render as `HighlightPulse` with accent color chosen by `accentColorForNode`. Apollo receives gold (advisor), Leads receive cyan, Cassandra receives gold_hot (Sonnet exception), other workers receive purple.

**Reasoning:** Consistent with Metis M3 palette mapping (`agent_flow_diagram.html` tier colors). Cassandra's gold_hot accent underscores the 1-of-22 Sonnet exception visually, reinforcing narration beat 2's "1 Sonnet" claim.

---

## ADR-10 Deferred concerns logged for post-hackathon refactor

Items tracked for post-hackathon per contract Section 11:

1. Voiceover audio sync if Ghaisan records a Day 4 pass.
2. Multiple Blueprint Moments per demo (Prediction Layer deep dive, Protocol translation beat) using the same component with different fixtures.
3. Interactive pause-in-pullback with click-to-inspect nodes. Would require re-exposing AgentNode onClick during the reveal.
4. SQLite persistence of reveal playback history for A/B testing different narration phrasings with stakeholders.
5. Gemini or Higgsfield video assets for outro beat if multi-vendor-in-UI ships as a post-hackathon feature (currently held by anti-pattern V1 Section 7).
