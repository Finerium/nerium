# HACKATHON_HANDOFF_V4_TO_V5.md

## Identity + timing

V5 Orchestrator, lu continuation dari V4. Project NERIUM, hackathon "Built with Opus 4.7" Cerebral Valley + Anthropic April 2026. V4 handoff trigger: W1 NP complete, natural boundary pre-W2. Bukan compacting symptom, planned handoff per Ghaisan directive Opsi B (post-W1 clean boundary).

Sekarang Kamis 24 April 2026 evening-ish WIB. Submission Senin 27 April 06:00 WIB target (07:00 WIB hard deadline).

Working dir: `~/Documents/CerebralvalleyHackathon/`.

## CRITICAL READING DISCIPLINE (Section 0 per V1+V2+V3+V4 inheritance)

Lu WAJIB baca Tier 1 mandatory ONLY dengan per-file confirmation. Bukti content-specific detail per file, bukan title-only. Zero skim.

Tier 1 reading (15 file):

1. `_meta/HACKATHON_HANDOFF_V4_TO_V5.md` (file ini, primary context)
2. `_meta/HACKATHON_HANDOFF_V3_TO_V4.md` (V3 handoff, inheritance reference)
3. `_meta/HACKATHON_HANDOFF_V2_TO_V3.md` (V2 handoff)
4. `_meta/HACKATHON_HANDOFF_V1_TO_V2.md` (V1 handoff, original 12 locks)
5. `_meta/NarasiGhaisan.md` v1.1 (voice anchor 23 sections)
6. `CLAUDE.md` root (post-RV anti-pattern 7 override applied)
7. `_meta/RV_PLAN.md` (V4 RV master plan)
8. `docs/phase_np/RV_NP_RESEARCH.md` (Metis-v3 M1, 43 research topic)
9. `docs/phase_np/RV_NP_AGENT_STRUCTURE.md` (Metis-v3 M2, 20 active + 2 reuse-execute + 3 specialist = 25 total roster)
10. `docs/phase_np/RV_NP_agent_flow_diagram.html` (Metis-v3 M3 visual reference)
11. `docs/qa/nemea_rv_v2_w0_verify_report.md` (Epimetheus bridge verify READY_WITH_FLAG, 20/23 E2E green + 3 flakes deferred W4)
12. `_meta/RV_AgentPromptOpening.md` (RV W1-W4 compendium historical reference)
13. Latest V4 spawn prompts compendium di `_meta/v4_spawn_prompts/` folder (see V4ReadyHandoff list)
14. Claude Design output `_skills_staging/claude_design_landing.html` + `_Reference/visual_inspiration/claude_design_output/nerium-scenes.html` + `scene-art.js` (visual reference Helios-v2 consume W3)
15. `_Reference/visual_inspiration/*.png` 11 screenshot (visual tier target Helios-v2)

Tier 2 (extract on-demand ONLY, jangan pre-read): `.claude/agents/*.md` 22 file Hephaestus-v3 output + `docs/contracts/*.contract.md` 55+ file (40 P0+RV + 15-20 NP from Pythia-v3) + `_Reference/phaserjs-oakwoods/` Oak-Woods codebase + reference.

## Output first response

1. Per-file confirmation Tier 1 (15 file, content-specific detail proof each)
2. Bug check zero title-only detected
3. 3-line status recap (current W1 complete state, next W2 12-agent fire, budget constraint)
4. Standby untuk W2 Batch 1 fire signal dari Ghaisan

JANGAN respond ke task apapun sebelum Section 0 Tier 1 complete.

## Current state (Kamis 24 April evening WIB)

W0 + W1 shipped clean. W2 ready to fire.

