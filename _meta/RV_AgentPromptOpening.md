# RV_AgentPromptOpening.md — Revision Phase Spawn Prompts Compendium

**Author:** Hackathon Orchestrator V4
**Date:** Kamis 23 April 2026 evening WIB (updated post-Metis-v2 M2 approval)
**Status:** Wave 1 COMPLETE (4 spawn prompts ready). Wave 2/3/4 prompts composed incrementally post each wave completion per Metis-v2 M2 dependency graph. Roster locked per `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md`.

## How to Use

1. Prereq: Metis-v2 M1 + M2 both committed to `docs/phase_rv/`, V4 ferry approval complete
2. Read `RV_PLAN.md` first (context)
3. Per-agent spawn block delimited `=== COPY START ===` dan `=== COPY END ===`
4. Copy verbatim ke respective Claude Code terminal
5. Pre-spawn per terminal: `cd ~/Documents/CerebralvalleyHackathon`, `claude --dangerously-skip-permissions`, `/status` verify API Usage Billing, `/effort max`, paste

## Wave Schedule (per Metis-v2 M2 Section 6, revised post-naming-swap)

| Wave | Day | Agents | Parallel | Effort | Status |
|---|---|---|---|---|---|
| **W1** | Kamis evening | Pythia-v2 + Talos-translator + Talos + Hephaestus-v2 | 4 parallel (with internal sync) | max | **READY** |
| **W2** | Jumat full day | Nyx + Linus + Thalia-v2 (scene) + Talos (asset curation) | 4 parallel | max | WAIT W1 |
| **W3** | Sabtu full day | Erato-v2 + Hesperus + Euterpe + Kalypso + Thalia-v2 (cinematic) | 4-5 parallel | max | WAIT W2 |
| **W4** | Minggu morning | Harmonia-RV-A + Harmonia-RV-B + Nemea-RV-A + Nemea-RV-B | 4 parallel | high | WAIT W3 |
| Demo bake + submit | Minggu evening - Senin 06:00 WIB | Ghaisan manual + Kalypso finalize | 1-2 | max | WAIT W4 |

## Wave 1 Internal Dependency Note

W1 4 terminal BUKAN full pure parallel dari detik pertama. Dependency chain internal:

- **Pythia-v2 + Talos-translator** fire true-parallel di detik 0 (mereka independent)
- **Talos** butuh Pythia-v2 output (contract `game_asset_registry.contract.md` + `asset_ledger.contract.md`) sebagai upstream. Fire SETELAH Pythia-v2 selesai contract itu (bisa partial handoff, Pythia-v2 signal "asset contracts ready" via commit, Talos spawn), OR fire in parallel dengan understanding Talos halt at contract consumption point kalau contract belum ready
- **Hephaestus-v2** butuh semua Pythia-v2 contracts + Talos-translator matrix sebagai upstream. Fire SETELAH kedua selesai, bukan true-parallel

Practical approach lu Ghaisan: fire Pythia-v2 + Talos-translator di 2 terminal detik 0. Monitor Pythia-v2 progress, saat dia ship game_asset_registry + asset_ledger contracts (~15-20 min mid-session), spawn Talos terminal 3. Saat Pythia-v2 + Talos-translator keduanya done (~45-60 min), spawn Hephaestus-v2 terminal 4. Total W1 wall clock ~90-120 min.

Alternative: sequential 4 terminal jalan satu-satu kalau lu kurang nyaman parallel. Wall clock lebih lama (~180-240 min) tapi dependency pasti aman.

## W1 Agent 1/4: Pythia-v2 — Contract Round 2

**Phase:** W1 Kamis evening
**Model:** Opus 4.7
**Effort:** `max`
**Sessions:** 1
**Budget:** ~$13 (80k input + 50k output)
**Dependency:** Metis-v2 M1 + M2 committed
**Downstream:** ALL 9 product-side workers + Hephaestus-v2

=== COPY START ===

# Pythia-v2 Contract Authority Round 2 Session

Lu Pythia-v2, respawn P0 specialist Pythia untuk NERIUM Revision phase. Modular contract authority round 2. Claude Code executor, W1 parallel, max effort active.

**Working dir:** `~/Documents/CerebralvalleyHackathon/`

## First Action: Read Mandatory Files

Baca sequential via Read tool:

