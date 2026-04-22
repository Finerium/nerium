# NERIUM

**Infrastructure for the AI agent economy. Built with Opus 4.7 hackathon submission (Cerebral Valley plus Anthropic, April 2026).**

This file is the root context document for every Claude Code agent that touches this repository. It is part of the mandatory reading bundle for every agent, every session, no exception.

---

## Mandatory reading per agent

Every agent spawned in this project MUST read the following files before executing any task. No silent-assume, no skip, no "already familiar" shortcut.

1. `_meta/NarasiGhaisan.md` (voice anchor, 23 sections, authored by V2 Hackathon Orchestrator, version 1.1)
2. `CLAUDE.md` (this file, root context)
3. The Pythia modular contracts assigned to the agent, located in `docs/contracts/`
4. The agent's own prompt file in `.claude/agents/{name}.md`, authored by Hephaestus

Any ambiguity in a directive is resolved by cross-referencing `_meta/NarasiGhaisan.md` first. If still ambiguous, halt and surface to V3 orchestrator. Do not silent-assume on cross-cutting decisions (architecture, contract, scope, naming, tier routing).

---

## Locked decisions quick reference

Total locks active: 34 (12 from V1 handoff plus 22 from V2 handoff). Full detail lives in `_meta/HACKATHON_HANDOFF_V2_TO_V3.md` Section 3.

**V1 Locks (12)** cover: project identity ("Infrastructure for the AI agent economy"), full 5-pillar scope as prototype, Builder hero deepest implementation, Builder output reference (production-ready apps from non-technical input, Express plus Guided modes), Prediction Layer Monte Carlo differentiator, two visualization modes (2D pixel primary, 3D cyberpunk stretch), meta-narrative "NERIUM built itself", three-tier model routing (later overridden by V3 ferry to 95% Opus), tech stack defaults, workflow methodology inherited from MedWatch, honesty filter for public surface, application APPROVED.

**V2 Locks (22)** cover: specialist roster (Metis plus Hephaestus plus Pythia plus Nemea plus Ananke), Greek fresh pool, working directory path, folder structure, demo app (Lumio smart reading SaaS), tech stack final (Next.js 15 plus Tailwind v4 plus Three.js r128 plus Framer Motion plus GSAP plus Howler plus Zustand plus Pixi.js plus FastAPI plus SQLite), MCP/plugin stack, 3-world visual (Medieval Desert plus Cyberpunk Shanghai plus Steampunk Victorian pending), asset path (CC0 plus Opus procedural, skip Gemini/Nano Banana), parallel execution mandate (4 plus terminals), Hephaestus batch pattern, mandatory reading per agent, modular contract discipline (Pythia strict blocker), open source mandate (MIT, `github.com/Finerium/nerium`), submission format (3-min video MAX, 100-200 word summary, OSS link), submission target (Senin 27 April 06:00 WIB for 07:00 WIB hard deadline), budget allocation, team size (solo), Discord handle, narasi voice anchor, problem statement framing, prize targets.

**V3 ferry revision applied 2026-04-22:** Model tier distribution re-rolled to 95% Opus per hackathon "Built with Opus 4.7" spirit. V1 Section 3.8 three-tier routing lock explicitly overridden. See Section "Budget" below and `docs/phase_0/NERIUM_AGENT_STRUCTURE.md` frontmatter for full detail.

Do not re-litigate locked decisions. If new strategic info requires a change, halt and ferry to V3 with reasoning.

---

## Tech stack

Frontend and demo:
- Next.js 15 (App Router, React Server Components)
- Tailwind CSS v4 (OKLCH design tokens)
- Three.js r128 (pinned, no r142 plus features)
- Framer Motion (page and component transitions)
- GSAP (timeline-driven sequences)
- Howler.js (audio layer, demo sound design)
- Zustand (client state)
- Pixi.js (2D pixel mode rendering)

Backend and AI:
- Python FastAPI (NERIUM runtime backend)
- SQLite (persistence)
- Anthropic Python SDK (Opus 4.7 orchestration)
- Managed Agents integration (Heracles lane, research-preview access)

Tooling reserved to Max plan (not API credits):
- Claude.ai chat (V3 orchestrator, Metis Chat specialist)
- Claude Code CLI (Hephaestus, Pythia, Nemea, Ananke, Workers)
- Claude Design (web at claude.ai/design for UI mockups)
- Claude Cowork (occasional non-technical touches)

---

## Folder structure

```
CerebralvalleyHackathon/
|-- CLAUDE.md                   <- this file, root context
|-- README.md                   <- public-facing intro
|-- LICENSE                     <- MIT
|-- .gitignore
|-- package.json                <- Next.js 15 scaffold
|
|-- _meta/                      <- orchestration artifacts (private to build process)
|   |-- NarasiGhaisan.md        <- voice anchor, mandatory reading
|   |-- HACKATHON_HANDOFF_V1_TO_V2.md
|   |-- HACKATHON_HANDOFF_V2_TO_V3.md
|   |-- METIS_KICKOFF.md
|   |-- reference/              <- pre-hackathon NERIUM source material (reference only, NEW WORK ONLY rule applies)
|   |-- orchestration_log/      <- Ananke daily logs (day_0.md, day_1.md, ...)
|
|-- docs/
|   |-- phase_0/                <- Metis outputs
|   |   |-- MANAGED_AGENTS_RESEARCH.md
|   |   |-- NERIUM_AGENT_STRUCTURE.md
|   |   |-- agent_flow_diagram.html
|   |-- contracts/              <- Pythia modular contracts
|   |-- qa/                     <- Nemea regression and a11y reports
|
|-- .claude/
|   |-- agents/                 <- Hephaestus prompt files, one per agent
|
|-- src/                        <- Next.js application source
|-- public/                     <- static assets
```

