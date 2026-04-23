---
agent: talos-translator
phase: RV-1 P0 artifact migration
scope: gotchas for downstream RV workers consuming P0 artifacts
date: 2026-04-23
version: 1.0.0
status: shipped
audience: Erato-v2 (primary), Hephaestus-v2, Thalia-v2, Nyx, Linus, Pythia-v2, Hesperus, Euterpe, Kalypso, Nemea-RV splits
---

# Translator notes: P0 to RV migration gotchas

Short, actionable notes for downstream RV workers consuming V3 P0 artifacts. Per-gotcha format: **rule / observation**, **Why**, **How to apply**. Read once before pulling any PORT artifact into a new RV surface.

---

## 1. Central event bus is `app/shared/events/pipeline_event.ts`, do not fork

**Observation**: The canonical event envelope is imported by 12 files across Builder, Banking, and the viz layer. It is the load-bearing spine of the demo; forking it breaks Heracles SSE normalization, Helios viz subscription, Cassandra prediction emission, Dionysus cache replay, and the mini Builder cinematic all at once.

**Why**: V3 achieved full integration PASS on Nemea-v1 because every executor and every subscriber agreed on one envelope. M2 Section 4.4 through 4.5 explicitly delegate new game event topics (`quest:*`, `caravan:*`, `npc:interact`, `cinematic:complete`, `world:unlock`) to Pythia-v2 contract authoring, not to fork-and-extend by individual workers.

**How to apply**: When an in-game event needs to fire, route it through Pythia-v2 `event_bus.contract.md` amendment at v0.2.0. Import from `app/shared/events/pipeline_event` unchanged. Do not copy-rewrite the envelope under `src/stores/gameBridge.ts` or similar; bridge it, do not fork it.

---

## 2. Apollo types are the HUD contract, import from `app/advisor/apollo`

**Observation**: `AdvisorSession`, `AdvisorTurn`, `AttachedComponent`, `Locale`, `ModelStrategy`, `WorldAesthetic` all export from `app/advisor/apollo.ts` and are consumed by `AdvisorChat.tsx`, `ModelStrategySelector.tsx`, and the builder route. `countQuestionMarks` and `countSentences` are also exported as brevity helpers.

**Why**: Erato-v2 will author an in-game NPC dialogue surface that replaces AdvisorChat. To preserve Apollo brevity discipline (NarasiGhaisan Section 13) and the `attached_components` pattern (pipeline_viz slot, blueprint_reveal, prediction_warning embed), the new HUD must import the same types.

**How to apply**: In every new `src/components/hud/*` that consumes advisor data, `import type { AdvisorSession, AdvisorTurn, AttachedComponent } from '@/app/advisor/apollo'` (or relative path). Never redeclare these shapes inline. If the new HUD needs extra fields, subclass the type at the HUD boundary, never mutate the apollo.ts export.

---

## 3. AdvisorChat prop drilling is a warning signal, not a pattern

**Observation**: `AdvisorChatProps` has 6 callback props plus 2 slots plus `isAwaitingAdvisorTurn` state. The top-level Apollo mount or Lumio demo runner owns session state and injects callbacks.

**Why**: This prop shape worked for a monolithic dashboard page but is brittle for a distributed game HUD where DialogueOverlay, QuestTracker, ShopModal, and the prompt-challenge node each need a narrow slice of advisor state. Prop drilling 6 callbacks to every HUD element will produce the same "re-render storm" that Nemea-v1 Section 7 flagged on Framer Motion stale-hook warnings.

**How to apply**: Replace prop drilling with Zustand narrow selectors. Erato-v2 authors `useAdvisorStore` (or equivalent) with `subscribeWithSelector`, each HUD element subscribes only to the slice it renders. Dispatch callbacks via store actions, not prop injection. Apollo core logic (`app/advisor/apollo.ts`) is the action authority; Zustand is the reactive projection.

---

## 4. Framer Motion lives at React HUD layer only, not inside Phaser