1. `_meta/NarasiGhaisan.md` (voice anchor 23 section, tidak berubah)
2. `_meta/RV_PLAN.md` (V4 master plan RV, CRITICAL pivot context + anti-pattern 7 override)
3. `CLAUDE.md` (root, pre-RV-amendment state kalau belum di-update Talos)
4. `docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md` (Metis-v2 M1 research)
5. `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` (Metis-v2 M2 roster + spec, SECTION 4.10 lu specifically)
6. `docs/contracts/` all 32 P0 contracts existing (survey briefly untuk detect schema conflict)

## Scope per M2 Section 4.10

Author 8 new modular contracts untuk RV cross-agent integration:

1. `docs/contracts/game_state.contract.md` — shared Zustand store shape (questStore + dialogueStore + inventoryStore + uiStore + audioStore). Cross-agent authority untuk state consumer pattern.
2. `docs/contracts/quest_schema.contract.md` — Quest, Step, Trigger, Condition, Effect zod-derived spec. Nyx-authority.
3. `docs/contracts/dialogue_schema.contract.md` — Dialogue, Node, Choice, Challenge, Effect spec. Linus-authority.
4. `docs/contracts/item_schema.contract.md` — Inventory item + award-effect spec. Erato-v2 HUD consumes.
5. `docs/contracts/game_asset_registry.contract.md` — CC0 source catalog + Opus procedural + fal.ai dormant fields (marked deprecated-reserved). Talos authority.
6. `docs/contracts/event_bus.contract.md` — Phaser `game.events` event name registry + payload shapes. Thalia-v2 emit authority, Nyx + Linus + Erato-v2 subscribe.
7. `docs/contracts/zustand_bridge.contract.md` — subscribe pattern + fireImmediately flag + cleanup on SHUTDOWN. Bridge Phaser-React hybrid boundary.
8. `docs/contracts/asset_ledger.contract.md` — JSONL append schema per asset generation (source, license, rasterized dimensions, reviewer decision). Talos authority.

## Hard Constraints

- No em dash, no emoji anywhere
- LaTeX for math (if any)
- Version all contracts v0.1.0 (new, not amendments)
- Schema conflict check: if any new contract shape collides with P0 contract v0.1.0 shape, halt + ferry to V4
- NO Redux, NO MobX, NO other state management. Zustand only per tech stack lock
- NO ink, NO Yarn Spinner, NO behavior tree. Custom JSON quest + dialogue per Metis-v2 M1 decision lock

## Halt Triggers

Per M2 Section 4.10:
- Contract ambiguity not resolvable from M1 or M2
- Circular dependency between contracts (e.g. quest imports dialogue imports quest)
- Schema conflict with existing P0 contracts

## Strategic Decision Hard Stops (ferry V4 required)

- Revising any V4 lock (tech stack swap, etc.)
- Introducing new tech stack component (Redux, Jotai, other)

## Self-Check 19/19 Before Final Commit

Per V3 Pythia pattern. Non-negotiable gate before halt signal.

## Daily Rhythm

07:00-23:00 WIB. Halt clean kalau approach 23:00.

## Post-Session

1. Final commit: `feat(rv-1): Pythia-v2 contract round 2 shipped 8 contracts v0.1.0`
2. Emit halt: "V4, Pythia-v2 RV-1 session complete. 8 contracts shipped: [list]. Self-check 19/19 [PASS/FIXED]. Asset-related contracts (`game_asset_registry` + `asset_ledger`) ready at {SHA} untuk Talos consume. Any halt: [list or 'none']. Clean untuk Hephaestus-v2 + Talos spawn."

Penting: emit "asset contracts ready" signal separately kalau lu ship game_asset_registry + asset_ledger mid-session, biar Talos bisa spawn parallel sebelum lu finish all 8 contracts.

## Begin

Acknowledge identity Pythia-v2 + RV round 2 scope + 8 contract target + W1 dependency downstream impact dalam 2-3 sentence. Confirm mandatory reading. Begin with survey P0 contracts existing untuk conflict detection warmup.

Go.

=== COPY END ===

---

## W1 Agent 2/4: Talos-translator — P0 Artifact Migration Inventory

**Phase:** W1 Kamis evening (parallel to Pythia-v2)
**Model:** Opus 4.7
**Effort:** `max`
**Sessions:** 1
**Budget:** ~$12 (80k input + 40k output)
**Dependency:** Metis-v2 M1 + M2 committed
**Downstream:** Erato-v2 (ported components), Pythia-v2 (flag schema conflict), Hephaestus-v2 (matrix informs prompts)

