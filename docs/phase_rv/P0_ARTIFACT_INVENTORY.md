---
agent: talos-translator
phase: RV-1 P0 artifact migration
scope: full catalog V3 shipped artifacts, per-file metadata
date: 2026-04-23
version: 1.0.0
status: shipped
authoritative: yes (feeds REUSE_REWRITE_MATRIX.md authoritative decisions)
inventory_total_files: 165
---

# P0 Artifact Inventory (V3 shipped codebase)

Per-file catalog of every V3 shipped artifact. Metadata per entry: path, owner agent, type, current usage status, dep reference count bucket.

Companion to `REUSE_REWRITE_MATRIX.md` (authoritative KEEP/PORT/DEPRECATE decisions). This inventory is descriptive; the matrix is prescriptive.

Matrix-scope artifacts only. Out of scope: `node_modules/`, `.next/`, `.git/`, `_skills_staging/` (not yet created by Daedalus/Talos-v2), on-disk screenshots repeated in `docs/qa/`.

Type vocabulary:
- **logic**: `.ts` business logic, pure functions, classes, or orchestration
- **component**: `.tsx` React component (Client or Server)
- **schema**: `.ts` zod/TypeScript interface declarations or JSON schema
- **data**: `.json` seed data, fixtures, cached traces, mock catalogs
- **config**: `.json`, `.mjs`, `.ts` build/toolchain configuration
- **style**: `.css` stylesheet
- **doc**: `.md` markdown artifact (including `.output.md` lead outputs)
- **asset**: `.png`, `.svg`, `.yml`, `.log` (static or transient binary/media)
- **scaffold**: route or layout file whose primary role is framework plumbing

Dep ref count bucket:
- **central** (6+ importers): high blast radius on change
- **multi** (2 to 5 importers): moderate
- **single** (1 importer): leaf
- **none** (0 importers or loaded via framework convention): page.tsx, layout.tsx, config files, docs

---

## 1. Summary counts

| Category | Count |
|---|---:|
| `app/` TypeScript/React source | 103 |
| `app/` style, config, data | 11 |
| `cache/lumio_artifacts/` orchestrated bake output | 27 |
| `cache/lumio_final/` Dionysus final HTML | 2 |
| `cache/lumio_run_2026_04_24.json` | 1 |
| `docs/contracts/*.contract.md` | 32 |
| `docs/qa/nemea_final_qa.md` | 1 |
| `public/` assets and static cache | 5 |
| `scripts/` | 3 |
| Root config and screenshots | 19 |
| `.claude/agents/*.md` V3 prompt files | 22 |
| `.playwright-mcp/` transient Playwright session logs | 14 |
| `_meta/` planning artifacts | 12 |
| `docs/phase_0/` Metis outputs | 3 |
| `docs/phase_rv/` Metis-v2 outputs (pre-Talos-translator) | 4 |
| **Total in-scope artifacts** | **258** |

Rough rollup: 165 product-side files (`app/` + `cache/` + `public/` + `scripts/` + `docs/contracts/` + agent prompts) which are the primary KEEP/PORT/DEPRECATE candidates. Remaining 93 files are orchestration artifacts or planning docs (almost entirely KEEP).

---

## 2. `app/` inventory (Next.js App Router V3 shipped source)

### 2.1 Root scaffolding

| Path | Owner | Type | Dep refs | Current usage |
|---|---|---|---|---|
| `app/layout.tsx` | Nemea-v1 (Critical Fix 1.1) | scaffold | none (framework) | Root RSC layout, imports `./globals.css` and `_harness/ClientThemeBoot` |
| `app/page.tsx` | Nemea-v1 | scaffold | none | Landing index at `/`, renders HarnessShell with pillar links |
| `app/globals.css` | Nemea-v1 + Harmonia | style | none (Next.js auto) | Tailwind v4 `@import` plus `@theme` block cyberpunk_shanghai seed |

### 2.2 `app/_harness/` Nemea-v1 emergency routing scaffold

| Path | Owner | Type | Dep refs | Current usage |
|---|---|---|---|---|
| `app/_harness/HarnessShell.tsx` | Nemea-v1 | component | multi (6 pillar pages) | Sticky nav + honest-claim banner wrapper |
| `app/_harness/ClientThemeBoot.tsx` | Nemea-v1 | component | single (layout) | Hydrates `applyActiveWorld()` on mount |
| `app/_harness/harness.css` | Nemea-v1 | style | none | Harness-only baseline style |

### 2.3 `app/advisor/` Apollo Advisor pillar

| Path | Owner | Type | Dep refs | Current usage |
|---|---|---|---|---|
| `app/advisor/apollo.ts` | Apollo | logic | central (AdvisorChat, ModelStrategySelector, LumioReplay, harness pages) | AdvisorAgent class + session management + event dispatch core |
| `app/advisor/apollo.prompts.ts` | Apollo | logic | single (apollo.ts) | System + user prompt templates |
| `app/advisor/apollo.config.json` | Apollo | config | single (apollo.ts) | Model strategy routing config |
| `app/advisor/page.tsx` | Nemea-v1 | scaffold | none | `/advisor` route, wraps AdvisorChat demo |
| `app/advisor/ui/AdvisorChat.tsx` | Erato | component | single (advisor/page.tsx) | Root chat surface, imports apollo types + framer-motion |
| `app/advisor/ui/ModelStrategySelector.tsx` | Erato | component | single (AdvisorChat) | 4-mode model picker with multi-vendor panel slot |
| `app/advisor/ui/PredictionWarning.tsx` | Erato | component | single (AdvisorChat) | Gamified warning banner, self-contained SVG icons |
| `app/advisor/ui/styles.css` | Erato + Harmonia | style | single (AdvisorChat) | Advisor-specific design tokens + layout |

