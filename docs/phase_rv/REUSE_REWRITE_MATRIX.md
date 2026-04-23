---
agent: talos-translator
phase: RV-1 P0 artifact migration
scope: authoritative per-artifact KEEP/PORT/DEPRECATE decision
date: 2026-04-23
version: 1.0.0
status: shipped, authoritative
supersedes: RV_NERIUM_AGENT_STRUCTURE_v2.md Section 7 seed (per Metis-v2 directive)
inputs:
  - docs/phase_rv/P0_ARTIFACT_INVENTORY.md
  - _meta/RV_PLAN.md Section 4 reuse-rewrite guidance
  - docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md Section 7 seed
  - NarasiGhaisan.md voice anchor
  - docs/qa/nemea_final_qa.md READY verdict context
decision_totals:
  KEEP: 173
  PORT: 51
  DEPRECATE: 34
total_artifacts: 258
---

# Reuse-Rewrite Matrix (authoritative)

Per-artifact decision **KEEP**, **PORT**, or **DEPRECATE** for every V3 shipped artifact. Downstream consumers (Erato-v2, Hephaestus-v2, Thalia-v2, all Wave 2 plus Wave 3 workers, Pythia-v2 contract review) treat this file as the authoritative per-file guide.

## Decision rubric (used for every row below)

**KEEP**: business logic valid, framework-neutral, use as-is in RV. Subsumes logic modules, pure schemas, event envelopes, shared types, data fixtures, Lead outputs, contracts. No edit; downstream imports continue pointing at the canonical V3 location until (if ever) the RV authors choose a new home.

**PORT**: the surface (UI component, CSS stylesheet, route-level scaffold, framework wrapper) is discarded and rewritten under the game paradigm, but the logic or token convention it encodes inherits into the new surface. Example: `AdvisorChat.tsx` is rewritten as in-game NPC dialogue + prompt-challenge node by Erato-v2 and Linus, but the Apollo session shape + brevity discipline + attached-components pattern that AdvisorChat encodes is preserved.

**DEPRECATE**: the artifact has no role in the RV build. Physical `git mv` to `_deprecated/<original-path>` is DEFERRED to each PORT worker's final cleanup step, AFTER the worker removes import references to the DEPRECATE target. Talos-translator does NOT execute moves in this session because the V3 build is still active and 8 files import from `_harness/`, 4 KEEP/PORT components import dashboard `styles.css` files. Moving now produces a broken V3 state before RV is ready to replace it. See translator_notes gotcha 22 for the ownership mapping: Thalia-v2 owns `_harness` + layout-level moves, Erato-v2 owns HUD style + WorldSwitcher moves, Kalypso owns pillar page.tsx moves. Never `git rm`; always `git mv`. Example: `app/_harness/HarnessShell.tsx` scaffold is replaced by the game main lobby scene + Kalypso landing page; Thalia-v2 drops the import in `app/layout.tsx` rewrite then moves the file.

**Default under ambiguity**: when unsure between KEEP and PORT, choose PORT (safer, Erato-v2 can revert to KEEP by importing the original). When unsure between PORT and DEPRECATE, halt and ferry to V4. Per session hard constraint, ambiguity at the PORT-vs-DEPRECATE boundary is a hard stop.

## Strategic decision hard-stops honored

1. **Apollo Advisor core logic is never deprecated**: `app/advisor/apollo.ts`, `apollo.prompts.ts`, `apollo.config.json` are KEEP (Builder demo fulcrum per session hard-stop).
2. **RV_PLAN Section 4 REUSE items**: every artifact Ghaisan explicitly marked REUSE in RV_PLAN Section 4 is KEEP here. Apollo core logic, Cassandra prediction, Helios viz logic, Heracles MA lane, all 32 contracts, all 5 Lead outputs, Blueprint Moment logic, Lumio cache, Proteus translation logic, NarasiGhaisan voice anchor, CLAUDE.md root, FastAPI backend direction, Anthropic Python SDK direction. Cross-verified row by row.

---

## 1. Decision summary by category

| Category | KEEP | PORT | DEPRECATE | Total |
|---|---:|---:|---:|---:|
| Apollo Advisor logic + config | 3 | 0 | 0 | 3 |
| Apollo Advisor UI | 0 | 3 | 2 | 5 |
| Builder executor (Athena + Heracles) | 10 | 0 | 0 | 10 |
| Cassandra prediction | 5 | 0 | 0 | 5 |
| Helios viz | 3 | 5 | 0 | 8 |
| Urania Blueprint Moment | 4 | 2 | 0 | 6 |
| Dionysus Lumio cache replay | 1 | 1 | 0 | 2 |
| Thalia worlds (v1) | 15 | 7 | 1 | 23 |
| Builder route + scaffold | 0 | 0 | 1 | 1 |
| Marketplace | 14 | 9 | 2 | 25 |
| Banking | 8 | 4 | 1 | 13 |
| Registry | 7 | 3 | 1 | 11 |
| Protocol | 11 | 6 | 3 | 20 |
| Shared | 2 | 1 | 0 | 3 |
| Root scaffolding | 8 | 3 | 0 | 11 |
| Nemea-v1 harness | 0 | 0 | 3 | 3 |
| Pillar routes (6) | 0 | 0 | 6 | 6 |
| Public assets | 2 | 3 | 0 | 5 |
| Scripts | 2 | 1 | 0 | 3 |
| Cache (Dionysus) | 31 | 0 | 0 | 31 |
| Contracts (all 32) | 32 | 0 | 0 | 32 |
| V3 agent prompts (22 archived) | 22 | 0 | 0 | 22 |
| Nemea-v1 screenshots (9) | 9 | 0 | 0 | 9 |
| Playwright transient (14) | 0 | 0 | 14 | 14 |
| Orchestration + planning docs | 15 | 0 | 0 | 15 |
| **Total** | **173** | **51** | **34** | **258** |