Conventions: snake_case file names for docs, kebab-case for TypeScript modules. UTF-8 Markdown. Relative paths for cross-references.

---

## Anti-patterns

Non-negotiable rules. Violation = halt and ferry to V3.

1. **No em dash (U+2014) anywhere.** Any output, any agent, any artifact. Use comma, period, parentheses, or sentence break instead. Ghaisan explicit: "sangat dilarang".
2. **No emoji anywhere.** README, docs, agent prompts, code comments, commit messages, everywhere.
3. **No scope narrow suggestion.** Full 5-pillar scope is locked. Operate from the axiom that all 5 pillars are buildable as prototype in 5 days. Do not re-litigate.
4. **No silent-assume on ambiguous cross-cutting decisions.** If architecture, contract, naming, tier routing, or scope ambiguity appears and is not explicitly covered in NarasiGhaisan.md or formal NERIUM documentation, halt and ferry to V3.
5. **No Vercel push yet.** Deploy platform deferred to Day 4-5 polish phase. Direction self-hosted VPS/dedicated server likely (not Vercel). Wait for Ghaisan explicit final lock.
6. **No per-file Hephaestus ferry.** Hephaestus runs single session batching all prompt files until 97% context. Halt only at context threshold, never per-file. MedWatch lesson V5 Section 10.9.
7. **No Gemini, Higgsfield, or non-Anthropic model for shipped execution.** Multi-vendor flexibility is a user-facing feature in the NERIUM Builder UI, not a hackathon execution choice. Shipped build runs on Opus 4.7 plus Sonnet 4.6 only. Image and asset generation uses CC0 packs (Kenney.nl, OpenGameArt) plus Opus-generated SVG or Canvas procedural. No Nano Banana.

Additional anti-patterns inherited from V1 Section 7 plus V2 Section 7: no MedWatch-specific decision inheritance, honest-claim discipline on public surfaces, concerns scrub, no meta-narrative dilution, compacting awareness at 60 to 70 percent capacity, stream hygiene for long subagent spawns, no copying existing `NERIUMcyberpunkcity.html` code verbatim (aesthetic reference only, NEW WORK ONLY rule by Discord mod Wania 2026-04-21).

---

## Submission

- **Hard deadline:** Senin 27 April 2026 07:00 WIB (April 26 8:00 PM EDT).
- **Target submission:** Senin 27 April 2026 06:00 WIB, one hour safety buffer.
- **Format:** 3-minute demo video (maximum), 100 to 200 word written summary, public GitHub OSS link MIT licensed.
- **Repo:** `https://github.com/Finerium/nerium`.
- **Judging criteria (weighted):** Impact 30 percent, Demo 25 percent, Opus 4.7 Use 25 percent, Depth 20 percent.
- **Prize targets:** main 1st plus 2nd plus 3rd, plus "Best Managed Agents Use" $5K special prize (verified via NewestInfo.md line 246-248, Heracles MA integration lane aligned).

---

## Budget

- **API credits allocated:** $500 total for Claude Code specialist execution.
- **Max plan reserved for:** V3 orchestrator chat, Metis Chat specialist, Cowork, Claude Design, occasional setup.
- **Model distribution per M2 structure (95% Opus):**
  - Opus 4.7: 21 of 22 product-side agents (Apollo Advisor, 5 Leads, all Workers except Cassandra)
  - Sonnet 4.6: 1 agent (Cassandra Prediction Layer, high-volume Monte Carlo simulation exception)
  - Haiku 4.5: 0 agents (tier removed per hackathon "Built with Opus 4.7" spirit)
- **Per-phase allocation:** Day 0 setup $20, Day 1-2 foundation $68, Day 2-3 hero Builder $113, Day 3 demo bake $36, Day 3-4 4 pillar $90, Day 4 polish $36, Day 4-5 QA $23, Day 5 demo plus README $14, Day 5-6 buffer $90.
- **MA exposure cap:** $150 of $500 on Managed Agents specifically (Heracles lane).

---

## Meta-narrative

NERIUM built itself by running the manual workflow it automates, one last time, for this hackathon.

This frame threads every submission surface: README, demo video narration, Twitter announcement, Discord post, final judge pitch. One frame, no dilution. The product's origin story IS the product's pitch, because the workflow that built NERIUM is literally what NERIUM Builder replaces.

Ghaisan manually lived the 47-agent 9-phase 106-step pipeline for Investment AI IDX blueprint. He knows every handoff, every dependency, every failure mode. The hackathon build is the same pattern, one more time, and then Builder collapses the whole thing into a single conversational interface.

## Daily Rhythm Lock

**Claude Code activity window:** 07:00 WIB to 23:00 WIB daily. Hard stop at 23:00 WIB.

**23:00 WIB freeze point:** Ghaisan spawn Ananke Claude Code session to compile day_N.md log from chat + session transcripts + TokenManager deltas. No new specialist spawn after 23:00, no Workers running past 23:00. If Worker in flight as 23:00 approach, halt at next natural checkpoint + commit + resume next morning.

**Rationale:** Orchestration log continuity + budget tracking accuracy + Ghaisan rest buffer.

