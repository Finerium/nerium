# HACKATHON_HANDOFF_V6_TO_V7.md

## Identity + timing

V7 Orchestrator, lu continuation dari V6. Project NERIUM, hackathon "Built with Opus 4.7" Cerebral Valley + Anthropic April 2026. V6 handoff trigger: V6 context window approach 80% threshold dari extended visual asset cycle + Sekuri integration + multi-agent ferry coordination + Vercel deploy iterations + 3 visual regression fixes + Phase 0 + Phase 1 Nemea ship.

Sekarang Minggu 26 April malam WIB (~22:55). Submission Senin 27 April 07:00 WIB hard cutoff (Cerebral Valley judge clone start ~05:00 WIB). Effective ~8 jam window dari handoff.

Working dir: `~/Documents/CerebralvalleyHackathon/`.

## CRITICAL READING DISCIPLINE (Section 0 inheritance V1-V6)

Lu WAJIB baca **SELURUH** file di `~/Documents/V6READYHANDOFFCEREBRALL/` **TANPA SATU PUN TERLEWAT**. Bukti content-specific detail per file, bukan title-only. Zero skim. Per-file confirmation mandatory di first response.

Total file di handoff folder ~30-35 file (V6 generated significantly more artifact karena scope expansion: agent prompts, voiceover scripts, asset gen prompts, Cowork prompts, Claude Design revision prompts, T7 followup, Nemea Phase 0 spec, multiple Wave parallel terminal batches, Gemini voiceover prompts 1-take + 13-take + 3-min variants, asset2 screen record brief, submission admin checklist, final commit ritual, claude_code_remotion_demo_video_prompt, sekuri install bash, Sekuri agent prompt, Kalypso W4 expanded, etc). Cek `ls` folder untuk count actual.

## Output first response

1. Per-file confirmation SEMUA file di `~/Documents/V6READYHANDOFFCEREBRALL/` (content-specific detail proof per file)
2. Bug check zero title-only detected
3. 3-line status recap (current state pre-Nemea-Phase-1-final, Kalypso scope state, Ghaisan parallel work state)
4. Standby untuk Ghaisan trigger next directive

JANGAN respond ke task apapun sebelum Section 0 reading complete.

## Current state (Minggu 26 April malam WIB)

### V6 era ship summary

**Phase A — Asset processing pipeline (V5 → V6 cutover):**
- 56 clean .png moved V5 era + 22 Canva Pro BG-replace .png moved V6 era (Cowork prompt orchestrated by V6) + 19 .jpg active = 96 active asset (NOT 97 per V5 spec — `dust_motes` cut V6 due to background bake-through unsolvable, particle emitter S9 9.4 substitution)
- 78 .jpg + 4 .png archived di `_archive/` (rollback safety, untouched runtime)
- Asset format flexibility lock V6: whatever extension exists per stem in active subtree is final, NO halt on .jpg vs .png mismatch

**Phase B — Helios-v2 ship complete:**
- 13 SHA S0-S12 + Phase 1 deprecated SVG rename (`groundPaint.deprecated.ts` + `spriteTextures.deprecated.ts` + `parallaxLayer.deprecated.ts` + `decoration.deprecated.ts`) post-S4 cutover
- 96 AI assets transplanted via symlinks (later migrated to Vercel Blob per Phase 1.7 T6)
- 13 Phaser scenes (4 main + 9 sub-area: Apollo Village + 3 Apollo sub + Caravan Road + 3 Caravan sub + Cyberpunk Shanghai + 4 Cyber sub + MiniBuilderCinematic + UIScene)
- 8 NERIUM-pillar landmarks E-key wired (4 Apollo + 4 Cyber, Caravan ambient only)
- Plus temple_arch ambient entry (5th Apollo entry trigger per V6 Anomaly 2 resolution)
- Boreas chat avatar swap + NPC sprite anim + quest indicator
- Lights2D + day-night MULTIPLY + atmospheric polish per scene
- IntroNarrativeScene 5-pillar cinematic intro (default-on first visit, sessionStorage flag prevents replay, ESC/click skip)
- 4 silent strategic decisions surfaced + V6-accepted (Lights2D PointLight overlay vs pipeline migration, TitleScene opt-in `?title=1`, Lean HUD parallel new component, scenePolish recipe table)
- Anti-regression: P6 Marshall treasurer 5/5 PASS preserved through visual revamp