### 2.4 `app/builder/` Builder pillar (hero, deepest)

#### 2.4.1 `app/builder/executor/` Athena plus Heracles

| Path | Owner | Type | Dep refs | Current usage |
|---|---|---|---|---|
| `app/builder/executor/BuilderSpecialistExecutor.ts` | Athena | logic | multi (AnthropicManagedExecutor, tests) | Core executor abstraction, consumes PipelineEvent bus |
| `app/builder/executor/AnthropicManagedExecutor.ts` | Heracles | logic | single (demo orchestrator) | MA session executor, SSE-to-PipelineEvent bridge |
| `app/builder/executor/handoff_events.ts` | Athena | schema | multi (PipelineCanvas, cassandra) | Handoff + prediction event envelope types |
| `app/builder/executor/ma_agent_definition.nerium_integration_engineer.json` | Heracles | config | single (ma_session_spawner) | MA agent definition for Lumio integrator |
| `app/builder/executor/ma_environment.nerium_integration_engineer.json` | Heracles | config | single (ma_session_spawner) | MA environment spec |
| `app/builder/executor/ma_files_api_client.ts` | Heracles | logic | single (ma_session_spawner) | File plane API wrapper |
| `app/builder/executor/ma_session_spawner.ts` | Heracles | logic | single (AnthropicManagedExecutor) | Session bootstrap |
| `app/builder/executor/ma_sse_bridge.ts` | Heracles | logic | single (AnthropicManagedExecutor) | SSE normalization to PipelineEvent topics |
| `app/builder/executor/pipeline_topology.lumio.json` | Athena | data | single (demo orchestrator) | Lumio run DAG fixture |
| `app/builder/leads/athena.output.md` | Athena (Lead) | doc | none (reference) | Lead directive + decisions |

#### 2.4.2 `app/builder/prediction/` Cassandra

| Path | Owner | Type | Dep refs | Current usage |
|---|---|---|---|---|
| `app/builder/prediction/cassandra.ts` | Cassandra | logic | single (PipelineCanvas) | 100-pass simulation + confidence mapper |
| `app/builder/prediction/confidence_formula.ts` | Cassandra | logic | single (cassandra) | Scoring math |
| `app/builder/prediction/prompt_template.ts` | Cassandra | logic | single (cassandra) | Prediction prompt |
| `app/builder/prediction/schema.ts` | Cassandra | schema | single (PredictionWarning parent) | Prediction payload types |
| `app/builder/prediction/simulation_event.ts` | Cassandra | schema | single (cassandra) | Simulation event envelope |

#### 2.4.3 `app/builder/viz/` Helios

| Path | Owner | Type | Dep refs | Current usage |
|---|---|---|---|---|
| `app/builder/viz/PipelineCanvas.tsx` | Helios | component | single (advisor chat viz slot) | Live SVG pipeline visualizer with Zustand store |
| `app/builder/viz/AgentNode.tsx` | Helios | component | single (PipelineCanvas) | Per-agent node renderer |
| `app/builder/viz/HandoffEdge.tsx` | Helios | component | single (PipelineCanvas) | Edge between nodes |
| `app/builder/viz/MAConsoleDeepLink.tsx` | Helios | component | single (PipelineCanvas) | MA console jump link |
| `app/builder/viz/ToolUseTicker.tsx` | Helios | component | single (PipelineCanvas) | Scrolling tool-use ticker |
| `app/builder/viz/confidence_overlay.ts` | Helios | logic | single (PipelineCanvas) | Confidence overlay fade constants |
| `app/builder/viz/stream_subscriber.ts` | Helios | logic | single (PipelineCanvas alt path) | Transport-level reconnect |
| `app/builder/viz/types.ts` | Helios | schema | multi (PipelineCanvas, AgentNode, HandoffEdge) | View types |

#### 2.4.4 `app/builder/moment/` Urania Blueprint Moment

| Path | Owner | Type | Dep refs | Current usage |
|---|---|---|---|---|
| `app/builder/moment/BlueprintReveal.tsx` | Urania | component | single (builder page) | Hero cinematic, 22-node reveal |
| `app/builder/moment/camera_pullback.ts` | Urania | logic | single (BlueprintReveal) | Camera easing math |
| `app/builder/moment/fixtures/blueprint_lumio_2026_04_25.json` | Urania | data | single (BlueprintReveal) | 22-node + highlight fixture |
| `app/builder/moment/ma_highlight.tsx` | Urania | component | single (BlueprintReveal) | MA node glow overlay |
| `app/builder/moment/narration_overlay.ts` | Urania | logic | single (BlueprintReveal) | Narration string table |
| `app/builder/moment/types.ts` | Urania | schema | multi (BlueprintReveal, ma_highlight) | Moment types |

#### 2.4.5 `app/builder/lumio/` Dionysus Lumio cache replay