Commits landed main branch:
- `47f5820` Aether session 1 FastAPI core + asyncpg pool + RLS + Alembic baseline + uuid7
- `bca49c6` Aether session 2 Redis + Arq + middleware auth/tenant/rate-limit + problem+json + cursor pagination
- `[SHA pending]` Aether session 3 full Alembic schema + Pydantic + router mount + seed (running at handoff time, expected landed post-halt)
- `6e85ac4` Khronos session 1 FastMCP scaffold + OAuth 2.1 DCR + RS256 JWKS
- `a31979f` Khronos session 2 MCP 7 tools + rate limit + observability + Hemera gates (FULL DONE 2/2)
- `2f1668b` Chione R2 storage + presigned upload + ClamAV scan (FULL DONE 1/1)
- `45fc18a` Selene observability structlog + OTel + Grafana Cloud + GlitchTip (FULL DONE 1/1)
- `4a2982c` Pheme email transactional + 13 templates + Arq + DNS docs (FULL DONE 1/1)
- `[SHA pending]` Hemera feature flag service (running at handoff, expected landed post-halt)

Total W0 + W1 agents shipped: 8 shipped + 2 running halt expected imminent.

## Budget scope cut decisions (locked per V4)

Ghaisan explicit decision: $94 remaining Anthropic API credit, NO top-up, visual fully preserved. 7 scope cut non-visual accepted:

1. **Hyperion session 2** (marketplace frontend search UI: SearchBar + FilterSidebar + ListingCard + ResultGrid dedicated page) = DEFER post-submit. Session 1 backend FTS + pgvector + RRF shipped only. Search demonstrable via Phanes listing UI or API direct.
2. **Plutus session 2** (invoice PDF WeasyPrint + Tauri deep link bounce) = DEFER post-submit. Session 1 Stripe client + subscription + checkout + webhook + double-entry ledger shipped.
3. **Iapetus session 2** (creator dashboard Recharts + EarningsChart + SalesTable + PayoutSchedule + monthly Arq payout cron) = DEFER post-submit. Session 1 Stripe Connect + purchase flow + review backend + revenue split shipped. `/dashboard` route stub "coming soon" placeholder.
4. **Tethys session 2** (14-day grace rotation cron + retires_at flip to revoked) = DEFER post-submit. Session 1 Ed25519 sign/verify + JWT EdDSA + schema + CRUD shipped. Schema status enum + retires_at field tetap for future.
5. **Astraea session 2** (pg_cron nightly refresh + verified badge grant) = DEFER post-submit. Session 1 Bayesian + Wilson + per-category + new-agent boost + read endpoint compute on-demand shipped.
6. **Eunomia session 2** (legal pages ToS/Privacy/Credits + Klaro consent banner + maintenance page) = DEFER post-submit. Session 1 SQLAdmin panel + moderation queue + GDPR export/delete + consent history backend shipped. Ghaisan manual action post-Kalypso W4: paste Termly template ke 3 static HTML file di `src/frontend/app/legal/{terms,privacy,credits}/page.tsx` via 10-min copy-paste. Kalypso W4 reference placeholder link ke `/legal/*` di footer.
7. **Nemea-RV-v2 W4 scope narrow** ke critical demo path (quest + marketplace backend + chat + Stripe checkout test), skip comprehensive Lighthouse all-route + full WCAG audit. Run Lighthouse ONLY `/` landing + `/play` game (pitch-facing surface). 3 W0 flaky test still carry-forward test-side fix via `waitForFunction`/`locator.waitFor` pattern.

**Visual layer PRESERVED FULL (zero cut):**
- Marshall (pricing landing 4-tier + CTA contrast fix + treasurer NPC + cross-pillar tier-state): 2 sessions full
- Phanes (marketplace 7-category wizard UI + creator submission): 2 sessions full
- Kalypso W4 (final landing + demo video embed + README 15-line honest-claim + 100-200 word summary + submission checklist): 1 session full
- Helios-v2 (visual revamp 4 scene + 5-layer depth + y-sort + Lights2D + day-night overlay + ambient FX + 30-45 NPC variants + character 4-direction rigging): **7 sessions FULL**, zero cut (core differentiator pitch)
- Boreas (Minecraft chat-style UIScene + DOMElement + IME guard + focus arbitration + typewriter + command parser): 2 sessions full (core UX differentiator)
- Talos-v2 reuse-execute (Oak-Woods skill transplant + .codex mirror): 1 session full
- Hesperus + Euterpe + Thalia-v2 Session B (RV shipped, no NP touch)