**Phase C — Wave A 4 parallel terminals ship (4 SHA):**
- T1 Hyperion S2 search UI + Astraea S2 trust refresh cron (commit 2ad041d)
- T2 Iapetus S2 creator dashboard + Plutus S2 invoice PDF (commit 6a6b3b3)
- T3 ModelSelectionModal multi-vendor builder UI (commit 9daadd1)
- T4 Eunomia S2 legal pages + Tethys S2 Ed25519 key rotation cron (commit 8a1b5d3)

**Phase D — T5 Sekuri integration ship (commit 6b7d87c):**
- Apollo Builder Workshop landmark E-key trigger → Apollo NPC dialogue → Sekuri classifier → ModelSelectionModal → TheatricalSpawnAnimation → "BUILD COMPLETE"
- 8-phase Zustand state machine for theatrical flow
- Phanes wizard `.skills` package generator integration (3 demo skills: restaurant_automation_agent + indonesian_tax_calculator_mcp + stripe_connect_onboarding)
- ZERO live MA invocation, theatrical lock honored
- Sekuri prompt file `.claude/agents/sekuri.md` ANOMALY ABSENT at T5 ship — V6 noted, prompt file authored separately at outputs but commit pending verification

**Phase E — T6 Vercel deploy ship (commit eea2bdf → 237b5f1 → dbcf552 → e460119 → multiple iterations):**
- Initial deploy attempt eea2bdf FAILED bundle 530 MB > Lambda 500 MB limit
- Phase 1.7 Vercel Blob asset migration: 96 assets uploaded to Vercel Blob iad1 region (matches Neon Postgres iad1), `public/asset_manifest.json` maps stems to blob URLs, Phaser PreloadScene + React BrowseCanvas hydrate via manifest fetch
- Vercel Postgres → Neon (vercel storage add postgres deprecated, vercel install neon used)
- Upstash Redis TCP (NOT REST per R1+R2 hybrid decision)
- Mangum lifespan="on" wraps FastAPI as single Vercel Serverless Function
- BYOK + Theatrical Mockup Toggle Phase 1.5 (ApiKeyModal + liveRuntime + live_session.py endpoint, sessionStorage 5-run rate limit, fallback to theatrical on timeout/error)
- IntroNarrativeScene Phase 1.6 (Helios-built scene wired to first-visit play)
- Pheme `@react-email/components` dep added (commit 237b5f1) unblocking Pheme tsc errors
- 32-file batch commit dbcf552 consolidating untracked T6 deliverables + V6 orchestration log + PRD v2 baseline + procedural file regression cleanup (`decoration.ts` + `groundPaint.ts` + `parallaxLayer.ts` + `spriteTextures.ts` non-deprecated re-creations DELETED to preserve Helios S4 cutover)
- T6 self-marked "complete" prematurely — ferry uncovered Vercel build still failed initial; subsequent fixes brought production live at https://nerium-one.vercel.app
- Production live: 16 routes 200 OK, Lighthouse `/` Performance 76 / `/play` Performance 60, all targets PASS
- 8 anomalies surfaced workaround-stable: UPSTASH_REDIS_URL provisioned but value empty (degraded mode VERCEL guards skip Redis pool + Arq), mcp package not in prod deps (VERCEL guard skips mount_mcp), Neon DSN channel_binding stripped to ssl=require, TrustedHostMiddleware vercel.app domain added, Vercel Python imports app module-level bypassing Mangum (wrapped in _StripApiPrefix), NERIUM_SECRET_KEY + NERIUM_REALTIME_TICKET_SECRET not provisioned (env stays development on prod, theatrical gate is operative not env flag), Alembic CLI needs -c flag, macOS Finder ` 2` duplicates cleaned