| Path | Owner | Type | Dep refs | Current usage |
|---|---|---|---|---|
| `app/builder/lumio/cache_types.ts` | Dionysus | schema | single (LumioReplay) | LumioCache envelope types |
| `app/builder/lumio/LumioReplay.tsx` | Dionysus | component | single (builder page) | Fetches public/cache trace, renders 11-specialist replay |

#### 2.4.6 `app/builder/worlds/` Thalia v1 pixel 2D pseudo-game

| Path | Owner | Type | Dep refs | Current usage |
|---|---|---|---|---|
| `app/builder/worlds/ConstructionAnimation.ts` | Thalia | logic | single (BlueprintReveal + worlds) | Scripted tween sequence over tiles |
| `app/builder/worlds/WorldSwitcher.tsx` | Thalia + Harmonia | component | single (builder page) | 3-world dropdown, drives `themeRuntime` |
| `app/builder/worlds/SpriteAtlasRegistry.ts` | Thalia | logic | single (WorldAestheticRegistry) | Registry class for atlas per world |
| `app/builder/worlds/WorldAestheticRegistry.ts` | Thalia | logic | multi (WorldSwitcher, BlueprintReveal) | World palette + atlas lookup |
| `app/builder/worlds/sprite_atlas_types.ts` | Thalia | schema | multi (world atlases) | Atlas + slot types |
| `app/builder/worlds/sprite_slots.ts` | Thalia | schema | multi (world atlases) | Slot enum |
| `app/builder/worlds/world_aesthetic_types.ts` | Thalia | schema | multi (world files) | WorldAesthetic + palette types |
| `app/builder/worlds/cyberpunk_shanghai/animations.ts` | Thalia | logic | single (atlas) | Cyberpunk animation descriptors |
| `app/builder/worlds/cyberpunk_shanghai/atlas.json` | Thalia | data | single (atlas.ts) | Cyberpunk atlas frames |
| `app/builder/worlds/cyberpunk_shanghai/atlas.ts` | Thalia | logic | single (registry) | Cyberpunk atlas loader + metadata |
| `app/builder/worlds/cyberpunk_shanghai/descriptor.ts` | Thalia | logic | single (registry) | World descriptor entry |
| `app/builder/worlds/cyberpunk_shanghai/palette.ts` | Thalia | data | single (atlas.ts) | Cyberpunk hex palette |
| `app/builder/worlds/medieval_desert/animations.ts` | Thalia | logic | single (atlas) | Medieval animation descriptors |
| `app/builder/worlds/medieval_desert/atlas.json` | Thalia | data | single (atlas.ts) | Medieval atlas frames |
| `app/builder/worlds/medieval_desert/atlas.ts` | Thalia | logic | single (registry) | Medieval atlas loader |
| `app/builder/worlds/medieval_desert/descriptor.ts` | Thalia | logic | single (registry) | Medieval descriptor |
| `app/builder/worlds/medieval_desert/palette.ts` | Thalia | data | single (atlas.ts) | Medieval palette |
| `app/builder/worlds/steampunk_victorian/animations.ts` | Thalia | logic | single (atlas) | Steampunk animation descriptors |
| `app/builder/worlds/steampunk_victorian/atlas.json` | Thalia | data | single (atlas.ts) | Steampunk atlas frames |
| `app/builder/worlds/steampunk_victorian/atlas.ts` | Thalia | logic | single (registry) | Steampunk atlas loader |
| `app/builder/worlds/steampunk_victorian/descriptor.ts` | Thalia | logic | single (registry) | Steampunk descriptor |
| `app/builder/worlds/steampunk_victorian/palette.ts` | Thalia | data | single (atlas.ts) | Steampunk palette |

#### 2.4.7 `app/builder/` route wrapper

| Path | Owner | Type | Dep refs | Current usage |
|---|---|---|---|---|
| `app/builder/page.tsx` | Nemea-v1 | scaffold | none | `/builder` route, composes BlueprintReveal + LumioReplay + PipelineCanvas + WorldSwitcher demo |

### 2.5 `app/marketplace/` Marketplace pillar (Demeter, Eos, Artemis, Coeus)

