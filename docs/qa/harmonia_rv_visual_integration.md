---
agent: Harmonia-RV-B (specialist, integration audit, split 2 of 2)
wave: W4
session: W4 Minggu pagi parallel, 2026-04-23
model: Claude Opus 4.7 (1M context)
scope: Visual plus Asset plus Audio integration check
contract_refs:
  - docs/contracts/game_event_bus.contract.md v0.1.0
  - docs/contracts/game_state.contract.md v0.1.0
  - docs/contracts/sprite_atlas.contract.md v0.1.0
  - docs/contracts/world_aesthetic.contract.md v0.1.0
  - docs/contracts/asset_ledger.contract.md v0.1.0
companion: docs/qa/harmonia_rv_state_integration.md (Harmonia-RV-A, sibling split)
role: Advisory only. No rewrite authority. Flag halts on asset-load failure or unresolved palette drift.
---

# Harmonia-RV-B Visual plus Asset plus Audio Integration Audit

Prepared by Harmonia-RV-B per `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` Section 4.14. This report cross-references the Talos W2 asset pipeline, Hesperus W3 SVG chrome, Euterpe W3 Howler layer, and Thalia-v2 Phaser scene consumption against the five audit dimensions M2 Section 4.14 locks into scope. Findings are advisory. Hard halts are raised separately in the summary at the end if the underlying condition blocks demo recording.

## Executive verdict

| Dimension | Verdict |
| --- | --- |
| 1. Sprite atlas load vs Phaser scene consumption | PASS |
| 2. SVG chrome palette alignment with world style-bible | PASS with drift note |
| 3. Howler cue mapping to game event bus topics | PASS with two minor notes |
| 4. Framer Motion vs Phaser scene transition conflict | PASS (no conflict) |
| 5. Brullov Oak Woods attribution presence | PRESENT |

No halt trigger was fired. Vertical slice shipping surface is visually coherent and ready for Nemea-RV-B to sweep.

## 1. Sprite atlas load vs Phaser scene consumption

### Evidence trail

**BootScene** at `src/game/scenes/BootScene.ts:23` invokes `this.load.pack('boot-pack', '/assets/packs/boot-asset-pack.json')`. That pack (`public/assets/packs/boot-asset-pack.json`) declares one entry: `nerium_logo_seed` at `/assets/procedural/svg/nerium_logo.svg`. File exists at `public/assets/procedural/svg/nerium_logo.svg` (4 KB SVG).

**PreloadScene** at `src/game/scenes/PreloadScene.ts:49` invokes `this.load.pack('preload-pack', '/assets/packs/preload-asset-pack.json')`. That pack declares six entries covering the three world atlases and three CC0 sheets. Each referenced path is verified present on disk.

| Preload pack key | Type | textureURL / url | atlasURL | Disk verify |
| --- | --- | --- | --- | --- |
| `atlas_medieval_desert` | atlas | `/assets/worlds/medieval_desert/atlas_32.png` | `/assets/packs/medieval_desert.atlas.json` | both present |
| `atlas_cyberpunk_shanghai` | atlas | `/assets/worlds/cyberpunk_shanghai/atlas_32.png` | `/assets/packs/cyberpunk_shanghai.atlas.json` | both present |
| `atlas_steampunk_victorian` | atlas | `/assets/worlds/steampunk_victorian/atlas_32.png` | `/assets/packs/steampunk_victorian.atlas.json` | both present |
| `ui_panel_kenney` | image | `/assets/cc0/kenney-ui-rpg-expansion/sheet.png` | N/A | present (32 KB) |
| `roguelike_master` | image | `/assets/cc0/kenney-roguelike/sheet.png` | N/A | present (95 KB) |
| `warped_city_tileset` | image | `/assets/cc0/warped-city/tileset.png` | N/A | present (7 KB) |

**ApolloVillageScene** at `src/game/scenes/ApolloVillageScene.ts:36-47` declares twelve frame keys. Each resolves against the medieval_desert atlas JSON frame table at `public/assets/packs/medieval_desert.atlas.json`:

| Frame key used in scene | Present in atlas |
| --- | --- |
| `floor_primary` | line 3 |
| `floor_secondary` | line 23 |
| `wall_solid` | line 43 |
| `wall_accent` | line 63 |
| `corner_outer` | line 83 |
| `pillar` | line 103 |
| `arch_opening` | line 123 |
| `feature_decor` | line 143 |
| `path_marker` | line 203 |
| `agent_idle` | line 243 |
| `agent_active` | line 263 |
| `sigil_world` | line 303 |

Four additional frames (`ambient_on`, `ambient_off`, `particle`, `agent_completed`) ship in the atlas but are not consumed by the Apollo Village layout. They are reserved for MiniBuilderCinematicScene or post-slice scenes. No tree-shake warning applies to Phaser atlases.

**MiniBuilderCinematicScene** at `src/game/scenes/MiniBuilderCinematicScene.ts` renders entirely via Phaser Graphics and Rectangles with hardcoded palette constants at lines 88-97. It does not pull any frame from the preloaded atlases. This is by design per the scene header comment at lines 292-295: "Procedural tile grid drawn as Rectangles so the cinematic does not depend on a Cyberpunk atlas frame being present." No atlas risk for this scene.

### Verdict: PASS

All atlas, atlas JSON, and CC0 sheet references resolve to committed files. All frame keys consumed by ApolloVillageScene exist in the medieval_desert atlas JSON.

### Advisory notes

- `nerium_logo_seed` loaded by BootScene is not referenced anywhere in `src/`. The asset occupies the boot-pack slot but no scene uses it at runtime. Consider removing from `boot-asset-pack.json` or surfacing it in the PreloadScene progress UI. Not a failure.
- The P0 16x16 `atlas.png` variants remain at `public/assets/worlds/<world>/atlas.png` as legacy fallback per `public/assets/CREDITS.md` line 54. They are not loaded by any current scene, but the file name differs from the RV primary `atlas_32.png` so no accidental shadow is possible. Left in place is the correct choice.

## 2. SVG chrome palette alignment with world style-bible

### Evidence trail

Two SVG chrome sets exist in the repo:

- **Seed set** at `public/assets/procedural/svg/` authored by Talos Sub-Phase 2 on 2026-04-23. Names follow `hud_frame_<genre>.svg`, `minimap_ring.svg`, `inventory_slot.svg`, `nerium_logo.svg`.
- **Polished set** at `public/svg/hud/`, `public/svg/ui/`, `public/svg/logo/` authored by Hesperus W3 on 2026-04-23. Names follow `border-<genre>.svg`, `dialog-frame.svg`, `minimap-ring.svg`, `inventory-slot.svg`, `nerium-logo.svg`. Dash instead of underscore.

CREDITS.md line 57 anticipates the Hesperus set: "Hesperus is expected to author polished variants during Sub-Phase 3 and emit supersede entries in the asset ledger. Phaser 3 consumes these SVG assets natively via `this.load.svg()`."

Palette audit against `_meta/NarasiGhaisan.md` Section 7 and `app/builder/worlds/<world>/palette.ts`:

**Medieval Desert** (`public/svg/hud/border-medieval.svg`)
- NarasiGhaisan anchors: terracotta `#c97a4a`, sand `#e8c57d`, stone `#8b6f47`, shadow `#3d2817`.
- SVG uses: `#c97a4a` line 7-8, `#e8c57d` line 12, `#8b6f47` line 20, `#3d2817` line 25-39. All four anchors present. Additional supporting shades (`#d48c5a`, `#8b5430`, `#f0d890`, `#f0d48a`, `#6a3d1c`) are valid interpolations within the terracotta to brass range.
- Verdict: ALIGNED. Moroccan souk plus Dune Arrakeen reference honored.

