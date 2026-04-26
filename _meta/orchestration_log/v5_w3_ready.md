# HACKATHON_HANDOFF_V5_TO_V6.md

## Identity + timing

V6 Orchestrator, lu continuation dari V5. Project NERIUM, hackathon "Built with Opus 4.7" Cerebral Valley + Anthropic April 2026. V5 handoff trigger: rembg batch processing 78 file complete via Claude Code `birefnet-general`, 22 file flagged dengan visual quality issue, V5 context window approach 80% threshold dari extended visual asset cycle + iterative compose work.

Sekarang Sabtu 25 April malam WIB (~22:45). Submission Senin 27 April 06:00 WIB target (07:00 WIB hard deadline). Effective ~31-32 hour window dari handoff.

Working dir: `~/Documents/CerebralvalleyHackathon/`.

## CRITICAL READING DISCIPLINE (Section 0 inheritance V1-V5)

You MUST read **EVERY** file in `~/Documents/V5READYHANDOFFCEREBRALL/` **WITHOUT A SINGLE OMISSION**. Prove content-specific detail per file, not title-only. Zero skim. Per-file confirmation mandatory in your first response.

Total file count in the handoff folder is approximately 12-15 (handoff message + 6 agent opening prompt + 3-5 historical reference + asset prompt spec + Cowork instruction reference). Check `ls` folder for the actual count.

## Output first response

1. Per-file confirmation for EVERY file in `~/Documents/V5READYHANDOFFCEREBRALL/` (content-specific detail proof per file)
2. Bug check zero title-only detected
3. 3-line status recap (current state pre-Helios fire, asset processing pipeline status, next agent fire order)
4. Standby for Ghaisan trigger discussion of 22 flagged asset solution + greenlight fire Helios post-fix

DO NOT respond to any task before Section 0 reading is complete.

## Current state (Sabtu 25 April malam WIB)

### W0-W3 partial complete

**Shipped commits di main branch:**
- W0 Epimetheus bridge: 5 SHA (708c50e, 74ba12e, 9f741d7, c8bd3ab, 3fdc3e4)
- W1: Aether (47f5820, bca49c6, 7041136), Khronos (6e85ac4, a31979f), Chione (2f1668b), Selene (45fc18a), Pheme (4a2982c), Hemera (032590f)
- Pre-W2 surgical ferries: Khronos kwarg fix (20a22c0), Selene caplog (2fa51fe)
- W1 Alembic merge: 82c4c84
- P2 Kratos: b570202, 1d76d4b, 832b433
- P3 Nike + Moros: 351588d, 9bdb6d8, e95de62
- P1 Marketplace + Trust: 1d151d5, caae324, ff13b37, fdc965b
- P4 Stripe: 387f19a, ce97f20
- P5 Identity + Protocol: a9154f0, 63c8662, 6d76f3d
- P6 Admin + Pricing: fe16fb5, e857815, c1e6372
- W3 Boreas: d5af0b4
- Helios-v2 prior session attempts (deprecated approach): 0730e3d, d7f0177, 63ffa62, 79367e4, 1a8484b

Total backend tests green: ~1149+ (post-P5)
Alembic head: 054 (post-P5 Crius secret table)
Latest commit pre-Helios: TBD (Ghaisan akan commit AI asset bundle separately)

### V4 scope cut decisions (locked)

V4 ship 7 scope cut non-visual untuk preserve $94 budget dan visual quality 100%:
1. Hyperion S2 (frontend search UI) DEFER post-submit, S1 only
2. Plutus S2 (invoice PDF) DEFER, S1 only
3. Iapetus S2 (creator dashboard) DEFER, S1 only
4. Tethys S2 (rotation cron) DEFER, S1 only
5. Astraea S2 (pg_cron refresh) DEFER, S1 only
6. Eunomia S2 (legal pages) DEFER, S1 only — Ghaisan manual paste Termly post-Kalypso
7. Nemea-RV-v2 W4 narrow Lighthouse `/` + `/play` only