| Path | Owner | Type | Dep refs | Current usage |
|---|---|---|---|---|
| `app/marketplace/leads/demeter.output.md` | Demeter (Lead) | doc | none | Lead directive |
| `app/marketplace/page.tsx` | Nemea-v1 | scaffold | none | `/marketplace` route |
| `app/marketplace/schema/listing.schema.ts` | Demeter | schema | multi (listing, browse, search) | ListingEntry zod schema |
| `app/marketplace/taxonomy/categories.json` | Demeter | data | single (browse) | Category tree |
| `app/marketplace/listing/SubmissionForm.tsx` | Eos | component | single (marketplace page) | Creator submission wizard |
| `app/marketplace/listing/PreviewCard.tsx` | Eos | component | single (SubmissionForm) | Pre-publish preview |
| `app/marketplace/listing/PublishConfirm.tsx` | Eos | component | single (SubmissionForm) | Final confirm + honest-claim copy |
| `app/marketplace/listing/submission_types.ts` | Eos | schema | multi (SubmissionForm, PreviewCard) | Submission types |
| `app/marketplace/listing/validation.ts` | Eos | logic | single (SubmissionForm) | Zod validation bridge |
| `app/marketplace/listing/draft_store.ts` | Eos | logic | single (SubmissionForm) | LocalStorage draft persistence |
| `app/marketplace/listing/styles.css` | Eos + Harmonia | style | single (SubmissionForm) | Listing UI style |
| `app/marketplace/browse/BrowseCanvas.tsx` | Artemis | component | single (marketplace page) | Grid listing browser |
| `app/marketplace/browse/CategoryNav.tsx` | Artemis | component | single (BrowseCanvas) | Category sidebar |
| `app/marketplace/browse/FeaturedAgents.tsx` | Artemis | component | single (BrowseCanvas) | Featured carousel |
| `app/marketplace/browse/ListingCard.tsx` | Artemis | component | single (BrowseCanvas) | Grid cell |
| `app/marketplace/browse/VendorFilter.tsx` | Artemis | component | single (BrowseCanvas) | Vendor filter dropdown |
| `app/marketplace/browse/types.ts` | Artemis | schema | multi (browse components) | Browse types |
| `app/marketplace/browse/mock_catalog.ts` | Artemis | data | single (BrowseCanvas) | 18 seed listings + DEMO_SEED_NOTICE |
| `app/marketplace/search/SearchBar.tsx` | Coeus | component | single (marketplace page) | Query input |
| `app/marketplace/search/ResultList.tsx` | Coeus + Harmonia | component | single (marketplace page) | Ranked result list |
| `app/marketplace/search/LivingTemplateChat.tsx` | Coeus | component | single (marketplace page) | Living-template customize chat |
| `app/marketplace/search/semantic_embedder.ts` | Coeus | logic | single (SearchBar) | Mock embedder |
| `app/marketplace/search/ranking_weights.json` | Coeus | data | single (semantic_embedder) | Ranking weights |

### 2.6 `app/banking/` Banking pillar (Tyche, Dike, Rhea)

| Path | Owner | Type | Dep refs | Current usage |
|---|---|---|---|---|
| `app/banking/leads/tyche.output.md` | Tyche (Lead) | doc | none | Lead directive |
| `app/banking/page.tsx` | Nemea-v1 | scaffold | none | `/banking` route |
| `app/banking/schema/wallet.schema.ts` | Dike | schema | multi (wallet, stream) | WalletState + TransactionEvent zod |
| `app/banking/pricing/tier_model.json` | Tyche | data | single (meter_contract) | Tier pricing config |
| `app/banking/metering/meter_contract.ts` | Tyche | schema | multi (cost_ticker, LiveCostMeter) | Metering types |
| `app/banking/meter/cost_ticker.ts` | Tyche | logic | single (LiveCostMeter) | Accumulator + dual-locale formatter |
| `app/banking/meter/LiveCostMeter.tsx` | Tyche | component | single (banking page) | Live cost HUD widget |
| `app/banking/wallet/WalletCard.tsx` | Dike | component | single (banking page) | Wallet balance card |
| `app/banking/wallet/EarningsDashboard.tsx` | Dike | component | single (banking page) | Earnings dashboard |
| `app/banking/stream/TransactionPulse.tsx` | Rhea + Harmonia | component | single (banking page) | Live transaction pulse |
| `app/banking/stream/mock_generator.ts` | Rhea | logic | single (TransactionPulse) | Synthetic tx generator |
| `app/banking/stream/mock_pools.json` | Rhea | data | single (mock_generator) | Seed tx pools |
| `app/banking/stream/stream_types.ts` | Rhea | schema | multi (TransactionPulse, mock_generator) | Stream types |

### 2.7 `app/registry/` Registry pillar (Hecate, Phoebe)

| Path | Owner | Type | Dep refs | Current usage |
|---|---|---|---|---|
| `app/registry/leads/hecate.output.md` | Hecate (Lead) | doc | none | Lead directive |
| `app/registry/page.tsx` | Nemea-v1 | scaffold | none | `/registry` route |
| `app/registry/schema/identity.schema.ts` | Hecate | schema | multi (card, trust) | AgentIdentity zod |
| `app/registry/audit/audit_contract.ts` | Hecate | schema | single (AuditTrailExpand) | Audit types |
| `app/registry/trust/trust_formula.ts` | Phoebe | logic | single (IdentityCard) | Trust score computation |
| `app/registry/trust/trust_types.ts` | Phoebe | schema | multi (IdentityCard, trust_formula) | Trust types |
| `app/registry/trust/formula_weights.json` | Phoebe | data | single (trust_formula) | Weight coefficients |
| `app/registry/card/IdentityCard.tsx` | Phoebe | component | single (registry page) | Agent identity card root |
| `app/registry/card/TrustScoreBadge.tsx` | Phoebe | component | single (IdentityCard) | Trust badge sub-component |
| `app/registry/card/AuditTrailExpand.tsx` | Phoebe | component | single (IdentityCard) | Audit trail collapsible |
| `app/registry/card/identity_card_types.ts` | Phoebe | schema | multi (IdentityCard, TrustScoreBadge, AuditTrailExpand) | Card types |

### 2.8 `app/protocol/` Protocol pillar (Proteus, Morpheus, Triton)

