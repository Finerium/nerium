# NERIUM RV M1 Research Document v2

## 0. Document meta

- **Version**: v2 (supersedes V3 Metis gamified-dashboard research)
- **Date**: April 23, 2026
- **Author**: Metis-v2 (M1 Research Phase, RV pivot)
- **Handoff target**: V4 ferry to M2 (agent roster design)
- **Scope**: research-only; produces decisions and references, does not author production code
- **Status**: DECISION-READY for M2 consumption
- **Hard constraints honored**: no em dash, no emoji, English-only, 95% Opus 4.7 preserved, multi-vendor asset gen authorized per RV.6 override

---

## 1. Executive summary

**NERIUM RV pivots the Builder pillar into an actual Phaser 3 top-down 2D RPG**, with React HUD overlays at the edges, Zustand as the shared state bridge, and fal.ai Nano Banana 2 as the primary asset engine. Five research streams converged on a coherent architecture that is buildable in 1 to 4 days by a solo dev, extensible to N quests, and projected to cost **under $5 of the $40 fal.ai budget** for the vertical-slice quest (Lumio onboarding).

**The four highest-signal findings are**: (1) the official Phaser 3 + Next.js 15 template (`phaserjs/template-nextjs`) validates the exact hybrid pattern NERIUM needs, and its `EventBus` pattern generalizes cleanly to a Zustand bridge with `subscribeWithSelector`; (2) the right quest runtime is a **linear FSM of steps with per-step Trigger/Condition/Effect hooks**, authored as one JSON file per quest, with a custom ~40-line React reducer for dialogue rather than inkjs or Yarn Spinner; (3) Claude Code skills load only frontmatter at session start and inject body content on demand, so project-specific skills committed to `.claude/skills/` cost near-zero context until actually used, which makes the skill transplant pattern highly economical; (4) fal.ai Nano Banana 2 at **$0.08 per 1K image** ($0.12 at 2K) is dramatically cheaper than anticipated, so the binding constraint on asset work is consistency and iteration time, not dollars.

The research also surfaces two structural decisions that M2 must lock before coding: **shop and currency UI live in the React HUD layer, not in Phaser**, because of Tailwind tokens, i18n USD/IDR needs, and accessibility; and **Phaser must be dynamically imported inside a Client Component** because `ssr: false` is illegal in Server Components under Next 15. Both are non-negotiable given the locked tech stack.

The implied agent roster adds **five fresh Greek names** (Nyx for quest state, Orpheus for dialogue, Calliope for fal prompt authoring, Daedalus for atlas packing, Hesperus for Opus SVG chrome), alongside extensions to existing roles (Thalia-v2 for Phaser scenes, Erato-v2 for React HUD). Thea-vision is reserved as an optional QA agent if cross-genre consistency becomes a bottleneck.

---

## 2. External reference repo analysis

### 2.1 chongdashu/phaserjs-oakwoods