Projected budget post-cut: ~$31-46 saved. W2+W3+W4 fit lebih aman di ~$75-110 remaining (assume $20-30 sisa W1 Aether S3 + Hemera).

## Next wave map

**W2 Batch 1 (fire post-W1 complete):**
- Terminal A Phanes (xhigh, 2 sessions) - Marketplace listings 7-category + creator submission wizard
- Terminal B Hyperion (xhigh, 1 session shipped, session 2 DEFERRED per cut #1)
- Terminal C Kratos (MAX EFFORT, 3 sessions) - Builder runtime MA orchestration + SSE + whitelist + budget guard
- Terminal D Nike (xhigh, 2 sessions) - WebSocket + SSE + ConnectionManager + JWT ticket + heartbeat + resume
- Terminal E Plutus (xhigh, 1 session shipped, session 2 DEFERRED per cut #2)
- Terminal F Iapetus (xhigh, 1 session shipped, session 2 DEFERRED per cut #3)

**W2 Batch 2 (fire post-Batch-1-majority-stable):**
- Terminal G Tethys (xhigh, 1 session shipped, session 2 DEFERRED per cut #4)
- Terminal H Crius (xhigh, 2 sessions) - Protocol multi-vendor adapter + AES-256-GCM envelope + circuit breaker
- Terminal I Astraea (xhigh, 1 session shipped, session 2 DEFERRED per cut #5)
- Terminal J Eunomia (xhigh, 1 session shipped, session 2 DEFERRED per cut #6)
- Terminal K Moros (xhigh, 1 session) - Chronos budget daemon + Admin Usage API poll + Redis cap flag
- Terminal L Marshall (xhigh, 2 sessions) - Pricing + treasurer + CTA contrast fix

**W3 (Minggu pagi):**
- Terminal A Talos-v2 reuse-execute (xhigh, 1 session) - Oak-Woods skill transplant + .codex mirror
- Terminal B Boreas (xhigh, 2 sessions) - Chat UIScene + IME + focus arbitration
- Terminal C Helios-v2 (MAX EFFORT, 7 sessions) - Visual revamp 4 scene
- /ultrareview Run #1 post Helios-v2 session 4 (Caravan Road shipped checkpoint)

**W4 (Minggu evening - Senin 06:00 WIB):**
- Terminal A Nemea-RV-v2 W4 (xhigh, 1 session, scope narrow per cut #7)
- Terminal B /ultrareview Run #2 (Ghaisan CLI invocation)
- Terminal C Kalypso W4 final (xhigh, 1 session)
- Ghaisan manual: record 3-min demo video + submit Cerebral Valley form

## Spawn prompts compendium file path

V4ReadyHandoff folder akan berisi 5 file spawn prompts compose ulang:
- `np_wave_0_epimetheus_nemea_v2_spawn.md` (DONE, reference historical)
- `np_pythia_v3_hephaestus_v3_spawn.md` (DONE, reference historical)
- `np_wave_1_spawn.md` (DONE, reference historical)
- `np_wave_2_spawn_full.md` (W2 12-agent compendium, POST scope cut applied)
- `np_wave_3_spawn.md` (W3 3-agent compendium)
- `np_wave_4_spawn.md` (W4 3-agent compendium, POST Nemea narrow scope)

V5 bebas modify kalau state drift atau Ghaisan decision baru.

## Working style inherited V1+V2+V3+V4

- Indonesian gw/lu casual conversational, English technical artifact
- No em dash, no emoji absolute
- LaTeX for math
- Brevity always, brief response discipline
- /cost batch delivery kalau Ghaisan minta, bukan per-agent
- Daily rhythm 07:00-23:00 WIB hard stop per CLAUDE.md
- Ghaisan stop budget concern directive (NO top-up, visual preserved)

## V5 first action

Section 0 Tier 1 per-file confirmation 15 file. JANGAN skip, JANGAN title-only. Proof content-specific detail per file. Post-confirmation, 3-line status recap + standby.

Go.