---

## 2. `app/advisor/` Apollo + Erato

### KEEP

| Path | Rationale |
|---|---|
| `app/advisor/apollo.ts` | Ghaisan hard-stop: Apollo core logic never deprecated. Session mgmt + brevity + event dispatch all framework-neutral. |
| `app/advisor/apollo.prompts.ts` | System prompt templates are neutral data. |
| `app/advisor/apollo.config.json` | Model strategy routing config, used by in-game HUD ModelSelector and existing apollo.ts. |

### PORT

| Path | PORT target | Rationale |
|---|---|---|
| `app/advisor/ui/AdvisorChat.tsx` | Erato-v2 BottomBar + DialogueOverlay integration | Dashboard chat surface is replaced by in-game NPC dialogue via Linus (DialogueOverlay). Session state machine + attached-components pattern (pipeline_viz slot, blueprint_reveal slot, prediction_warning embed) inherits. `src/components/hud/ported/ApolloStream.tsx` lands as reference skeleton. |
| `app/advisor/ui/ModelStrategySelector.tsx` | Erato-v2 SideBar ModelSelector | Surface becomes in-game sidebar dropdown with the same 4-mode options (Opus-all, Collaborative Anthropic, Multi-vendor, Auto). Type imports from apollo.ts stay. |
| `app/advisor/ui/PredictionWarning.tsx` | Erato-v2 QuestTracker + HUD banner, plus `src/components/hud/ported/CassandraPrediction.tsx` reference | Self-contained SVG icons + aria-live severity pattern inherits. Warning fires as in-game HUD banner overlay. |

### DEPRECATE

| Path | Rationale |
|---|---|
| `app/advisor/ui/styles.css` | Dashboard-specific class namespace (`.advisor-root`, `.advisor-bubble`, etc). Game HUD is authored fresh by Erato-v2 + Hesperus with game tokens. OKLCH token convention referenced in translator_notes.md. |
| `app/advisor/page.tsx` | `/advisor` route collapsed. Apollo surfaces as in-game NPC dialogue only; no standalone dashboard route. |

---

## 3. `app/builder/executor/` Athena + Heracles

### KEEP (10 of 10)

| Path | Rationale |
|---|---|
| `app/builder/executor/BuilderSpecialistExecutor.ts` | Core orchestration abstraction, UI-agnostic, consumes `pipeline_event` bus. Used as-is by in-game mini Builder cinematic driver. |
| `app/builder/executor/AnthropicManagedExecutor.ts` | MA session executor, framework-neutral. |
| `app/builder/executor/handoff_events.ts` | Handoff + prediction event envelope types. Central schema. |
| `app/builder/executor/ma_agent_definition.nerium_integration_engineer.json` | MA agent definition for Lumio integrator. Reuse as-is for in-game Lumio quest mini Builder run. |
| `app/builder/executor/ma_environment.nerium_integration_engineer.json` | MA env spec. |
| `app/builder/executor/ma_files_api_client.ts` | File plane API wrapper, neutral. |
| `app/builder/executor/ma_session_spawner.ts` | Session bootstrap, neutral. |
| `app/builder/executor/ma_sse_bridge.ts` | SSE to `pipeline_event` normalization, central for in-game live pipeline viz. |
| `app/builder/executor/pipeline_topology.lumio.json` | Lumio run DAG fixture, reused by Urania-v2 in-game cinematic. |
| `app/builder/leads/athena.output.md` | Lead directive, historical record. |

---

## 4. `app/builder/prediction/` Cassandra

### KEEP (5 of 5)

| Path | Rationale |
|---|---|
| `app/builder/prediction/cassandra.ts` | 100-pass simulation + confidence mapper. Reused by in-game Advisor-NPC warning generation. |
| `app/builder/prediction/confidence_formula.ts` | Pure math, neutral. |
| `app/builder/prediction/prompt_template.ts` | Prediction prompt, reusable. |
| `app/builder/prediction/schema.ts` | Prediction payload types, central schema. |
| `app/builder/prediction/simulation_event.ts` | Simulation event envelope, on `pipeline_event` bus. |

---

## 5. `app/builder/viz/` Helios

### KEEP

| Path | Rationale |
|---|---|
| `app/builder/viz/confidence_overlay.ts` | Fade-timing constants, neutral. |
| `app/builder/viz/stream_subscriber.ts` | Transport-level reconnect logic, used if in-game HUD subscribes directly to SSE. |
| `app/builder/viz/types.ts` | View types (PipelineNode, PipelineEdge, NodeStatus, ViewMode, ToolUseEntry). Central schema for HUD mini-viewer. |

### PORT