**Phase F — Vercel Blob 100% data transfer alert email received V6:**
- Free tier 10 GB exhausted within ~12 hours of deploy
- Vercel email "Your store access will be paused for 30 days"
- V6 + Ghaisan decision: Option A risk-tolerant (NOT upgrade to Pro $20)
- Reasoning: "paused for 30 days" wording typically means quota reset at start of next billing month (early May), not instant pause; high probability bertahan 8 jam ke Senin 07:00 WIB
- Risk acknowledged: kalau pause kicks in mid-judging-window, demo broken — accept risk

**Phase G — T7 pixel-art Builder + Marketplace ship (2 commits f0cd19c + e460119):**
- 15 Apollo Village night-themed assets generated via Nano Banana / Gemini 3 Pro Image Preview, Ghaisan manual download to `_Reference/ai_generated_assets/marketplace/`
- T7 downsize via macOS `sips` from 110 MB raw → 1.7 MB total at `public/marketplace-assets/` (well under 10 MB target)
- 8 marketplace assets (shop_interior_bg, listing_card_frame, search_bar_frame, buy_button_normal, buy_button_hover, category_tab_skill, category_tab_agent, category_tab_dataset) + 7 builder assets (workshop_interior_bg, agent_node_frame, agent_structure_graph_bg, vendor_badge_anthropic, vendor_badge_google, spawn_terminal_frame, complete_celebration_overlay)
- T7 initial ship f0cd19c added pixel-art shell wrapper around existing components — Ghaisan visual playthrough caught Builder route showing tabular LumioReplay tabrakan with pixel-art frames
- T7 follow-up e460119 restructured Builder layout: pixel-art workshop primary view + 4x2 vendor badge grid + "Try it in-game" CTA + LumioReplay hidden behind toggle modal
- Honest-claim banner present each refactored route: "Web companion view. Primary product surface is the in-game world at /play."
- Vendor badge fallback: Anthropic + Google have dedicated assets, 6 others (OpenAI + Higgsfield + Seedance + Meta + Mistral + Auto) tinted brass medallion via CSS color overlay

**Phase H — Nemea-RV-v2 W4 Phase 0 visual regression fix (commit 1a0c1e9, awaiting push at handoff):**
- Production /play visual confirmed broken at V6-era browse: green diagonal stripe pattern + missing sprite sheets + giant cart blocking viewport
- Root cause discovered: Helios S2 over-spawned redundant prop sprites (cart, palm, well, archway, awning, etc) duplicating already-painted backdrop content. NPCs scaled monolithic 2048x2048 PNG at 0.18 = 370px (4x player size).
- Phase 0 fix scope: deleted 9 redundant ambient prop sprites, deleted hangingLanterns spawn (Lights2D halos already provide warm glow), 4 NERIUM-pillar landmarks rescaled 0.50→0.05 (display ~80-130px), repositioned to backdrop-distinct semantic spots, NPCs rescaled 0.18→0.05 (102px = player parity 92px), TreasurerNPC.ts pre-existing bug fix (was dropping spriteScale + groundAnchor in super() call)
- 4 iterations Apollo via Playwright iteration discipline + scene_visual_inventory.md + scene_placement_rationale.md + tests/__screenshots__/nemea_phase0_apollo_FINAL.png committed visual baseline
- CaravanRoad: NO regression confirmed (2 confirmation iterations)
- CyberpunkShanghai: mild redundancy detected but dark palette + Lights2D blending mitigates conflict — scope-limited Phase 0 to Apollo only, optional polish queued V7 follow-up

