---
name: NERIUM Demo Video Script
version: 0.1.0
status: draft
owner: Ghaisan (record + edit), Urania (timing coordination for Blueprint Moment beat 1:30 to 2:10)
last_updated: 2026-04-22
collaborative: true
---

# NERIUM Demo Video Script

## Purpose

Timing-anchored shot list for the 3-minute hackathon submission video. Maximum 3:00 per hackathon submission rules. Judge weights: Impact 30 percent, Demo 25 percent, Opus 4.7 Use 25 percent, Depth 20 percent. Scene pacing optimized for Impact + Demo beats while keeping an honest-claim surface.

Total budget: 180 seconds. Beat durations below sum to exactly 180 seconds including transitions.

## Collaborative authorship

- **Urania** owns the Blueprint Moment beat (1:30 to 2:10). Timing markers in that section are locked to `app/builder/moment/fixtures/blueprint_lumio_2026_04_25.json`. Narration copy is Urania-authored and signed off against `BuilderDifferentiation_PerceptionProblem.pdf` 2-mispersepsi kill narrative.
- **Dionysus** owns the Lumio cached run beat (0:30 to 1:30). Narration copy draft pending Dionysus session output.
- **Ghaisan** owns intro + closing + final edit pass. All other beats marked TBD below, pending Ghaisan draft or downstream Worker sign-off.
- **Apollo** (Advisor runtime) triggers the Blueprint Moment attached component at t=1:30 via `presentBlueprintMoment(session_id, 'blueprint_lumio_2026_04_25')`.

Any timing change after lock requires ferry to V3 orchestrator for re-sync across Workers.

## Beat-by-beat timeline

### 0:00 to 0:30 Intro beat (TBD Ghaisan)

30 seconds.

Recommended narrative anchor per NarasiGhaisan Section 20 origin credential pattern: open on Ghaisan's lived experience with manually orchestrated 47-agent pipeline for Investment AI IDX blueprint, then cut to NERIUM thesis: infrastructure for the AI agent economy, 5 pillars, meta-narrative "built itself".

Visual candidate: Cyberpunk Shanghai world overhead shot, title card Orbitron typography treatment matching Metis M3 palette.

Narration draft needed. Ghaisan to write.

### 0:30 to 1:30 Lumio Builder live run (Dionysus)

60 seconds.

Content: Apollo Advisor receives a short prompt in bahasa campur English ("bikin landing page buat smart reading SaaS"), dispatches to Athena (Builder Lead), 10 specialists spawn across the Builder pipeline. Heracles MA lane runs in the magenta-highlighted Managed Agents track; rest run in the Anthropic-direct lane. Viewer sees:

- Advisor chat surface (Erato component) streaming 2-3 turn exchange.
- Pipeline visualizer (Helios component) lighting up node by node.
- Tool-use ticker tearing left to right as specialists consume tools.
- Prediction Layer warning chip firing briefly for Cassandra Floor 3 result, user dismisses.
- Final Lumio landing page artifact renders at t=1:20, viewer sees the finished page.

Cached replay comes from `cache/lumio_run_2026_04_24.json`. Narration to be authored by Dionysus post-session. Urania does not coordinate this beat.

### 1:30 to 2:10 Blueprint Moment (Urania LOCKED)

40 seconds. Contract: `docs/contracts/blueprint_moment.contract.md v0.1.0`. Fixture: `app/builder/moment/fixtures/blueprint_lumio_2026_04_25.json`.

Trigger: Apollo calls `presentBlueprintMoment(session_id, 'blueprint_lumio_2026_04_25')` at video timestamp 1:30.000. The attached_components array on the next AdvisorTurn pushes the BlueprintReveal component into the conversation canvas, replacing the Lumio artifact in view.

Camera sequence (all relative to beat start t=0 at video 1:30):

| Beat t start | Beat t end | Zoom from | Zoom to | Ease | Effect |
|---|---|---|---|---|---|
| 0.0s | 6.5s | 1.00 | 1.00 | linear | Hold on Builder-core focus. Apollo + Erato + Helios + Cassandra + Heracles centered. |
| 6.5s | 18.0s | 1.00 | 0.55 | ease_in_out | Pullback begins. Leads and MP + BK + Reg workers enter the frame. |
| 18.0s | 32.0s | 0.55 | 0.22 | cubic | Pullback accelerates. All 22 agents visible. Protocol + Harmonia + Urania (self) reveal. |
| 32.0s | 40.0s | 0.22 | 0.22 | linear | Hold at full-reveal. Narration beat 5 ends at t=39.5s, onComplete fires at t=40.0s. |

Narration overlay beats (overlay-only, no voiceover per Urania ADR-01 recommendation pending Ghaisan lock):