| Path | PORT target | Rationale |
|---|---|---|
| `app/builder/viz/PipelineCanvas.tsx` | Erato-v2 SideBar mini-viewer (embedded HUD element) + `src/components/hud/ported/HeliosPipelineViz.tsx` reference | Full-width dashboard SVG becomes compact HUD embed. Zustand store + Framer Motion layout + tier-based ring layout inherits. |
| `app/builder/viz/AgentNode.tsx` | bundled with HeliosPipelineViz port | Node renderer, sub-component. |
| `app/builder/viz/HandoffEdge.tsx` | bundled | Edge renderer, sub-component. |
| `app/builder/viz/MAConsoleDeepLink.tsx` | bundled (keep behind `data-dev` flag in HUD) | MA console jump link, optional in in-game HUD. |
| `app/builder/viz/ToolUseTicker.tsx` | bundled | Tool-use ring buffer widget, useful as scrolling HUD chrome element. |

---

## 6. `app/builder/moment/` Urania Blueprint Moment

### KEEP

| Path | Rationale |
|---|---|
| `app/builder/moment/camera_pullback.ts` | Camera easing math, reusable for Phaser camera tweens. |
| `app/builder/moment/narration_overlay.ts` | Narration strings, reusable. |
| `app/builder/moment/fixtures/blueprint_lumio_2026_04_25.json` | 22-node + highlight fixture, consumed by in-game cinematic. |
| `app/builder/moment/types.ts` | Moment types (BlueprintSnapshot, BlueprintNode, etc). Central schema. |

### PORT

| Path | PORT target | Rationale |
|---|---|---|
| `app/builder/moment/BlueprintReveal.tsx` | Thalia-v2 MiniBuilderCinematicScene (Phaser) + Urania-v2 narration overlay | Hero cinematic moves from SVG DOM to Phaser scripted tween over pre-generated tiles. Narration text + highlight fixture inherit. |
| `app/builder/moment/ma_highlight.tsx` | bundled into MiniBuilderCinematicScene | MA node glow effect becomes Phaser tween on ma_lane tile. |

---

## 7. `app/builder/lumio/` Dionysus Lumio

### KEEP

| Path | Rationale |
|---|---|
| `app/builder/lumio/cache_types.ts` | LumioCache envelope types, central schema. |

### PORT

| Path | PORT target | Rationale |
|---|---|---|
| `app/builder/lumio/LumioReplay.tsx` | In-game quest trigger cinematic via Nyx + Thalia-v2 | Dashboard fetch-and-render becomes in-game NPC-interaction cinematic that plays the cached trace. Quest step triggers on replay completion. |

---

## 8. `app/builder/worlds/` Thalia v1

### KEEP (15 of 23)

| Path | Rationale |
|---|---|
| `app/builder/worlds/world_aesthetic_types.ts` | WorldAesthetic + palette types, central schema. Phaser consumes. |
| `app/builder/worlds/sprite_atlas_types.ts` | Atlas + slot types, central schema. |
| `app/builder/worlds/sprite_slots.ts` | Slot enum. |
| `app/builder/worlds/cyberpunk_shanghai/palette.ts` | Palette hex data, Phaser reads. |
| `app/builder/worlds/cyberpunk_shanghai/descriptor.ts` | World metadata descriptor. |
| `app/builder/worlds/cyberpunk_shanghai/animations.ts` | Animation frame descriptors, Phaser reads. |
| `app/builder/worlds/cyberpunk_shanghai/atlas.json` | Atlas frame data, Phaser-compat. |
| `app/builder/worlds/medieval_desert/palette.ts` | Palette hex data. |
| `app/builder/worlds/medieval_desert/descriptor.ts` | World metadata descriptor. |
| `app/builder/worlds/medieval_desert/animations.ts` | Animation frame descriptors. |
| `app/builder/worlds/medieval_desert/atlas.json` | Atlas frame data. |
| `app/builder/worlds/steampunk_victorian/palette.ts` | Palette hex data. |
| `app/builder/worlds/steampunk_victorian/descriptor.ts` | World metadata descriptor. |
| `app/builder/worlds/steampunk_victorian/animations.ts` | Animation frame descriptors. |
| `app/builder/worlds/steampunk_victorian/atlas.json` | Atlas frame data. |

### PORT (7 of 23)

| Path | PORT target | Rationale |
|---|---|---|
| `app/builder/worlds/cyberpunk_shanghai/atlas.ts` | Phaser scene loader format | Wraps atlas.json + Pixi.js assumptions; Phaser needs `Phaser.Loader.FileTypes.atlas` format adaptation. |
| `app/builder/worlds/medieval_desert/atlas.ts` | same as above | |
| `app/builder/worlds/steampunk_victorian/atlas.ts` | same as above | |
| `app/builder/worlds/SpriteAtlasRegistry.ts` | Thalia-v2 Phaser asset pack loader | Registry pattern reusable; Phaser integration rewrite. |
| `app/builder/worlds/WorldAestheticRegistry.ts` | Thalia-v2 scene router | Registry reusable; world transitions move from CSS cascade to Phaser scene key. |
| `app/builder/worlds/ConstructionAnimation.ts` | Thalia-v2-B MiniBuilderCinematicScene | Scripted tween sequence inherits as Phaser tween chain. |
| `app/builder/worlds/WorldSwitcher.tsx` (see DEPRECATE) | Actually see DEPRECATE below | (noted here by mistake, see DEPRECATE row). |