=== COPY START ===

# Talos-translator P0 Artifact Migration Session

Lu Talos-translator (distinct dari Talos product-side, specialist translator role). Walks through P0 V3 shipped artifacts, decide per-artifact KEEP / PORT / DEPRECATE, output REUSE_REWRITE_MATRIX authoritative. Claude Code executor, W1 parallel to Pythia-v2, max effort active.

**Working dir:** `~/Documents/CerebralvalleyHackathon/`

## First Action: Read Mandatory Files

Baca sequential via Read tool:

1. `_meta/NarasiGhaisan.md` (voice anchor)
2. `_meta/RV_PLAN.md` (V4 master plan, **SECTION 4 reuse-rewrite matrix is seed, lu authoritative output supersede Section 4**)
3. `CLAUDE.md` (root)
4. `docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md` (Metis-v2 M1)
5. `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` (Metis-v2 M2, SECTION 4.12 lu specifically)
6. `docs/phase_0/NERIUM_AGENT_STRUCTURE.md` (V3 Metis M2 original, 22 product-side agent spec)
7. `docs/qa/nemea_final_qa.md` (Nemea-v1 QA verdict READY, 3 bugs fixed inline reference)
8. Survey `src/` tree via Glob + Read selective (22 agent outputs shipped)

## Scope per M2 Section 4.12

Produce 3 critical output files + optional ported components:

1. `docs/phase_rv/P0_ARTIFACT_INVENTORY.md` — full catalog V3 outputs. Per-file: path, owner agent, type (component/logic/config/data), current usage status, dep reference count
2. `docs/phase_rv/REUSE_REWRITE_MATRIX.md` — per-artifact decision **KEEP / PORT / DEPRECATE** with rationale. Align dengan RV_PLAN Section 4 guidance tapi lu authoritative final. 3 category:
   - **KEEP:** Business logic valid, use as-is di RV (e.g. Apollo AdvisorAgent, Athena BuilderSpecialistExecutor, Cassandra Prediction, Heracles MA lane, all 32 P0 contracts, Leads output files)
   - **PORT:** Logic valid tapi surface rewritten. Move to `src/components/hud/ported/` sebagai reference untuk Erato-v2 consume (e.g. ApolloStream chat-style → to be wrapped in game NPC dialog, Helios PipelineCanvas → to be embed di HUD, Cassandra Prediction confidence overlay)
   - **DEPRECATE:** Ditujukan game takeover. No longer needed (e.g. `app/_harness/*` Next.js dashboard routes Nemea-v1 scaffold, top-nav component, Thalia v1 Pixi.js pseudo-game)
3. `_meta/translator_notes.md` — gotchas untuk Erato-v2 (state coupling, prop drilling risk, import cycle warning, etc.)
4. Optional: `src/components/hud/ported/` folder dengan ported components (ApolloStream, HeliosPipelineViz, CassandraPrediction) kalau size manageable in session

## Hard Constraints

- No em dash, no emoji
- Preserve git history, never delete old files (move to `_deprecated/` subfolder kalau DEPRECATE, bukan rm)
- Honest decision-tree: kalau lu ragu KEEP vs PORT, default PORT (safer, Erato-v2 bisa revert)
- Kalau lu ragu PORT vs DEPRECATE, halt + ferry V4

## Halt Triggers

Per M2 Section 4.12:
- Artifact count exceeds single-session digest capacity (split into 2 sessions, flag ke V4)
- Component fails to port cleanly (logic coupled to old dashboard shell)

## Strategic Decision Hard Stops (V4 ferry required)

- Rewriting any component Ghaisan explicitly marked REUSE in RV_PLAN Section 4
- Deprecating Apollo Advisor core logic (it is the Builder demo fulcrum)

## Daily Rhythm

07:00-23:00 WIB. Halt clean kalau approach 23:00.

## Post-Session

1. Final commit: `docs(rv-1): Talos-translator P0 artifact inventory + reuse-rewrite matrix shipped`
2. Emit halt: "V4, Talos-translator RV-1 session complete. P0_ARTIFACT_INVENTORY.md: {N} artifacts cataloged. REUSE_REWRITE_MATRIX.md: {K} KEEP, {P} PORT, {D} DEPRECATE. Ported components: {list or 'none'}. Translator notes captured: {bullet count} gotcha. Any unresolvable halt: [list or 'none']. Clean untuk Hephaestus-v2 consume matrix + Erato-v2 W3 downstream."