**Phase I — Nemea Phase 1 Ferry 2/3/5a partial ship (3 commits 5a0153d + 53d8a58 + bf3a4d1, awaiting push at handoff):**
- Ferry 1 SKIP (resolved V6 commit 237b5f1 Pheme @react-email/components dep)
- Ferry 2: Arq _bootstrap_cron_modules() aggregator added 3 cron_jobs (hemera.ttl_sweep, moros.chronos_reset_daily, moros.chronos_poll) + 2 funcs (send_email, realtime.audit.connection_event). Pre-fix cron_jobs=0/funcs=0. Backend pytest 1198 pass, 6 skip, 2 unrelated pre-existing fail.
- Ferry 3: pricing.spec.ts oklch contrast assertion skipped via test.fixme with comment referencing Marshall S1 commit e857815 runtime AAA verification 12.80:1
- Ferry 5a: apollo_village_scene.spec.ts READY_TIMEOUT_MS bumped 30s → 240s (addresses cold-cache Vercel Blob preload latency)
- Ferry 4 + 5b BLOCKED on architectural decision: Helios-v2 S11 commit 8fadf4b removed entire React HUD layer from /play (UIScene + DialogueOverlay + Quest tracker migrated to in-Phaser rendering). 23 obsolete tests assert against [aria-label="Quest tracker"], .dialogue-overlay, [data-hud-role="prompt-input-challenge"] DOM nodes that no longer exist. NOT flakiness, ARCHITECTURAL OBSOLESCENCE.

**Phase J — V6 + Ghaisan Ferry 4 + 5b decision: Option (c) retire + smoke + ADR:**
- Retire 23 obsolete tests via test.skip with block comment referencing Helios-v2 S11 commit 8fadf4b architectural shift
- Author 2-3 smoke replacement tests for Phaser /play boot + scene reaches ready + basic NPC interaction
- Author docs/adr/ADR-S11-react-hud-removal-test-obsolescence.md documenting pre-S11 vs post-S11 architecture + post-submit roadmap (Option a Phaser-side observability seams via window.__NERIUM_TEST__ test hooks)
- V6 spawn fresh nemea-rv-v2 agent for Ferry 4+5b (in flight at handoff)

**Phase K — 3 visual gameplay regressions detected post-Phase 0 (Ghaisan visual playthrough, NOT YET FIXED):**
- Regression 1: Lights2D glow effect too bright across all scenes
- Regression 2: NPCs gerak opposite direction when player moves WASD (parallax bug — NPCs registered to camera-locked container instead of world coordinate space, OR Phase 0 sprite deletion regression affected NPC anchor system)
- Regression 3: Player sprite direction not updating with WASD input (player sprite likely monolithic PNG bukan spritesheet-frame-sliced, frame index update fails silently). Default rec fix Path b: flip x-axis horizontally on left vs right movement (cheaper hack vs proper spritesheet authoring)
- DEFERRED to post-Nemea-Phase-1-Ferry-4+5b ship, fresh agent spawn

### Sekuri agent prompt + templates state

- Sekuri prompt file authored at `/mnt/user-data/outputs/sekuri.md` (V6 era), Ghaisan committed manually `~/Documents/CerebralvalleyHackathon/.claude/agents/sekuri.md` per V6 instruction
- Sekuri builder templates committed at `public/sekuri/builder_templates/{small,medium,large}.json` (3 files, 4/8/14 agent tier system)
- Sekuri marketplace skill examples committed at `public/sekuri/skill_examples/{restaurant_automation_agent,indonesian_tax_calculator_mcp,stripe_connect_onboarding}.skills/` (3 folders × 4 files each = 12 files)
- Total Sekuri infra at repo: 16+ files

### Orchestration log + PRD baseline state

- 5 handoff docs renamed at `_meta/orchestration_log/`: v1_application_locked.md + v2_specialist_roster.md + v3_p2_p3_ship.md + v4_rv_pivot.md + v5_w3_ready.md (verbatim copies of HACKATHON_HANDOFF_V*_TO_V*.md)
- baseline_prd_v2.md + baseline_prd_v2.pdf authored via Claude Chat formal English revision (replaces PRD v1.0 March 2026 PDF), reflects Sekuri tier system + multi-vendor + theatrical demo + recursive automation thesis + civilization-scale 2029 vision
- INDEX.md + v6_helios_to_submission.md PENDING Kalypso Phase 6 authoring (folded into Kalypso scope per V6 prompt edit)