**Observation**: AdvisorChat, PipelineCanvas, and PredictionWarning use Framer Motion heavily (`AnimatePresence`, `motion.article`, `useReducedMotion`). Nemea-v1 QA flagged "one Framer Motion development-mode warning on /builder and /banking about stale layout hooks. Non-blocking, does not surface in production build."

**Why**: Framer Motion operates on React reconciliation; Phaser operates on WebGL/Canvas render loop. Mixing them inside a Phaser scene (e.g., trying to `motion.div` a Phaser game object) will thrash or silently no-op. Nemea-v1 warnings are the tell.

**How to apply**: Keep Framer Motion for React HUD layer only (TopBar, BottomBar, SideBar, overlay modals, landing page). Inside Phaser scenes, use Phaser's own tween + timeline system (`this.tweens.add({...})`). MiniBuilderCinematicScene uses Phaser tweens per M2 Section 4.4. React HUD and Phaser must not animate the same DOM node.

---

## 5. `window.dispatchEvent(new CustomEvent('nerium:*'))` is a V3 pattern, may conflict with game bridge

**Observation**: `AdvisorChat.tsx` dispatches `nerium:prediction-warning-action` via window CustomEvent (see lines 141 to 153). `ModelStrategySelector` and `PipelineCanvas` do not; they use prop callbacks.

**Why**: The `nerium:*` window event pattern was Erato P2's workaround for cross-component dispatch in a dashboard context without a central bus. In RV the central bus is the canonical path. Keeping `nerium:*` window events alongside a game Zustand bridge creates two parallel event systems, which WILL drift.

**How to apply**: Erato-v2 retires the `nerium:*` window event pattern. Prediction warning acknowledge/revise routes through Zustand store action, not window dispatch. If for some reason a window-level escape hatch is needed (Nemea-RV Playwright `window.__TEST__` hook per M2 Section 4.15), namespace it as `__NERIUM_TEST_*` so it is obvious which code is production and which is test.

---

## 6. PipelineCanvas Zustand factory pattern is worth preserving

**Observation**: `PipelineCanvas.tsx` uses `createPipelineStore()` factory so each canvas render gets an isolated store. Not a module-level singleton.

**Why**: The factory pattern lets Urania Blueprint Moment, Helios dashboard, and an in-game HUD mini-viewer each have independent state without cross-contamination. M2 Section 4.5 Erato-v2 authors ApolloStream + HeliosPipelineViz as HUD elements; these should keep the factory pattern.

**How to apply**: When porting `PipelineCanvas.tsx` to `src/components/hud/ported/HeliosPipelineViz.tsx`, preserve `createPipelineStore` export. Erato-v2's SideBar mini-viewer gets its own store instance; if the game later adds a floating pipeline viz inside an Advisor NPC dialog, that too gets its own store. Do not globalize.

---

## 7. Dashboard CSS class namespaces (`.advisor-*`, `.browse-*`, `.wallet-*`) do not inherit, but OKLCH token convention does

**Observation**: Every pillar ships its own CSS file (`app/advisor/ui/styles.css`, `app/marketplace/listing/styles.css`, `app/marketplace/search/(no dedicated CSS, uses tokens directly)`, `app/protocol/demo/styles.css`, `app/protocol/vendor/styles.css`, `app/banking/(no dedicated CSS, component-local)`). Class names are dashboard-specific and won't reuse.

**Why**: In-game HUD has a unified component library authored by Erato-v2 + Hesperus. Class name inheritance would force the new HUD to carry the dashboard namespace and create dead code. But the underlying token convention (OKLCH via CSS custom props `--color-*`, transition timing locked at 150 ms per Harmonia pass, `prefers-reduced-motion` honored in 7 places) is proven and should inherit.

**How to apply**: Erato-v2 writes new CSS under `src/styles/hud/*.css` or component-local modules. Import OKLCH tokens from `app/shared/design/tokens.ts` (KEEP). Pattern-match the old class structure only to understand semantic intent; never copy class names. For the 150 ms transition lock, the 7 `prefers-reduced-motion` honor sites, and the aria-live polite/assertive severity mapping in PredictionWarning, replicate the semantic contract in the new HUD.

