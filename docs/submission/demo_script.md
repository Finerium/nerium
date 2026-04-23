---
name: NERIUM RV Demo Video Script
version: 0.1.0-draft
status: W3 draft, W4 finalize pending
phase: RV
owner: Ghaisan (record + edit), Kalypso (script authorship)
runtime_cap_seconds: 180
speaking_rate_wpm: 150
total_word_target: 450
last_updated: 2026-04-23
predecessor: docs/demo_video_script.md (V3 dashboard-era script, preserved for reference)
---

# NERIUM RV Demo Video Script

## Purpose

Timing-anchored shot list for the 3-minute hackathon submission video. Hard cap 3:00 per hackathon rules. Beat durations below sum to exactly 180 seconds. Judge weights Impact 30, Demo 25, Opus 4.7 Use 25, Depth 20. Impact + Demo beats front-loaded.

The V3 predecessor at `docs/demo_video_script.md` was written for a five-tab dashboard surface. This RV script reflects the pivot to Builder as a browser game at `/play` per `_meta/RV_PLAN.md` RV.1.

## Voice register

NarasiGhaisan Section 23 brand voice. Casual, confident, not corporate. No em dash. No emoji. Bahasa-English mix acceptable in overlay text, spoken narration primarily English for judge parity.

## Beat-by-beat timeline

### 0:00 to 0:20 Hook and tagline (20 seconds, target 50 words)

B-roll cues: cut open on a creator scrolling through X and Discord, DMs asking "how to buy your restaurant automation agent", tabs stacked with Claude Skills, GPT Store, MCP Hubs, Replit Agent. Fast cut montage, 3 to 5 seconds per frame.

Narration draft:

"The AI agent economy already exists. Just in fragments. Creators post MCP servers on Twitter for free. Buyers DM for payment. A restaurant automation agent ends up on a one-off website because no neutral marketplace exists. NERIUM is the infrastructure layer for that economy."

Overlay card at 0:18: "Infrastructure for the AI agent economy."

### 0:20 to 0:40 Solution intro and five pillars (20 seconds, target 50 words)

B-roll cues: landing page scroll-through, pillar cards fading in one by one matching the narration.

Narration draft:

"Five pillars. Builder is the flagship, a gamified agent orchestrator. Marketplace is a neutral cross-vendor storefront. Banking meters agent execution like utilities meter electricity. Registry is DNS for the agent layer. Protocol preserves each model's native dialect instead of forcing one."

### 0:40 to 1:30 Vertical slice playthrough (50 seconds, target 125 words)

B-roll cues: browser window opens on `/play`. Phaser canvas loads Apollo Village lobby. Player sprite walks toward Apollo Advisor NPC. Dialogue overlay opens. Player accepts onboarding quest. Prompt challenge node renders. Player types short Lumio prompt. Apollo acknowledges, dispatches. Mini Builder cinematic plays. Camera pulls back to reveal specialist agents wiring up. Finished Lumio landing page renders. Inventory toast awards the reward item.

Narration draft:

"Open `/play` in a browser. No install. Phaser loads Apollo Village. Walk up to the Advisor. Accept the onboarding quest. Type a short prompt. `bikin landing page buat smart reading SaaS`. Apollo dispatches to the Builder lead. The mini Builder cinematic plays inside the scene. Specialist agents wire up tile by tile. The Lumio landing page renders. The player receives an inventory item. Quest complete. Builder ran the same manual orchestration a human would run, except the human did not have to touch the handoff mesh."

### 1:30 to 2:00 Blueprint Moment reveal (30 seconds, target 75 words)

B-roll cues: camera pullback from Apollo Village to reveal all sixteen active NERIUM agents as tiles connected by edges. Heracles MA node glows in magenta (Managed Agents lane). Apollo, Cassandra, and the five Leads accent-color pulse. Urania `blueprint_lumio_2026_04_25.json` fixture drives the reveal sequence. Overlay captions match the Urania-locked beat copy.

Narration draft (overlay, silent or voiced):

"Pull back. This is what actually ran. Sixteen agents. All Opus 4.7. Heracles is in the Managed Agents lane. Apollo orchestrates. Cassandra predicts. The five Leads hand off to Workers. Claude Code alone does not orchestrate this. You do not need prompting skill. You approve."