| Path | Owner | Type | Dep refs | Current usage |
|---|---|---|---|---|
| `app/protocol/leads/proteus.output.md` | Proteus (Lead) | doc | none | Lead directive |
| `app/protocol/page.tsx` | Nemea-v1 | scaffold | none | `/protocol` route |
| `app/protocol/schema/agent_intent.ts` | Proteus | schema | multi (adapters) | AgentIntent protocol types |
| `app/protocol/adapters/VendorAdapter.ts` | Proteus | schema | multi (anthropic_adapter, gemini_adapter.mock) | Adapter interface |
| `app/protocol/adapters/anthropic_adapter.ts` | Proteus | logic | single (TranslationSplit) | Claude adapter real |
| `app/protocol/adapters/gemini_adapter.mock.ts` | Proteus | logic | single (TranslationSplit) | Gemini serialize-only mock |
| `app/protocol/demo/TranslationSplit.tsx` | Triton | component | single (protocol page) | Side-by-side Claude vs Gemini demo |
| `app/protocol/demo/ClaudePanel.tsx` | Triton | component | single (TranslationSplit) | Claude body panel |
| `app/protocol/demo/GeminiMockPanel.tsx` | Triton | component | single (TranslationSplit) | Gemini mock panel + MOCK badge |
| `app/protocol/demo/translation_demo_types.ts` | Triton | schema | multi (TranslationSplit, panels) | Demo types |
| `app/protocol/demo/styles.css` | Triton + Harmonia | style | single (TranslationSplit) | Demo style |
| `app/protocol/vendor/MultiVendorPanel.tsx` | Morpheus | component | single (protocol page + advisor slot) | 4-mode multi-vendor panel |
| `app/protocol/vendor/HonestAnnotation.tsx` | Morpheus | component | single (MultiVendorPanel) | Honest-claim annotation band |
| `app/protocol/vendor/TaskAssignmentGrid.tsx` | Morpheus | component | single (MultiVendorPanel) | Task-to-vendor grid |
| `app/protocol/vendor/annotation_text.constant.ts` | Morpheus | data | single (HonestAnnotation) | NarasiGhaisan Section 16 literal copy |
| `app/protocol/vendor/vendor_adapter_ui_types.ts` | Morpheus | schema | multi (MultiVendorPanel, TaskAssignmentGrid) | UI types |
| `app/protocol/vendor/styles.css` | Morpheus + Harmonia | style | single (MultiVendorPanel) | Vendor UI style |

### 2.9 `app/shared/` cross-pillar shared

| Path | Owner | Type | Dep refs | Current usage |
|---|---|---|---|---|
| `app/shared/design/tokens.ts` | Harmonia | logic | multi (theme_runtime + Tailwind seed) | OKLCH design tokens source-of-truth |
| `app/shared/design/theme_runtime.ts` | Harmonia | logic | multi (ClientThemeBoot, WorldSwitcher) | `applyWorld()` runtime cascade injector |
| `app/shared/events/pipeline_event.ts` | Athena (core) | schema | central (12 importers: BuilderSpecialistExecutor, AnthropicManagedExecutor, handoff_events, PipelineCanvas, ToolUseTicker, stream_subscriber, cassandra, simulation_event, ConstructionAnimation, LumioReplay, cache_types, viz/types) | Canonical event bus envelope |

---

## 3. `cache/` Dionysus orchestrated bake output

| Path | Owner | Type | Current usage |
|---|---|---|---|
| `cache/lumio_run_2026_04_24.json` | Dionysus | data | Canonical trace: 11 specialists, schema 0.1.0, bake_mode opus_session_synthesis |
| `cache/lumio_final/index.html` | Dionysus (Lumio integrator MA) | asset | Final Lumio landing HTML artifact (37.6 KB) |
| `cache/lumio_final/signup.html` | Dionysus (Lumio integrator MA) | asset | Final Lumio signup HTML artifact (27.1 KB) |
| `cache/lumio_artifacts/lumio_api_builder/main.py` | MA lumio_api_builder | logic | FastAPI entry |
| `cache/lumio_artifacts/lumio_api_builder/routes/read_sessions.py` | MA | logic | Read sessions route |
| `cache/lumio_artifacts/lumio_api_builder/routes/users.py` | MA | logic | Users route |
| `cache/lumio_artifacts/lumio_architect/api_contract.yaml` | MA architect | schema | OpenAPI contract |
| `cache/lumio_artifacts/lumio_architect/component_tree.md` | MA architect | doc | Component tree plan |
| `cache/lumio_artifacts/lumio_architect/system_overview.md` | MA architect | doc | System overview |
| `cache/lumio_artifacts/lumio_asset_designer/favicon.svg` | MA asset_designer | asset | Favicon |
| `cache/lumio_artifacts/lumio_asset_designer/hero_illustration.svg` | MA asset_designer | asset | Hero illo |
| `cache/lumio_artifacts/lumio_asset_designer/logo.svg` | MA asset_designer | asset | Logo |
| `cache/lumio_artifacts/lumio_copywriter/feature_descriptions.md` | MA copywriter | doc | Feature copy |
| `cache/lumio_artifacts/lumio_copywriter/headline_variants.md` | MA copywriter | doc | Headline variants |
| `cache/lumio_artifacts/lumio_copywriter/pricing_labels.md` | MA copywriter | doc | Pricing labels |
| `cache/lumio_artifacts/lumio_db_schema/migrations/0001_init.sql` | MA db_schema | schema | Init migration |
| `cache/lumio_artifacts/lumio_db_schema/schema.sql` | MA db_schema | schema | Full schema |
| `cache/lumio_artifacts/lumio_deployer/deploy_plan.md` | MA deployer | doc | Deploy plan |
| `cache/lumio_artifacts/lumio_deployer/env_requirements.md` | MA deployer | doc | Env req |
| `cache/lumio_artifacts/lumio_final_strategist/go_to_market_brief.md` | MA final_strategist | doc | GTM brief |
| `cache/lumio_artifacts/lumio_final_strategist/post_launch_monitor_checklist.md` | MA final_strategist | doc | Monitor checklist |
| `cache/lumio_artifacts/lumio_integration_engineer/build_log.md` | MA integration_engineer | doc | Build log |
| `cache/lumio_artifacts/lumio_integration_engineer/pr_url.txt` | MA integration_engineer | doc | PR URL placeholder |
| `cache/lumio_artifacts/lumio_integration_engineer/test_results.json` | MA integration_engineer | data | Test results |
| `cache/lumio_artifacts/lumio_qa_reviewer/a11y_findings.md` | MA qa_reviewer | doc | A11y findings |
| `cache/lumio_artifacts/lumio_qa_reviewer/review_report.md` | MA qa_reviewer | doc | Review report |
| `cache/lumio_artifacts/lumio_strategist/product_brief.md` | MA strategist | doc | Product brief |
| `cache/lumio_artifacts/lumio_strategist/user_personas.md` | MA strategist | doc | User personas |
| `cache/lumio_artifacts/lumio_ui_builder/feature_grid.tsx` | MA ui_builder | component | Feature grid TSX |
| `cache/lumio_artifacts/lumio_ui_builder/hero.tsx` | MA ui_builder | component | Hero TSX |
| `cache/lumio_artifacts/lumio_ui_builder/layout.tsx` | MA ui_builder | component | Layout TSX |
| `cache/lumio_artifacts/lumio_ui_builder/page.tsx` | MA ui_builder | component | Page TSX |
| `cache/lumio_artifacts/lumio_ui_builder/pricing.tsx` | MA ui_builder | component | Pricing TSX |