---

## 8. World switching via CSS cascade is retired, do not resurrect

**Observation**: `app/shared/design/theme_runtime.ts` exports `applyWorld()` which cascades CSS custom properties across `:root` to re-theme the entire dashboard when WorldSwitcher dropdown fires. `app/_harness/ClientThemeBoot.tsx` invokes it on mount.

**Why**: Per RV.4 and M2 Section 7.2, 3-world skinning moves from CSS cascade to Phaser scene keys. Players unlock Cyberpunk Shanghai and Steampunk Victorian via in-game caravan mechanic, not a dropdown. Keeping `applyWorld()` active alongside Phaser scene-key transitions creates two worldview-changes with different contracts (one DOM cascade, one canvas swap) that will visually desync.

**How to apply**: Retire `applyWorld()` from React HUD mount. Keep `tokens.ts` as static OKLCH source; HUD root applies tokens once at boot, not on every world change. World changes for in-game are canvas-side only (Phaser `this.scene.start('CyberpunkScene')`). React HUD aesthetics stay world-agnostic or follow a single default world (likely Medieval Desert for Apollo Village main lobby).

---

## 9. BlueprintReveal 22-node fixture is historical, check before reusing

**Observation**: `app/builder/moment/fixtures/blueprint_lumio_2026_04_25.json` shipped with 22 nodes matching V3 agent roster. M2 Section 3.1 shows RV has 9 active product-side workers plus 7 specialists = 16 max agents, not 22.

**Why**: If MiniBuilderCinematicScene renders the fixture directly, the 22-node reveal will include defunct V3 agents (Kratos, Eris, Zelus, Moros, Calliope, Nike, Hypnos which were dropped per M2 Section 8.3) or shows agents that never shipped.

**How to apply**: Two paths acceptable:
- **Historical reveal (recommended for demo)**: fixture stays at 22 nodes, cinematic narrates "these are the 22 agents NERIUM ran to build itself in V3". This aligns with meta-narrative per RV_PLAN Section 0 "built itself" framing.
- **Current-state reveal**: Urania-v2 or Thalia-v2-B authors `fixtures/blueprint_rv_current.json` with the 16-agent RV roster. Use for HUD agent structure editor SideBar.

Either is valid; do not silently mix the two in a single cinematic.

---

## 10. Dual-locale (en-US, id-ID) cost formatting lives in `cost_ticker.ts`, not the UI

**Observation**: `app/banking/meter/cost_ticker.ts` uses `Intl.NumberFormat('en-US', 'USD', 2dp)` and `Intl.NumberFormat('id-ID', 'IDR', 0dp)` and exports the formatted string. LiveCostMeter + WalletCard consume the pre-formatted string, they do not re-format.

**Why**: Currency formatting is locale + precision sensitive; doing it twice in different places guarantees drift. Keeping it single-sourced at `cost_ticker.ts` is the reason Nemea-v1 integration path 2 passed.

**How to apply**: When Erato-v2 authors TopBar CurrencyDisplay for in-game HUD, import formatted strings from `cost_ticker.ts`, do not re-implement. If the game adds a new currency (e.g., in-game gold plus USD/IDR toggle per M2 Section 4.5 Erato-v2 `i18n USD/IDR toggle`), extend `cost_ticker.ts`, do not branch.

---

## 11. Honest-claim annotation copy is immutable string in `app/protocol/vendor/annotation_text.constant.ts`

**Observation**: The exact NarasiGhaisan Section 16 phrasing "demo execution Anthropic only, multi-vendor unlock post-hackathon" is locked in `annotation_text.constant.ts`. `HonestAnnotation.tsx` imports it. Nemea-v1 Section 3 voice audit PASS cited this specific file.

**Why**: Honest-claim copy variations would trigger em-dash/emoji/drift surface at Nemea-RV-B copy review hard-stop. The constant file is the single authority.

**How to apply**: When Erato-v2 authors in-game caravan faction NPC dialogue surface, the honest-claim banner on the caravan NPC imports from `annotation_text.constant.ts`. If RV.6 adds "asset generation via fal.ai Nano Banana 2 per ADR override" as an additional honest claim, extend the constants file with a new export, do not rewrite the existing string.