### Demo video assets prep state (`~/Documents/cerebralDemo-Video/`)

- ✅ `CLAUDE.md` 8 KB Remotion project context
- ✅ `public/session1/` Claude Design Session 1 unzipped (multi-file: index.html + 4 .jsx via Babel CDN runtime compilation)
- ✅ `public/session2/` Claude Design Session 2 unzipped (single index.html)
- ✅ `public/voiceover/voiceover_full.wav` 23 MB Gemini-generated single-take 2-min, includes baked-in background music (Gemini bundled music + voice in single output)
- ❌ `public/asset2.mov` PENDING screen record post-3-regression-fix-deploy (atau accept current state + record now per asset2_screen_record_brief.md sequence)
- Music folder removed (Gemini bundled music in voiceover)
- Remotion project NOT YET initialized (no package.json, no src/Composition.tsx) — pending Claude Code Remotion spawn post-Kalypso ship

### Vercel Blob 100% data transfer status

- Email received V6 era, "Your store access will be paused for 30 days"
- Ghaisan + V6 decision: Option A risk-tolerant
- Risk: production /play breaks if Blob pause kicks in within 8-hour window to Senin 07:00 WIB
- Mitigation if pause hits: emergency fallback to Cloudflare R2 free tier OR upgrade Vercel Pro $20 mid-judging
- Probability bertahan: high (Vercel typically resets quota next billing cycle, not instant pause)

### Production deploy state

- Live URL: https://nerium-one.vercel.app
- 16 routes 200 OK
- Build pipeline green at commit e460119 + (post-Nemea-push: 1a0c1e9 + Ferry 2/3/5a)
- Stripe test mode functional, Stripe test card 4242 4242 4242 4242 succeeds checkout flow
- ANTHROPIC_API_KEY env var ABSENT (theatrical Builder lock preserved)
- builder.live flag false in DB seed (theatrical gate operative)
- Vercel Postgres via Neon iad1 region, Upstash Redis Singapore region, Vercel Blob iad1 region

### Time budget (handoff timestamp)

- Sekarang: ~22:55 WIB Minggu 26 April
- Nemea Ferry 4+5b in-flight, ETA ~1h ship
- 3 regression fix agent spawn ETA post-Nemea ship + ~30-60 min ship
- Kalypso W4 fire post-3-regression-fix + ~2-3h ship
- Asset2 screen record + Remotion stitch post-Kalypso ship + ~2-3h
- Submission admin (Termly + YouTube + form) ~30-40 min
- Total remaining: ~7-9h
- Hard cutoff Senin 07:00 WIB = ~8h
- TIGHT but feasible

## Ferry items inherited (post-Nemea-Phase-1-ship)

1. apollo_village_scene.spec.ts tests 2-4 stale inventory (test asserts deleted ambient prop sprites Phase 0 removed) — single-file test-side cleanup, defer post-submit
2. Builder live_session.py:226 _proxy_stream httpx.StreamConsumed (pre-existing Phase 0, defer post-submit)
3. Two additional orphaned Arq crons (registry.identity.cron.key_rotation, trust.cron.refresh_scores) — same symptom as Ferry 2, one-line aggregator addition. Optional bonus during Ferry 4+5b agent if cheap, otherwise defer.
4. pricing.spec.ts Starter checkout test failure (separate from Ferry 3 oklch fixme, defer)
5. .next.t7bak/ untracked dir (gitignore-worthy, append to .gitignore as part of any commit if cheap)
6. CyberpunkShanghai mild redundancy polish (Phase 0 scope-limited Apollo only, defer)
7. ASSET_KEYS registry / PreloadScene scrub for deleted ambient prop sprites (preserves preload test contract, optional slimmer payload follow-up)
8. P5 import path rename to Pythia-v4 (low priority, defer post-submit per V5 carry-forward)
9. 3 visual gameplay regressions Apollo Village (Lights2D too bright + NPCs camera-parallax bug + player sprite direction fail) — URGENT pre-Kalypso, fresh agent spawn