Visual layer PRESERVED FULL:
- Marshall 2 sessions full (P6) ✓ shipped
- Phanes 2 sessions full (P1) ✓ shipped
- Boreas 2 sessions full (W3) ✓ shipped
- Helios-v2 7 sessions originally → expanded to 11-13 sessions per Helios-v2 full restart prompt with AI asset transplant
- Talos-v2 SKIPPED entirely (V5 + Ghaisan decision: skill transplant non-critical, can defer post-submit)

### Budget pivot — API credit habis, Max subscription primary

V5 era: Ghaisan API credit drained ~$31 → $30.66 → $15.08 → ~$3 saat fire P3 ke arah end. Switch ke Max 20x subscription (2 akun Pro confirmed available). Helios-v2 + Nemea + Kalypso semua run di Max subscription, NO API credit.

### Hackathon AI asset gen ALLOWED

Ghaisan confirm tim hackathon explicitly allow AI asset generation. ADR override antipattern 7 (no fal.ai) effectively superseded by hackathon rule update. **97 AI-generated PNG asset shipped via Nano Banana Pro (gemini-3-pro-image-preview) di Google AI Studio + gemini.google.com**, NOT fal.ai. ADR formal update deferred post-submit.

### Asset processing pipeline (rembg COMPLETE, 22 file FLAGGED for re-process)

V5 era: 97 AI asset generated via Nano Banana Pro (Gemini 3 Pro Image Preview) di Google AI Studio + gemini.google.com. Output mostly .jpg, beberapa .png (Prompt 91-97 dari gemini.google.com path).

Cowork pipeline 1: 45 file (Prompt 46-91 batch) di-move dari `~/Documents/GhaisanHackathonAssets/` ke `~/Documents/CerebralvalleyHackathon/_Reference/ai_generated_assets/` per spec, 4 wrong-location corrected, Prompt 91 missing (regenerated separately). All as .jpg, no conversion at move time.

Cowork pipeline 2: 78 file copied ke `~/Documents/cerebralBackgroundRemover/` flat folder untuk background removal staging.

Claude Code rembg pipeline: batch process 78 image via `rembg[cli] birefnet-general` model di Python venv. Output ke `~/Documents/cerebralBackgroundRemover/Processed/` (78 transparent PNG). Wall clock ~15-40 min, single batch script with resume capability + fallback ke `u2net` model. **COMPLETE saat handoff.**

### CRITICAL — 22 flagged asset (rembg quality regression)

Ghaisan flag 22 file di `Processed/` punya visual quality regression dari original.

**Pattern kerusakan rembg (`birefnet-general`) — TWO distinct bugs:**

**Bug A: Disconnected luminous elements stripped**
- Aggressive segmentation untuk floating element terpisah dari subject body
- Floating orb terpisah dari pillar (registry pillar orb top) → ke-strip total
- Hovering glyph icon di atas landmark (marketplace scale, builder hammer, treasury credit-chip) → terkadang ke-strip
- Drop shadow di ground (caravan rope bridge cast shadow on ground) → ke-strip
- Glow halo aura around subject body (drone purple-cyan hover field, sun orb rays) → ke-strip

**Bug B: Checkerboard pattern bake-through (CRITICAL — Ghaisan-surfaced)**
- Beberapa Nano Banana Pro output dari Image 4 dst punya **literal checkerboard pattern sebagai content pixel** (bukan transparency indicator). Visual checkerboard ini intentional dari Nano Banana sebagai **dark backdrop aesthetic** untuk asset cyberpunk + atmospheric.
- rembg interpret checkerboard pattern sebagai background-to-remove, tapi karena pattern itu actual pixel content (bukan single solid color BG), rembg confused dan **output PNG punya checkerboard pattern di area yang harusnya transparent**, bake-through sebagai opaque pixel
- Result: PNG output kelihatan punya "transparency-shaped checkerboard" yang sebenarnya literal opaque pattern, tampil sebagai noise di scene saat di-render via Phaser
- Affected files: cyber_billboard_closeup, cyber_reception_desk, dust_motes (atmospheric), holo_ad_panel, dan beberapa cyberpunk prop dengan dark backdrop