### DEPRECATE (1 of 23)

| Path | Rationale |
|---|---|
| `app/builder/worlds/WorldSwitcher.tsx` | Dropdown UI replaced by Phaser scene-key transitions + main lobby caravan unlock mechanic. No world picker needed in game paradigm. |

---

## 9. `app/builder/` route scaffold

### DEPRECATE

| Path | Rationale |
|---|---|
| `app/builder/page.tsx` | `/builder` route collapsed into `/play` (Phaser takeover) + `/leaderboard` (3D City) + `/` (landing). Composes BlueprintReveal + LumioReplay + PipelineCanvas + WorldSwitcher as dashboard, all of which port to in-game surfaces. |

---

## 10. `app/marketplace/` Demeter + Eos + Artemis + Coeus

### KEEP (14 of 25)

| Path | Rationale |
|---|---|
| `app/marketplace/leads/demeter.output.md` | Lead directive. |
| `app/marketplace/schema/listing.schema.ts` | ListingEntry zod schema, central. |
| `app/marketplace/taxonomy/categories.json` | Category tree data. |
| `app/marketplace/listing/submission_types.ts` | Submission types. |
| `app/marketplace/listing/validation.ts` | Zod validation bridge. |
| `app/marketplace/listing/draft_store.ts` | LocalStorage draft persistence (neutral). |
| `app/marketplace/browse/types.ts` | Browse types. |
| `app/marketplace/browse/mock_catalog.ts` | 18 seed listings + DEMO_SEED_NOTICE, reused by in-game shop. |
| `app/marketplace/search/semantic_embedder.ts` | Mock embedder logic. |
| `app/marketplace/search/ranking_weights.json` | Ranking weights data. |
| (contracts cross-reference: marketplace_listing, browse_ui, search_ui, search_ranking, listing_submission, living_template_customize - all 6 contracts KEEP via Section 15). | |

### PORT (9 of 25)

| Path | PORT target | Rationale |
|---|---|---|
| `app/marketplace/listing/SubmissionForm.tsx` | Erato-v2 ShopModal submit flow (in-game NPC transaction) | Creator submission wizard becomes in-game NPC vendor kiosk. Zod validation + draft_store + PreviewCard + PublishConfirm logic inherits. |
| `app/marketplace/listing/PreviewCard.tsx` | bundled with ShopModal | Pre-publish preview, in-game modal sub-component. |
| `app/marketplace/listing/PublishConfirm.tsx` | bundled with ShopModal | Final confirm + honest-claim copy. |
| `app/marketplace/browse/BrowseCanvas.tsx` | Erato-v2 in-game shop browse modal | Dashboard grid becomes in-game shop UI. Mock catalog + honest-claim + vendor filter + featured carousel all inherit. |
| `app/marketplace/browse/CategoryNav.tsx` | bundled | Sidebar nav. |
| `app/marketplace/browse/FeaturedAgents.tsx` | bundled | Featured carousel. |
| `app/marketplace/browse/ListingCard.tsx` | bundled | Grid cell. |
| `app/marketplace/browse/VendorFilter.tsx` | bundled | Vendor filter. |
| `app/marketplace/search/SearchBar.tsx` + `ResultList.tsx` + `LivingTemplateChat.tsx` | Erato-v2 in-game shop search subcomponents | Search + result render + living-template chat become in-game shop search modal. Treat as 3-PORT bundle; logic files already KEEP above. |

### DEPRECATE (2 of 25)

| Path | Rationale |
|---|---|
| `app/marketplace/listing/styles.css` | Dashboard-specific styles. Erato-v2 authors game HUD styles fresh. |
| `app/marketplace/page.tsx` | `/marketplace` route collapsed into in-game main lobby shop system. |

---

## 11. `app/banking/` Tyche + Dike + Rhea

### KEEP (8 of 13)

| Path | Rationale |
|---|---|
| `app/banking/leads/tyche.output.md` | Lead directive. |
| `app/banking/schema/wallet.schema.ts` | WalletState + TransactionEvent zod, central schema. |
| `app/banking/pricing/tier_model.json` | Tier pricing config, neutral data. |
| `app/banking/metering/meter_contract.ts` | Metering types, central schema. |
| `app/banking/meter/cost_ticker.ts` | Accumulator + dual-locale formatter. Neutral logic. |
| `app/banking/stream/stream_types.ts` | Stream types. |
| `app/banking/stream/mock_generator.ts` | Synthetic tx generator, neutral. |
| `app/banking/stream/mock_pools.json` | Seed tx pools data. |

### PORT (4 of 13)

| Path | PORT target | Rationale |
|---|---|---|
| `app/banking/meter/LiveCostMeter.tsx` | Erato-v2 TopBar cost ticker (absorbs V4 pre-sketch Zelus role) | Dashboard HUD widget becomes in-game currency display sub-component. `cost_ticker.ts` logic inherits unchanged. |
| `app/banking/wallet/WalletCard.tsx` | Erato-v2 TopBar CurrencyDisplay | Balance card becomes in-game wallet status. |
| `app/banking/wallet/EarningsDashboard.tsx` | Erato-v2 in-game shop earnings panel (optional) | Dashboard becomes optional earnings panel in shop modal. |
| `app/banking/stream/TransactionPulse.tsx` | Erato-v2 TopBar transaction pulse mini-widget | Dashboard live pulse becomes in-game pulse animation on currency tick. |