---

## 4. `docs/contracts/` Pythia modular contracts v0.1.0

All 32 contracts authored by Pythia P0, passed Nemea-v1 conformance sweep, referenced by name throughout codebase via "Conforms to:" headers. Single authoritative source for every cross-agent surface.

| Path | Dep refs |
|---|---|
| `docs/contracts/advisor_interaction.contract.md` | multi (apollo, AdvisorChat) |
| `docs/contracts/advisor_ui.contract.md` | multi (AdvisorChat, ModelStrategySelector, PredictionWarning) |
| `docs/contracts/agent_identity.contract.md` | single (identity.schema) |
| `docs/contracts/agent_intent.contract.md` | multi (protocol adapters) |
| `docs/contracts/billing_meter.contract.md` | single (meter_contract) |
| `docs/contracts/blueprint_moment.contract.md` | multi (BlueprintReveal, fixtures, narration) |
| `docs/contracts/browse_ui.contract.md` | single (BrowseCanvas) |
| `docs/contracts/builder_specialist_executor.contract.md` | central (BuilderSpecialistExecutor + all executors) |
| `docs/contracts/cost_meter.contract.md` | single (cost_ticker) |
| `docs/contracts/design_tokens.contract.md` | central (tokens, theme_runtime, globals) |
| `docs/contracts/event_bus.contract.md` | central (pipeline_event + 12 importers) |
| `docs/contracts/identity_card.contract.md` | multi (IdentityCard, TrustScoreBadge, AuditTrailExpand) |
| `docs/contracts/listing_submission.contract.md` | multi (SubmissionForm, PreviewCard, PublishConfirm, validation) |
| `docs/contracts/living_template_customize.contract.md` | single (LivingTemplateChat) |
| `docs/contracts/lumio_demo_cache.contract.md` | multi (LumioReplay, cache_types, cache/lumio_run) |
| `docs/contracts/managed_agent_executor.contract.md` | multi (AnthropicManagedExecutor, ma_*) |
| `docs/contracts/marketplace_listing.contract.md` | multi (listing.schema, mock_catalog) |
| `docs/contracts/pillar_lead_handoff.contract.md` | single (apollo + Lead outputs) |
| `docs/contracts/pipeline_visualizer.contract.md` | multi (PipelineCanvas, AgentNode, HandoffEdge, ToolUseTicker, MAConsoleDeepLink) |
| `docs/contracts/prediction_layer_surface.contract.md` | multi (PredictionWarning, cassandra, simulation_event) |
| `docs/contracts/protocol_adapter.contract.md` | multi (VendorAdapter, anthropic_adapter, gemini_adapter.mock) |
| `docs/contracts/search_ranking.contract.md` | single (semantic_embedder) |
| `docs/contracts/search_ui.contract.md` | multi (SearchBar, ResultList) |
| `docs/contracts/simulation_event.contract.md` | single (simulation_event) |
| `docs/contracts/sprite_atlas.contract.md` | multi (SpriteAtlasRegistry, per-world atlas.ts) |
| `docs/contracts/transaction_event.contract.md` | single (wallet.schema) |
| `docs/contracts/transaction_stream.contract.md` | multi (TransactionPulse, mock_generator, stream_types) |
| `docs/contracts/translation_demo.contract.md` | multi (TranslationSplit, panels) |
| `docs/contracts/trust_score.contract.md` | multi (trust_formula, trust_types) |
| `docs/contracts/vendor_adapter_ui.contract.md` | multi (MultiVendorPanel, TaskAssignmentGrid, HonestAnnotation) |
| `docs/contracts/wallet_ui.contract.md` | multi (WalletCard, EarningsDashboard) |
| `docs/contracts/world_aesthetic.contract.md` | multi (WorldAestheticRegistry, per-world descriptor) |