**Yang preserved baik:** glow yang menempel ke subject body (book magic glow, weapon enchant), background removal clean untuk solid-color BG, sparkle particle masih intact, character single-frame portrait (treasurer/apollo/synth_vendor) — total ~56 file

**File flagged (22 total, complete list):**

Mix of Bug A (orb/halo/shadow stripped) dan Bug B (checkerboard bake-through). All file referenced as base stem (extension .jpg in source folder):

1. `apollo_temple_altar` (Bug A: sun orb floating + rays terhapus)
2. `builder_workshop_landmark` (Bug A: hammer/wrench glyph hovering, glow stripped)
3. `caravan_rope_bridge` (Bug A: drop shadow on ground terhapus)
4. `caravan_tavern_table` (Bug A: candle glow stripped)
5. `category_agent` (Bug A: humanoid + circuit halo glow stripped)
6. `category_dataset` (Bug A: cyan data-stream particle glow stripped)
7. `category_skill` (Bug A: scroll magic glow + sparkle particle damaged)
8. `cyber_billboard_closeup` (Bug B: checkerboard bake-through + glow stripped)
9. `cyber_data_terminal` (Bug A: cyan hologram glow + Bug B partial)
10. `cyber_reception_desk` (Bug B: dark backdrop ke-strip, glass body over-transparent + checkerboard noise)
11. `drone` (Bug A: cyberpunk hover glow halo terhapus)
12. `dust_motes` (Bug B: atmospheric particle dimmed, dark BG bake-through)
13. `hanging_lantern` (Bug A: warm amber glow halo terhapus)
14. `holo_ad_panel` (Bug B: dark backdrop ke-strip, glitch artifact lost dark context)
15. `marketplace_stall_landmark` (Bug A: scale glyph hovering glow stripped)
16. `neon_market_stall` (Bug A: neon trim glow stripped)
17. `quest_exclamation` (Bug A: golden halo around indicator stripped)
18. `quest_question` (Bug A: cyan halo around indicator stripped)
19. `registry_pillar_landmark` (Bug A: floating crystal orb top + glowing rune body terhapus, paling parah)
20. `smog_wisps` (Bug B: violet smog backdrop ke-strip awkward)
21. `temple_arch` (Bug A: warm amber doorway glow stripped)
22. `trust_shrine_landmark` (Bug A: star glyph + central flame partial damage)

**Solution path — Ghaisan PROCEEDING dengan Canva (in-progress saat handoff):**

Ghaisan **sudah pilih path (a) Canva Pro BG Remover** dan sedang execute saat V5→V6 handoff:

- 22 flagged .jpg original sudah di-copy ke `~/Documents/CanvaRemover/` (via Cowork pipeline V5 era, source `cerebralBackgroundRemover/` root tetap intact)
- Ghaisan sedang upload manual ke Canva Pro BG Remover web UI, download .png transparent kembali ke `~/Documents/CanvaRemover/` (overwrite original .jpg di staging folder dengan .png hasil Canva)
- Process estimate ~15-30 min wall clock

Plus 56 clean PNG dari rembg sudah di-move dari `Processed/` ke proper subfolder di `_Reference/ai_generated_assets/` (V5 era), dengan matching .jpg di destination **DI-ARCHIVE ke `_archive/` subfolder** (NOT deleted, preserved for rollback safety).

**V6 task saat Ghaisan trigger post-Canva-complete:** Compose Cowork prompt buat move 22 .png dari `~/Documents/CanvaRemover/` ke proper subfolder di `_Reference/ai_generated_assets/`, dengan **same archive pattern**: archive matching .jpg di destination ke `_archive/` (NOT delete). Pattern reference: `cowork_56_clean_move.md` di handoff folder.