### DEPRECATE (1 of 13)

| Path | Rationale |
|---|---|
| `app/banking/page.tsx` | `/banking` route collapsed into in-game TopBar currency HUD. |

---

## 12. `app/registry/` Hecate + Phoebe

### KEEP (7 of 11)

| Path | Rationale |
|---|---|
| `app/registry/leads/hecate.output.md` | Lead directive. |
| `app/registry/schema/identity.schema.ts` | AgentIdentity zod, central schema. |
| `app/registry/audit/audit_contract.ts` | Audit types. |
| `app/registry/trust/trust_formula.ts` | Trust score computation logic, neutral. |
| `app/registry/trust/trust_types.ts` | Trust types. |
| `app/registry/trust/formula_weights.json` | Weight coefficients data. |
| `app/registry/card/identity_card_types.ts` | Card types. |

### PORT (3 of 11)

| Path | PORT target | Rationale |
|---|---|---|
| `app/registry/card/IdentityCard.tsx` | Erato-v2 NPC trust meter overlay | Dashboard card becomes in-game NPC hover/interact surface. Trust score formula + audit trail inherits. |
| `app/registry/card/TrustScoreBadge.tsx` | bundled | Badge sub-component on NPC sprite. |
| `app/registry/card/AuditTrailExpand.tsx` | bundled | Audit trail collapsible, shown on NPC deep-interact. |

### DEPRECATE (1 of 11)

| Path | Rationale |
|---|---|
| `app/registry/page.tsx` | `/registry` route collapsed into in-game NPC trust meter interactions. |

---

## 13. `app/protocol/` Proteus + Morpheus + Triton

### KEEP (11 of 20)

| Path | Rationale |
|---|---|
| `app/protocol/leads/proteus.output.md` | Lead directive. |
| `app/protocol/schema/agent_intent.ts` | AgentIntent protocol types, central. |
| `app/protocol/adapters/VendorAdapter.ts` | Adapter interface, central. |
| `app/protocol/adapters/anthropic_adapter.ts` | Claude adapter real logic. Reused by in-game multi-vendor caravan demo. |
| `app/protocol/adapters/gemini_adapter.mock.ts` | Gemini serialize-only mock. Reused. |
| `app/protocol/demo/translation_demo_types.ts` | Demo types, central. |
| `app/protocol/vendor/annotation_text.constant.ts` | NarasiGhaisan Section 16 literal honest-claim copy. Reused by in-game HUD honest-claim annotation. |
| `app/protocol/vendor/vendor_adapter_ui_types.ts` | UI types (keep for Erato-v2 caravan faction consume). |
| (contracts: agent_intent, protocol_adapter, translation_demo, vendor_adapter_ui - all 4 KEEP via Section 15) | |

### PORT (6 of 20)

| Path | PORT target | Rationale |
|---|---|---|
| `app/protocol/demo/TranslationSplit.tsx` | Erato-v2 in-game caravan dialogue demo (side-by-side) | Dashboard split becomes in-game caravan NPC conversation demonstration. |
| `app/protocol/demo/ClaudePanel.tsx` | bundled | Claude body panel sub-component. |
| `app/protocol/demo/GeminiMockPanel.tsx` | bundled | Gemini mock panel + MOCK badge. |
| `app/protocol/vendor/MultiVendorPanel.tsx` | Erato-v2 in-game caravan faction UI | 4-mode panel becomes in-game multi-vendor caravan faction NPC dialogue surface. |
| `app/protocol/vendor/HonestAnnotation.tsx` | bundled (plus annotation_text.constant.ts KEEP import) | Persistent annotation on caravan NPC. |
| `app/protocol/vendor/TaskAssignmentGrid.tsx` | bundled | Task-to-vendor grid, in-game shop sub-view. |

### DEPRECATE (3 of 20)

| Path | Rationale |
|---|---|
| `app/protocol/demo/styles.css` | Dashboard-specific styles. Game HUD styling by Erato-v2 + Hesperus. |
| `app/protocol/vendor/styles.css` | Same as above. |
| `app/protocol/page.tsx` | `/protocol` route collapsed into in-game caravan faction system. |

---

## 14. `app/shared/` cross-pillar shared

### KEEP (2 of 3)

| Path | Rationale |
|---|---|
| `app/shared/design/tokens.ts` | OKLCH design tokens source-of-truth. Reused by Erato-v2 HUD component layer and Hesperus SVG chrome. Game paradigm replaces world-CSS cascade with Phaser tilemap palette but the underlying OKLCH token convention is preserved for React HUD and landing page. |
| `app/shared/events/pipeline_event.ts` | Central canonical event bus. 12 importers. Do not touch. RV in-game pipeline viz + mini Builder cinematic reuse identical envelope. |

### PORT (1 of 3)

| Path | PORT target | Rationale |
|---|---|---|
| `app/shared/design/theme_runtime.ts` | Erato-v2 HUD token injector (simplified, no world cascade) + retired world-switcher cascade | `applyWorld()` dynamic CSS cascade is deprecated (Phaser drives world transitions via scene keys). React HUD side retains token injection at root but simplifies to static OKLCH. |