### 2:00 to 2:30 Pillars integrated in-game (30 seconds, target 75 words)

B-roll cues: shop modal opens for Marketplace (mock catalog of 18 listings). TopBar currency HUD tick for Banking (USD and IDR dual-locale). NPC trust meter overlay for Registry. Caravan faction dialogue for Protocol (Claude live plus Gemini mock with honest-claim annotation visible).

Narration draft:

"Marketplace ships as the in-game shop. Creators list, buyers browse, eighteen mock listings annotated honestly as demo data. Banking ticks in the currency HUD, dual locale USD and IDR. Registry shows up as NPC trust meters. Protocol is the caravan faction, Claude live, Gemini serialize-only mock, honest-claim banner persistent. Four pillars as prototype surfaces, one pillar as vertical slice."

### 2:30 to 2:50 Meta-narrative close (20 seconds, target 50 words)

B-roll cues: split screen. Left, the orchestration chat window with V4 messages. Right, Ghaisan's terminal with six Claude Code Workers running in parallel. Fade to NERIUM wordmark.

Narration draft:

"NERIUM built itself by running the manual workflow it automates. One last time. Sixteen specialist agents over five days. Chat orchestrator. Contract authority. Prompt author. Workers in parallel. The product's origin story is the product's pitch. Builder replaces the workflow that built it."

### 2:50 to 3:00 Call to action (10 seconds, target 25 words)

B-roll cues: wordmark card with repo URL, Discord handle, MIT license. Fade to black at 2:59.

Narration draft:

"Open source. MIT. github.com/Finerium/nerium. Play the demo in your browser. Discord nerium0leander. Thanks."

## Word budget verification

| Beat | Seconds | Target words at 150 wpm | Draft words |
|---|---:|---:|---:|
| 0:00 to 0:20 Hook | 20 | 50 | 47 |
| 0:20 to 0:40 Solution | 20 | 50 | 44 |
| 0:40 to 1:30 Vertical slice | 50 | 125 | 101 |
| 1:30 to 2:00 Blueprint Moment | 30 | 75 | 55 |
| 2:00 to 2:30 Pillars | 30 | 75 | 71 |
| 2:30 to 2:50 Meta-narrative | 20 | 50 | 49 |
| 2:50 to 3:00 CTA | 10 | 25 | 14 |
| Total | 180 | 450 | 381 |

Draft under target word count leaves slack for b-roll pause between sentences and for Ghaisan recording in bahasa-English mix which averages slightly slower than 150 wpm pure English.

## Open items for W4 finalize

1. Ghaisan records actual narration. Script treated as guideline, not locked script. Narration delivery in bahasa-English mix acceptable; overlay card copy stays English.
2. Final decision on voiceover versus overlay-only. V3 predecessor defaulted to overlay-only per Urania ADR-01. RV can go either way; overlay-only is faster to produce.
3. Lumio cache rebake confirmation if the vertical slice changes between W3 and W4. If cache invalidates, the 0:40 to 1:30 beat re-records.
4. Blueprint Moment fixture confirmation. `blueprint_lumio_2026_04_25.json` has 22 nodes for V3; RV shipped 16 active agents. Per translator_notes gotcha 9, historical 22-node reveal is acceptable ("these are the 22 agents NERIUM ran to build itself in V3") and aligns with "built itself" meta-narrative. Flag for Ghaisan sign-off before record.
5. Final music choice. Kenney RPG Audio CC0 layer by Euterpe; two candidate ambient loops tracked in `src/data/audio/cues.json`.

## File pointers

- Landing page hero video source: `public/video/demo-preview.mp4` (W3 placeholder, W4 replace with final demo cut).
- Meta-narrative copy: `src/components/landing/MetaNarrativeSection.tsx`, `CLAUDE.md` Meta-narrative section (verbatim frame locked).
- Honest-claim copy: `app/protocol/vendor/annotation_text.constant.ts` (do not rewrite per translator_notes gotcha 11).
- Blueprint Moment fixture: `app/builder/moment/fixtures/blueprint_lumio_2026_04_25.json`.
- Lumio cache: `cache/lumio_run_2026_04_24.json`, static-served copy at `public/cache/lumio_run_2026_04_24.json`.
- Audio cue map: `src/data/audio/cues.json` (Euterpe output).

## End of script