**Archive pattern reasoning (locked decision V5):**
- Phaser load via filename-based key, kalo ada `treasurer.jpg` + `treasurer.png` di same folder, ambigu mana yang preferred — solved by archive .jpg out of main path
- .png at proper subfolder = single source of truth for Helios-v2
- Original .jpg preserved in `_archive/` for rollback safety kalo Helios-v2 nemu visual issue dengan .png at runtime
- 19 .jpg yang ga butuh BG removal (3 main bg, 10 sub-area bg, 1 cobblestone tile, 1 loading, 2 transition, 1 title, 1 hero) STAYS as .jpg di proper subfolder — NOT archived, Helios-v2 load .jpg langsung untuk asset ini
- Helios-v2 explicit instruction: **DO NOT consume anything from `_archive/`** — archive is rollback only, not runtime

Alternative paths kalo Canva juga gagal handle Bug B (defer plan):
1. (b) Re-run rembg dengan `u2net` model
2. (c) Re-run rembg + alpha matting flag (`-a`)
3. (d) Skip BG removal untuk 22 file, accept .jpg, Phaser handle via shader/tint mask runtime
4. (e) Hand-process di Photoshop / Affinity Photo / Pixelmator manual

V6 facilitate decision kalo Canva also fails. Default expectation: Canva sukses handle both Bug A + Bug B.

**Workflow post-Canva (current active path):**

1. (DONE V5 era) Cowork pipeline copied 22 flagged original .jpg dari `cerebralBackgroundRemover/` root ke `~/Documents/CanvaRemover/`
2. (IN PROGRESS) Ghaisan upload 22 .jpg ke Canva Pro BG Remover web UI, download 22 .png ke same `~/Documents/CanvaRemover/` folder (replacing source .jpg with output .png)
3. (V6 task pending) Compose Cowork prompt move + archive pattern: move 22 .png ke `_Reference/ai_generated_assets/` proper subfolders, archive matching .jpg ke `_archive/`
4. (V6 task pending post-replace) Ghaisan commit asset bundle ke main, fire Helios-v2

### Asset state pre-Helios fire (saat handoff)

- 56 clean .png di `_Reference/ai_generated_assets/` proper subfolders (V5 era moved from rembg `Processed/`)
- 56 corresponding .jpg di `_Reference/ai_generated_assets/_archive/` subfolder (V5 era archived for rollback)
- 22 .jpg matching flagged stems still di `_Reference/ai_generated_assets/` proper subfolders (will be archived + replaced by Canva .png post-V6 Cowork move)
- 22 degraded .png di `~/Documents/cerebralBackgroundRemover/Processed/` (rembg output, untouched, will not be used — remains as historical record)
- 22 Canva .png di `~/Documents/CanvaRemover/` (in-progress, will move to repo via V6-orchestrated Cowork pipeline with archive pattern)
- 19 .jpg ga butuh BG removal stays as .jpg at proper subfolders (3 main bg, 10 sub-area bg, 1 tile, 1 loading, 2 transition, 1 title, 1 hero) — Helios-v2 load .jpg langsung
- `_archive/` subfolder grows from 56 → 78 .jpg post-V6 archive run
- Total target di repo post-Canva-replace: 78 .png transparent (56 clean rembg + 22 Canva) + 19 .jpg active = 97 active asset, plus 78 .jpg archive (rollback only, NOT runtime)

## Ferry items inherited (W4 Nemea cleanup)

1. Pheme `@react-email/components` missing dep — 14 tsc error
2. Arq worker bootstrap aggregator gap — cron_jobs empty registry
3. pricing.spec.ts contrast parser fail oklch
4. dialogue_flow.spec.ts typewriter timing flake (line 153)
5. 3 W0 carry-forward Playwright flake
6. P5 import path rename to Pythia-v4 (low priority defer)

Plus surfaced post-V5: ANY ferry yang Helios-v2 surface saat S0 audit + S1-S12 execution.