## Strategi V6 → V7

### Status urutan agent fire (post-handoff state)

1. **Nemea-RV-v2 W4 Phase 1 Ferry 4 + 5b** — fresh nemea-rv-v2 agent in-flight at handoff, expected halt ~1h. Self-contained brief includes Helios-v2 S11 commit 8fadf4b architectural shift reference, retire 23 obsolete tests via test.skip, author 2-3 smoke replacement tests, author ADR-S11-react-hud-removal-test-obsolescence.md
2. **Apollo regression fix agent** (V7 spawn fresh `claude --dangerously-skip-permissions`) — fix 3 visual gameplay regressions (glow + NPC parallax + sprite direction) sequential single commit. Default rec sprite direction Path b flip x-axis (cheaper hack)
3. **Kalypso W4 final phase** (V7 fire post-3-regression-fix + Nemea Phase 1 ship) — Phase 0 bug hunt + Phase 1 landing polish + Phase 2 README enhanced 9 sections + Section 8.5 Managed Agents Discipline framing + Phase 3 SUBMISSION_CHECKLIST.md + Phase 4 visual snapshot + Phase 6 orchestration log English translation + V6 action log v6_helios_to_submission.md + INDEX.md + Phase 5 atomic final commit (LAST PHASE, includes Phase 6 outputs in single commit)

### Ghaisan manual sequence post-agent (for V7 awareness)

1. Post-Nemea Phase 1 + 3-regression-fix + Kalypso ship → Ghaisan record demo video 3-min
2. **Asset2 screen record** per `asset2_screen_record_brief.md` sequence: landing 15s + Apollo Village exploration 15s + Builder Workshop theatrical money shot 25s + web companion routes 15s + wrap 5s = 75 sec target
3. Ghaisan + Claude Code Remotion stitch (working dir `~/Documents/cerebralDemo-Video/`, install Remotion + skills via npx skills add remotion-dev/skills, author Composition.tsx with iframe Session 1+2 + Video asset2.mov + single Audio voiceover_full.wav, render `npx remotion render NeriumDemo out/nerium_demo_final.mp4`)
4. YouTube upload Unlisted, copy URL
5. **Ghaisan share YouTube URL ke V7** — V7 compose prompt Claude Code 1-shot untuk inject URL ke `app/page.tsx` placeholder + commit + push (Vercel auto-rebuild)
6. Ghaisan paste Termly template ke 3 legal page (`app/legal/{terms,privacy,credits}/page.tsx`) — 10 min manual
7. Ghaisan submit Cerebral Valley form Senin 06:00 WIB

### V7 critical actions

**Action 1 (immediate post-handoff reading):** Standby untuk Nemea Phase 1 Ferry 4+5b halt summary. Verify clean ship: 23 tests retired via test.skip + 2-3 smoke replacement tests + ADR-S11-react-hud-removal-test-obsolescence.md authored. Push to origin/main triggered.