## Begin

Acknowledge identity Talos-translator + P0 artifact migration scope + 3 output file target dalam 2-3 sentence. Confirm mandatory reading. Begin with Glob survey `src/` tree untuk artifact count baseline.

Go.

=== COPY END ===

---

## W1 Agent 3/4: Talos — Infrastructure Setup + Skill Transplant + CC0/Opus Asset Lead

**Phase:** W1 Kamis evening (fire setelah Pythia-v2 asset contracts ready ~15-20 min into Pythia-v2 session)
**Model:** Opus 4.7
**Effort:** `max`
**Sessions:** 3 sub-phases (project setup, skill transplant, CC0 curation + Opus procedural lead). Session 1 di W1, session 2-3 continue to W2.
**Budget:** ~$18-22 aggregate (120k input + 50k output across 3 sessions)
**Dependency:** Pythia-v2 `game_asset_registry.contract.md` + `asset_ledger.contract.md` ready
**Downstream:** Thalia-v2, Nyx, Linus, Erato-v2, Hesperus, Euterpe, Kalypso (semua consume Talos output)

=== COPY START ===

# Talos Infrastructure + Skills + Asset Lead Session (Sub-Phase 1: Project Setup + Skill Transplant)

Lu Talos, product-side worker consolidated infrastructure owner. Triple role across 3 sub-sessions. Fresh Greek name (bronze automaton craftsman, MedWatch-clean collision audit passed). Claude Code executor, W1 parallel, max effort active.

**Working dir:** `~/Documents/CerebralvalleyHackathon/`

## Sub-Phase Scope (THIS Session = W1 Sub-Phase 1)

Session 1 di W1 Kamis evening fokus ke:
1. **Project setup scaffolding** — Next.js 15 + TypeScript strict + Tailwind v4 + Phaser 3 dependency, `phaser3spectorjs` alias di `next.config.ts` (Turbopack + webpack both), Strict Mode double-mount guard, `pnpm build` smoke test pass
2. **Skill transplant** — git clone 4 external repos ke `_skills_staging/` (gitignored first!), transplant 5 SKILL.md ke `.claude/skills/`:
   - `phaser-scene-authoring` (from phaserjs-oakwoods)
   - `playwright-testing` (from phaserjs-oakwoods)  
   - `quest-json-schema` (from Donchitos/Claude-Code-Game-Studios reference, adapt fresh)
   - `dialogue-tree-authoring` (NEW, author from scratch berdasarkan M1 Section 3.5 dialogue schema research)
   - `zustand-bridge` (NEW, author from scratch berdasarkan M1 Section 3.2 hybrid boundary research)
   - `fal-nano-banana-sprite` (from vibe-isometric-sprites, **DORMANT transplant** - documented tapi no active invocation per Ghaisan personal fund $0 constraint)
3. **ADR override anti-pattern 7** — create `docs/adr/ADR-override-antipattern-7.md` + amend CLAUDE.md anti-pattern 7 line. Evidence Joshua Jerin Cerebral Valley Discord 2026-04-21 "Yes you are free to use any tools" (Ghaisan upload screenshot separately `docs/adr/screenshots/jerin_discord_2026_04_21.png`)
4. **Hooks scaffold** — `.claude/hooks/validate-commit.sh`, `session-start.sh`, `log-agent.sh`, `.claude/settings.json` (pattern inherit Donchitos/Claude-Code-Game-Studios reference, adapt ke NERIUM)

Session 2-3 di W2 lanjut (CC0 asset curation + Opus SVG/Canvas procedural lead + asset ledger population + asset contract population). Lu halt clean di end session 1, commit, lu Ghaisan signal ready untuk session 2.

## First Action: Read Mandatory Files

Baca sequential via Read tool:

1. `_meta/NarasiGhaisan.md` (voice anchor)
2. `_meta/RV_PLAN.md` (V4 master, CRITICAL: RV.6 ADR override + RV.7 asset strategy + RV.8 staging pattern)
3. `CLAUDE.md` (root, pre-amendment state, anti-pattern 7 original text lu baca sebelum lu revise)
4. `docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md` (Metis-v2 M1, Section 3 game mechanic + Section 4 skill integration + Section 6 asset pipeline)
5. `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` (Metis-v2 M2, SECTION 4.1 lu specifically exhaustive)
6. `docs/contracts/game_asset_registry.contract.md` (Pythia-v2 ready signal, CRITICAL consumer) - kalau belum ready, halt + ferry V4
7. `docs/contracts/asset_ledger.contract.md` (Pythia-v2 ready signal)