## Strategi V5 → V6

### Status agent fire order (post-asset-processing complete)

1. **Helios-v2** (`helios_v2_full_restart_opening.md`) -- 11-13 sessions S0+S1-S12, MAX EFFORT, in a Claude Code Max subscription terminal
2. **Nemea-RV-v2 W4** (`nemea_w4_opening.md`) -- 1 session xhigh, ferry cleanup + narrow Lighthouse
3. **Kalypso W4** (`kalypso_w4_opening.md`) -- 1 session xhigh, FINAL agent. SCOPE EXPAND: V6 MUST edit the Kalypso prompt via str_replace BEFORE Ghaisan fires it, to add new tasks:
   - **Kalypso = Bug Hunter ALSO** (alongside the existing landing/README/checklist scope)
   - Scan codebase for bugs, inconsistency, performance bottlenecks, cybersecurity vulnerabilities
   - README must be compelling + comprehensive, clearly explaining "what NERIUM is"
   - Bake this in before fire when Ghaisan signals "fire Kalypso"

### Ghaisan manual sequence post-agent (for V6 awareness)

1. Helios ship -> Nemea fire -> Kalypso fire (V5 era already edited the Kalypso prompt fully, V6 just greenlights)
2. Ghaisan records 3-min demo video showing landing + /play + marketplace + builder + pricing
3. Ghaisan uploads YouTube unlisted
4. **Ghaisan shares the YouTube URL with V6.** V6 composes a Claude Code 1-shot prompt to inject the URL into the `app/page.tsx` placeholder + commit + push
5. Ghaisan pastes Termly template into 3 legal pages (`app/legal/{terms,privacy,credits}/page.tsx`) -- 10 min manual
6. Ghaisan submits the Cerebral Valley form Senin 06:00 WIB

### V6 critical actions

**Action 1 (immediate post-handoff reading):** Standby for Ghaisan to trigger the Canva-complete signal. When Ghaisan emits "Canva 22 PNG ready in `~/Documents/CanvaRemover/`":

1. Compose a Cowork prompt to move the 22 .png files from `~/Documents/CanvaRemover/` into the proper subfolders in `~/Documents/CerebralvalleyHackathon/_Reference/ai_generated_assets/`, using a **replace pattern** (delete the matching .jpg at destination, replace with the .png from Canva)
2. Reference Cowork prompt template: same pattern as `cowork_56_clean_move.md` that V5 era already composed for the 56 clean PNG move (lookup in `~/Documents/V5READYHANDOFFCEREBRALL/` for pattern reference)
3. After Ghaisan ships 22 .png to the repo via Cowork move: greenlight Ghaisan to commit the asset bundle + fire Helios-v2

There is no actionable code work before Ghaisan triggers the Canva-complete signal.

### Helios-v2 prompt V5 era updates (V6 should NOT duplicate)

V5 era already added 2 critical scope expansion ke `helios_v2_full_restart_opening.md` (file ada di `~/Documents/V5READYHANDOFFCEREBRALL/`):

**1. Mandatory visual deep-read of all 97 assets**
- Helios-v2 HARUS use `view` tool on EVERY single one of 97 PNG/JPG asset, recursive across all subfolders
- Document at `_skills_staging/asset_visual_inventory.md` per asset:
  - File path, visual content summary, pixel quality assessment, inherent visual strengths to preserve, enhancement opportunities
- This is HARD requirement, foundation for proactive scene placement S2-S6

**2. Proactive enhancement directive (NOT optional, IS the spec)**
- Asset PNG = base layer, Phaser runtime FX = "bringing alive" layer. Both required.
- Helios-v2 MUST proactively add per asset that has inherent visual quality:
  - Lantern with warm amber glow body → MUST add Phaser Lights2D point light + flicker tween
  - Holographic display with cyan-magenta glow → MUST add bloom + glitch alpha tween + data particle emitter
  - NPC standing static → MUST add idle breathing tween (scale 1.0↔1.02 over 800ms loop)
  - Prop on ground → MUST add subtle drop shadow ellipse below feet anchor
  - Atmospheric overlay PNG → MUST add slow drift tween (position + alpha)
  - Landmark with hovering glyph → MUST add alpha pulse + y-bob + outer glow halo (per S7 + S9 already specced)