---

## 5. `public/` static assets

| Path | Owner | Type | Current usage |
|---|---|---|---|
| `public/assets/attributions.md` | Thalia | doc | CC0 pack attribution |
| `public/assets/worlds/cyberpunk_shanghai/atlas.png` | Thalia | asset | Harmonia-polished 32x32 atlas |
| `public/assets/worlds/medieval_desert/atlas.png` | Thalia | asset | Harmonia-polished 32x32 atlas |
| `public/assets/worlds/steampunk_victorian/atlas.png` | Thalia | asset | Harmonia-polished 32x32 atlas |
| `public/cache/lumio_run_2026_04_24.json` | Nemea-v1 (Critical Fix 1.3) | data | Static-servable copy of trace |

---

## 6. Root configuration and ephemera

| Path | Owner | Type | Current usage |
|---|---|---|---|
| `package.json` | Athena (scaffold) | config | Next.js 15 + Tailwind v4 + deps |
| `package-lock.json` | npm | config | Lockfile |
| `tsconfig.json` | Athena | config | TypeScript compiler config |
| `next-env.d.ts` | Next.js (auto) | config | Next.js type shims |
| `postcss.config.mjs` | Nemea-v1 (Critical Fix 1.2) | config | PostCSS + @tailwindcss/postcss wiring |
| `.gitignore` | Athena | config | Ignore patterns |
| `README.md` | Athena (scaffold, pre-hackathon polish pending) | doc | Public intro |
| `LICENSE` | Ghaisan | doc | MIT |
| `CLAUDE.md` | Ghaisan (root context) | doc | Root context, hackathon instructions |
| `nemea_home.png` | Nemea-v1 | asset | Visual QA screenshot `/` |
| `nemea_advisor.png` | Nemea-v1 | asset | Visual QA screenshot `/advisor` |
| `nemea_banking.png` | Nemea-v1 | asset | Visual QA screenshot `/banking` |
| `nemea_builder_cyberpunk.png` | Nemea-v1 | asset | Visual QA screenshot cyberpunk |
| `nemea_builder_medieval.png` | Nemea-v1 | asset | Visual QA screenshot medieval |
| `nemea_builder_steampunk.png` | Nemea-v1 | asset | Visual QA screenshot steampunk |
| `nemea_marketplace.png` | Nemea-v1 | asset | Visual QA screenshot `/marketplace` |
| `nemea_protocol.png` | Nemea-v1 | asset | Visual QA screenshot `/protocol` |
| `nemea_registry.png` | Nemea-v1 | asset | Visual QA screenshot `/registry` |

---

## 7. `scripts/` build utilities

| Path | Owner | Type | Current usage |
|---|---|---|---|
| `scripts/build_lumio_cache.mjs` | Dionysus | logic | Orchestrates MA-powered Lumio bake, writes cache/ output |
| `scripts/build_world_atlases.mjs` | Thalia | logic | Builds 3-world sprite atlases (Pixi.js style) |
| `scripts/submit_ma_research_preview_form.md` | Heracles (Ghaisan run) | doc | Research-preview access form submission notes |

---

## 8. `.claude/agents/` V3 product-side prompt files

All 22 agent prompt files authored by Hephaestus P0. Defines hard constraints, mandatory reading, halt triggers, self-check per agent.

| Path | Pillar |
|---|---|
| `.claude/agents/apollo.md` | Advisor |
| `.claude/agents/artemis.md` | Marketplace (Browse) |
| `.claude/agents/athena.md` | Builder (Lead) |
| `.claude/agents/cassandra.md` | Builder (Prediction) |
| `.claude/agents/coeus.md` | Marketplace (Search) |
| `.claude/agents/demeter.md` | Marketplace (Lead) |
| `.claude/agents/dike.md` | Banking (Wallet) |
| `.claude/agents/dionysus.md` | Builder (Lumio cache) |
| `.claude/agents/eos.md` | Marketplace (Listing) |
| `.claude/agents/erato.md` | Advisor (UI) |
| `.claude/agents/harmonia.md` | Cross-pillar polish |
| `.claude/agents/hecate.md` | Registry (Lead) |
| `.claude/agents/helios.md` | Builder (Pipeline viz) |
| `.claude/agents/heracles.md` | Builder (MA integration) |
| `.claude/agents/morpheus.md` | Protocol (Multi-vendor panel) |
| `.claude/agents/phoebe.md` | Registry (Card + Trust) |
| `.claude/agents/proteus.md` | Protocol (Lead) |
| `.claude/agents/rhea.md` | Banking (Stream) |
| `.claude/agents/thalia.md` | Builder (Worlds) |
| `.claude/agents/triton.md` | Protocol (Demo split) |
| `.claude/agents/tyche.md` | Banking (Lead + Meter) |
| `.claude/agents/urania.md` | Builder (Blueprint Moment) |

---

## 9. `.playwright-mcp/` transient session artifacts