| Beat t start | Beat t end | Text |
|---|---|---|
| 0.5s | 6.5s | Zoom out. Builder barusan bangun Lumio. |
| 7.5s | 15.5s | 22 agent. 21 Opus 4.7. 1 Sonnet. 9 fase. |
| 16.5s | 25.5s | Heracles magenta = Managed Agents, real git PR. |
| 26.5s | 34.5s | Claude Code solo gak orchestrate ini. |
| 35.5s | 39.5s | Prompting skill ga dibutuhin. Lu tinggal approve. |

Highlight nodes (pulse during reveal): heracles (MA glow + rotating ring + Console chip), apollo (advisor gold), athena (lead cyan), cassandra (Sonnet gold_hot exception accent).

Kill narrative mapping per BuilderDifferentiation_PerceptionProblem.pdf:

- Beat 2 ("22 agent. 21 Opus. 1 Sonnet. 9 fase.") kills misperception 1 ("Claude Code alone cukup") via showing the full orchestration graph.
- Beat 3 ("Heracles magenta = Managed Agents") reinforces Best Managed Agents Use $5K prize surface; receipt visible via MA Console deep-link chip.
- Beat 4 ("Claude Code solo gak orchestrate ini") names the misperception directly.
- Beat 5 ("Prompting skill ga dibutuhin. Lu tinggal approve.") kills misperception 2 (AI needs prompting skill) and plants the Builder UX thesis.

End state at t=40.0: camera at zoom 0.22, all 22 agents visible, Heracles MA chip still lit, onComplete fires. Next beat takes over.

### 2:10 to 2:35 Marketplace plus Banking beat (TBD Ghaisan coordinates with Eos + Artemis + Dike + Rhea output)

25 seconds.

Content candidate: creator (restaurant automation example per NarasiGhaisan Section 5) lists an agent in Marketplace, buyer browses and invokes, Banking meters the call "kaya listrik" ("seperti tagihan listrik PLN" for local audience if bahasa). Real-world pain angle for Impact 30 percent judging weight.

Draft narration pending.

### 2:35 to 2:55 Registry plus Protocol shallow reveal (TBD Ghaisan coordinates with Phoebe + Triton + Morpheus output)

20 seconds.

Content candidate: agent identity card with trust score (Phoebe component), cross-model translation dialog mock (Triton Claude XML to Gemini), vendor adapter UI showing multi-vendor choice with demo execution annotation "Anthropic only for hackathon" per honest-claim filter.

Draft narration pending.

### 2:55 to 3:00 Meta-narrative close (TBD Ghaisan)

5 seconds.

Recommended: "NERIUM built itself. This submission is Builder v0, running the manual workflow one last time." Closing card with GitHub repo URL `github.com/Finerium/nerium`, Discord handle `nerium0leander`, MIT license note.

## Open strategic questions tracked for Ghaisan sign-off

1. Exact video timestamp for Blueprint Moment trigger. Current draft: 1:30.000. If intro beat over-runs or Lumio run under-runs, ferry adjusted timestamp to Urania (fixture `trigger_timestamp_ms_into_demo` field updates from 90000).
2. Voiceover audio vs overlay-only. Current default: overlay-only per Urania ADR-01 recommendation. Voiceover possible as stretch if Day 4 recording capacity allows; hackathon scope prefers overlay-only since Ghaisan records solo in bahasa-English mix.
3. Whether beat 4 narration "Claude Code solo gak orchestrate ini" reads as too confrontational against Anthropic judges. Alternative copy: "Satu agent solo gak orchestrate ini." Ghaisan sign-off required before fixture lock.

## Visual references

- Cyberpunk Shanghai palette: `docs/phase_0/agent_flow_diagram.html` CSS root variables.
- Full 22-agent layout reference: `docs/phase_0/agent_flow_diagram.html` nodes section. Note: Urania component produces a NEW dynamic render, does not import the HTML. Reference is visual only per CLAUDE.md NEW WORK ONLY rule.
- Orbitron + Share Tech Mono typography: Google Fonts CDN, same stack as Metis M3 reference.

## File pointers

- Component: `app/builder/moment/BlueprintReveal.tsx`
- Fixture: `app/builder/moment/fixtures/blueprint_lumio_2026_04_25.json`
- Trigger integration: `app/advisor/apollo.ts` `presentBlueprintMoment` method
- Pipeline snapshot: bundled in `BlueprintReveal.tsx` as `NERIUM_TEAM_NODES` + `NERIUM_TEAM_EDGES` (22 agents + 31 edges)
- Contract: `docs/contracts/blueprint_moment.contract.md v0.1.0`
- ADR log: `docs/urania.decisions.md`