- Helios-v2 selama deep-read finds asset "good but missing one final touch", proactively add appropriate FX di scene placement, document in placement coordinate map.

V6 — DO NOT duplicate these instructions in any addendum. They already exist in the Helios-v2 opening prompt file. Only verify Helios honors them at S0/S1 boundary.

**Action 2 (saat Ghaisan greenlight Kalypso fire):** **V5 era SUDAH edit `kalypso_w4_opening.md` lengkap dengan bug hunter scope + README enhancement scope.** V6 — DO NOT re-edit, DO NOT duplicate. Just verify the prompt file di `~/Documents/V5READYHANDOFFCEREBRALL/kalypso_w4_opening.md` ada Phase 0 (Bug Hunter Sweep) + Phase 2 README enhanced (9 sections), then greenlight Ghaisan fire.

**Kalypso prompt scope expanded V5 era (already baked, V6 just verify present):**

1. **Phase 0 — Bug Hunter Sweep** (FIRST, before visual/README work):
   - 5 categories: code-level bugs/inconsistencies, performance bottlenecks, cybersecurity vulnerabilities, architectural inconsistency, README+docs gaps
   - Severity classify: critical/high/medium/low
   - Fix path per finding: fix-now / ferry-to-Nemea (kalo Nemea belum fire) / defer-post-submit
   - Output `docs/qa/kalypso_bug_hunt_report.md`
   - Effort upgraded MAX (from xhigh) untuk accommodate scope expansion

2. **Phase 2 — README finalization (ENHANCED 9-section structure):**
   - Section 1: NERIUM intro (2-3 paragraph compelling explainer "Apa itu NERIUM" untuk audience ga familiar)
   - Section 2: 5-pillar architecture diagram (text-based, NO emoji)
   - Section 3: Honest-claim "What works" (15 baris hard cap preserved)
   - Section 4: 100-200 word summary
   - Section 5: Tech stack badges (text format, NO emoji)
   - Section 6: Quick start (clone, install, run)
   - Section 7: Demo video embed (links to YouTube, V6 inject URL post-record)
   - Section 8: Built for Cerebral Valley + Anthropic
   - Section 9: Credits (optional)

3. **Phase 1, 3, 4, 5 unchanged** from baseline (landing polish, submission checklist, visual snapshot + sanity, final commit)

V6 — DO NOT modify Kalypso prompt. Only fire when Ghaisan signals greenlight.

**Action 3 (saat Ghaisan share YouTube URL):** Compose prompt Claude Code 1-shot untuk:
- Edit `app/page.tsx` placeholder `PLACEHOLDER_VIDEO_ID` to actual URL
- Commit `chore: embed final demo video URL`
- Push origin/main

**Action 4 (post-submit, optional):** V6 compose post-mortem if Ghaisan request.

## Working style inherited V1+V2+V3+V4+V5

- Indonesian gw/lu casual conversational, English technical artifact
- No em dash, no emoji absolute
- LaTeX for math
- Brevity always, brief response discipline
- /cost batch delivery kalau Ghaisan minta, bukan per-agent
- Daily rhythm 07:00-23:00 WIB hard stop per CLAUDE.md
- Ghaisan sometimes pakai BAHASA SHOUTY KAPS — itu intensitas + urgency, bukan anger. Calm execution, brief response.

## V6 first action

Section 0 reading discipline 12-15 file di `~/Documents/V5READYHANDOFFCEREBRALL/`. JANGAN skip apapun, JANGAN title-only. Proof content-specific detail per file. Per-file confirmation explicit. Post-confirmation, 3-line status recap + standby.

Go.