Nemea-v1 Playwright session captures, generated during visual QA pass 2026-04-22 13:33 UTC. Not committed as canonical artifacts; transient.

14 files total: 7 `console-*.log`, 7 `page-*.yml`. Identifier path examples:
- `.playwright-mcp/console-2026-04-22T13-33-05-879Z.log`
- `.playwright-mcp/page-2026-04-22T13-33-06-462Z.yml`

---

## 10. Orchestration and planning artifacts

### 10.1 `_meta/`

| Path | Owner | Type | Current usage |
|---|---|---|---|
| `_meta/NarasiGhaisan.md` | V2 | doc | Voice anchor, mandatory reading |
| `_meta/HACKATHON_HANDOFF_V1_TO_V2.md` | V1 | doc | V1 to V2 handoff |
| `_meta/HACKATHON_HANDOFF_V2_TO_V3.md` | V2 | doc | V2 to V3 handoff |
| `_meta/HACKATHON_HANDOFF_V3_TO_V4.md` | V3 | doc | V3 to V4 handoff (per recent commit) |
| `_meta/METIS_KICKOFF.md` | V3 | doc | Metis kickoff prompt reference |
| `_meta/RV_PLAN.md` | V4 | doc | RV master plan |
| `_meta/RV_AgentPromptOpening.md` | V4 | doc | RV batch opening prompts |
| `_meta/RV_FileManifest.md` | V4 | doc | RV file manifest |
| `_meta/RV_METIS_v2_KICKOFF.md` | V4 | doc | Metis-v2 kickoff |
| `_meta/reference/` | V2 | doc folder | Pre-hackathon NERIUM source material (aesthetic reference only) |
| `_meta/orchestration_log/day_0.md`, `day_1.md`, `day_2.md` | Ananke | doc | Daily orchestration logs |

### 10.2 `docs/phase_0/`

| Path | Owner | Type | Current usage |
|---|---|---|---|
| `docs/phase_0/MANAGED_AGENTS_RESEARCH.md` | Metis P0 | doc | MA research M1 |
| `docs/phase_0/NERIUM_AGENT_STRUCTURE.md` | Metis P0 | doc | 22 product-side agent spec M2 |
| `docs/phase_0/agent_flow_diagram.html` | Metis P0 | asset | Visual M3 |

### 10.3 `docs/phase_rv/`

| Path | Owner | Type | Current usage |
|---|---|---|---|
| `docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md` | Metis-v2 | doc | RV MA M1 |
| `docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md` | Metis-v2 | doc | RV agent structure M2 (authoritative for RV, seed matrix in Section 7) |
| `docs/phase_rv/P0_ARTIFACT_INVENTORY.md` | Talos-translator | doc | This file |
| `docs/phase_rv/REUSE_REWRITE_MATRIX.md` | Talos-translator | doc | Authoritative per-artifact decisions |

### 10.4 `docs/qa/`

| Path | Owner | Type | Current usage |
|---|---|---|---|
| `docs/qa/nemea_final_qa.md` | Nemea-v1 | doc | QA verdict READY + 3 fixes + 9 screenshot references |

---

## 11. Ownership rollup

| Agent | Primary artifact count | Type mix |
|---|---:|---|
| Apollo | 4 | logic core + config |
| Erato (Advisor UI) | 4 | components + style |
| Athena | 9 | executor logic + topology + lead output + shared pipeline_event (co-owner) |
| Heracles | 6 | MA executor + spawner + bridge + agent defs |
| Cassandra | 5 | prediction logic + schema |
| Helios | 8 | viz components + logic |
| Urania | 6 | blueprint reveal + narration + fixtures |
| Dionysus | 2 | lumio replay + cache types (plus 31 cache/ artifacts) |
| Thalia | 23 | worlds registry + 3x per-world atlas + construction anim + switcher |
| Eos | 7 | listing form + preview + publish + types + validation + draft + style |
| Artemis | 7 | browse components + types + mock catalog |
| Coeus | 5 | search components + embedder + weights |
| Demeter | 3 | lead output + schema + categories |
| Tyche | 5 | lead output + pricing + meter contract + cost_ticker + LiveCostMeter |
| Dike | 3 | wallet components + schema |
| Rhea | 4 | stream components + mock generator + pools + types |
| Hecate | 3 | lead output + schema + audit |
| Phoebe | 7 | card components + trust logic |
| Proteus | 5 | lead output + schema + adapter interface + 2 adapters |
| Morpheus | 6 | vendor panel components + types + style + annotation literal |
| Triton | 5 | demo split components + types + style |
| Harmonia (post-polish) | 3 | tokens + theme_runtime (co-owner) + globals.css seed |
| Nemea-v1 (emergency harness) | 13 | layout + page + harness wrappers + per-pillar page.tsx + postcss + globals.css + public cache copy |

---

## 12. Halt triggers encountered

None. Artifact count 165 primary + 93 orchestration = 258 total, digestible within single-session capacity.

---

## 13. Handoff pointers

- Authoritative decisions in `REUSE_REWRITE_MATRIX.md` (this file feeds it, matrix supersedes M2 Section 7 seed)
- Translator gotchas in `_meta/translator_notes.md`
- Optional ported components land under `src/components/hud/ported/` (ApolloStream, HeliosPipelineViz, CassandraPrediction) for Erato-v2 consume

---

**End of P0_ARTIFACT_INVENTORY.md**