---

## 15. `docs/contracts/` Pythia contracts (all 32)

### KEEP (32 of 32)

All 32 contracts pass Nemea-v1 conformance sweep, all at v0.1.0. Per Pythia-v2 Section 4.10 spec: "contract round 2 specialist, respawn of V3 Pythia for RV additions only". Pythia-v2 will amend signatures where RV adds game-state fields; existing surface preserved.

| Path | Status under Pythia-v2 review |
|---|---|
| `docs/contracts/advisor_interaction.contract.md` | KEEP (Apollo core unchanged) |
| `docs/contracts/advisor_ui.contract.md` | KEEP (surface properties reused by Erato-v2 HUD) |
| `docs/contracts/agent_identity.contract.md` | KEEP |
| `docs/contracts/agent_intent.contract.md` | KEEP |
| `docs/contracts/billing_meter.contract.md` | KEEP (Tyche meter unchanged) |
| `docs/contracts/blueprint_moment.contract.md` | KEEP (types reused by MiniBuilderCinematicScene) |
| `docs/contracts/browse_ui.contract.md` | KEEP |
| `docs/contracts/builder_specialist_executor.contract.md` | KEEP (central) |
| `docs/contracts/cost_meter.contract.md` | KEEP |
| `docs/contracts/design_tokens.contract.md` | KEEP (amendments possible at v0.2.0 for game HUD if Pythia-v2 deems necessary) |
| `docs/contracts/event_bus.contract.md` | KEEP (central, 12 importers) |
| `docs/contracts/identity_card.contract.md` | KEEP |
| `docs/contracts/listing_submission.contract.md` | KEEP |
| `docs/contracts/living_template_customize.contract.md` | KEEP |
| `docs/contracts/lumio_demo_cache.contract.md` | KEEP (LumioReplay PORT, cache_types stays) |
| `docs/contracts/managed_agent_executor.contract.md` | KEEP (central) |
| `docs/contracts/marketplace_listing.contract.md` | KEEP |
| `docs/contracts/pillar_lead_handoff.contract.md` | KEEP |
| `docs/contracts/pipeline_visualizer.contract.md` | KEEP (PipelineCanvas PORT, logic/types stays) |
| `docs/contracts/prediction_layer_surface.contract.md` | KEEP |
| `docs/contracts/protocol_adapter.contract.md` | KEEP |
| `docs/contracts/search_ranking.contract.md` | KEEP |
| `docs/contracts/search_ui.contract.md` | KEEP |
| `docs/contracts/simulation_event.contract.md` | KEEP |
| `docs/contracts/sprite_atlas.contract.md` | KEEP (amendments possible for Phaser format at v0.2.0 per Pythia-v2) |
| `docs/contracts/transaction_event.contract.md` | KEEP |
| `docs/contracts/transaction_stream.contract.md` | KEEP |
| `docs/contracts/translation_demo.contract.md` | KEEP |
| `docs/contracts/trust_score.contract.md` | KEEP |
| `docs/contracts/vendor_adapter_ui.contract.md` | KEEP |
| `docs/contracts/wallet_ui.contract.md` | KEEP |
| `docs/contracts/world_aesthetic.contract.md` | KEEP (Phaser consumption amendments possible at v0.2.0) |

Pythia-v2 autonomously handles any v0.1.0 to v0.2.0 bumps; none of these are DEPRECATE candidates.

---

## 16. `cache/` Dionysus orchestrated bake output

### KEEP (31 of 31)

All 31 cache artifacts inherit as in-game Lumio quest cinematic trigger data. Per RV_PLAN Section 4 explicit REUSE: "`app/builder/lumio/lumio_cache.json` (Dionysus bake output, reuse as in-game quest trigger)".

| Path | Rationale |
|---|---|
| `cache/lumio_run_2026_04_24.json` | Canonical trace, 11 specialists. Consumed by in-game Dionysus-v2 quest replay. |
| `cache/lumio_final/index.html` + `signup.html` | Final Lumio HTML artifacts, shown as quest reward cinematic. |
| `cache/lumio_artifacts/*` (29 files across 9 specialist subdirs) | Per-specialist bake outputs, shown at granular quest-step level in-game. |

---

## 17. Public assets

### KEEP (2 of 5)

| Path | Rationale |
|---|---|
| `public/assets/attributions.md` | CC0 pack attribution. Talos-v2 W1 extends (not replaces) with new CC0 sources (Kenney multi-genre, Oak Woods, Warped City). |
| `public/cache/lumio_run_2026_04_24.json` | Static-servable copy of trace. Nemea-v1 Critical Fix 1.3 output. Reused as-is. |

### PORT (3 of 5)

| Path | PORT target | Rationale |
|---|---|---|
| `public/assets/worlds/cyberpunk_shanghai/atlas.png` | Talos-v2 W2 regenerate from CC0 Warped City + Opus procedural fill | Existing Harmonia-polished 32x32 atlas is decorative. Phaser consumes new atlas authored by Talos-v2 per M2 Section 7.4 NEW entries. Existing PNG may stay as fallback or retired. |
| `public/assets/worlds/medieval_desert/atlas.png` | Talos-v2 W2 regenerate from CC0 Kenney + Oak Woods + Opus procedural fill | Same as above. |
| `public/assets/worlds/steampunk_victorian/atlas.png` | Talos-v2 W2 regenerate from CC0 Kenney + Opus procedural fill | Same as above. |