- **URL**: https://github.com/chongdashu/phaserjs-oakwoods
- **Status**: TypeScript 62.5% / Python 33.9% / HTML 3.6%, MIT, 45 stars, 23 forks, companion to the "Vibe Coding 2D Games with Claude Code and Agent Skills" tutorial (https://www.youtube.com/watch?v=QPZCMd5REP8).
- **What it is**: a small Phaser 3 + TypeScript + Vite side-scroller platformer (Oak Woods brullov assets) packaged alongside Claude Code and Codex CLI agent skills. The `.claude/skills/phaser-gamedev/SKILL.md` and `.claude/skills/playwright-testing/SKILL.md` are the most valuable artifacts, mirrored at `.codex/skills/` for tool portability. Art is external and must be dropped into `public/assets/oakwoods/` with an `assets.json` manifest tracked in git while the PNGs are gitignored.
- **Key patterns to port**: four-scene convention (Boot, Preload, Game, UI), manifest-only art tracking, mirror-skills-across-tooling. The sibling repo `chongdashu/phaserjs-tinyswords` adds a **`window.__TEST__` hook** pattern for Playwright canvas testing that NERIUM should adopt verbatim.
- **Not applicable**: infinite-ground platformer physics; Apollo Village is top-down so gravity and jump-arc tuning are irrelevant. The controller collapses to an 8-direction Arcade physics walker (`body.setVelocity(vx, vy)`, no gravity).
- **Caveat**: direct `src/*.ts` fetch was blocked in this environment; scene-level code patterns are reconstructed from the tinyswords sibling and the `phaser-gamedev` skill body published at https://skills.sh.

### 2.2 chongdashu/vibe-isometric-sprites

- **URL**: https://github.com/chongdashu/vibe-isometric-sprites
- **Status**: direct fetch returned PERMISSIONS_ERROR and the repo does not surface in indexes as of April 23, 2026. It may be private or renamed. Patterns below are reconstructed from verified sibling artifacts: the March 2026 article "Generating Final Fantasy Tactics-Style Isometric Sprites With Nano Banana 2 + Veo 3.1" (https://x.com/chongdashu/status/2037573384674930715), the threejs-tactics-game repo, and `chongdashu/cc-skills-nanobananapro`.
- **Reconstructed pipeline**: Codex or Claude Code drives a prompt rewriter (OpenRouter gpt-4o-mini), which feeds fal.ai (Nano Banana 2 or Pro), then BRIA for background removal, optionally Veo 3.1 for reference motion. One `FAL_KEY` env var.
- **Consistency technique**: per-world style-bible JSON injected as a prompt prefix, reference-image seeding via `/edit` endpoint (up to 14 references), seed reuse across 8 directions of one character, verbatim trait-token reuse.
- **Slicing**: generate on a grid (2x2, 3x3, 4x4), then slice client-side with Pillow or a Canvas routine; output Phaser atlas JSON or load as spritesheet with fixed `frameWidth`.
- **Port directly**: the style-bible-as-prompt-prefix discipline, single `FAL_KEY`, per-run `meta.json` (model, seed, prompt hash, reference URLs), and the three-worlds-means-three-style-bibles rule (never mix prompts across worlds in one batch).

### 2.3 Donchitos/Claude-Code-Game-Studios

- **URL**: https://github.com/Donchitos/Claude-Code-Game-Studios
- **Status**: v0.3.0 Mar 9 2026, 7.2k stars, MIT. 48 agents, 37 skills, 8 hooks, 11 path-scoped rules (table counts; navigation blurb still says 49/72). Targets Godot 4, Unity, Unreal. **No Phaser specialist exists.**
- **Three-tier hierarchy**: Tier 1 Opus directors (creative, technical, producer), Tier 2 Sonnet leads (design, programming, art, audio, narrative, QA, release, localization), Tier 3 specialists.
- **Key artifacts to port**:
  - YAML-frontmatter markdown agent format (`---\nname: ...\ndescription: ...\nmodel: sonnet\n---`)
  - Subdirectory-per-skill at `.claude/skills/<name>/SKILL.md`
  - Collaboration protocol "Question, Options, Decision, Draft, Approval" with mandatory "May I write this to [filepath]?" before write-tool use
  - Hook scripts: `validate-commit.sh`, `validate-push.sh`, `validate-assets.sh`, `session-start.sh`, `detect-gaps.sh`, `log-agent.sh`
  - Path-scoped `.claude/rules/` (different standards for `src/gameplay/**`, `src/core/**`, `src/ui/**`, `tests/**`, `prototypes/**`)
  - Slash-command library (`/brainstorm`, `/sprint-plan`, `/code-review`, `/scope-check`, `/perf-profile`, `/gate-check`, `/release-checklist`)
- **For NERIUM**: do not replicate 48 agents. Collapse to approximately 10 hackathon-sized agents. Add a **phaser-specialist** (which Donchitos lacks) and a **fal-asset-specialist**. Drop localization, live-ops, analytics, multiplayer, monetization.

### 2.4 HermeticOrmus/claude-code-game-development

- **URL**: https://github.com/HermeticOrmus/claude-code-game-development
- **Status**: 5 commits, branch name suggests Claude-authored scaffolding, 2 stars, MIT, polyglot (Python 58%, Go 7.6%, JS 7.4%, Rust 6.6%, TS 5.5%, Svelte 4.4%). **README claims extensive content (50,000+ words, 10+ complete games, 100+ prompts) that could not be verified at the observed commit density.** Treat as aspirational.
- **Patterns worth borrowing**: `.claude-plugin/` manifest (distributable plugin shape), `plugins/<domain>/{agents,commands,skills}` folder structure (cleaner than flat `.claude/skills/`), prompt-library-by-lifecycle organization (`game-initialization-prompts.md`, `feature-development-prompts.md`, `debugging-prompts.md`, `optimization-prompts.md`).
- **Use as secondary reference only**; cross-check every concrete pattern against Donchitos (more populated) and against the sibling `HermeticOrmus/claude-code-guide` which documents the canonical agent/hook/command YAML shapes.

### 2.5 Bonus finds

- **`phaserjs/template-nextjs`** (https://github.com/phaserjs/template-nextjs) is the **authoritative reference for NERIUM**: Phaser 3.90.0 + Next.js 15.3.1 + TypeScript 5, MIT, ships `PhaserGame.tsx` + `EventBus.ts` + `App.tsx`. Official announcement at https://phaser.io/news/2024/03/official-phaser-3-and-nextjs-template. The `current-scene-ready` handshake is the canonical bridge primitive.
- **`fal-ai-community/skills`** (https://github.com/fal-ai-community/skills) is the canonical fal.ai agent-skills set (`fal-generate`, `fal-image-edit`, `fal-upscale`, `fal-audio`, `fal-workflow`). Single `FAL_KEY`, queue-mode polling, schema discovery.
- **`chongdashu/phaserjs-tinyswords`** validates the `assets.json` manifest pattern, nine-slice custom texture stitching, and the `window.__TEST__` Playwright hook.
- **`mikewesthad/phaser-3-tilemap-blog-posts`** (five-post tutorial by a Phaser Labs contributor): the top-down Pokemon-style post is directly applicable to Apollo Village traversal.
- **`chongdashu/threejs-tactics-game`** demonstrates the capture-after-implementation convention (`learnings/*.md`) and ships a `.claude/skills/playwright-testing/` with `imgdiff.py` for canvas regression.

### 2.6 Synthesized lessons for NERIUM RV

Adopt `CLAUDE.md` at root plus `.claude/{agents,skills,hooks,rules,settings.json}` per Donchitos. Mirror selected skills to `.codex/skills/` per Chong-U if any Codex CLI work is anticipated. Ship the four-scene convention per scene. Use the **official `phaserjs/template-nextjs` bridge pattern** as the starting point, but replace raw `EventBus` with Zustand `subscribeWithSelector`. Track only `assets.json` manifests in git; gitignore the PNG bulk. Keep the hackathon roster at ~10 agents. Enforce the "Question, Options, Decision, Draft, Approval" protocol and the "May I write this to [filepath]?" gate.

---

## 3. Game mechanic research

### 3.1 Quest state machine pattern

Four patterns were evaluated. **Linear FSM of steps with per-step Trigger/Condition/Effect hooks is the winner.** Behavior trees are overkill; dependency graphs need graph-editor tooling; pure TCE is flexible but verbose. The FSM+TCE hybrid matches the Zelda-style "go here, talk to X, return" flow, is trivially serializable, and leaves a ramp to branching quests later without rewrite. References: Orbits data-driven devlog (https://the-nope-slope.itch.io/orbits/devlog/359917/data-driven-quest-system-with-json), UE5 DT_Quests (https://medium.com/object-oriented-worlds/implementing-quest-systems-in-ue5-blueprints-47ea0ac00599), Pixel Crushers Quest Machine manual (https://www.pixelcrushers.com/quest_machine/Quest_Machine_Manual.pdf), and the Age of Mythology trigger model (https://aom.heavengames.com/scendesign/advanced/trig2/).

**Rex Rainbow's `DialogQuest`** (https://rexrainbow.github.io/phaser3-rex-notes/docs/site/dialog-quest/) was considered and rejected: it couples quest control flow to a Phaser Dialog instance, but NERIUM renders dialog in React.

**Schema (`src/data/quests/lumio_onboarding.json`)**:

```json
{
  "id": "lumio_onboarding",
  "title": "Meet Apollo and build Lumio v1",
  "giver": "apollo",
  "world": "apollo_village",
  "autostart": true,
  "steps": [
    { "id": "approach_apollo",
      "trigger": { "type": "npc_interact", "npcId": "apollo" },
      "effects": [{ "type": "open_dialogue", "node": "apollo_intro" }] },
    { "id": "answer_prompt_challenge",
      "trigger": { "type": "prompt_submitted", "slot": "lumio_brief" },
      "condition": { "minChars": 20 },
      "effects": [{ "type": "stream_apollo_response" }] },
    { "id": "watch_builder_cinematic",
      "trigger": { "type": "cinematic_complete", "key": "mini_builder" },
      "effects": [
        { "type": "award_item", "itemId": "lumio_blueprint_v1" },
        { "type": "add_trust", "npcId": "apollo", "amount": 10 },
        { "type": "unlock_world", "worldId": "cyberpunk_shanghai" }
      ] }
  ],
  "rewards": { "currency": { "USD": 5 }, "items": ["lumio_blueprint_v1"] }
}
```

The runtime is ~60 lines: a `useQuestStore` (Zustand) holding `activeQuests`, `completedQuests`, `stepIndex`, plus a `fireTrigger(trigger)` dispatcher that every subsystem calls.

### 3.2 Dialogue tree format

**Recommendation: custom minimal JSON dialogue schema, parsed by a ~40-line React reducer.** Ink, Twine, Yarn Spinner, and Dialogic were all evaluated.

| Format | JS/TS runtime | LLM authoring | NERIUM fit |
|---|---|---|---|
| Ink (inkle) | inkjs, zero deps | fragile DSL | Strong as escape hatch |
| Twine / Harlowe | custom parsers | weak | Poor |
| Yarn Spinner 3 | Bondage.js, 3.x official JS runtime | weaker for LLM JSON | Good but overkill |
| Dialogic (Godot) | none for web | N/A | Not viable |
| rex `DialogQuest` | Phaser native | basic JSON | Couples to Phaser UI |

Custom JSON wins because Claude generates JSON natively with schema validation, and NERIUM needs to **embed React prompt-challenge components mid-dialog** (a first-class node type that Ink and Yarn do not provide). Reserve a `source: "ink"` field so later quests can adopt inkjs (https://github.com/y-lohse/inkjs) without schema migration.

**Schema snippet**:

```json
{
  "id": "apollo_intro",
  "speaker": "apollo",
  "start": "greet",
  "vars": { "playerName": "" },
  "nodes": {
    "greet": {
      "lines": [
        { "text": "Welcome to Apollo Village, {playerName}." },
        { "text": "I am Apollo. Ready to build Lumio?" }
      ],
      "choices": [
        { "label": "Yes, show me.", "next": "prompt_brief" },
        { "label": "Who are you?", "next": "lore", "if": "trust.apollo < 5" }
      ]
    },
    "prompt_brief": {
      "challenge": {
        "type": "prompt_input",
        "slotId": "lumio_brief",
        "placeholder": "Describe Lumio in one sentence",
        "minChars": 20
      },
      "onSubmit": { "stream": "apollo_stream", "next": "builder_cinematic" }
    },
    "builder_cinematic": {
      "phaser": { "event": "play_cinematic", "key": "mini_builder" },
      "next": "end"
    },
    "end": { "effects": [{ "type": "complete_quest", "questId": "lumio_onboarding" }] }
  }
}
```

### 3.3 Inventory system

**Slot-based array of `{ itemId, quantity }` with tag array on item def for filtering and unlock semantics.** No spatial grid needed for a vertical slice. Items defined in JSON with `id`, `name`, `type`, `iconUrl`, `description`, `tags`, `stackable`, `quantity`, `rarity`. The quest-effect `{ "type": "award_item", "itemId": "..." }` invokes `useInventory.getState().award(effect.itemId)`, and a React toast subscribes to `inventory.lastAwarded`. Phaser never touches inventory state directly.

### 3.4 Currency and shop render boundary

**Locked decision: currency HUD lives in React top bar, shop is a React modal gated by `ui.shopOpen`, Phaser emits only the trigger event.** Reasoning: Tailwind tokens, `next-intl` USD/IDR formatting, screen-reader accessibility, and precedent from the `phaserjs/template-react-ts` `EventBus` pattern. Shopkeeper `pointerdown` emits `shop:open`; a top-level `BusBridge` React component flips `useUI.setState({ shopOpen: true })`; React renders `<ShopModal />` conditionally.

### 3.5 NPC trust and reputation

**Flat `npcTrust: Record<string, number>` counter now, with parallel `factionReputation: Record<string, number>` field reserved in schema but unused in slice.** Tiers (stranger < 5, acquaintance < 20, ally) are computed, not stored. Dialogue choices gate via `"if": "trust.apollo >= 5"`, evaluated by a tiny `jsep` parser or a single `new Function("ctx", "return " + expr)` line.

### 3.6 Lumio onboarding quest mechanic breakdown

| # | Step | Active scene/component | Event | Zustand mutation | Visual/audio | Gate to next |
|---|---|---|---|---|---|---|
| 1 | Spawn in Apollo Village | `ApolloVillageScene` + `TopBar` + `QuestTracker` | `scene:ready`, `quest:start` | push to `activeQuests`, `stepIndex=0` | village ambient loop, fade in | proximity to Apollo |
| 2 | Walk up to Apollo | zone collision | `npc:nearby` | `ui.interactPromptVisible=true` | "Press E" indicator | press E |
| 3 | Press E opens dialogue | React `DialogueOverlay` | `npc:interact`, bridge sets `ui.dialogueId` | `dialogue.activeId`, `dialogue.nodeId="greet"` | slide-up panel, typewriter SFX | reach node `prompt_brief` |
| 4 | Prompt challenge | React `PromptInputChallenge` | `onSubmit` calls `fireTrigger({type:"prompt_submitted"})` | `prompts.submissions[slot]=value`, `stepIndex++` | input glow | length >= 20 chars |
| 5 | Apollo streams | React `ApolloStream` (reuse existing) | fetch `/api/apollo/stream` | `dialogue.streaming`, fill buffer | token-by-token, chime on done | `stream:complete` |
| 6 | Mini Builder cinematic | `MiniBuilderScene` launched via `scene.launch` | `cinematic:start`, `cinematic:complete` | `ui.cinematicPlaying` flips | tileset reveal tween, music sting | tween `onComplete` |
| 7 | Award "Lumio Blueprint v1" | React `InventoryToast` | `inventory.award(...)` | `slots.push`, `lastAwarded` | card toast, pickup SFX | immediate |
| 8 | Trust bump + complete | `QuestTracker` flashes Complete | `add_trust`, `complete_quest` | `npcTrust.apollo+=10`, move quest to completed | checkmark, jingle | always |
| 9 | Caravan unlocked | `ApolloVillageScene` listens | `world:unlock` | `world.unlocked.push(...)` | caravan sprite fades in, shimmer | walk to caravan |

### 3.7 Tooling decisions

- No inkjs, no Yarn Spinner, no rex DialogQuest in M2.
- Add `zod` schemas for `Quest`, `Dialogue`, `Item` for load-time validation of Claude-generated JSON.
- Single `EventBus` (Phaser `game.events`) plus Zustand stores. Phaser writes world/cinematic events; a top-level `BusBridge` React component forwards relevant ones into Zustand; quest-runner effects call Zustand actions directly. React never touches Phaser scenes directly.

---

## 4. Skill integration pattern

### 4.1 SKILL.md structure reference

Sources: Claude Code Skills docs (https://code.claude.com/docs/en/skills), Anthropic engineering blog "Equipping agents for the real world with Agent Skills" (https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills), best-practices (https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), anthropics/skills skill-creator (https://github.com/anthropics/skills), Mikhail Shilkov reverse-engineering (https://mikhail.io/2025/10/claude-code-skills/), Lee Hanchung deep dive (https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/).

A skill is a directory whose entrypoint is `SKILL.md`. All frontmatter fields are optional except `description` (strongly recommended as the trigger signal). Key fields: `name` (lowercase alphanumeric with hyphens, max 64 chars), `description` (max 1024 chars, primary auto-invoke signal), `when_to_use`, `allowed-tools`, `disable-model-invocation`, `user-invocable`, `argument-hint`, `model`, `effort`, `context: fork` + `agent`, `paths` (glob patterns that gate activation), `hooks`, `shell`.

Body structure: H1 title and one-paragraph summary, imperative instructions (prefer the "why" over heavy `MUST`/`ALWAYS`), output format templates, 1 to 3 concrete Input/Output examples, additional-resources section linking `references/*.md`, `scripts/*.py`, `assets/*`.

Canonical example from the docs:

```
---
name: explain-code
description: Explains code with visual diagrams and analogies. Use when explaining how code works, teaching about a codebase, or when the user asks "how does this work?"
---

When explaining code, always include:
1. Start with an analogy
2. Draw an ASCII diagram
3. Walk through the code
4. Highlight a gotcha
```

### 4.2 Skill discovery and load order

Claude Code scans four levels: enterprise, personal (`~/.claude/skills/`), project (`.claude/skills/`), plugin. Precedence enterprise > personal > project. Plugin skills use `plugin-name:skill-name` namespace. Pre-built skills mount read-only at `/mnt/skills/public/` (docx, pptx, pdf, xlsx, frontend-design) in the Claude.ai container runtime.

Runtime behavior (critical for context budgeting): at session start, Claude Code injects only `name` + `description` per skill into `<available_skills>` in the Skill tool definition. Body content is **not** loaded. Budget approximately 1% of the context window, fallback 8,000 chars, tunable via `SLASH_COMMAND_TOOL_CHAR_BUDGET`. When Claude invokes a skill, the tool response injects the base path plus SKILL.md body (frontmatter stripped). Once injected, the body stays in conversation for the rest of the session; Claude does not re-read SKILL.md on later turns. Supporting files load only on explicit read. Live change detection works within a session; new top-level skill directories need a restart. Auto-compaction retains the most recent invocation per skill up to 5,000 tokens each, 25,000-token combined budget.

Nested monorepo discovery: opening a file under `packages/frontend/` also loads `packages/frontend/.claude/skills/`.

### 4.3 Project-specific skill authoring

Layout:

```
.claude/skills/<skill-name>/
├── SKILL.md           # required, under 500 lines
├── references/        # domain docs, loaded on demand
│   └── schema.md
├── scripts/           # executables via Bash
│   └── generate.py
└── assets/            # templates, fixtures
    └── template.json
```

Keep `SKILL.md` under 500 lines and approximately 5,000 words total. For references over 300 lines, include a TOC. From SKILL.md reference files explicitly so Claude knows when to load them. Use `${CLAUDE_SKILL_DIR}` in shell substitutions for cwd-independence.

### 4.4 Candidate NERIUM skills

- **`phaser-scene-authoring/`**: scene lifecycle (init, preload, create, update), SceneManager transitions, asset-key conventions, `references/preload-patterns.md`. Triggers: "new scene", "Phaser scene", "preload assets", "scene transition".
- **`zustand-bridge/`**: store shape, EventEmitter contract, subscribe/unsubscribe pattern, `scripts/scaffold-slice.ts`. Triggers: "zustand store", "HUD state", "React Phaser bridge".
- **`fal-nano-banana-sprite/`**: prompt profile templates, 8-way turnaround skeleton, `references/cost-table.md`, `scripts/estimate-cost.py`. Triggers: "sprite generation", "nano-banana", "character turnaround", "fal.ai sprite".
- **`quest-json-schema/`**: JSON schema, filled template under `assets/quest-template.json`, validator script. Triggers: "new quest", "quest file", "quest json".
- **`dialogue-tree-authoring/`**: Yarn-like JSON dialogue format, node conventions, condition/variable grammar, two example dialogues under `assets/`. Triggers: "NPC dialog", "dialogue tree", "yarn node".

Each SKILL.md leads with a pushy description naming concrete trigger phrases, e.g., "Use this skill whenever the user asks to author, modify, or validate a NERIUM quest file, or mentions quest JSON, objectives, or rewards, even if they do not say 'quest'."

Agent-to-skill affinity (reference only; all skills are globally discoverable):

- Hephaestus-v2 (worker): any
- Thalia-v2 (Phaser): `phaser-scene-authoring`, `fal-nano-banana-sprite`
- Erato-v2 (React HUD): `zustand-bridge`
- Nyx (quest): `quest-json-schema`, `zustand-bridge`
- Orpheus (dialogue): `dialogue-tree-authoring`

### 4.5 Skill vs inline prompt decision framework

Inline belongs: agent persona, tool allow-list, one-off constraints, under ~30 lines. Skill belongs when content is reused across agents, carries scripts/templates, exceeds ~50 lines, contains schemas/tables/multi-step workflows, or needs Claude to auto-route by intent. Decision tree:

1. Reused by two or more agents or by a slash command? Skill.
2. Needs bundled scripts, templates, references? Skill.
3. Over ~50 lines or contains schema/table/workflow? Skill.
4. Needs auto-loading by intent? Skill.
5. Persona or always-on guardrail? Inline in agent prompt or CLAUDE.md.
6. Rarely-used deep reference? Skill with `user-invocable: false`.

### 4.6 `_skills_staging/` pattern

Add `/_skills_staging/` to `.gitignore`. Author drafts there. To test, either symlink into `.claude/skills/` during iteration, or use `claude --add-dir _skills_staging` (structure as `_skills_staging/<draft>/.claude/skills/<draft>/SKILL.md`). Iterate with the skill-creator eval loop (2 to 3 eval prompts, review, revise description). Promote via `git mv` when stable. PR checklist: name regex `^[a-z0-9]+(-[a-z0-9]+)*$`, description under 1024 chars with trigger keywords, SKILL.md under 500 lines, no secrets, no unreviewed scripts.

### 4.7 Recommendations for M2

- Commit `.claude/skills/` to repo.
- Author first: `phaser-scene-authoring` and `quest-json-schema`. Both unblock the most agents and have objective outputs that benefit from the eval loop.
- Author second: `zustand-bridge` and `dialogue-tree-authoring`.
- Defer `fal-nano-banana-sprite` until the sprite pipeline stabilizes (templates will churn).
- Enforce 500-line SKILL.md cap; push long content to `references/*.md`.
- Do not put agent personas or tool allow-lists into skills; those live in `.claude/agents/<name>.md`.
- Reuse `/mnt/skills/public/` skills (docx, pptx, pdf, xlsx, frontend-design); reference by name in agent prompts for document artifacts.
- Security note: audit third-party skills; frontmatter is injected directly into system prompt, so a malicious description can redirect agents.

---

## 5. Phaser 3 + Next.js 15 embed

### 5.1 SSR incompatibility and dynamic import pattern

Phaser's entry point imports `WebGLRenderer.js`, which references `phaser3spectorjs` and reads `window`/`navigator` synchronously. Importing Phaser anywhere a Server Component renders throws "Module not found: Can't resolve 'phaser3spectorjs'" or "window is not defined" (https://github.com/phaserjs/phaser/discussions/6659). The fix is `next/dynamic` with `ssr: false`, **but** Next 14+ disallows `ssr: false` inside Server Components (https://nextjs.org/docs/messages/no-ssr-in-server-component, https://github.com/vercel/next.js/discussions/72236).

**The canonical three-layer sandwich**: server page > client wrapper (`"use client"`) > dynamic Phaser component.

```tsx
// app/play/page.tsx  (Server Component)
import GameShell from "@/components/game/GameShell";
export default function PlayPage() { return <GameShell />; }
```

```tsx
// components/game/GameShell.tsx
"use client";
import dynamic from "next/dynamic";
import { TopHud, BottomHud, SideHud } from "@/components/hud";

const PhaserCanvas = dynamic(() => import("./PhaserCanvas"), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">Loading game...</div>,
});

export default function GameShell() {
  return (
    <div className="grid h-dvh grid-cols-[16rem_1fr] grid-rows-[3rem_1fr_4rem] bg-zinc-950">
      <TopHud className="col-span-2" />
      <SideHud className="row-span-1" />
      <main className="relative overflow-hidden"><PhaserCanvas /></main>
      <BottomHud className="col-span-2" />
    </div>
  );
}
```

Rules: the `import()` string must be a literal; the file containing `dynamic(..., { ssr: false })` must start with `"use client"`; `phaser` itself must be imported only inside the dynamically loaded module, never in any page or layout. If the `phaser3spectorjs` resolution error appears, alias it away:

```ts
// next.config.ts
const nextConfig = {
  turbopack: { resolveAlias: { phaser3spectorjs: { browser: "./lib/empty.ts" } } },
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, phaser3spectorjs: false };
    return config;
  },
};
export default nextConfig;
```

### 5.2 Mount lifecycle

```tsx
// components/game/PhaserCanvas.tsx
"use client";
import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { BootScene } from "@/game/scenes/BootScene";
import { WorldScene } from "@/game/scenes/WorldScene";
import { wireBridge } from "@/lib/gameBridge";

export default function PhaserCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (gameRef.current || !containerRef.current) return; // Strict Mode guard
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: "#0b0f19",
      scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%", autoCenter: Phaser.Scale.CENTER_BOTH },
      physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 } } },
      scene: [BootScene, WorldScene],
    });
    gameRef.current = game;
    const unwire = wireBridge(game);
    return () => { unwire(); game.destroy(true); gameRef.current = null; };
  }, []);

  return <div ref={containerRef} className="absolute inset-0" />;
}
```

The `gameRef.current` guard neutralizes React 18/19 Strict Mode double-mount. Do not disable `reactStrictMode` globally; the ref guard is sufficient. Turbopack HMR works out of the box because the cleanup destroys the previous game.

### 5.3 Canvas sizing

Phaser's `ScaleManager` offers NONE, FIT, ENVELOP, WIDTH_CONTROLS_HEIGHT, HEIGHT_CONTROLS_WIDTH, RESIZE, EXPAND (https://docs.phaser.io/phaser/concepts/scale-manager). **Recommendation: `Phaser.Scale.RESIZE` with `width: "100%"`, `height: "100%"`**, letting Tailwind define the viewport via the parent grid cell. Scenes subscribe to resize for world-space UI:

```ts
this.scale.on("resize", (size: Phaser.Structs.Size) => {
  this.cameras.main.setViewport(0, 0, size.width, size.height);
  this.worldBoundsText?.setPosition(size.width - 16, 16).setOrigin(1, 0);
});
```

Phaser's ScaleManager installs its own ResizeObserver on the parent. If NERIUM later commits to fixed-resolution pixel art (e.g., 640x360 upscaled), swap to `FIT + CENTER_BOTH`.

### 5.4 Zustand bridge module

```ts
// lib/gameStore.ts
"use client";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export type NpcId = string;
export interface GameState {
  currentQuest: string | null;
  prompt: string | null;
  hp: number;
  setPrompt: (text: string | null) => void;
  onNpcInteract: (id: NpcId) => void;
  setQuest: (q: string | null) => void;
}

export const useGameStore = create<GameState>()(
  subscribeWithSelector((set, get) => ({
    currentQuest: null,
    prompt: null,
    hp: 100,
    setPrompt: (prompt) => set({ prompt }),
    setQuest: (currentQuest) => set({ currentQuest }),
    onNpcInteract: (id) => set({ prompt: `Talking to ${id}` }),
  }))
);
```

```ts
// lib/gameBridge.ts
"use client";
import Phaser from "phaser";
import { useGameStore, type NpcId } from "./gameStore";

export function wireBridge(game: Phaser.Game): () => void {
  const store = useGameStore;
  const onNpc = (id: NpcId) => store.getState().onNpcInteract(id);
  const onDmg = (amount: number) => store.setState((s) => ({ hp: Math.max(0, s.hp - amount) }));
  game.events.on("npc-interact", onNpc);
  game.events.on("player-damaged", onDmg);
  const unsubQuest = store.subscribe(
    (s) => s.currentQuest,
    (quest, prev) => game.events.emit("quest-changed", { quest, prev }),
    { fireImmediately: false }
  );
  game.registry.set("store", store);
  return () => {
    unsubQuest();
    game.events.off("npc-interact", onNpc);
    game.events.off("player-damaged", onDmg);
  };
}
```

Inside a scene, pull via `useGameStore.getState()`, subscribe via `useGameStore.subscribe(selector, cb)`, and clean up on `Phaser.Scenes.Events.SHUTDOWN`. React HUD uses narrow selectors: `useGameStore((s) => s.hp)`.

### 5.5 TypeScript strict compat

Phaser 3.60+ bundles its own types. Under strict mode: use definite assignment (`!`) sparingly for fields initialized in `create()`; use `satisfies Phaser.Types.Scenes.SettingsConfig` on scene configs; type `init(data)` with explicit interfaces; null-guard `this.input.keyboard` and `this.player.body`. Set `"skipLibCheck": true` in `tsconfig.json` (standard for all Next.js templates).

```ts
export interface WorldSceneData { spawn: { x: number; y: number }; questId: string | null; }

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spawn: WorldSceneData["spawn"] = { x: 0, y: 0 };
  constructor() { super({ key: "World" } satisfies Phaser.Types.Scenes.SettingsConfig); }
  init(data: WorldSceneData) { this.spawn = data.spawn; }
  create() {
    this.player = this.physics.add.sprite(this.spawn.x, this.spawn.y, "hero");
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error("Keyboard plugin unavailable");
    this.cursors = keyboard.createCursorKeys();
    this.game.events.emit("scene-ready", this);
  }
}
```

### 5.6 Performance and bundle

Full `phaser.min.js` is ~1.3 MB minified, ~345 KB gzipped, ~300 KB Brotli (sources: https://www.npmjs.com/package/phaser, Bundlephobia). Custom graphics-only builds drop to ~113 KB min+gz. Phaser Compressor (https://phaser.io/news/2024/05/phaser-compressor-released) can trim 60%+.

Strategy: the dynamic import splits Phaser into its own chunk loaded only when `/play` mounts; keep landing-page initial JS under 200 KB. Lazy-add large optional scenes at runtime via `await import()`. Use two Phaser asset packs (`boot-asset-pack.json` and `preload-asset-pack.json`). Turbopack compat needs no `transpilePackages`; only the `phaser3spectorjs` alias. HUD selectors must be narrow; use `useShallow` when selecting multiple fields.

### 5.7 Production references

- Official template: https://github.com/phaserjs/template-nextjs (Phaser 3.90.0 + Next 15.3.1 + TS 5, MIT, 145 stars, April 2026). Authoritative.
- Phaser Studio org: https://github.com/phaserjs
- Phaser Editor variant: https://github.com/phaserjs/phaser-editor-template-nextjs
- Older Pages Router template (contrast): https://github.com/robksawyer/nextjs-phaser
- Community tutorial: https://generalistprogrammer.com/tutorials/phaser-nextjs-tutorial
- Phaser project templates hub: https://docs.phaser.io/phaser/getting-started/project-templates
- CLI bootstrapper: `npm create @phaserjs/game@latest`
- Next lazy-loading ref: https://nextjs.org/docs/pages/building-your-application/optimizing/lazy-loading
- Zustand subscribeWithSelector: https://zustand.docs.pmnd.rs/reference/middlewares/subscribe-with-selector

---

## 6. Asset strategy hybrid

### 6.1 Fal.ai Nano Banana 2 deep dive

**Endpoints**: `fal-ai/nano-banana-2` (text-to-image) and `fal-ai/nano-banana-2/edit` (image editing, up to 14 reference images). The model is **Google Gemini 3.1 Flash Image** served as Partner inference with commercial-use rights (https://fal.ai/models/fal-ai/nano-banana-2).

**Pricing (April 2026)**:

| Resolution | $ per image |
|---|---|
| 0.5K | $0.06 |
| **1K (default)** | **$0.08** |
| 2K | $0.12 |
| 4K | $0.16 |

Optional: `enable_web_search` +$0.015; `thinking_level: "high"` +$0.002. Older Nano Banana: $0.039; Nano Banana Pro: $0.15.

**API call (TypeScript queue mode)**:

```ts
import { fal } from "@fal-ai/client";
fal.config({ credentials: process.env.FAL_KEY });

const result = await fal.subscribe("fal-ai/nano-banana-2", {
  input: {
    prompt: "character sheet, 8-direction turnaround ...",
    num_images: 1,
    aspect_ratio: "1:1",
    output_format: "png",
    resolution: "1K",
    seed: 42,
    thinking_level: "high"
  },
  logs: true,
  onQueueUpdate: (u) => { if (u.status === "IN_PROGRESS") u.logs.forEach(l => console.log(l.message)); }
});
```

**Input schema**: `prompt`, `num_images`, `seed`, `aspect_ratio` (enum includes 1:1, 3:4, 4:3, 16:9, 9:16, 4:1, 1:4, 8:1, 1:8, etc.), `output_format` (jpeg/png/webp), `resolution` (0.5K/1K/2K/4K), `enable_web_search`, `thinking_level`, `limit_generations`, `safety_tolerance`. The `/edit` endpoint adds `image_urls` up to 14.

**Prompt engineering for consistent sprites**: Nano Banana 2 is autoregressive multimodal, not diffusion. It reasons about composition before rendering (https://fal.ai/learn/tools/how-to-use-nano-banana-2). Consequences:

1. Conversational prose, not tag soup.
2. Use the `/edit` endpoint with 1 to 3 reference images aggressively; generate a "character sheet master" first, then seed every variant off it.
3. Lock "trait tokens" verbatim across calls: same words for hair, eye color, clothing.
4. Force diagram mode for turnarounds: "orthographic projection, flat view, character reference sheet, no perspective distortion".
5. Reuse `seed` across related calls.
6. **Generate the whole 8-direction turnaround in one call as a 3x3 grid (center cell empty)** on a 1:1 canvas, then slice client-side. Saves 8x cost and enforces identity at the latent level.

**Genre prompt profiles**:

*Medieval Desert (Apollo Village)*:
```
Pixel art, SNES 16-bit era, 32x32 top-down 3/4 JRPG tile, limited 16-color
palette: warm sand #E8C48A, terracotta #B4613C, ivory #F5ECD1, dusty blue
shadow #6B7A99, bronze #8A5A2B. Subject: [SUBJECT]. Cel-shaded flat fill,
1px black outline, no anti-alias, no dithering, magenta (#FF00FF) chroma
background. Sun-bleached mediterranean-aegean mood, low-contrast midday
light. Orthographic projection. Consistent with Apollo Village art bible.
```

*Cyberpunk Shanghai*:
```
Pixel art, late-16-bit arcade era, 32x32 top-down 3/4 tile, 24-color palette:
neon magenta #FF2E88, neon cyan #22E8FF, deep purple #2A0B3F, rain-slick
asphalt #1A1A24, signboard yellow #FFD23F, LED green #38FFA7. Subject:
[SUBJECT]. Wet-pavement reflections, rim-light on shoulders, slight CRT
glow on emissive signs, no bloom. 1px black outline, cel-shaded, magenta
(#FF00FF) chroma background. Shanghai Bund night vibe. Orthographic.
```

*Steampunk Victorian*:
```
Pixel art, 16-bit era, 32x32 top-down 3/4 tile, sepia-brass 16-color
palette: brass #B58A3A, copper #C26A3D, oil-black #1B140F, cream paper
#EDE1C2, soot grey #3A342E, rust red #7A2E1F. Subject: [SUBJECT]. Gaslit
London mood, soft amber key light, cel-shaded flat fill, visible rivets
and gears where appropriate, 1px black outline, magenta (#FF00FF) chroma
background. No anti-alias. Orthographic projection.
```

For tilesets, replace subject with "16-tile seamless tileset arranged as a 4x4 grid on a 1:1 canvas, top-down ground tiles, edges tileable, each tile exactly 32x32 pixels, no overlap."

**Batch generation**: `limit_generations: true` default overrides `num_images`; use `fal.queue.submit` one-per-asset with `Promise.allSettled`, webhooks via `webhookUrl` for completion notifications. Concurrency starts at 2 at signup, auto-scales to 40 based on paid invoice totals (https://fal.ai/docs/documentation/model-apis/concurrency-limits). For NERIUM's personal budget, the 2-concurrent cap is fine; 15 to 25 sprites complete in under 10 minutes.

**Failure modes and mitigations**:

| Failure | Mitigation |
|---|---|
| Style drift between NPCs | Use `/edit` with Apollo master as reference; reuse genre block verbatim |
| Wrong facing | Generate 3x3 grid in one call, add "orthographic, no perspective" |
| Palette drift | Encode hex codes in prompt |
| Wrong tile seams | "Seamless, tileable edges" + edge-compare post-check |
| Baked caption text | "No text, no watermark, no labels, no signatures" |
| Cost blowout | Cap each asset at 2 retries; fall back to CC0 or Opus SVG |
| 429 concurrency | SDK auto-retries with backoff; set `client_timeout=120` |
| Runner mid-failure | Fal auto re-queues up to 10 times |

**Resolution and rate**: 1K default (~1024x1024 at 1:1); 2K worth $0.12 for hero sheets and tilesets. No documented hard RPS cap; concurrency tier is the effective limit. Time-to-start via `X-Fal-Request-Timeout` header; inference uncapped post-pickup.

**Budget math for 1 quest**:

| Asset | Count | Res | $/img | Subtotal |
|---|---|---|---|---|
| Apollo Village tileset (4x4) | 1 | 2K | 0.12 | 0.12 |
| Apollo NPC 3x3 turnaround | 1 | 2K | 0.12 | 0.12 |
| Supporting NPCs | 4 | 1K | 0.08 | 0.32 |
| Lumio Blueprint v1 icon | 1 | 1K | 0.08 | 0.08 |
| Cyberpunk caravan teaser | 1 | 2K | 0.12 | 0.12 |
| UI decorative fall-through | 2 | 1K | 0.08 | 0.16 |
| **Base (10 images)** | | | | **$0.92** |
| 2x rejection-retry buffer | +10 | mix | avg 0.10 | 1.00 |
| A/B variants | +5 | 1K | 0.08 | 0.40 |
| **Projected total (25 images)** | | | | **~$2.32** |

Full Phase 1 (3 villages, 30 NPCs, 10 tilesets) projects to $10 to $15. **The $40 cap is comfortable.** The binding constraint is time and consistency, not dollars. Reserve $30 for iteration slop; treat first $10 as prompt-calibration sacrificial budget.

### 6.2 CC0 pack coverage

**Kenney.nl (all CC0)**:
- Roguelike/RPG pack, 1,700+ tiles: https://kenney.nl/assets/roguelike-rpg-pack (best Medieval Desert starter)
- RPG Urban Pack, 480 assets: https://kenney.nl/assets/rpg-urban-pack
- RPG Base, 230 assets: https://kenney.nl/assets/rpg-base
- Medieval Town (Base), 65 assets: https://kenney.nl/assets/medieval-town-base
- Platformer Pack Medieval: https://kenney.nl/assets/platformer-pack-medieval
- **UI Pack (RPG Expansion), 85 assets**: https://kenney.nl/assets/ui-pack-rpg-expansion (directly usable HUD borders and dialog frames)
- Medieval RTS: https://kenney.nl/assets/medieval-rts
- 50 RPG sfx and UI sfx audio packs

**OpenGameArt**:
- **Warped City (CC0)**, complete cyberpunk 16x16 tileset, 3-layer parallax, characters, vehicles: https://opengameart.org/content/warped-city
- Cyberpunk Tileset Slim Version: https://opengameart.org/content/cyberpunk-tileset-and-assets-slim-version
- Cyberpunk Pixel Art Platformer: https://opengameart.org/content/cyberpunk-pixel-art-platformer
- Steampunk Level Tileset Mega Pack (CC-BY 3.0, attribution required): https://opengameart.org/content/steampunk-level-tileset-mega-pack-level-tileset-16x16
- Steampunk Inspired Tiles 32x32 (CC0): https://opengameart.org/content/steampunk-inspired-tiles-32x32

**Oak Woods**: canonical source https://brullov.itch.io/oak-woods. License is custom permissive ("can be used in free and commercial projects, do not redistribute"), not CC0; credit brullov and do not rehost. Sibling packs by brullov include Generic Character Asset v0.2, Castle of Despair, Pixel RPG Survival Medieval Icons.

**Gap analysis**: CC0 covers generic tiles, UI frames, audio sfx (approximately 60 to 70% of the asset surface). CC0 does **not** cover consistent NERIUM-specific NPC roster (Apollo, Lumio, Daedalus identities), genre-consistent cross-world "NERIUM look", or signature items. fal.ai fills 20 to 30%. Opus SVG fills the last 5 to 10% (HUD chrome, logo).

### 6.3 Opus SVG/Canvas procedural

**Use for**: UI chrome (HUD frame, dialog border, quest panel corners, minimap ring, logo), geometric icons (compass, buff/debuff, skill nodes), simple procedural FX (rain, dust, sparkles via Canvas draw loops), tile patterns (grid overlays, brick, stripes), anything CSS-themable.

**Do not use for**: character sprites, illustrated tilesets, photoreal, anything with many variants requiring aesthetic consistency (SVG geometry-art vs fal.ai painterly sprites clash visually).

**Authoring**: Ghaisan or Hesperus asks Opus for SVG inline; commit to `/public/svg/`. Phaser loads via `this.load.svg('hud-frame', '/svg/...', { width: 128, height: 128 })`. React HUD uses `<img>`, `?react` inline, or Tailwind `bg-[url(...)]`. Canvas procedural modules live at `/lib/procedural/*.ts` exporting `drawFrame(ctx, t)`. Version each SVG so per-world palette swaps are one-line token changes.

### 6.4 Asset pipeline ownership

New Greek names assigned from the available pool:

| Asset type | Primary source | Fallback | Owning agent | Approval gate |
|---|---|---|---|---|
| Named NPC sprites (Apollo, Lumio, Daedalus) | fal.ai NB2 | Kenney Roguelike NPCs | **Calliope** (fal prompt author) | Ghaisan per-hero; Thea batch QA |
| Supporting NPCs (seeded off hero sheet) | fal.ai NB2 `/edit` | Kenney Roguelike | Calliope | Thea batch palette + silhouette |
| World tilesets | fal.ai 4x4 sheet | Oak Woods, Warped City, Steampunk Mega | Calliope prompts; **Daedalus** slices and packs | Ghaisan approves first tileset per world |
| Item icons | fal.ai NB2 | Kenney icons, brullov Medieval Icons | Calliope | Thea palette match |
| UI HUD borders, dialog frames, logo | Opus SVG | Kenney UI Pack RPG Expansion | **Hesperus** (Opus SVG author) | Ghaisan visual |
| Procedural FX (rain, dust, sparkles) | Opus Canvas module | Kenney particle packs | Hesperus | Ghaisan visual |
| Ambient tiles, decorative props | Kenney/OpenGameArt CC0 | fal.ai if visible gap | Daedalus (imports and catalogs) | Spot check |
| Audio (ambient, sfx) | Kenney audio, OpenGameArt | N/A | Daedalus | Ghaisan listen-pass |
| Sprite slicer and atlas packer | free-tex-packer CLI, Pillow | Manual | Daedalus | Pixel-diff regression |
| Cross-batch consistency QA | Palette histogram + silhouette variance | Human eye | **Thea** (optional, if volume justifies) | Go/no-go gate |

Thalia-v2 stays focused on scene code and state. Daedalus-atlas is a thin new specialist (CLI wrapping free-tex-packer, Pillow, ffmpeg). Thea starts as a prompt-driven Claude check-loop and only promotes to a standalone agent if batch QA becomes a bottleneck.

### 6.5 Asset-strategy decisions for M2

- Default `fal-ai/nano-banana-2` at 1K; 2K for hero sheets and tilesets.
- Primary consistency lever: master-sheet-plus-`/edit`-reference per named NPC.
- Three genre blocks in `/agents/calliope/prompts/genre/*.md`; never free-write style, only vary subject.
- Turnarounds as 3x3 grid, one 2K call, slice client-side.
- Download immediately; fal-hosted URLs are not permanent.
- First pass: pull Kenney Roguelike/RPG, Kenney UI Pack RPG Expansion, Oak Woods, Warped City into `/public/assets/cc0/` **before any fal spend**, maximizing fal budget for identity-critical work.
- Opus SVG owns UI chrome; fal.ai never draws a HUD border.
- Spin up Calliope (prompt author + fal client) and Daedalus (slicer/packer) now. Defer Thea.
- All generations logged (prompt, seed, `request_id`, cost, resolution, reviewer decision) in `asset-ledger.jsonl`.

---

## 7. Cross-cutting decisions surfaced

These are the architectural commitments M2 must encode before any code is written.

**Bridge contract (`game_state.contract.md` authoritative)**: single `useGameStore` created with `subscribeWithSelector`. One bridge module `lib/gameBridge.ts` wires Phaser `game.events` to Zustand actions (Phaser emits, bridge converts to setState) and Zustand subscriptions back to Phaser `game.events.emit` (store changes, bridge emits). Scenes pull via `getState()` and subscribe with SHUTDOWN cleanup. React HUD uses narrow selectors. **React never touches Phaser scenes directly; Phaser never touches React components directly.**

**Render boundary**: shop modal, currency HUD, prompt input, Apollo streaming response, dialogue overlay, inventory toast, quest tracker, and the multi-vendor model selector all live in React. Phaser renders only the world (tilemap, player, NPCs, zones, cinematics, particles). World-space UI (floating names, interact indicators) renders in Phaser; screen-space UI renders in React.

**Quest runtime**: linear FSM of steps plus per-step TCE hooks. One JSON per quest under `src/data/quests/`. Quest runner is a ~60 line Zustand store with `fireTrigger()` dispatcher. `zod` schemas for load-time validation.

**Dialogue runtime**: custom JSON schema (nodes, lines, choices, challenge, effects) parsed by a ~40 line React reducer. Escape hatch `source: "ink"` reserved for later inkjs adoption.

**SSR boundary**: Server Component page > Client wrapper (`"use client"`) > dynamic Phaser component with `ssr: false`. Phaser imported only in the dynamic module. `phaser3spectorjs` aliased in both `turbopack.resolveAlias` and `webpack.resolve.alias` of `next.config.ts`.

**Canvas sizing**: `Phaser.Scale.RESIZE` with `width/height: "100%"`. Tailwind CSS grid owns the layout; Phaser fills its cell. Swap to `FIT + CENTER_BOTH` only if fixed-resolution pixel art is committed.

**Bundle discipline**: Phaser off the landing page, dynamically imported on `/play`. Large optional scenes lazy-added via `await import()`. Assets in `public/assets/` with two Phaser asset packs (boot, preload).

**Asset hierarchy**: fal.ai Nano Banana 2 (identity-critical) > CC0 Kenney/OpenGameArt/Oak Woods (ambient) > Opus SVG (UI chrome). Never invert. Master-sheet-plus-`/edit` is the consistency lever. Three style-bible JSONs (one per world) injected as prompt prefixes. Never mix prompts across worlds in one batch.

**Skill discipline**: `.claude/skills/` committed to repo. SKILL.md under 500 lines with pushy descriptions. `_skills_staging/` gitignored for drafts. Promote via `git mv`. First skills: `phaser-scene-authoring`, `quest-json-schema`. Second: `zustand-bridge`, `dialogue-tree-authoring`. Defer `fal-nano-banana-sprite` until templates stabilize.

**Testing**: Playwright with `window.__TEST__` hook per scene (pattern from phaserjs-tinyswords). `imgdiff.py` for canvas regression (pattern from threejs-tactics-game).

**Hooks and rules**: adopt Donchitos `validate-commit.sh`, `session-start.sh`, `log-agent.sh`. Path-scoped rules: `src/scenes/**` must subclass `Phaser.Scene` and use delta time; `src/components/**` must declare `"use client"` for EventBus interaction and must not top-level import Phaser; `public/assets/**` filenames must match `assets.json` manifest; `prompts/**` must include style bible reference, expected output, and seed.

---

## 8. Open questions for Ghaisan review

1. **Pixel-art style commitment**: the prompt profiles default to 32x32 SNES-era pixel art. Is that the locked NERIUM visual identity across all three worlds, or is the Cyberpunk Shanghai world intended to be higher-res (64x64 or HD vector)? Decision affects canvas-sizing mode (RESIZE vs FIT + CENTER_BOTH) and fal.ai resolution budget.

2. **Dialogue format escape hatch**: should M2 ship the `source: "ink"` field in the schema now (reserved but unused), or defer until Ghaisan actually wants to import a compiled Inky story? Shipping now is ~3 lines; deferring adds a schema migration later.

3. **Audio layer scope**: Howler.js is in the tech stack for game audio. Research did not deep-dive audio; should M2 include an Euterpe-adjacent agent for audio authoring and mixing, or is audio handled by Calliope or Hesperus as a side duty?

4. **Thea QA agent**: defer until volume justifies, or spin up in M2 preemptively to avoid a batch-consistency crisis near demo day?

5. **Mini Builder cinematic fidelity**: is the mini Builder cinematic scripted Phaser tweens over pre-generated tiles (~2 hours to build), or does it need fal.ai-generated "Lumio scaffold reveal" frames (~extra day plus $1 to $2)? Vertical-slice polish implies the former; RV ambition might demand the latter.

6. **3D leaderboard separate route**: confirm this route uses the existing Three.js r128 setup without any Phaser bleed-through, and that the caravan-to-leaderboard handoff is a plain Next.js navigation (no shared canvas).

7. **`.codex/skills/` mirror**: does NERIUM plan any Codex CLI usage, or is this mirror pattern unnecessary overhead for a hackathon submission?

8. **brullov attribution**: Oak Woods license requires credit. Confirm NERIUM README and in-game credits screen will include brullov attribution (and Kenney, and all OpenGameArt authors for non-CC0 packs like Steampunk Mega).

---

## 9. Recommended skill transplants list

Priority order for `.claude/skills/` authoring targets. All live-committed to repo; drafted first in `_skills_staging/` (gitignored).

1. **`phaser-scene-authoring/`** (priority 1): scene lifecycle, SceneManager transitions, asset-key conventions, four-scene convention (Boot/Preload/Game/UI), resize event handling, `references/preload-patterns.md` with asset-pack JSON shape, `references/scene-transition-matrix.md`. Triggers: "new scene", "Phaser scene", "preload", "scene transition".

2. **`quest-json-schema/`** (priority 1): full Quest zod schema, `assets/quest-template.json`, `scripts/validate-quest.ts`, `references/trigger-condition-effect-grammar.md` enumerating all trigger types, condition types, effect types. Triggers: "new quest", "quest file", "quest json", "objective", "reward".

3. **`zustand-bridge/`** (priority 2): store shape contract, EventEmitter event names registry, subscribe + SHUTDOWN cleanup pattern, `scripts/scaffold-slice.ts`, `references/bridge-antipatterns.md`. Triggers: "zustand store", "HUD state", "bridge", "React Phaser sync".

4. **`dialogue-tree-authoring/`** (priority 2): custom JSON dialogue schema, node conventions, condition/variable grammar, two example dialogues, `references/ink-escape-hatch.md`. Triggers: "NPC dialog", "dialogue tree", "branching conversation".

5. **`fal-nano-banana-sprite/`** (priority 3, defer): three genre prompt profiles, 8-way turnaround 3x3 grid template, master-sheet-plus-`/edit` consistency lever, `references/cost-table.md`, `scripts/estimate-cost.py`, `scripts/call-nb2.ts`. Triggers: "sprite generation", "nano-banana", "character turnaround", "fal.ai sprite".

6. **`asset-ledger/`** (priority 3, optional): `asset-ledger.jsonl` append schema, `scripts/ledger-summary.py` for budget tracking. Triggers: "asset cost", "fal budget", "generation log".

7. **`phaser-playwright-testing/`** (priority 4, optional): `window.__TEST__` hook convention, `imgdiff.py` template, scene-ready handshake. Ported from chongdashu repos. Triggers: "Phaser test", "canvas regression", "Playwright game".

Existing public skills to reference by name, not reimplement: `/mnt/skills/public/frontend-design/` (React HUD polish), `/mnt/skills/public/docx/` and `/mnt/skills/public/pptx/` (demo-day deliverables if needed).

---

## 10. Handoff notes to M2

### 10.1 Implied agent roster shape

M2 should design a roster of approximately 10 to 12 agents, combining existing NERIUM Greek names with five fresh additions. The locked 95% Opus 4.7 distribution is preserved; Sonnet 4.6 appears only in high-volume deterministic roles.

**Existing agents needing v2 upgrades**:

- **Thalia-v2** (Opus): Phaser scene author. Owns `src/game/scenes/`, scene lifecycle, tilemap loading, collision, sprite animation. Consumes `phaser-scene-authoring` skill. Extends to Phaser-side cinematic authoring (mini Builder sequence).
- **Erato-v2** (Opus): React HUD author. Owns `components/hud/`, Tailwind layout grid, narrow Zustand selectors, i18n USD/IDR toggle. Consumes `zustand-bridge` skill. Reuses existing Apollo/Helios/Cassandra React components for prompt input, streaming text, pipeline viz.
- **Hephaestus-v2** (Opus): generalist worker. Picks up any task and invokes skills as needed.

**Fresh Greek names to introduce (all Opus 4.7 unless noted)**:

- **Nyx** (Opus): quest state owner. Authors quest JSON under `src/data/quests/`, owns `useQuestStore`, designs trigger/condition/effect grammar, implements `fireTrigger()` dispatcher. Consumes `quest-json-schema` and `zustand-bridge` skills. Name fits: Nyx as primordial night embodies temporal state and progression.
- **Orpheus** (Opus): NPC dialogue owner. Authors dialogue JSON under `src/data/dialogues/`, implements the ~40 line React reducer, designs the condition/variable grammar, designs prompt-challenge node type. Consumes `dialogue-tree-authoring` skill. Name fits: Orpheus as the master of song and persuasive speech.
- **Calliope** (Opus): fal.ai prompt author and asset forge. Owns `src/agents/calliope/prompts/genre/*.md`, three genre prompt profiles, character-sheet master authoring, `/edit`-endpoint consistency lever, `asset-ledger.jsonl` ownership. Consumes `fal-nano-banana-sprite` skill. Name fits: Calliope as muse of epic poetry embodies composition and voice-discipline.
- **Daedalus** (Sonnet 4.6): sprite slicer and atlas packer. Owns CLI wrappers around free-tex-packer, Pillow for slicing, ffmpeg for audio import, `public/assets/` catalog, `assets.json` manifests. Sonnet because the work is deterministic and high-volume. Name fits: Daedalus as master craftsman, the original packer and builder.
- **Hesperus** (Opus): Opus SVG and Canvas procedural author. Owns `/public/svg/`, `/lib/procedural/`, HUD chrome, dialog box frame, logo, procedural FX. Uses `/mnt/skills/public/frontend-design/` reference. Name fits: Hesperus as evening-star embodies polish and ornamental refinement.

**Reserved (not spun up yet)**:

- **Thea** (Opus): cross-batch consistency QA. Reserve for M2b if sprite volume justifies; start as a prompt-driven Claude check-loop inside Calliope, promote to standalone if batch QA bottlenecks.

**Skill ownership cross-reference**:

| Skill | Primary consumer | Secondary consumers |
|---|---|---|
| phaser-scene-authoring | Thalia-v2 | Hephaestus-v2 |
| quest-json-schema | Nyx | Hephaestus-v2 |
| zustand-bridge | Erato-v2, Nyx | Thalia-v2, Orpheus |
| dialogue-tree-authoring | Orpheus | Nyx |
| fal-nano-banana-sprite | Calliope | Daedalus |

### 10.2 Sequencing recommendation for M2

Phase A (day 0 to 1): author `phaser-scene-authoring` and `quest-json-schema` skills; scaffold the three-layer SSR sandwich; wire the Zustand bridge; stand up Apollo Village empty scene with player movement. This unblocks Thalia-v2, Nyx, and Erato-v2 in parallel.

Phase B (day 1 to 2): author `zustand-bridge` and `dialogue-tree-authoring` skills; Calliope generates Apollo NPC master sheet + Apollo Village tileset via fal.ai; Daedalus slices and catalogs; Orpheus authors `apollo_intro.json`; Nyx authors `lumio_onboarding.json`; Hesperus drafts HUD border and dialog frame SVGs.

Phase C (day 2 to 3): mini Builder cinematic (Thalia-v2 tweens + optional Calliope scaffold frames); inventory toast; caravan unlock; quest-tracker HUD integration; Playwright `window.__TEST__` harness.

Phase D (day 3 to 4): polish pass; audio layer (Howler.js); cross-world caravan preview; demo rehearsal; buffer for the 06:00 WIB target ahead of 07:00 WIB submission.

### 10.3 Risks and mitigations

- **Phaser Strict Mode double-mount**: mitigated by `gameRef.current` guard in `useEffect`. Do not disable `reactStrictMode`.
- **`phaser3spectorjs` resolve failure**: mitigated by `next.config.ts` alias in both Turbopack and webpack lanes.
- **fal.ai style drift**: mitigated by master-sheet-plus-`/edit` pattern and verbatim trait-token reuse. Budget 2 retries per asset then fall back.
- **Quest JSON authoring errors**: mitigated by `zod` schema validation at load time, plus skill-creator eval loop during `quest-json-schema` skill authoring.
- **Dialog-React-Phaser timing bugs**: mitigated by single `BusBridge` React component as the sole Phaser-to-Zustand translator; all cross-boundary events go through it.
- **Solo dev demo-day bandwidth**: mitigated by Opsi A vertical-slice lock (1 quest polished over N quests shallow), plus the 1-hour 06:00 WIB buffer.

### 10.4 What M2 must NOT do

- Do not add a Phaser specialist on top of Thalia-v2; extend Thalia-v2 instead. The roster is already at capacity for hackathon velocity.
- Do not ship a three-tier director hierarchy per Donchitos; collapse to one tier of specialists coordinated by Hephaestus-v2.
- Do not invert the asset hierarchy (fal.ai > CC0 > Opus SVG). CC0 must be pulled before any fal spend.
- Do not put agent personas or tool allow-lists into skills; those belong in `.claude/agents/<name>.md`.
- Do not import `phaser` outside the dynamically loaded module, ever.
- Do not render currency, shop, or prompt input inside Phaser. The React HUD boundary is absolute.
- Do not introduce inkjs, Yarn Spinner, or rex DialogQuest in M2. Custom JSON dialogue only.
- Do not spin up Thea-vision QA agent until sprite volume demonstrably justifies it.

### 10.5 Success criteria for the vertical slice

At demo time (target 06:00 WIB Monday April 27): a visitor lands on `/play`, sees Apollo Village top-down scene, walks player to Apollo NPC, presses E, sees dialog in React bottom bar, types a prompt describing Lumio, submits, sees Apollo stream a response in React HUD (reusing existing Apollo component), watches a Phaser cinematic reveal the Lumio scaffold, sees an inventory toast awarding "Lumio Blueprint v1", sees the quest-tracker flash complete, watches a caravan sprite fade in at village edge, walks to the caravan, and triggers transition to Cyberpunk Shanghai world (even if that world is a placeholder scene). Total demo under 3 minutes. Engine demonstrably N-quest capable (quest JSON visible in repo; schema documented).

This handoff is decision-ready. M2 can begin agent-prompt authoring immediately.