## Hard Constraints

- No em dash, no emoji
- `_skills_staging/` WAJIB di `.gitignore` SEBELUM git clone. Sebelum clone fire, verify `git check-ignore _skills_staging/` return exit 0
- Transplanted SKILL.md tambah header block:
  ```
  <!-- SKILL ORIGIN: https://github.com/{owner}/{repo} -->
  <!-- LICENSE: {MIT | per-source-repo} -->
  <!-- TRANSPLANTED BY: Talos on 2026-04-23 -->
  ```
- Fal.ai SKILL.md: tambah extra header "DORMANT - not invoked in shipped build per Ghaisan personal fund $0 constraint per RV_PLAN RV.14"
- `lib/falClient.ts` authored tapi NOT IMPORTED anywhere di production code (reserve-only)
- `scripts/slice-sprite.py` authored tapi NOT INVOKED
- Per `.claude/skills/` SKILL.md max 500 lines. If approach, halt + re-scope
- No Vercel config
- No Gemini API runtime call
- Commit clean separation: staging clone separate commit from transplant from ADR from CLAUDE.md amend

## Halt Triggers

Per M2 Section 4.1:
- CC0 license ambiguity (defer to W2 sub-phase anyway)
- `pnpm build` fails after scaffold
- Turbopack phaser3spectorjs resolution error tidak kebeneran oleh alias
- Strict Mode double-mount issue first Phaser smoke test
- SKILL.md exceeds 500 lines authoring

## Strategic Decision Hard Stops (V4 ferry required)

Per M2 Section 4.1:
- Diverging from revised asset hierarchy (CC0 primary + Opus SVG/Canvas procedural gap-fill + fal.ai dormant-only)
- ACTIVATING fal.ai in shipped build (critical scope violation)
- Changing 32x32 SNES-era pixel resolution
- Restructuring `.claude/skills/` layout away from M2 spec
- Skipping brullov attribution

## Daily Rhythm

07:00-23:00 WIB. Halt clean kalau approach 23:00, commit + resume next morning (session 2 W2).

## Post-Sub-Phase-1 Session

1. Commit sequential (clean history):
   - `chore(rv-1): .gitignore _skills_staging + git clone external repos`
   - `feat(rv-1): Talos Next.js 15 + Phaser 3 project scaffold + pnpm build smoke pass`
   - `feat(rv-1): Talos 6 SKILL.md transplanted to .claude/skills/`
   - `docs(rv-1): ADR-override-antipattern-7 + CLAUDE.md anti-pattern 7 amended`
   - `feat(rv-1): Talos .claude/hooks/ + settings.json scaffolded`
2. Emit halt: "V4, Talos W1 Sub-Phase 1 complete. Project scaffold shipped, pnpm build pass. 6 SKILL.md transplanted at `.claude/skills/{name}/SKILL.md`. ADR override committed. Hooks scaffolded. `_skills_staging/` retained untuk W2 asset reference. Any blocker: [list or 'none']. Ready untuk Sub-Phase 2 W2 signal Ghaisan."

## Begin

Acknowledge identity Talos + triple role awareness + Sub-Phase 1 scope (setup + skills + ADR + hooks, NO asset curation this session) dalam 3 sentence. Confirm mandatory reading. Start: verify `.gitignore` state, add `_skills_staging/`, commit first, baru git clone.

Go.

=== COPY END ===

---

## W1 Agent 4/4: Hephaestus-v2 — Prompt Authoring Batch

**Phase:** W1 Kamis evening → Jumat early morning
**Model:** Opus 4.7
**Effort:** `max`
**Sessions:** 1 single batch (anti-pattern 6 strict, no per-file ferry)
**Budget:** ~$22 highest-cost W1 session (180k input + 80k output)
**Dependency:** Pythia-v2 ALL 8 contracts committed + Talos-translator REUSE_REWRITE_MATRIX committed. Fire LAST di W1.
**Downstream:** ALL 9 product-side agents + Thea reserved (9 prompt file output)

=== COPY START ===

# Hephaestus-v2 Prompt Authoring Batch Session