**Cyberpunk Shanghai** (`public/svg/hud/border-cyberpunk.svg`)
- NarasiGhaisan anchors: cyan `#00f0ff`, magenta `#ff2e88`, deep purple `#8b5cf6`, black `#06060c`.
- SVG uses: `#00f0ff` line 15-17, 28, 32-35, 43-45, 50, 57-59; `#ff2e88` line 30, 38-41, 49; `#8b5cf6` line 29, 53; `#06060c` line 6, 43. All four anchors present. Supporting shades (`#0a0618`, `#1a0e3a`, `#120a28`) extend the void backing tastefully.
- Verdict: ALIGNED. Blade Runner 2049 plus Ghost in the Shell reference honored.

**Steampunk Victorian** (`public/svg/hud/border-steampunk.svg`)
- NarasiGhaisan hints (V2 proposal, pending Ghaisan explicit confirm): brass, oxblood, walnut, BioShock Columbia aesthetic.
- SVG uses: brass `#e8c888` / `#c9a061` / `#6b4a22`, walnut `#40281c`, oxblood `#7a2f24`, ivory `#e5d6b8`, rivet highlight `#f0d89a`. Palette occupies the brass-plus-oxblood-plus-walnut space intended. BioShock Columbia reference is honored.
- Verdict: ALIGNED.

**Dialog frame, minimap ring, inventory slot, NERIUM logo** all use CSS custom properties (`var(--color-primary, ...)` and siblings) with cyberpunk fallbacks. Consumption via Tailwind OKLCH theme at `app/globals.css` lines 37-62 and runtime swap via `app/shared/design/theme_runtime.ts` `applyWorld()` produces the per-world tint at render time. The SVG fallback strings (`#00f0ff`, `#8b5cf6`, `#06060c`, `#e8eaef`) match the cyberpunk palette so the SSR-visible first paint looks right before hydration.

### Verdict: PASS with drift note

Palette alignment is clean. However, the polished Hesperus set is not consumed by any scene or component: `rg` across `src/` and `app/` returns zero matches for `border-medieval`, `border-cyberpunk`, `border-steampunk`, `dialog-frame`, `minimap-ring`, `inventory-slot`, or `nerium-logo` filename references. The only SVG imported in source is `/video/demo-preview-poster.svg` from `src/components/landing/HeroSection.tsx:117`, which is unrelated to HUD chrome.

### Advisory recommendation

The SVG chrome shipped by Hesperus W3 currently renders nowhere in the vertical slice. Two remediation paths, each cheap:

1. Wire the polished SVGs into Erato-v2 HUD (TopBar or SideBar wrapper) as `<img>` or inline SVG background. Low effort, visible impact in demo.
2. Swap `boot-asset-pack.json` `nerium_logo_seed` URL from `/assets/procedural/svg/nerium_logo.svg` to `/svg/logo/nerium-logo.svg` so the polished logo lands in Phaser and can be revealed at boot. Also surface the seed supersede line in `public/assets/ledger/asset-ledger.jsonl` per CREDITS.md line 57 expectation.

Either path is out of Harmonia-RV-B advisory scope but non-blocking. Flag to Erato-v2 or Hesperus for W4 bake-in if demo recording time permits.

## 3. Howler cue mapping to game event bus topics

### Evidence trail

Euterpe wraps Howler at `src/lib/audioEngine.ts` and reads route configuration from `src/data/audio/cues.json`. Twenty-one routing rules are declared in `cues.json` `eventRouting[]`. Each rule references a topic string that must appear in `docs/contracts/game_event_bus.contract.md` `GameEventTopic` union.

Cross-reference of each routing rule to the contract topic list at `docs/contracts/game_event_bus.contract.md` lines 42-122:

| Rule index | Topic | Contract line | Verified |
| --- | --- | --- | --- |
| 0 | `game.scene.ready` | 42 | yes |
| 1 | `game.audio.sfx_play` | 111 | yes |
| 2 | `game.audio.ambient_play` | 109 | yes |
| 3 | `game.audio.ambient_stop` | 110 | yes |
| 4 | `game.audio.music_play` | 112 | yes |
| 5 | `game.audio.music_stop` | 113 | yes |
| 6 | `game.npc.interact` | 55 | yes |
| 7 | `game.pickup.interact` | 64 | yes |
| 8 | `game.dialogue.opened` | 68 | yes |
| 9 | `game.dialogue.node_entered` | 69 | yes |
| 10 | `game.dialogue.choice_selected` | 70 | yes |
| 11 | `game.dialogue.challenge_submitted` | 71 | yes |
| 12 | `game.dialogue.stream_chunk` | 73 | yes |
| 13 | `game.quest.started` | 79 | yes |
| 14 | `game.quest.completed` | 81 | yes |
| 15 | `game.quest.step_advanced` | 80 | yes |
| 16 | `game.inventory.awarded` | 86 | yes |
| 17 | `game.ui.toast_pushed` | 105 | yes |
| 18 | `game.cinematic.start` | 98 | yes |
| 19 | `game.world.unlocked` | 116 | yes |
| 20 | `game.shop.purchase_completed` | 95 | yes |

Every routed topic is present in the contract union. No phantom topics, no missing topics for routed cues.

**Emit-site verification** (the topics that actually fire in the vertical slice):

| Topic | Emitter | Site |
| --- | --- | --- |
| `game.scene.ready` | ApolloVillageScene | `src/game/scenes/ApolloVillageScene.ts:86,98` |
| `game.scene.shutdown` | ApolloVillageScene | `src/game/scenes/ApolloVillageScene.ts:283` |
| `game.player.spawned` | ApolloVillageScene | `src/game/scenes/ApolloVillageScene.ts:90` |
| `game.player.moved` | Player object | `src/game/objects/Player.ts:92` |
| `game.npc.nearby` / `game.npc.far` / `game.npc.interact` | NPC object | `src/game/objects/NPC.ts:78,85,97` |
| `game.cinematic.start` / `game.cinematic.complete` | MiniBuilderCinematicScene | `src/game/scenes/MiniBuilderCinematicScene.ts:200,767` |
| `game.audio.sfx_play` | MiniBuilderCinematicScene | `src/game/scenes/MiniBuilderCinematicScene.ts:204` |
| `game.world.unlocked` | Caravan, gameBridge | `src/game/objects/Caravan.ts:70`, `src/state/gameBridge.ts:194` |
| `game.quest.started` / `game.quest.completed` | gameBridge | `src/state/gameBridge.ts:172,183` |
| `game.audio.ambient_play` / `game.audio.ambient_stop` | gameBridge | `src/state/gameBridge.ts:250,253` |
| `game.dialogue.opened` / `game.dialogue.closed` | gameBridge | `src/state/gameBridge.ts:230,235` |
| `game.ui.overlay_changed` | gameBridge | `src/state/gameBridge.ts:219` |
| `game.dialogue.node_entered` / `game.dialogue.choice_selected` / `game.dialogue.closed` | DialogueOverlay | `src/components/game/DialogueOverlay.tsx:122,198,218` |

The critical demo-path cues (`scene-ready`, `dialog-advance`, `prompt-submit`, `item-pickup`, `quest-complete`, `caravan-unlock`, `cinematic-sting`, apollo-village-loop ambient) all have verified emitter sites matched to their routed topics.

**Ambient loop map verification** at `cues.json` lines 106-113: six loopId aliases resolve to three concrete ambient cue keys. Each maps to a file present under `public/audio/ambient/`. `apollo_village` and `medieval_desert` both resolve to `apollo-village-loop`, the correct behavior for the Apollo Village scene on boot.

### Verdict: PASS with two minor notes

1. Rule 12 (`game.dialogue.stream_chunk`) declares `"throttle": true` in `cues.json` line 127. The audioEngine `shouldEmit` path at `audioEngine.ts:290-298` only reads a numeric `throttleMs` from the cue config (not a route flag). The `throttle: true` flag in the route rule is effectively a no-op. The typewriter cue itself has `throttleMs: 45` in its cue config (line 72), so throttling still works via the per-cue path. Net effect: throttle is active, but the route flag is decorative. Recommend either removing the route flag or promoting it to a numeric `throttleMs` field for route-level clarity. Non-blocking.