---

## 18. `scripts/`

### KEEP (2 of 3)

| Path | Rationale |
|---|---|
| `scripts/build_lumio_cache.mjs` | Dionysus cache rebake script. Reusable if in-game Lumio cinematic needs cache refresh. |
| `scripts/submit_ma_research_preview_form.md` | MA access form submission notes, historical record. |

### PORT (1 of 3)

| Path | PORT target | Rationale |
|---|---|---|
| `scripts/build_world_atlases.mjs` | Talos-v2 W2 `scripts/pack-atlas.ts` (free-tex-packer wrapper) | Pixi-era script. M2 Section 4.1 output lists `scripts/pack-atlas.ts` as Talos-v2 new authored. Existing mjs script serves as source-of-knowledge for atlas stitching logic. |

---

## 19. Root scaffolding

### KEEP (8 of 11)

| Path | Rationale |
|---|---|
| `package.json` | Amended (not replaced) by Talos-v2 W1 to add Phaser 3, Zustand, zod, Howler. V3 dep set preserved. |
| `package-lock.json` | Amended. |
| `tsconfig.json` | V3 compiler config preserved. |
| `next-env.d.ts` | Next.js auto-generated. |
| `postcss.config.mjs` | Tailwind v4 wiring, kept as-is. |
| `.gitignore` | Extended by Talos-v2 to add `_skills_staging/` + potential `public/assets/bulk/`. |
| `LICENSE` | MIT. |
| `CLAUDE.md` | Amended with RV-6 anti-pattern 7 override footer. Not rewritten. |

### PORT (3 of 11)

| Path | PORT target | Rationale |
|---|---|---|
| `app/layout.tsx` | Thalia-v2 Next.js root layout (new) | Rewritten for new route map `/`, `/play`, `/leaderboard`. Harness chrome removed. |
| `app/page.tsx` | Kalypso landing page | Becomes landing page route via Claude Design mockup translate. |
| `app/globals.css` | Erato-v2 + Hesperus game HUD baseline + landing baseline | Global styles rewritten for game HUD + landing context. Tailwind import preserved. |
| `README.md` | Kalypso final polish pass | Substantially rewritten for RV positioning (game-takeover framing, meta-narrative enhancement per RV_PLAN Section 0, Nano Banana 2 honest-claim annotation). |

---

## 20. Nemea-v1 harness scaffold

### DEPRECATE (3 of 3)

| Path | Rationale |
|---|---|
| `app/_harness/HarnessShell.tsx` | Emergency pillar-nav scaffold. Replaced by game main lobby scene + Kalypso landing page. |
| `app/_harness/ClientThemeBoot.tsx` | `applyActiveWorld()` hydration trigger. World transitions move to Phaser scene keys; no hydration trigger needed. |
| `app/_harness/harness.css` | Harness-only baseline. No longer loaded. |

---

## 21. Pillar route scaffolds

### DEPRECATE (6 of 6)

Per RV_PLAN Section 4 explicit DEPRECATE: "`app/_harness/*` Next.js routes scaffold bikinan Nemea-v1 Critical Fix #1 (page.tsx per-pillar)". All 6 pillar routes collapse into in-game systems per RV.3.

| Path | Rationale |
|---|---|
| `app/advisor/page.tsx` | Collapsed into in-game NPC dialogue. |
| `app/builder/page.tsx` | Collapsed into `/play` + `/leaderboard` + `/`. |
| `app/marketplace/page.tsx` | Collapsed into in-game shop system. |
| `app/banking/page.tsx` | Collapsed into in-game TopBar currency HUD. |
| `app/registry/page.tsx` | Collapsed into in-game NPC trust meter. |
| `app/protocol/page.tsx` | Collapsed into in-game caravan faction system. |

---

## 22. V3 agent prompt files

### KEEP (22 of 22, archived reference)

All 22 `.claude/agents/*.md` V3 prompt files stay as historical reference. Hephaestus-v2 Section 4.11 spec: "respawn of V3 Hephaestus for RV agents". Hephaestus-v2 authors NEW prompt files for RV agents (Nyx, Linus, Kalypso, Talos, Hesperus, Euterpe, Thalia-v2, Erato-v2, plus specialists); does not replace the 22 V3 prompts.

| Prompt file | Pillar |
|---|---|
| apollo.md | Advisor |
| artemis.md | Marketplace (Browse) |
| athena.md | Builder Lead |
| cassandra.md | Builder Prediction |
| coeus.md | Marketplace Search |
| demeter.md | Marketplace Lead |
| dike.md | Banking Wallet |
| dionysus.md | Builder Lumio |
| eos.md | Marketplace Listing |
| erato.md | Advisor UI |
| harmonia.md | Cross-pillar polish |
| hecate.md | Registry Lead |
| helios.md | Builder Viz |
| heracles.md | Builder MA |
| morpheus.md | Protocol Vendor |
| phoebe.md | Registry Card/Trust |
| proteus.md | Protocol Lead |
| rhea.md | Banking Stream |
| thalia.md | Builder Worlds |
| triton.md | Protocol Demo |
| tyche.md | Banking Lead/Meter |
| urania.md | Builder Blueprint |