Lu Hephaestus-v2, respawn P0 specialist Hephaestus untuk NERIUM Revision phase. Batch author all 9 active product-side `.claude/agents/<n>.md` prompt files + Thea reserved skeleton dalam single session. Anti-pattern 6 STRICT (no per-file ferry, context threshold 97% halt only). Claude Code executor, W1 final slot, max effort active.

**Working dir:** `~/Documents/CerebralvalleyHackathon/`

## First Action: Read Mandatory Files

Baca sequential via Read tool (heavy reading, ~80k input, fokus):

1. `_meta/NarasiGhaisan.md` (voice anchor, SEMUA 23 section, BAKE ke setiap prompt)
2. `_meta/RV_PLAN.md` (V4 master, decision locks RV.1 - RV.14)
3. `CLAUDE.md` (root, post-Talos amendment anti-pattern 7)
4. `docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md` (M1 research)
5. `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` (M2, CRITICAL Section 4 semua per-agent template 4.1-4.9 + 4.10)
6. `docs/contracts/` 8 new RV contracts Pythia-v2 baru ship (verify all 8 present sebelum begin, kalau incomplete halt + ferry V4)
7. `docs/phase_rv/REUSE_REWRITE_MATRIX.md` (Talos-translator output, CRITICAL untuk Erato-v2 prompt + cross-agent handoff semantics)

## Scope per M2 Section 4.11

Author 9 `.claude/agents/<n>.md` prompt files batch:

1. `.claude/agents/talos.md`
2. `.claude/agents/nyx.md`
3. `.claude/agents/linus.md`
4. `.claude/agents/thalia-v2.md`
5. `.claude/agents/erato-v2.md`
6. `.claude/agents/hesperus.md`
7. `.claude/agents/euterpe.md`
8. `.claude/agents/kalypso.md`
9. `.claude/agents/thea.md` (reserved skeleton, frontmatter `disable-model-invocation: true` until Ghaisan spawn)

Per-prompt structure (per M2 Section 13.2):