2. `cinematic-sting` is declared `category: "music"` in cue config (line 50) but is invoked via `game.audio.sfx_play` from `MiniBuilderCinematicScene.ts:204`. AudioEngine route dispatch to `play()` is category-agnostic at the event level, but the effective mix volume at `getEffectiveVolume('music')` will follow the music slider, not the sfx slider. For the vertical slice this is fine and likely intentional (cinematic stings feel like score), but the surprise factor is worth a one-line comment in `cues.json` so future tuners do not wonder why lowering SFX volume leaves the sting intact. Non-blocking.

## 4. Framer Motion vs Phaser scene transition conflict

### Evidence trail

**Layering** per `src/components/game/GameShell.tsx`:
- Phaser canvas host is an absolute inset-0 div at `data-hud-role="phaser-host"`.
- `GameHUD` sits as a sibling, and inside it the HUD root uses `pointer-events-none absolute inset-0 z-30 grid` with `pointer-events-auto` cells for each chrome region.
- Phaser canvas receives input through the pointer-events-none gaps.

**Framer Motion usage** is confined to React HUD and landing:
- HUD: TopBar, BottomBar, SideBar, ShopModal, InventoryToast, PromptInputChallenge, QuestTracker (`src/components/game/QuestTracker.tsx:15`).
- Landing: HeroSection, PillarsSection, MetaNarrativeSection, CTASection.
- Every HUD surface that consumes motion imports `useReducedMotion` for a11y.

**Phaser transitions** are confined to the canvas:
- ApolloVillage to MiniBuilder uses `scene.launch + scene.pause` pattern (per MiniBuilderCinematicScene header comment at lines 37-43). ApolloVillage stays mounted beneath the cinematic layer.
- MiniBuilderCinematic uses Phaser Tweens and Graphics primitives only (`this.tweens.add`, `this.add.rectangle`, `this.add.circle`, etc). No DOM mutation, no Framer invocation.

**Synchronization bridge** (Zustand + CustomEvent):
- `BusBridge.tsx:105-115` translates `game.cinematic.start` and `game.cinematic.complete` into `useUIStore.startCinematic / endCinematic`.
- Erato-v2 HUD is expected to read `ui.cinematicPlaying` and render conditional dim or render-gating.
- No Framer animation targets an element that Phaser also mutates. Different owners on different layers.

**Pointer event routing during modal overlays** (checked for surprise):
- ShopModal (`src/components/hud/ShopModal.tsx`) uses `AnimatePresence` and full-viewport backdrop. When mounted, the backdrop has `pointer-events-auto` by design, which intentionally blocks Phaser input. This is expected modal behavior. Phaser scenes should receive `game.shop.open` and pause accordingly or treat the player as idle.
- InventoryToast is top-right fixed with a small footprint; does not block Phaser input.

### Verdict: PASS. No conflict.

Framer Motion and Phaser operate on disjoint surfaces. Cross-boundary synchronization is handled by Zustand state with bus translation in BusBridge. No double-animation of a single DOM element was observed.

### Advisory note

If Erato-v2 adds a full-screen Framer dim overlay during cinematic, remember to set `pointer-events-none` on it so the Phaser canvas still receives resize events. Currently no such overlay exists, so no action required today.

## 5. Brullov Oak Woods attribution presence

### Evidence trail

Brullov Oak Woods ships empty in the repo per the no-redistribution clause but requires attribution in every documentation surface.

- `public/assets/CREDITS.md` lines 39-46: full canonical attribution `brullov, Oak Woods pixel-art pack, https://brullov.itch.io/oak-woods` with license quote.
- `README.md` line 96 (Honest-claim annotation 3): "Brullov Oak Woods (custom permissive, attribution required) is referenced for local clones but ships empty in the committed repo to respect the no-redistribution clause." Names author plus pack, references CREDITS.md.
- `README.md` line 103 (Assets section footer): honest-claim block repeats Brullov Oak Woods naming and links `public/assets/CREDITS.md` as the full-attribution source.
- `public/assets/cc0/oak-woods/README.md` lines 1-34: full attribution with license text, canonical URL, local pull procedure, and Talos Strategic Hard Stop note (credit non-omissable).
- `public/assets/ledger/asset-ledger.jsonl` line 6 (ledger entry `fb028962-d6e3-4c6b-8e31-701489da1bab`): machine-readable attribution text `brullov (brullov.itch.io/oak-woods), custom permissive: free plus commercial, no redistribution, credit appreciated`.