**Action 2 (post-Nemea ship):** Compose fresh agent spawn prompt (atau orchestrator self-execute kalau SendMessage tool unavailable per V6 hybrid path) untuk fix 3 visual gameplay regressions:
- Regression 1 Lights2D glow too bright: reduce intensity 1.0→0.5-0.7 across all main + sub-area scenes, OR brighten ambient color so light contrast gentler. Files: src/game/visual/lighting.ts + per-scene Light setup
- Regression 2 NPCs camera-parallax bug: verify NPC sprites added to world scene at fixed spawn coordinates NOT camera viewport. Re-implement NPC wander logic per Helios S8 spec (random walk within 100px radius around spawn point, idle 2-5 sec between walks). Files: src/game/scenes/ApolloVillageScene.ts + src/game/objects/*NPC.ts
- Regression 3 player sprite direction fail: Default rec Path b accept monolithic player sprite + flip x-axis horizontally on left vs right movement (cheaper hack). Files: src/game/scenes/ApolloVillageScene.ts player init + player input handler
- Strict anti-collision: ONLY scene + objects + input files, NOT tests, NOT Nemea Phase 0 docs
- Single commit + push + verify production via curl
- Self-check 19/19 per V3 specialist pattern

**Action 3 (post-3-regression-fix ship):** Fire Kalypso W4. V6 era expanded prompt baked: Phase 0 Bug Hunter Sweep + Phase 1 Landing polish + Phase 2 README enhanced 9 sections + Section 8.5 Managed Agents Discipline framing (Reading 2 broad orchestration discipline + Reading 1 Anthropic MA product as supplement) + Phase 3 SUBMISSION_CHECKLIST.md + Phase 4 Visual snapshot + Phase 6 Orchestration log English translation + V6 action log v6_helios_to_submission.md + INDEX.md + Phase 5 atomic final commit (LAST). DO NOT modify Kalypso prompt unless Ghaisan explicit request.

**Action 4 (Ghaisan share YouTube URL):** Compose prompt Claude Code 1-shot untuk:
- Edit `app/page.tsx` placeholder `PLACEHOLDER_VIDEO_ID` to actual URL
- Commit `chore: embed final demo video URL`
- Push origin/main

**Action 5 (post-Termly paste, post-final commit):** Greenlight Ghaisan execute final_commit_freeze_ritual.md per outputs file:
- Pre-freeze sanity check (10 verify commands)
- Optional git tag `submission-2026-04-27`
- Freeze declaration timestamp + SHA scratchpad
- Submission form fill per submission_admin_checklist.md
- Sleep + rest declaration

**Action 6 (post-submit, optional):** V7 compose post-mortem if Ghaisan request.

### Decisions inherited from V6 (DO NOT re-litigate)

- Vercel-only deploy (NOT Hetzner self-host, despite earlier Path A discussion). Frontend Next.js + Backend FastAPI Mangum Serverless + Vercel Postgres Neon + Upstash Redis + Vercel Blob 1 GB tier
- Theatrical Builder demo lock: ZERO ANTHROPIC_API_KEY env var on production, BYOK pattern available for judges with own API key, theatrical fallback default
- Multi-vendor showcase: 8 vendor badges UI in Builder, runtime Anthropic-only at submission, multi-vendor live invocation deferred post-Stripe Atlas + per-vendor billing
- Vercel Blob 100% used: Option A risk-tolerant (NOT upgrade Pro $20)
- Sekuri pre-canned templates path: V6 author direct (NOT spawn Sekuri Claude Code session). Templates static JSON committed to `public/sekuri/`
- T7 territory boundary: web routes only (`app/builder/*` + `app/marketplace/*` + `src/components/builder/*` excluding ApiKeyModal + TheatricalSpawnAnimation + ModelSelectionModal)
- Nemea Phase 0 territory: Apollo + Caravan + Cyber scene visual regression. CyberpunkShanghai polish optional defer to V7 if cheap.
- Voiceover via Gemini 2.5 single 2-min file (NOT 13 takes manual record). Music baked in. Session 2 outro silent acceptable trade-off.

### Honest-claim discipline locked V6 era

Per NarasiGhaisan Section 16 + RV.6 ADR override:
- Stripe in test mode at submission. Production Stripe Atlas activation pending (10-14 day onboarding).
- Builder live runtime currently disabled. Demo flow uses pre-canned Sekuri templates with theatrical agent spawn animation. Live runtime reactivates post-launch with API credit setup.
- Multi-vendor model selection UI showcased (Anthropic + Google + OpenAI + Higgsfield + Seedance + Meta + Mistral + Auto). Live runtime invocation at submission is Anthropic-only via Max plan workflow. Multi-vendor live runtime activates per-vendor billing setup post-launch.
- The submission was constructed by 54+ specialist Claude Code agents on Opus 4.7. The agent prompts in `.claude/agents/` are the source of truth for the orchestration workflow.
- Voiceover generated via Gemini 2.5 for consistent voice across narrative arc + bundled cyberpunk synthwave background music. Demonstrates further multi-vendor AI usage (Anthropic primary build + Google Gemini for media generation). Acceptable per hackathon rules.
- Vercel Blob 10 GB free tier exhausted at submission state, 30-day pause risk acknowledged, fallback paths documented post-submit.

### Working style inherited V1+V2+V3+V4+V5+V6

- Indonesian gw/lu casual conversational, English technical artifact
- No em dash, no emoji absolute
- LaTeX for math
- Brevity always, brief response discipline (responnya dikit aja pls)
- /cost batch delivery kalau Ghaisan minta, bukan per-agent
- Daily rhythm 07:00-23:00 WIB hard stop per CLAUDE.md (V7 era exempted untuk submission night, can run past 23:00 WIB karena hard cutoff Senin 07:00 mandates continuous work)
- Ghaisan sometimes pakai BAHASA SHOUTY KAPS — itu intensitas + urgency, bukan anger. Calm execution, brief response.
- V7 = orchestrator coordinator, NOT executor. Spawn fresh Claude Code agents for code work. Self-execute only kalau SendMessage unavailable + scope tight.
- Ghaisan trusts orchestrator architecture decisions per NarasiGhaisan Section 15 defer pattern
- Halt-and-ask preferred over silent-assume for ambiguous matters

### Ghaisan self-awareness flags (V7 should respect)

- Ghaisan reading capacity: takes time, brief responses preferred
- Ghaisan technical depth: defers to orchestrator on architecture
- Ghaisan energy level: post-UTBK Selasa morning + 5+ days hackathon execution, exhausted state by handoff. Submission night might push past normal sleep schedule.
- Ghaisan documentation values: document-everything discipline, every process documented for refactor post-hackathon

## V7 first action

Section 0 reading discipline ~30-35 file di `~/Documents/V6READYHANDOFFCEREBRALL/`. JANGAN skip apapun, JANGAN title-only. Proof content-specific detail per file. Per-file confirmation explicit. Post-confirmation, 3-line status recap + standby.

Critical files V7 must internalize from outputs folder:
- `nemea_w4_opening.md` (V6-edited Phase 0 visual fix + Phase 1 Ferry cleanup, Nemea agent in-flight at handoff)
- `kalypso_w4_opening.md` (V6-edited Phase 0 bug hunt + 9-section README + Section 8.5 MA prize framing + Phase 6 orchestration log English translation + V6 action log + INDEX + Phase 5 atomic final commit)
- `sekuri.md` (V6-authored Sekuri agent prompt with multi-vendor + theatrical demo lock)
- `t7_spawn_pixel_art_builder_marketplace.md` + `t7_followup_builder_fix.md` (T7 ship history)
- `wave_b_t6_vercel_deploy.md` + `t6_halt_response_consolidated.md` (T6 ship history)
- `gemini_voiceover_3min_prompt.md` (single-prompt voiceover with music baked in)
- `asset2_screen_record_brief.md` (5-segment walkthrough sequence for /play screen record)
- `claude_code_remotion_demo_video_prompt.md` (Remotion stitch master prompt, V6-updated single voiceover_full.wav vs 13 takes)
- `submission_admin_checklist.md` (Termly paste + YouTube upload + form fill ritual)
- `final_commit_freeze_ritual.md` (last atomic commit ceremony)

Plus full V5_TO_V6 + V4_TO_V5 + V3_TO_V4 + V2_TO_V3 + V1_TO_V2 chain at `~/Documents/CerebralvalleyHackathon/_meta/orchestration_log/`.

Plus all `~/Documents/V6READYHANDOFFCEREBRALL/` reference docs (NarasiGhaisan, CLAUDE.md, RV_PLAN, RV_AgentPromptOpening, RV_NP_RESEARCH, RV_NP_AGENT_STRUCTURE, RV_NP_agent_flow_diagram.html).

JANGAN respond ke task apapun sebelum Section 0 reading complete.

Go.