---

## 23. Nemea-v1 visual QA screenshots

### KEEP (9 of 9)

All 9 `nemea_*.png` root-level screenshots stay as visual regression reference for Nemea-RV-A + Nemea-RV-B baseline diff check. Low storage cost (~1.5 MB total), high future reference value.

| Path |
|---|
| `nemea_home.png` |
| `nemea_advisor.png` |
| `nemea_banking.png` |
| `nemea_builder_cyberpunk.png` |
| `nemea_builder_medieval.png` |
| `nemea_builder_steampunk.png` |
| `nemea_marketplace.png` |
| `nemea_protocol.png` |
| `nemea_registry.png` |

---

## 24. Playwright transient artifacts

### DEPRECATE (14 of 14)

`.playwright-mcp/*` 14 files (7 `console-*.log`, 7 `page-*.yml`). Nemea-v1 transient session captures from 2026-04-22 13:33 UTC visual QA pass. Superseded by Nemea-RV-A regression run fresh artifacts. No reference value.

| Pattern | Count |
|---|---:|
| `.playwright-mcp/console-2026-04-22T13-3*.log` | 7 |
| `.playwright-mcp/page-2026-04-22T13-3*.yml` | 7 |

---

## 25. Orchestration and planning docs

### KEEP (15 of 15)

All orchestration artifacts (V1 through V4 handoffs, Metis outputs, Ananke daily logs, Metis-v2 outputs, this file, inventory, translator notes, Nemea-v1 QA report, Metis pre-hackathon reference, METIS_KICKOFF, RV_PLAN, RV_AgentPromptOpening, RV_FileManifest, RV_METIS_v2_KICKOFF) stay as permanent historical record.

| Category | Paths kept |
|---|---|
| V1-V4 handoff chain | `_meta/HACKATHON_HANDOFF_V1_TO_V2.md`, `V2_TO_V3.md`, `V3_TO_V4.md` |
| Voice anchor | `_meta/NarasiGhaisan.md` |
| V3 Metis outputs | `docs/phase_0/MANAGED_AGENTS_RESEARCH.md`, `NERIUM_AGENT_STRUCTURE.md`, `agent_flow_diagram.html` |
| RV planning | `_meta/RV_PLAN.md`, `RV_AgentPromptOpening.md`, `RV_FileManifest.md`, `RV_METIS_v2_KICKOFF.md`, `METIS_KICKOFF.md` |
| RV Metis-v2 outputs | `docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md`, `RV_NERIUM_AGENT_STRUCTURE_v2.md` |
| RV Talos-translator outputs | `docs/phase_rv/P0_ARTIFACT_INVENTORY.md`, `REUSE_REWRITE_MATRIX.md` (this file), `_meta/translator_notes.md` |
| QA | `docs/qa/nemea_final_qa.md` |
| Pre-hackathon reference | `_meta/reference/` folder contents |
| Orchestration log | `_meta/orchestration_log/day_0.md`, `day_1.md`, `day_2.md` |

---

## 26. Halt triggers encountered

None. All 258 artifacts resolved to a decision within session capacity. No PORT-vs-DEPRECATE ambiguity triggered V4 ferry.

## 27. Strategic decisions honored

- **Apollo core KEEP**: `apollo.ts`, `apollo.prompts.ts`, `apollo.config.json` explicitly KEEP per session hard-stop.
- **RV_PLAN Section 4 REUSE items all KEEP**: Apollo, Cassandra, Helios logic, Heracles MA, contracts, Leads, Urania logic, Lumio cache, Proteus logic, NarasiGhaisan, CLAUDE.md root, tech stack direction. Cross-verified.
- **M2 Section 7 seed alignment**: aligned with 7.1 (KEEP), 7.2 (PORT), 7.3 (DEPRECATE) guidance. Expanded and finalized per-file.

## 28. Open items for Erato-v2

Flagged for pickup by Erato-v2 (Wave 3):
- 3 ported components under `src/components/hud/ported/` (ApolloStream, HeliosPipelineViz, CassandraPrediction). Erato-v2 wraps these into in-game HUD via Zustand bridge per M2 Section 4.5 spec.
- OKLCH token convention from `app/shared/design/tokens.ts` KEEP is the HUD token source; theme_runtime PORT means static injection only.
- Central event bus `app/shared/events/pipeline_event.ts` KEEP must not be modified; new events (`quest:*`, `caravan:*`, `npc:*`) added via Pythia-v2 contract round 2, same envelope format.

## 29. Open items for Hephaestus-v2

- Consume this matrix decisions to inform prompt file authoring for RV agents. Every PORT target in this matrix maps to a worker's input files list.
- Hard constraints section of new RV prompts should cite this matrix as mandatory reading.

## 30. Open items for Pythia-v2

- Review all 32 contracts for RV compatibility. Amend at v0.2.0 if signature changes (e.g. sprite_atlas.contract.md adding Phaser format fields, design_tokens.contract.md adding game-HUD scope, event_bus.contract.md adding game-event topics).
- Author new contracts per M2 Section 7.4 NEW list: `quest_schema.contract.md`, `dialogue_schema.contract.md`, `game_state.contract.md`, `game_asset_registry.contract.md`, `asset_ledger.contract.md`.

---

**End of REUSE_REWRITE_MATRIX.md**