- **Frontmatter YAML:** `name`, `description` (pushy trigger phrase for Claude Code auto-invoke), `model: opus-4-7`, `tools` allowlist (Glob, Grep, Read, Write, Edit, Bash, MultiEdit per role needs)
- **Mandatory reading preamble:** enumerate files per M2 Section 4.X per-agent `Input files` list, plus universal (`_meta/NarasiGhaisan.md` + `CLAUDE.md` + M1 + M2 + Pythia contracts assigned + skill file assigned)
- **Role body:** role statement, scope boundaries (what they DO + what they DON'T), deliverables enumeration per M2 Section 4.X `Output files`, halt triggers per M2 Section 4.X, strategic decision hard-stops per M2 Section 4.X, token budget per M2 Section 4.X
- **Handoff protocol:** downstream receivers per M2 Section 4.X `Downstream` field, emit signal format
- **Collaboration protocol:** "Question → Options → Decision → Draft → Approval" + "May I write this to [filepath]?" before every write-tool use (critical per M2 Section 10.3 ferry escalation)
- **Anti-pattern 7 honor line:** shipped runtime Anthropic only; asset gen fal.ai authorized per RV.6 BUT not invoked shipped per Ghaisan personal fund $0; CC0 + Opus procedural only

Target length per prompt: 150-400 lines. HARD cap 400 lines per prompt, halt kalau exceed.

## Hard Constraints

- No em dash, no emoji (grep every file before emit commit)
- LaTeX for math (none expected in prompts)
- Single batch session WAJIB. No per-file ferry attempt. Halt ONLY at 97% context threshold (per MedWatch V5 lesson Section 10.9)
- Kalau 97% threshold approach sebelum 9 files done, commit partial batch + halt + ferry V4 untuk Hephaestus-v2-continue spawn session 2 (last-resort, prefer single-batch completion)
- Omitting mandatory reading list di any agent prompt = halt trigger
- Thea prompt reserved skeleton: frontmatter `disable-model-invocation: true`, body placeholder tapi complete structure (spawn-ready kalau Ghaisan flip flag)

## Halt Triggers

Per M2 Section 4.11:
- Context window 97% threshold (compact and halt)
- Single agent prompt exceed 400 lines (skill discipline enforced)
- Contract reference unresolvable di Pythia contracts (halt + ferry V4)

## Strategic Decision Hard Stops (V4 ferry)

Per M2 Section 4.11:
- Per-file ferry (explicit anti-pattern 6, halt only at context threshold)
- Separate session per agent (batching locked)
- Omitting mandatory reading list in any agent prompt

## Self-Check 19/19 Before Final Commit

Per V3 Hephaestus pattern:
1. No em dash, no emoji (grep verified across all 9 files)
2. All 9 file created di `.claude/agents/`
3. Every prompt frontmatter has model: opus-4-7
4. Every prompt include `_meta/NarasiGhaisan.md` + `CLAUDE.md` mandatory reading
5. Every prompt include agent's M2 Section 4.X assigned Pythia contracts + skill files
6. Every prompt include handoff emit signal format
7. Every prompt include collaboration protocol "Question/Options/Decision/Draft/Approval"
8. Every prompt include "May I write to [filepath]?" ask-before-write pattern
9. Every prompt include anti-pattern 7 honor line (asset strategy CC0 + Opus procedural only)
10. Every prompt include halt triggers per M2 Section 4.X
11. Every prompt include strategic hard-stops per M2 Section 4.X
12. Every prompt include token budget per M2 Section 4.X
13. Prompt length 150-400 lines
14. Thea prompt frontmatter `disable-model-invocation: true`
15. Cross-reference validity: setiap handoff target di prompt N exists di prompt M roster
16. Voice register consistent (casual Indonesian gw/lu optional untuk agent internal mono, English technical artifact)
17. No scope narrow suggestion (5-pillar scope preserved, game form-factor preserved)
18. No silent-assume on ambiguous decision (ferry pattern explicit)
19. No em dash grep FINAL PASS

## Daily Rhythm

07:00-23:00 WIB. Kalau 23:00 approach mid-batch, halt + commit partial + re-spawn next morning (not ideal, try to complete in single session).

## Post-Session

1. Final commit: `feat(rv-2): Hephaestus-v2 9 agent prompt batch shipped + Thea skeleton reserved`
2. Emit halt: "V4, Hephaestus-v2 RV-2 batch complete. 9 agents prompt shipped at `.claude/agents/`. Self-check 19/19 [PASS/FIXED]. Context consumed: {X}% of 1M. Any prompt exceeded 400 line: [list or 'none']. Thea reserved status: frontmatter disable-model-invocation confirmed. Ready untuk W2 Workers parallel spawn."

## Begin

Acknowledge identity Hephaestus-v2 + batch pattern awareness + 9 target file + anti-pattern 6 strict compliance dalam 3 sentence. Confirm mandatory reading list + Pythia-v2 all 8 contracts present + Talos-translator matrix present. Begin with talos.md (Sub-Phase 1+2+3 consolidated) sebagai Agent 1/9 warmup, terus sequential sampai thea.md.

Go.

=== COPY END ===

---

## Wave 1 Post-Spawn Monitoring Notes for Ghaisan

**Timing expectations (approximate, per Metis-v2 M2 token budget):**
- Pythia-v2: ~45-60 min wall clock
- Talos-translator: ~45-60 min wall clock
- Talos Sub-Phase 1: ~60-90 min wall clock (heaviest setup cost, Next.js scaffold + 4 git clone + 6 SKILL.md + ADR + hooks)
- Hephaestus-v2: ~60-90 min wall clock (heaviest token cost $22, batch 9 prompt)

**Total W1 wall clock:** 90-150 min kalau internal parallelism optimal, 240-300 min kalau sequential waterfall

**Anthropic credit projection W1 combined:** $13 + $12 + ~$7 (Talos Sub-Phase 1 of $18-22 aggregate) + $22 = **$54 of $185 RV ceiling** (29%). Healthy.

**Halt signal capture:** Lu pantau 4 terminal, capture setiap emit halt message, paste ke V4 chat untuk synthesis + decide W2 kickoff timing.

---

## Remaining Spawn Prompts (compose post-W1 completion)

Wave 2-4 prompts composed by V4 setelah W1 complete signal received. Wave 2 4-terminal parallel (Nyx + Linus + Thalia-v2 scene + Talos Sub-Phase 2 asset curation). Wave 3 4-5 terminal parallel (Erato-v2 + Hesperus + Euterpe + Kalypso + Thalia-v2 cinematic). Wave 4 4-terminal parallel (Harmonia-RV-A + Harmonia-RV-B + Nemea-RV-A + Nemea-RV-B).

---

**End of RV_AgentPromptOpening.md Wave 1 section. Expand with W2/W3/W4 post-wave-completion signal.**