### Verdict: PRESENT

Attribution appears in all four expected locations (repo README, asset CREDITS, oak-woods staging README, asset ledger). The license requires credit only "if appreciated", so this exceeds the minimum. NERIUM discipline classifies the credit as mandatory per Talos Strategic Hard Stop, which is also honored.

### Advisory note

README footer attribution (line 103) names `Brullov Oak Woods` but delegates the URL to CREDITS.md. For readers who scan only the README, a one-line inline URL would reduce click-through friction, but this is a polish nuance, not a license concern. Non-blocking.

## Cross-dimension observations

Two cross-dimension observations surfaced during the audit. Both are advisory and out of Harmonia-RV-B scope, but the integration check uncovered them so they are recorded here for Erato-v2 and Linus to triage.

### Observation A: DialogueOverlay semantic class names have no CSS rules

`src/components/game/DialogueOverlay.tsx` renders with plain semantic class names (`dialogue-overlay`, `dialogue-overlay-header`, `dialogue-overlay-lines`, `dialogue-overlay-line`, `dialogue-overlay-caret`, `dialogue-overlay-stream`, `dialogue-overlay-stream-label`, `dialogue-overlay-stream-buffer`, `dialogue-overlay-choices`, `dialogue-overlay-choice-item`, `dialogue-overlay-choice`, `dialogue-overlay-advance`, `dialogue-overlay-continue`, `dialogue-overlay-terminal`, `dialogue-overlay-finish`, `dialogue-overlay-close`, `dialogue-overlay-speaker`).

No CSS file in the project (`app/globals.css`, `app/_harness/harness.css`, `app/marketplace/listing/styles.css`, `app/protocol/demo/styles.css`, `app/protocol/vendor/styles.css`, `app/advisor/ui/styles.css`) defines rules for any of these class names. Tailwind v4 `@theme` tokens provide color vars but no class rule for the `.dialogue-overlay*` selectors.

Impact: dialogue overlay renders unstyled in the browser (browser default HTML display). Typewriter effect still runs because it manipulates text content, not layout.

Owning agent: Linus (dialogue surface owner). Triage suggested before demo recording.

### Observation B: The polished Hesperus SVG set is not consumed

As called out under dimension 2, `public/svg/**/*.svg` files are shipped but not referenced anywhere in `src/` or `app/`. This does not block the demo (Phaser scenes draw with atlas frames and Phaser Graphics primitives, not SVG chrome), but represents unrealized visual polish authored by Hesperus W3.

Owning agents: Erato-v2 (HUD consumer) and Hesperus (SVG author). Triage suggested if W4 bake-in window permits.

## Summary to V4

- Asset load: PASS
- Palette verify: PASS (no drift in world anchors, drift note on orphaned polished SVG set)
- Audio cue mapping: PASS (all 21 routed topics valid; two minor config notes)
- Framer-Phaser conflict: none
- Brullov attribution: PRESENT (four locations)

Halt triggers per Section 4.14: none fired. No asset-load failure, no unresolved palette drift.

Recommendation list for V4 routing:

1. Linus triage: author CSS rules for `src/components/game/DialogueOverlay.tsx` `.dialogue-overlay*` class names, or migrate surface to Tailwind utilities consistent with the rest of the HUD.
2. Erato-v2 or Hesperus triage: wire `public/svg/**/*.svg` polished chrome into HUD or swap the `boot-asset-pack.json` logo reference from seed to polished. Optional but advisable for demo polish.
3. Euterpe nit: remove `"throttle": true` from rule 12 in `src/data/audio/cues.json`, or promote it to a numeric `throttleMs`. Add a one-line comment on `cinematic-sting` explaining the `music` category choice.

Nemea-RV-B may consume this report as an input for the visual a11y QA split.