---

## 12. MA console deep-link URLs are environment-sensitive

**Observation**: `app/builder/viz/MAConsoleDeepLink.tsx` renders a URL based on `ma_session_id` and a `consoleDeepLinks` record. The URL format is MA runtime-dependent (platform.anthropic.com/agents/* or similar).

**Why**: If Anthropic changes the MA console URL format between now and hackathon demo recording, the deep link breaks silently. Nemea-v1 QA cited the component as PASS but the URL was rendered from a placeholder record, not verified against live MA console.

**How to apply**: Before demo recording, Ghaisan or Nemea-RV verifies the MA console URL format against current Anthropic platform. If changed, update the `consoleDeepLinks` record and/or the formatter in MAConsoleDeepLink. Flag in the HUD as `data-dev` so if MA console URL breaks, the in-game viz still renders the rest.

---

## 13. Nemea-v1 screenshots are the Nemea-RV-B visual diff baseline, do not delete

**Observation**: 9 `nemea_*.png` files at repo root are Nemea-v1 visual QA artifacts. Total ~1.5 MB.

**Why**: Nemea-RV-B Section 4.16 spec runs Lighthouse + visual a11y sweep. Diffing against the V3 baseline proves the RV pivot preserved the demoable surface (or surfaces regressions). Deleting these forces Nemea-RV-B to regenerate baselines and compares RV-to-RV only, losing V3 change-tracking.

**How to apply**: Keep the 9 PNGs in place until submission. If storage becomes tight (unlikely at 1.5 MB), move to `docs/qa/v1_screenshots/` rather than delete.

---

## 14. LumioReplay fetches `/cache/lumio_run_2026_04_24.json`, the public/cache copy is critical

**Observation**: `app/builder/lumio/LumioReplay.tsx` fetches from `public/cache/lumio_run_2026_04_24.json`. The Nemea-v1 Critical Fix 1.3 was to copy the trace from `cache/` to `public/cache/` because Next.js only serves the `public/` directory as static assets.

**Why**: If RV in-game cinematic uses the same LumioReplay data source (likely, per RV_PLAN "reuse as in-game quest trigger"), the static copy must stay. Deleting `public/cache/lumio_run_2026_04_24.json` during a cleanup pass will silently 404 the cinematic at demo time.

**How to apply**: `public/cache/lumio_run_2026_04_24.json` is KEEP in the matrix. Do not garbage-collect `public/cache/` as "generated artifacts". When Dionysus-v2 rebakes a fresh trace, the new trace is copied to `public/cache/` too, not just `cache/`.

---

## 15. Three styles.css files are safely DEPRECATE, but skim tokens before moving

**Observation**: `app/advisor/ui/styles.css`, `app/marketplace/listing/styles.css`, `app/protocol/demo/styles.css`, `app/protocol/vendor/styles.css` all DEPRECATE per the matrix.

**Why**: All four encode dashboard class-name namespaces that will not inherit. But they also encode working OKLCH token usage, `prefers-reduced-motion` honor sites, and transition timing locks that Harmonia polished during Full-Harmonia pass.

**How to apply**: Before `git mv` to `_deprecated/`, Erato-v2 or Hesperus skim the 4 CSS files for:
- Transition duration values (150 ms Harmonia lock)
- Timing curve easings (cubic-bezier or similar)
- Reduced-motion fallback strategy (opacity-only swap? display-none?)
- OKLCH light/dark usage pattern

Capture these in the new HUD style system as documented conventions, not as copy-paste.

---

## 16. `app/advisor/ui/AdvisorChat.tsx` composed `multiVendorPanelSlot` as a ReactNode slot, keep the slot pattern

**Observation**: Line 75 of AdvisorChat: `multiVendorPanelSlot?: ReactNode;`. Passed through ModelStrategySelector as `multiVendorPanel={multiVendorPanelSlot}`. The Protocol Multi-Vendor Panel is wired into Advisor as a slot, not a direct import, so Advisor does not take on a Protocol dependency.

**Why**: This slot pattern avoids circular deps between Advisor pillar and Protocol pillar. Erato-v2 in-game HUD must preserve the same: the caravan faction UI is injected into the Advisor NPC dialogue via a slot prop, not imported.

**How to apply**: In-game HUD composition should use slot props (`ReactNode` or render-prop) for cross-pillar elements. Specifically:
- Advisor NPC dialogue accepts `multiVendorPanelSlot` for Protocol caravan
- Advisor NPC dialogue accepts `pipelineVizSlot` for Helios mini-viewer
- Advisor NPC dialogue accepts `blueprintMomentSlot` for Urania cinematic trigger

Never import Protocol or Helios directly from Advisor. This pattern is a Pythia-v2 `pillar_lead_handoff.contract.md` compatible composition.

---

## 17. Cassandra `cassandra.ts` imports `EventBus` as type-only, cleanly detached

**Observation**: `import type { EventBus } from '../../shared/events/pipeline_event'`. Type-only import means Cassandra logic compiles standalone; bus is provided at runtime.

**Why**: Erato-v2 in-game HUD can construct a different EventBus instance (or a bridge to Zustand store events) without Cassandra caring. The contract shape is the coupling; the runtime instance is pluggable.

**How to apply**: All Cassandra consumption in RV should maintain type-only EventBus import. When wiring the in-game prediction warning surface, inject an EventBus-compatible adapter from the game bridge; Cassandra does not need to change.

---

## 18. `ConstructionAnimation.ts` is tempting to KEEP but is Pixi-era, PORT

**Observation**: `app/builder/worlds/ConstructionAnimation.ts` contains scripted tween sequences for 3-world construction reveal. Imports from `app/shared/events/pipeline_event`. Logic is event-driven tween choreography.

**Why**: The tween choreography pattern (fire event, build tile, next event, fire tween, next event) is reusable for Phaser MiniBuilderCinematicScene. But the animation API calls it currently makes (likely Pixi or CSS transitions) do not map directly to Phaser's `this.tweens.add()`.

**How to apply**: Thalia-v2-B skims `ConstructionAnimation.ts` for the event sequence and narrative arc. Reimplements the tween chain with Phaser API. The event-bus subscription pattern inherits; the tween calls do not.

---

## 19. Keep an eye on Next.js App Router `page.tsx` vs `src/app/*/page.tsx`

**Observation**: V3 uses `app/*/page.tsx` (project root `app/` dir per Next.js 15 convention). M2 Section 4.4 Thalia-v2 output lists `src/app/play/page.tsx`. This suggests RV is migrating Next.js App Router dir to `src/app/` convention.

**Why**: Next.js 15 supports both `app/` at project root AND `src/app/`. Mixing the two in one project will have Next.js pick one and silently ignore the other, producing 404s on routes you think exist.

**How to apply**: Before Thalia-v2 creates `src/app/play/page.tsx`, confirm `tsconfig.json` and `next.config.ts` expect `src/app/`. If they expect root `app/`, either amend config or have Thalia-v2 put new routes under root `app/play/page.tsx` instead. This is a strategic hard-stop for Thalia-v2 Wave 2 entry.

---

## 20. `_harness/` folder DEPRECATE requires matching cleanup of Apollo mount layer refactor

**Observation**: Nemea-v1 Section 10 post-hackathon refactor backlog includes: "Fold the Nemea harness scaffold into an Apollo mount layer or a Hephaestus-authored canonical scaffold and retire the `_harness` directory."

**Why**: This refactor is scheduled post-hackathon but RV effectively does it. The cleanup must also handle the downstream dependencies: `app/layout.tsx` imports `ClientThemeBoot` from `_harness/`, every pillar page.tsx wraps with `HarnessShell`.

**How to apply**: When Thalia-v2 rewrites `app/layout.tsx` for new route map, the import of `ClientThemeBoot` is dropped (theme_runtime retires too per gotcha 8). Every pillar `page.tsx` DEPRECATE removes the HarnessShell dependency. `_harness/` can cleanly git mv to `_deprecated/_harness/` once no importer remains. Talos-translator Task 7 performs the move; downstream workers should confirm no import dangles before commit.

---

## 21. Apollo `apollo.ts` is a large file, budget token read time

**Observation**: `app/advisor/apollo.ts` plus `apollo.prompts.ts` plus `apollo.config.json` together form the Apollo core. Apollo core is KEEP but also central, and future RV workers (Erato-v2, Linus, Nyx) will need to read from it.

**Why**: `apollo.ts` carries session mgmt, brevity enforcement, prediction warning gamification map, handoff types, strategy routing. Skimming it is not enough; workers that consume it deeply should budget a targeted read of specific exported functions, not the whole file.

**How to apply**: Hephaestus-v2 prompt authoring for Erato-v2, Linus, Nyx should list specific Apollo exports in the mandatory reading: `AdvisorAgent.renderNextTurn()`, `enforceAdvisorBrevity()`, `renderPredictionMap()`, `handlePillarHandoff()`. Not the whole file. Reduce token pressure per worker.

---

## 22. Git history preservation via `_deprecated/` folder is a hard constraint, not suggestion

**Observation**: Session hard constraint: "Preserve git history, never delete old files (move to `_deprecated/` subfolder kalau DEPRECATE, bukan rm)".

**Why**: Post-hackathon startup phase Ghaisan may need to reference V3 dashboard behavior (e.g., "how did AdvisorChat handle long-wait?" for a future feature). Losing git blame and git log means reconstructing behavior from scratch. Nemea-RV diff also needs baseline.

**How to apply**: DEPRECATE moves are DEFERRED to downstream RV workers. Physical `git mv` to `_deprecated/` happens as the LAST step in each PORT worker's session, AFTER the worker has removed imports pointing at the DEPRECATE file. For example: Thalia-v2 rewrites `app/layout.tsx` to drop `ClientThemeBoot` import, then `git mv app/_harness/ClientThemeBoot.tsx _deprecated/app/_harness/ClientThemeBoot.tsx`. Talos-translator does NOT execute moves in this session because moving now breaks the active V3 build (8 files import from `_harness/`; styles.css files imported by KEEP/PORT components). Never `git rm`; always `git mv`. Preserves history and allows `git log --follow _deprecated/app/_harness/HarnessShell.tsx` post-hackathon.

Ownership mapping for deferred moves:
- Thalia-v2 (Wave 2): after rewriting `app/layout.tsx`, moves `app/_harness/HarnessShell.tsx`, `app/_harness/ClientThemeBoot.tsx`, `app/_harness/harness.css`. Also moves `app/advisor/page.tsx`, `app/builder/page.tsx` as `/play` route takes over.
- Erato-v2 (Wave 3): after authoring new HUD CSS system, moves `app/advisor/ui/styles.css`, `app/marketplace/listing/styles.css`, `app/protocol/demo/styles.css`, `app/protocol/vendor/styles.css`, `app/builder/worlds/WorldSwitcher.tsx`.
- Kalypso (Wave 3): after authoring landing page, moves remaining pillar `page.tsx` files (`app/marketplace/page.tsx`, `app/banking/page.tsx`, `app/registry/page.tsx`, `app/protocol/page.tsx`).
- Ananke (daily log session): at end of RV execution, sweeps `.playwright-mcp/*` if any is accidentally tracked (currently gitignored, so no move needed; only if gitignore scope changes).

---

## 23. Contracts at v0.1.0 may bump to v0.2.0, Pythia-v2 owns this

**Observation**: 32 contracts all KEEP at v0.1.0. Pythia-v2 Section 4.10 spec is "respawn for RV additions only".

**Why**: Some RV additions (sprite_atlas format amendments for Phaser, new game-state fields in event_bus, HUD-scope tokens in design_tokens) genuinely need signature changes. Forcing these into v0.1.0 without bump breaks Pythia versioning discipline.

**How to apply**: Pythia-v2 (not Talos-translator) decides per-contract whether v0.1.0 stays or bumps to v0.2.0. Talos-translator flags in the matrix which contracts likely bump (sprite_atlas, event_bus, design_tokens), but does not bump them.

---

## 24. No em dash, no emoji, absolute across all RV surfaces

**Observation**: Nemea-v1 voice audit Section 3 PASS: "0 em dash, 0 emoji across 123 files". CLAUDE.md anti-pattern 1 and 2 lock.

**Why**: Ghaisan explicit "sangat dilarang". Nemea-RV-B runs a grep sweep as part of submission QA; one em dash or emoji in the entire shipped surface triggers a hard stop.

**How to apply**: Every new RV file (worker outputs, commits, READMEs, honest-claim annotations) goes through the same discipline. The ported components in `src/components/hud/ported/` lose any em dash that might have slipped into comments. Self-check before every commit: `grep -rP "[\x{2014}\x{1F300}-\x{1FAFF}]" .` (or similar).

---

## 25. Parallel execution via `--dangerously-skip-permissions` amplifies contract drift cost

**Observation**: RV runs 6 to 7 parallel terminal Workers per M2 Section 6.2 Wave 2 + Wave 3. NarasiGhaisan Section 9 mandates strict contract discipline because ambiguity is hit 4+ times concurrently.

**Why**: If one Worker interprets a KEEP/PORT boundary differently than another (e.g., Erato-v2 assumes apollo.ts has function X, Linus assumes function X is in linus.ts both imported from apollo.ts), the integration bug surfaces only at Harmonia-RV integration check, hours later, with partial context lost.

**How to apply**: This matrix is the disambiguation. Every Worker in Wave 2 and Wave 3 reads this matrix plus `P0_ARTIFACT_INVENTORY.md` plus their Pythia-v2 contracts before first write. If the matrix is ambiguous at a boundary, halt and ferry to V4 or Pythia-v2. Silent assume is the failure mode.

---

## 26. `_meta/reference/` folder is aesthetic reference only, NEW WORK ONLY rule

**Observation**: `_meta/reference/` contains pre-hackathon NERIUM source material including `NERIUMcyberpunkcity.html`. CLAUDE.md anti-pattern 7 addendum plus Discord mod Wania 2026-04-21 clarification: "NEW WORK ONLY".

**Why**: The reference folder is historical research material, not a code library. Copying directly violates the Cerebral Valley rule. Treat as inspiration.

**How to apply**: Moros (3D City leaderboard) Wave 3 worker can reference `NERIUMcyberpunkcity.html` aesthetic (palette, camera angle, building style), but writes Three.js code from scratch. Pattern-match, do not copy.

---

## 27. Hephaestus-v2 batch pattern still applies, do not ferry per file

**Observation**: NarasiGhaisan Section 11 and Hephaestus-v2 Section 4.11: single session batch all prompt files until 97% context, then halt.

**Why**: MedWatch lesson plus V2 lock. Per-file ferry is 5+ hour wasted wallclock. RV has ~10 to 14 new agents to author (Nyx, Linus, Kalypso, Talos, Hesperus, Euterpe, Thalia-v2, Erato-v2, plus Wave 3 agents, plus Harmonia-RV + Nemea-RV splits). Per-file pattern fails the timeline.

**How to apply**: Hephaestus-v2 writes all RV agent prompts in one session. Halt at 97% context only, never per file. Session post-halt allows fresh-context Hephaestus-v3 for any remaining prompts.

---

## 28. Closing: when in doubt, re-read Section 0 of RV_PLAN

**Observation**: The pivot rationale in RV_PLAN Section 0 is the clearest prose statement of why we are migrating. "User masuk Builder = masuk game 2D (Phaser 3 engine), bukan masuk website page."

**Why**: Mid-execution ambiguity (is this component dashboard-style UI or game HUD? is this route in-game or in-website?) resolves fastest by re-reading the pivot rationale, not by interpretation.

**How to apply**: When an RV worker hits a design fork not covered by this matrix or their contract, re-read RV_PLAN Section 0 first. If still ambiguous, halt and ferry to V4.

---

**End of translator_notes.md**
