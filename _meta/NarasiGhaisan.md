# NarasiGhaisan.md (Expanded v1.1)

**Purpose:** Voice Ghaisan unfiltered dari conversation execution-phase NERIUM hackathon (Selasa 21 April 2026 malam, post-UTBK, pre-Metis spawn). Quotes verbatim untuk capture nuansa, emphasis, dan framing yang TIDAK eksis di dokumen formal (PRD, AGENT_STRUCTURE.md, improvement docs, critique, valuasi).

**Audience:** Setiap agent dalam pipeline NERIUM, mulai dari Metis (architect) sampai Workers (executors). Mandatory reading per V2 directive Ghaisan: "setiap agent wajib dapet narasi gw."

**Why this doc matters:** Dokumen formal NERIUM ditulis Februari-Maret 2026 sebelum hackathon. Voice Ghaisan disini ditulis di hackathon execution itself, refleksikan apa yang dia pikirin SEKARANG, real-time, dengan urgency hackathon plus lived experience setelah ngerun MedWatch parallel project plus Investment AI IDX blueprint. Banyak directive nuanced disini yang dia surface karena dia takut V2 atau downstream agent miss the point. Dia explicit bilang: "narasi gwnya bisa dijadiin lebih komprehensif lagi ga, gw takutnya poin gw ga kesampein."

**How to read:** Quote di blockquote pertahankan literal. Framing antar quote minimal, hanya cukup untuk topical grouping plus cross-reference. Casual register Ghaisan dengan gw/lu, no em dash absolute, no emoji. Kalau lu (downstream agent) ambiguity di directive Ghaisan, halt eksplisit, jangan silent-assume.

---

## SECTION 1: VISION LOCK NERIUM SEBAGAI STARTUP POST-HACKATHON

> "Gw tegasin ulang, Nerium bakal gw bangun sebagai startup/company yang terdiri dari 5 pilar itu setelah hackathon ini selesai."

> "ini belum fully production grade kan ya alias si nerium bisa gw refactor segala macem lagi setelah hackathonnya beres"

**Implication:** Hackathon submission bukan one-off project. Ini Phase 0 dari multi-year ship. Setiap keputusan arsitektur Metis design plus Pythia contract plus Worker implementation harus pertimbangkan:

- Post-hackathon refactor budget reserved (technical debt OK selama tidak merusakkan refactor path)
- Design DNA yang ke-set di hackathon akan jadi foundation startup actual
- Pilihan tech stack, naming convention, modular contract pattern, agent communication protocol semuanya akan inherited ke production NERIUM
- Brand identity (visual, voice, story) yang tampil di hackathon adalah brand identity startup actual

**Ghaisan emphasize ini sebagai "tegasin ulang"** karena dia ngerti V1 handoff mungkin frame hackathon sebagai isolated event. Reset assumption: ini soft-launch product, bukan throwaway demo.

---

## SECTION 2: BUILDER SOUL - RECURSIVE AUTOMATION THESIS

Quote core thesis Builder, paling penting dari seluruh narasi:

> "Builder dimaksudkan untuk mengotomatisasi segala proses pembuatan aplikasi, kaya kita gini sekarang, gw masih harus nyuruh lu buat design agent structure (bukan lu sih, tapi bikin lagi agent baru yang nyuruh design, tapi ngerti lah poin gw), nah semua ini diotomatisasi dari 0 sampai jadi"

**Unpacking phrase by phrase:**

- **"kaya kita gini sekarang"** - Ghaisan menggunakan workflow saat ini sebagai LITERAL example pain yang Builder solve. Saat ini chain-nya: Ghaisan ke V2 Hackathon Orchestrator (Claude Chat) ke Metis (Claude Chat) ke Hephaestus (Claude Code) ke Pythia (Claude Code) ke Workers (Claude Code parallel). Multiple manual handoffs, ferry messages bolak-balik, Ghaisan harus aware setiap layer.

- **"gw masih harus nyuruh lu buat design agent structure"** - acknowledge bahwa current state masih MANUAL meta-orchestration. Bahkan dengan Claude Code subagent capability, masih ada human di loop yang harus decide structure-of-the-structure.

- **"(bukan lu sih, tapi bikin lagi agent baru yang nyuruh design, tapi ngerti lah poin gw)"** - clarification penting: dia tidak suruh V2 (Claude Chat) yang design, dia suruh V2 spawn Metis untuk design. Pattern: orchestrator spawn architect, architect design structure, downstream executors implement structure. THREE LAYERS minimum di current workflow.

- **"nah semua ini diotomatisasi dari 0 sampai jadi"** - Builder collapse semua chain di atas jadi single conversational interface. User non-technical bilang "gw mau aplikasi X", Builder internally handle: spawn architect agent, architect design structure, structure handed off to prompt creator, prompt creator generate worker prompts, workers execute parallel, output assembled, deployed. User cuma approve di checkpoint strategis.

**Builder differentiation versus existing tools:**

| Tool | What it does | What it doesn't |
|---|---|---|
| Cursor / Claude Code | AI yang nulis kode di-loop dengan dev | Tidak handle multi-agent orchestration |
| Bolt / Lovable / Replit Agent | Vibe coding, single-AI prompt-to-app | Tidak handle multi-agent, no strategy layer, single-shot |
| ChatGPT / Claude.ai chat | Conversational coding help | No execution layer, no orchestration |
| **NERIUM Builder** | **Meta-orchestrator: AI yang spawn agent yang spawn agent. Strategy plus execution plus deployment unified.** | **Replaces the human meta-orchestrator role itself** |

Builder bukan kompetitor existing AI coding tools. Builder gantiin layer DI ATAS mereka. Existing tools tetap bisa jadi "tukang" (per Arsitek vs Tukang analogy di BuilderDifferentiation_PerceptionProblem.pdf), Builder jadi arsitek plus kontraktor.

---

## SECTION 3: BUILDER FLEXIBILITY - USER PICKS MODEL STRATEGY

> "si Builder ini bakal jadi brand utama gw, si gamifikasi ini, gw tegasin ulang kalo builder ini bersifat fleksibel, user bisa milih mau pake model apa, apakah opus semua, apakah mau collab dengan gemini, pake higgsfield, atau bahkan mau si orchestrator aja yang research+nentuin"

**"brand utama gw"** - Builder is THE flagship. 4 pilar lain support brand recognition Builder. Marketing surface, demo video opening, README hero section, all should center Builder primary.

**Model flexibility sebagai first-class feature:**

Builder UI MUST surface model selection sebagai prominent option, bukan hidden setting di advanced menu. Minimum 4 modes user-selectable:

1. **"Opus all the way"** - premium quality, premium cost. User trade money untuk top-tier output across every agent.
2. **"Collaborative Anthropic"** - Opus for strategic agents (Advisor, architect), Sonnet for execution Workers, Haiku for high-volume simulation passes (Prediction Layer).
3. **"Multi-vendor"** - Claude plus Gemini plus Higgsfield plus others. Per-task model assignment. User picks "use Gemini for image generation, Claude for strategy, Higgsfield for video assets, Llama for cheap classification."
4. **"Auto"** - orchestrator agent itself research dan decide per-task model. User trust orchestrator's judgment on cost/quality tradeoff.

**Mengapa ini penting strategis:**

- Sekaligus DEMO Protocol pillar value prop in vivo. Builder sendiri menjadi proof-of-concept Protocol layer yang preserve keunikan tiap model.
- Differentiate dari competitors yang lock ke single model (Cursor primarily Claude, ChatGPT-based tools primarily OpenAI, etc.)
- Position NERIUM sebagai infrastructure agnostic, bukan AI vendor partisan

**Hackathon scope constraint:**

Per "only Opus 4.7" hackathon rule clarification (Discord screenshot Exotic comment), shipped product execution di hackathon scope pakai Anthropic models only (Opus 4.7 / Sonnet 4.6 / Haiku 4.5). Multi-vendor "choice" tampil di UI sebagai feature spec dengan annotation "demo execution Anthropic only, multi-vendor unlock post-hackathon." Ini honest framing, tidak mislead judges.

---

## SECTION 4: BUILDER AMBITION - PRODUCTION-GRADE TOKOPEDIA TIER

> "yang jadi aware gw, kalo si Builder ini bakal bekerja dari 0 sampai production grade setara tokopedia, berarti kan itu bakal mahal banget tokennya, ini harus dipikirin dari sekarang juga"

**Output quality bar Builder:**

Bukan toy demo. Bukan landing page generator. Bukan CRUD scaffold. Bar adalah **Tokopedia-tier marketplace e-commerce platform**: production-grade deployable, scalable architecture, real users, real transactions, real ops dashboard.

Indonesian context: Tokopedia adalah Indonesia's largest e-commerce platform, complex multi-vendor marketplace dengan payment integration, logistics, recommendation engine, mobile plus web. Bar ini bukan arbitrary, ini reference point yang Ghaisan plus Indonesian audience instantly grasp.

**Token cost realistik untuk Tokopedia-tier output:**

- Single Builder run untuk Tokopedia-tier app: realistically 10-50 juta token Opus saja
- Cost per app build pure Opus: roughly USD 500-2500
- Sustainable pricing model HARUS tier-gated:
  - Cheap tier: Sonnet plus Haiku heavy plus Opus minimal (architecture decisions only)
  - Mid tier: balanced routing
  - Premium tier: full Opus
- Atau: charge user usage-based dengan transparent cost meter sebelum start build, user explicit consent ke estimated total

**Implication untuk Metis design:**

Pipeline execution architecture HARUS allow tier-gating dynamically. Each agent definition include "model tier flexibility flag" yaitu which model is preferred, which is acceptable substitute, what quality degrades when substituted. Hardcoded per-agent model lock = inflexible product.

Future-proof untuk dynamic tier decision yang Builder make at runtime based on user budget choice.

**Implication untuk hackathon scope:**

Demo Lumio (smart reading SaaS landing page) bounded ke 10-12 worker agents, single cached run. TIDAK demo full Tokopedia-tier build (token budget destroy semua $500 credits dalam 1 jam). Demo video narration jelaskan: "ini scaled-down example dari yang Builder bisa do, full Tokopedia-tier output realistic 10-50M token, demonstrate-able post-hackathon dengan dedicated infrastructure."

---

## SECTION 5: MARKETPLACE PAIN - REAL WORLD FRAGMENTATION

Two key quotes:

> "Buat marketplace, sekarang orang-orang masih ngirim MCP/agent baru dan sebagainya lewat x/twitter secara gratis, padahal mereka bisa memonetasi hasil karya mereka, atau bisa juga charge billing kaya listrik (ini gabung sama yang bankingnya juga)"

> "buat marketplace aman sih, tapi coba lu search problem ini biar lu makin ngerti, sekaran AI agent yang dibuild tuh masih tersebar di mana-mana, alias orang-orang susah nyarinya, ada yang mau jual ai agent automatisasi untuk klien restaurant tapi dia gatau mau jual dimana dan jadinya dia malah bikin website sendiri"

**Pain pattern dual-sided:**

**Creator side:**
- Indie developers plus agencies build MCP servers, subagent definitions, automation workflows
- Post di X/Twitter/GitHub gratis karena tidak ada home untuk monetize
- Concrete example Ghaisan kasih: restaurant automation agent creator. Domain-specific agent yang valuable untuk niche customer base (restaurant owners). Tapi creator ends up bikin website sendiri karena tidak ada marketplace yang serve niche-cross-vendor agents.
- Result: creators undercompensated, motivation skew, ekosistem stagnant di hobbyist mode

**Buyer side:**
- Customers susah discover agents
- 8+ vendor-locked storefronts existing (Claude Skills, GPT Store, MCP Hubs, Hugging Face Spaces, Replit Agent Market, LangChain Hub, Vercel Agent Gallery, Cloudflare AI Marketplace) per V2 web search verification
- Each tied to specific build tool. Creator pakai Claude Code? Listing di Claude Skills only. Pakai Replit Agent? Listing di Replit only.
- Cross-vendor neutral marketplace tidak ada
- Customer ends up DM creator via Twitter, ad-hoc payment via PayPal/bank transfer, no trust verification, no service guarantee

**NERIUM Marketplace solution:**

Open neutral cross-vendor platform plus Banking integration untuk usage-based billing. Solve both creator monetization gap dan buyer discovery fragmentation.

**Banking integration ("kaya listrik"):**

Pricing model "kaya listrik" sangat important framing. Bukan one-time purchase, bukan monthly subscription, tapi **usage-based metering** seperti utility billing. Buyer bayar setiap kali agent execute task. Creator earn revenue share per execution.

Analogi listrik bekerja karena:
- Familiar mental model untuk Indonesian audience (PLN billing per kWh)
- Sam Altman quote yang Ghaisan reference di NERIUM_HANDOFF_PROMPT.md ("AI akan jadi tagihan bulanan kamu") align dengan utility framing
- Technical feasible via existing payment infra (Stripe agent commerce, Nevermined, similar)

---

## SECTION 6: REGISTRY PLUS PROTOCOL - SHALLOW BY DESIGN

> "registry dan protocol lu ngerti sih ini harusnya, ga terlalu kompleks kaya yang tadi"

**Scope direction:** Registry dan Protocol di hackathon = shallow demoable, NOT deep. Per locked decision Section 3.3 V1 handoff. Specifically:

- **Registry:** identity card per agent (visual UI showing name, capabilities, trust score, audit trail summary). Zero real DNS infrastructure. Zero blockchain identity. Mock data populated for demo agents.
- **Protocol:** mock cross-model translation dialog (visual: agent A in Claude box outputs XML, translates to Gemini-style prompt format in Gemini box, response back). Zero real protocol negotiation. Zero real Gemini API call.

**Why shallow:** Token budget reality. Builder hero needs deepest implementation. Marketplace needs decent depth (it's the real-world pain pillar). Banking shallow but functional (transaction visualization). Registry plus Protocol get visual treatment that demonstrates concept tanpa actual infrastructure build.

Ghaisan tidak push back depth karena dia ngerti hackathon constraint. Don't oversell these in agent structure. Allocate maybe 1-2 Workers per pillar untuk Registry plus Protocol.

---

## SECTION 7: VISUAL PLUS 3-WORLD GAME PREFERENCE

> "kalo bisa kita sekalian deliver 3 world game berbeda buat nampilin visual yang beda, ada medieval, cyberpunk, apalagi 1 lagi(3 aja cukup) yang medieval mungkin warna oranye coklat kaya di gurun gitu, cyberpunk mungkin shanghai"

**3 worlds detailed direction:**

| World | Palette guidance Ghaisan | V2 expansion |
|---|---|---|
| Medieval Desert | "warna oranye coklat kaya di gurun gitu" | Terracotta `#c97a4a`, sand `#e8c57d`, stone `#8b6f47`, shadow `#3d2817`. Moroccan souk, Dune Arrakeen, Mos Eisley aesthetic. |
| Cyberpunk Shanghai | "cyberpunk mungkin shanghai" | Cyan `#00f0ff`, magenta `#ff2e88`, deep purple `#8b5cf6`, black `#06060c`. Blade Runner 2049, Ghost in the Shell aesthetic. Existing NERIUMcyberpunkcity.html aesthetic reference (DO NOT copy code, NEW WORK ONLY rule). |
| Third (Ghaisan said "apalagi 1 lagi") | Open to V2 pick | V2 propose Steampunk Victorian (brass, oxblood, walnut, BioShock Columbia aesthetic) sebagai bridge palette antara warm medieval dan cold cyberpunk. PENDING explicit Ghaisan confirm. |

**Visual quality bar:**

> "yang bikin secara pixel dulu aja gaperlu high end graphic bagus versi gta, lu boleh cari referensinya ntar"

Pixel art baseline OK. Tidak harus GTA-level photorealistic. Tidak harus AAA studio quality. Tapi harus polished enough to feel intentional, bukan placeholder. Day 5 polish pass dedicated to bringing visual consistency.

**Tooling preference Ghaisan untuk visual:**

> "kita gunain fitur claude design yak biar cepet, karena boleh pake max plan juga kan, jadi gw bisa pake claude cowork (cari tau dulu fitur ini di internet biar lu tau pasti kemampuannya)"

Claude Design (Anthropic Labs, launched April 17, 2026, accessible via claude.ai/design atau Cowork plugin, runs Opus 4.7) jadi primary tool untuk generate UI mockup 3 world variations. Saves $500 credits karena runs di Max plan, bukan API.

**On Gemini/Nano Banana for assets:**

> "kita boleh bikin background pake gemini/nano banana apa kaga sih"

Ghaisan asked, V2 verdict: skip non-Anthropic image generation untuk shipped product. CC0 asset packs (Kenney.nl, OpenGameArt) sebagai primary, Opus-generated SVG/Canvas procedural overlay sebagai secondary. Cleaner license plus closer to "only Opus 4.7" spirit.

---

## SECTION 8: DEMO PHILOSOPHY - VISUAL PLUS BUSINESS FIRST

> "hackathon biasanya lebih ngeliat aspek bisnisnya/kegunaan daripada logikanya, maksud gw logikanya tetep penting, tapi kita utamain visual dan fitur utama kitanya"

> "aplikasi ini harus gampang dipresentasiin dalam artian visualnya bagus"

**Demo video narrative principles:**

- LEAD dengan business pain (indie creator plus customer hunt plus no marketplace, restaurant automation example), bukan technical architecture
- Blueprint Moment (menit 15-20 demo) yang surface technical depth framed as "kenapa Claude Code alone gak cukup", bukan as feature parade
- Marketplace plus Banking pitch emphasize monetization unlock untuk creators, bukan technology stack
- Prediction Layer story as risk reduction for buyers/users, bukan as Monte Carlo theory dump

**Visual polish non-negotiable:**

Day 5 dedicated polish pass (animation timing, color consistency, typography tune, loading states, error states). Kalau visual kurang Day 4, Nemea (QA agent) flag ke V2, V2 re-scope Day 5.

**Judge perspective Ghaisan model:**

Ghaisan ngerti judges (Anthropic staff plus Cerebral Valley) akan evaluate dengan rubric Impact 30% plus Demo 25% plus Opus 4.7 Use 25% plus Depth 20%. Demo 25% standalone, plus Impact 30% weight kemampuan jelaskan WHY this matters (business angle). Total roughly 55% weight di non-pure-technical aspect. Sisanya Depth plus Opus 4.7 use, tapi keduanya more compelling kalau visual demo nya kuat dulu.

---

## SECTION 9: MODULAR CONTRACT DISCIPLINE - CRITICAL BLOCKER

Quote dengan emphasis tinggi (Ghaisan use kata "kritis banget"):

> "harus ada agent yang design modular kontrak biar semua hasil bisa konsisten (meminimalisir bug/debugging), dan btw tambahin agent QA buat ngecek ada bug kaga"

> "karena kita dikejar waktu dan aplikasi nerium ini bisa dibilang besar banget, setelah agent2 claude code awal ngedefine modular kontrak/dokumen kritis yang wajib dibaca setiap agent selesai, para executor harus bisa dijalankan secara pararel dalam artian gw bisa buka lebih dari 4 terminal sekaligus dan nyalain claude --dangerously-skip-permissions"

> "yes semuanya bakal gw nyalain claude --dangerously-skip-permissions makanya gw kritis banget di bagian agent2 awal ini, gw pengen setiap modular kontrak spesifikasi segala macemnya udah jelas di awal"

**Why this is critical:**

Ghaisan plan untuk run 4+ Claude Code terminal SIMULTANEOUSLY dengan `--dangerously-skip-permissions`. Mode ini auto-execute every action tanpa konfirmasi. Kalau modular contract ambiguous:
- Worker A interpret schema X way
- Worker B interpret schema Y way (slightly different)
- Output incompatible
- Detected later dengan integration error
- Fix requires either rerun (token waste) atau manual reconciliation
- 4 paralel terminal = 4 kali conflict cost

**Pythia (modular contract designer) jadi STRICT BLOCKER:**

- No Worker spawn before Pythia output complete
- No exception
- Each contract harus eksplisit: schema (JSON, TypeScript interface), API contract (endpoints, methods, payloads), event signature (event bus topics, payload shape), file path convention (where output goes), naming convention (variables, files, functions)
- Cross-cutting concerns: error format, logging format, telemetry format

**Mandatory reading per Worker agent (non-negotiable):**

1. `_meta/NarasiGhaisan.md` (this doc)
2. `CLAUDE.md` root
3. Pythia contract files relevant to assigned task
4. Agent prompt file specific to this agent

Hephaestus akan bake mandatory reading list ke setiap agent prompt file's hard_constraints.

**QA agent (Nemea):**

> "tambahin agent QA buat ngecek ada bug kaga"

Nemea runs Loop C regression pattern across feature modules. Scoped checks:
- Contract conformance (does module implement Pythia contract?)
- Bug sweep (obvious runtime errors, null reference, type mismatch)
- Accessibility sanity (basic a11y, keyboard nav, contrast ratio)
- Demo-path E2E walkthrough

> "opus 4.7 sekarang udah bisa scroll aplikasi buatannya jadi bisa gunain itu buat fitur reviewer, biar uinya bagus"

Opus 4.7 computer use capability (April 2026) lets Nemea visually inspect UI: launch dev server, scroll-test rendered app, screenshot artifacts, flag visual regression. Bake ini ke Nemea spec.

---

## SECTION 10: PARALLEL EXECUTION MANDATE

Beyond contract discipline, Ghaisan eksplisit set parallel execution sebagai design requirement:

> "para executor harus bisa dijalankan secara pararel dalam artian gw bisa buka lebih dari 4 terminal sekaligus"

**Architecture implication:**

Agent structure design HARUS support parallel-by-default execution model. Specifically:

- Workers grouped into "parallel groups" (P1, P2, P3, dst)
- Within a group, all agents run simultaneously, zero dependency conflict
- Between groups, sequential dependency (P2 starts only after P1 done)
- Group P1 = first wave parallel after Pythia contracts complete
- Group P2 = second wave, depends on P1 outputs (e.g., visual assets depend on contract definitions)
- Group P3 = third wave, polish plus integration

Metis M2 deliverable include explicit "parallel group" assignment per agent, dengan dependency graph yang prove correctness.

**Workflow Ghaisan envision:**

Terminal 1: `claude --dangerously-skip-permissions` running Worker for Builder Foundation
Terminal 2: `claude --dangerously-skip-permissions` running Worker for Marketplace UI
Terminal 3: `claude --dangerously-skip-permissions` running Worker for Banking visualization
Terminal 4: `claude --dangerously-skip-permissions` running Worker for Registry card
Terminal 5: `claude --dangerously-skip-permissions` running Worker for Protocol mock dialog

5 terminal jalan simultaneously selama 30-60 menit per group. Wallclock saved 4-5x vs sequential. Token budget saved minimal (same total work) but TIME savings massive untuk 5-day deadline.

---

## SECTION 11: HEPHAESTUS BATCH PATTERN - MEDWATCH LESSON

> "buat Hephaestus gw saranin buat bikin sekaligus semua prompt filenya aja buat ngehemat token dan mempercepat waktu, kecuali kalo dia udah nyentuh context 97% baru stop dan lanjut ke Hephaestus selanjutnya (ini lesson gw dari yang medwatch, alias lama banget bikin prompt filenya, dan hindari Ferry yang terlalu berlebih antara agent dengan orchestrator)"

**Lesson source:** Ghaisan's MedWatch parallel project. V5 handoff Section 10.9 documents 215 min wall-clock 86 tool_uses 76/76 self_check PASS via Option D batch execution pattern.

**Anti-pattern di MedWatch:**

Per-file ferry pattern: Hephaestus write 1 prompt file, halt, ferry summary ke V2, V2 review, V2 greenlight, Hephaestus write next file, halt, ferry, dst.

Result: 15-20 menit overhead per file untuk ferry plus review cycle. 20 files times 15 min = 5 jam ferry overhead alone.

**Correct pattern: Auto-greenlight batch**

Hephaestus single session, batch ALL prompt files until context hit 97%. No per-file ferry. V2 review at end of batch. Saves 5 plus jam wallclock.

Kalau context approach 97%, Hephaestus halt dengan partial output, V2 review, Hephaestus-2 spawn for remaining files dengan context fresh.

**Implication:**

Metis M2 must produce agent structure yang Hephaestus dapat write semua prompt files dalam single session if possible (20-25 agents times 1500 token per prompt = 30-40K tokens output, fits in single Opus session easily).

Kalau jumlah agent > 30 atau prompt complexity > 3K token per file, multi-Hephaestus session jadi mandatory. Plan accordingly di structure design.

---

## SECTION 12: TOOLING PREFERENCES PLUS AWARENESS

Ghaisan keeps up dengan AI tooling landscape closely. Several tooling-specific directives:

**On Claude Cowork:**

> "kita gunain fitur claude design yak biar cepet, karena boleh pake max plan juga kan, jadi gw bisa pake claude cowork (cari tau dulu fitur ini di internet biar lu tau pasti kemampuannya)"

- Cowork = Claude desktop app feature, available pada Pro/Max/Team/Enterprise
- Underneath same engine sebagai Claude Code, simplified UI for non-coder
- Use case fit untuk NERIUM: occasional non-technical touches (README polish, file organization), bukan core development

**On Claude Design:**

> "Terus lu mention Claude Design, lu kayanya salah nangkep, itu fitur baru claude cowork buat bikin ui design, cari lagi info terbarunya, ini nyampe bikin saham figma anjlok"

- Claude Design launched April 17, 2026 by Anthropic Labs
- Powered by Opus 4.7 vision model
- Caused Figma stock 7% drop because positioned as design tool replacement
- Access: claude.ai/design web atau Cowork plugin
- Use untuk NERIUM: generate UI mockups (3 worlds, Builder UI, Marketplace landing, dashboard) free pada Max plan

**On MCP gamification:**

> "ada MCP yang worth it buat dipake bikin gamification ini kaga. pasti ada tapi bagus ga, bandingin sama kualitas/kemampuan claude opus 4.7 yang ori. dan okay ternyata kalo gaboleh pake agent lain, kita pure pake opus 4.7 aja berarti ya"

- Ghaisan ask comparison, bukan blind install
- Care about kualitas/kemampuan Opus 4.7 ori
- Accept "pure Opus 4.7 only" karena understand hackathon constraint
- V2 conclusion: skip game-asset MCPs (semua route ke non-Opus image models), use CC0 packs plus Opus-generated procedural

**On Opus 4.7 computer use:**

> "opus 4.7 sekarang udah bisa scroll aplikasi buatannya jadi bisa gunain itu buat fitur reviewer, biar uinya bagus"

- Awareness of latest Opus capability (April 2026)
- Suggestion: use computer use for QA visual review (Nemea agent)
- Bake ke Nemea spec

**On dangerously-skip-permissions:**

- All Claude Code execution uses this flag
- No interactive confirmation
- Speed-optimized, contract-relied-upon discipline
- Tradeoff explicit: faster execution plus larger blast radius if contracts ambiguous

---

## SECTION 13: COMMUNICATION STYLE - META-FEEDBACK FOR NERIUM TOO

Ghaisan repeatedly emphasizes brevity:

> "gw belum baca semua wait ntar gw baca lagi response lu yang tadi, dan buat selanjutnya responnya dikit2 aja pls biar gw gaperlu bingung langsung baca sekaligus"

> "gw tegasin ulang, jawabnya singkat-singkat aja pls, ini evaluasian buat lu, sekalian buat Nerium Builder juga, orang non teknis gamau AInya nanya panjang-panjang"

**Meta-feedback applicable to BOTH:**

1. **V2 orchestrator behavior:** Conversational replies tighter, less sprawling. Bullet over paragraph when listing. Direct over hedged. Surface critical info at top of message.

2. **NERIUM Builder UX implication:** Advisor character chat surface MUST respect non-technical user attention budget. No AI-style verbose paragraphs. Step-by-step guidance dengan minimum questions per step. Default to action over explanation. Show progress visually rather than narrate textually.

**Builder UX principle locked:** 
- Advisor turns short, 3 sentences typical maximum
- Question per Advisor turn ideally 1, max 2
- Long context user doesn't read = friction, abandonment risk
- Replace text with visual where possible (progress bars, agent activity indicators, building visualization)

**Anti-pattern di NERIUM Builder UX:**

- AI yang ngomong paragraph 5+ kalimat
- Multiple questions in single message
- Technical jargon tanpa simpler alternative
- "Are you sure you want to proceed?" friction text instead of clear visual confirmation

---

## SECTION 14: IDENTITY PLUS REPO

> "akun github gw Finerium yak"

- GitHub username: `Finerium`
- Repo identity: `github.com/Finerium/nerium`
- Public initially OR public on submission (both acceptable per hackathon rules, recommend public from Day 0 for transparency)
- MIT license, OSI-approved per hackathon mandate
- Discord handle: `nerium0leander` (per V1 handoff Section 3.12)

---

## SECTION 15: TRUST PLUS DELEGATION PATTERN

Important meta-signal yang affect how downstream agents interpret directives:

> "Buat agent, bebas, gimana lu aja yang design, lu tinggal kasih tau gw, gw perlu ngerun agent mana dan lu bikinin opening promptnya dan kasih tau gw itu agent claude code atau apa"

> "claude chat cuman gw gunain buat ngobrol sama lu para orchestrator dan buat ngedefine para researcher, sisanya kaga akan gw baca soalnya lu lebih pinter buat ngedesign agentic structurenya daripada gw"

**Trust pattern unpacked:**

- Ghaisan delegates strategic decisions to V2/Metis/specialists liberally
- Explicit: "lu lebih pinter buat ngedesign agentic structurenya daripada gw"
- Won't read agent structure outputs ("sisanya kaga akan gw baca")

**Implication:**

Agent structure plus prompt files MUST be self-explanatory dan correct first-time. Ghaisan tidak akan catch error via review, dia trust V2/Metis/Hephaestus output. Self_check protocol enforcement critical karena human review fallback minimal.

Pythia contract clarity even more critical karena downstream Workers run with `--dangerously-skip-permissions`, no human-in-loop catching ambiguity.

**Decision delegation explicit:**

- Demo app domain: defer ke V2 ("hmm jujur masih bingung, gw serahin ke lu lagi aja")
- Tech stack: defer ke V2 ("yep gimana lu aja")
- Specialist agent design: defer ke V2 ("Buat agent, bebas, gimana lu aja yang design")
- 3rd world pick: defer ke V2 ("apalagi 1 lagi")
- Sleep schedule: defer ("bentar dulu ini, fokus aplikasinya dulu aja")

**Decision retention explicit:**

- Vision (NERIUM startup post-hackathon)
- Builder hero plus 5-pillar full scope
- Builder model flexibility
- Production-grade output bar
- Modular contract discipline
- Hephaestus batch pattern
- 3-world deliverable
- Visual plus business priority
- Solo team
- GitHub Finerium

**For ambiguous matters, Ghaisan halt-and-ask preferred over silent-assume:**

If Metis/Hephaestus/Worker hit strategic decision yang ambiguous in NarasiGhaisan.md, halt eksplisit dengan question list plus recommendation plus reasoning. Ghaisan akan answer fast (his pattern: short batch responses) and unblock.

---

## SECTION 16: ANTI-PATTERNS - WHAT GHAISAN REJECTS

Aggregated dari pushback, corrections, dan emphasis "jangan":

**Hard rules (no exception):**

> "btw sangat dilarang sama gw, gaboleh pake em dash buat apapun"

- No em dash (U+2014) anywhere, any output, any agent
- This includes: documentation, code comments, README, demo script, agent prompts, contract files, EVERYTHING
- Use comma, period, parens, or sentence break instead

> "jangan pake emoji"

- No emoji anywhere
- This includes: README, docs, agent prompts, code comments

**Workflow rules:**

> "tar yak jangan dulu eksekusi apa-apa kalo udah bener2 sepakat baru eksekusi bikin2"

- No execution before explicit Ghaisan greenlight
- Discuss-first, execute-after pattern
- Even when V2 thinks plan is clear, wait for explicit go signal

> "JANGAN bilang gabisa buildable, hilangin itu, DAN ANGGAP SEMUA IDE GW YANG ADA DI ZIP FILE BISA DILAKUIN DALAM 6 HARI DALAM BENTUK PROTOTYPE"

(From V1 handoff anti-pattern Section 7.1, original Ghaisan directive)

- No scope-narrow suggestion under any circumstance
- Operate from "all 5 pillars buildable as prototype" axiom
- Don't re-litigate scope feasibility

**Reading discipline rules:**

> "responnya dikit2 aja pls"

- Brevity always preferred over completeness
- If long response unavoidable, structure for skim (headers, bullets, top-loaded critical info)
- Avoid wall-of-text

**Communication anti-patterns:**

- Don't ask multiple questions per message (Ghaisan tracks one decision at a time)
- Don't preface with extensive context dump before getting to actionable point
- Don't apologize excessively for misunderstanding
- Don't add unsolicited praise or filler

**Tooling anti-patterns:**

- Don't suggest non-Anthropic models for shipped product (Gemini, Higgsfield etc OK in NERIUM Builder UI as feature, NOT OK in hackathon execution)
- Don't suggest commercial tools yang bukan part of Ghaisan's existing stack (Max plan, Claude Code, Cowork)
- Don't suggest Vercel deploy yet (Ghaisan flagged "kemungkinan gaakan di vercel, ntar gw kasih tau aja")

---

## SECTION 17: SELF-AWARENESS FLAGS

Things Ghaisan said about himself yang downstream agents harus aware:

**On reading capacity:**

> "gw belum baca semua wait ntar gw baca lagi response lu yang tadi"

- Ghaisan reads carefully but takes time
- Don't expect instant comprehension of long outputs
- Respect his reading pace, batch responses thoughtfully

**On technical depth:**

> "lu lebih pinter buat ngedesign agentic structurenya daripada gw"

- Self-acknowledge orchestrator/architect superior at structure design
- Defer trust pattern (see Section 15)

**On energy level:**

(V1 handoff Section 10.10 plus post-UTBK context)

- Just finished UTBK SNBT 2026 hari ini (Selasa 21 April morning)
- Energy 60% capacity per V1 estimate
- Should not push extreme work hours Selasa-Rabu
- Real intensive build starts Rabu morning

**On communication need:**

> "orang non teknis gamau AInya nanya panjang-panjang"

- Self-identify with non-technical user pain
- Builder UX principle informed by his own preference
- When Ghaisan uncomfortable with verbosity, target Builder users WILL be too

**On documentation values:**

> "semua proses kita harus didokumentasiin, ntar suruh si claude code buat dokumentasiin"

- Document-everything discipline
- Auto-document during execution (Ananke role)
- Documentation serves: future-self (refactor post-hackathon), team-of-one (Ghaisan only), audit (judges plus community)

**On self-deprecation about own input:**

> "yappingan gw yang tadi"

- Ghaisan calls his own explanations "yappingan" (rambling), self-effacing
- Don't take this literal, his "yappingan" carries strategic directives
- Treat with weight equal to formal documentation

---

## SECTION 18: READING PATTERN

> "sisanya kaga akan gw baca"

> "gw belum baca semua wait ntar gw baca lagi response lu yang tadi"

**Implication for agent output:**

- Agent structure file (Metis M2) MUST be self-explanatory plus correct first-time. Ghaisan won't catch errors via review.
- Each agent's prompt file (Hephaestus output) similarly. Workers depend on prompt file alone, no Ghaisan oversight.
- Pythia contract files: critical, but Ghaisan also won't read these. Pythia must self-check 19-item before commit.
- Nemea QA reports: Ghaisan won't read full bug list. Surface top 3-5 critical issues with clear severity plus suggested fix.
- Daily orchestration log (Ananke): Ghaisan won't read every entry. Surface only flagged decisions or anomalies via V2 ferry.

**What Ghaisan DOES read:**

- V2 orchestrator messages in this chat (interactive, real-time)
- Halt summaries from specialists (concise, actionable)
- Demo video script (he'll review before recording)
- README final draft (he'll review before submission)
- Final agent_flow_diagram.html (visual, fast comprehension)

---

## SECTION 19: HACKATHON CONTEXT - URGENCY PLUS TIMING

**Aggregated context:**

- UTBK SNBT 2026 selesai pagi hari Selasa 21 April 2026
- Hackathon kickoff Selasa 21 April 23:30 WIB (12:30 PM EDT)
- Effective build window dimulai Selasa malam, 5 hari intensive
- Submission deadline Senin 27 April 07:00 WIB hard
- Solo team locked
- $500 API credits cap untuk Claude Code execution
- Max plan reserved untuk V2 chat, Metis chat, Cowork, Claude Design, occasional setup
- 3-min demo video MAX, 100-200 word written summary, public OSS GitHub MIT licensed
- Judging: Impact 30%, Demo 25%, Opus 4.7 Use 25%, Depth 20%
- Special prizes targets: Best Managed Agents Use $5K (high alignment), Most Creative Opus 4.7 Exploration $5K (medium alignment), Keep Thinking $5K (medium-low alignment)
- Discord handle: nerium0leander
- Joined Discord (per Ghaisan confirmation Selasa malam)
- API credits $500 status: belum landing (per Ghaisan confirmation Selasa malam, expected post-kickoff confirmation)

**Deferred to next orchestrator:**

- Deploy platform decision (Ghaisan: "kemungkinan gaakan di vercel, ntar gw kasih tau aja, mungkin di orches selanjutnya")
- Sleep schedule discipline (Ghaisan: "fokus aplikasinya dulu aja")

---

## SECTION 20: ORIGIN CREDENTIAL PATTERN - PUBLIC SURFACE

**Beyond docs reference:** Ghaisan lived experience with multi-agent manual orchestration is THE credibility anchor for NERIUM thesis.

**Public surface narrative locked:**

"Saya manually menjalankan pipeline 47-agent 9-fase 106-step untuk build Personal Investment AI Assistant. Saya tau setiap handoff, setiap dependency, setiap failure mode. NERIUM Builder mengotomasi apa yang saya lakukan secara manual. Submission ini sendiri built BY running that exact manual workflow ONE LAST TIME."

**Honest framing per Section 3.11 plus Section 7.4 V1 handoff anti-patterns:**

- Investment AI IDX still blueprint stage, NOT executed live
- Don't claim shipped
- Frame as "I architected this in detail to know it works in principle, and I've executed similar pipelines manually for other projects (MedWatch parallel ongoing)"

**Other shipped/in-progress projects Ghaisan can claim honestly:**

- XAU/USD algorithmic trading signal system (10-layer, 48 conditions, 15 quantitative methods, 3800+ tests, "fully assembled local, not pushed public")
- MedWatch drug safety monitoring plus clinic management (deep in execution, course project)
- 30-day quantitative trading portfolio challenge (in middle of run)
- Investment AI IDX (blueprint stage, planted seed for NERIUM)

**Anti-claim filter:**

NEVER mention as shipped products in public surface (per V1 handoff Section 7.4):
- ThermoVision AI
- SoilSense
- Omniear
- QRIS SCORE
- PERISAI

These were earlier project explorations, none shipped. Don't over-claim.

---

## SECTION 21: META FROM GHAISAN ABOUT THIS DOCUMENT

> "narasi gwnya bisa dijadiin lebih komprehensif lagi ga, gw takutnya poin gw ga kesampein"

This very NarasiGhaisan.md exists because Ghaisan worried his points won't get through to downstream agents. He requested expansion to maximize signal preservation.

**Implication for agents reading this:**

If you're reading this doc, Ghaisan personally cared enough about getting his vision across that he asked for expanded version. Treat directives here with weight equal to formal contracts. Voice anchor for ANY architectural decision ambiguity.

If lu (downstream agent) hit ambiguity:
1. Re-read relevant section here for context
2. Cross-reference with NERIUM_PRD.pdf for technical detail
3. Halt plus ferry question to V2 if still ambiguous
4. NEVER silent-assume

---

## SECTION 22: DOCUMENTATION DISCIPLINE

> "btw semua proses kita harus didokumentasiin, ntar suruh si claude code buat dokumentasiin, fase orchestration kita juga dokumentasiin"

**Document-everything mandate:**

- Code: inline comments where non-obvious logic appears
- Architecture: separate doc per major decision (why this, what alternatives, what tradeoff)
- Orchestration: daily log Ananke maintain, decision tracker, ferry transcript summaries
- Specialist runs: each specialist halt message captured in log
- Bug + fix history: Nemea QA tracker
- Cost tracking: token spend per phase, running total

**Format conventions:**

- Markdown standard
- Frontmatter when relevant (date, author, status, version)
- Cross-references via relative paths
- Diagrams via Mermaid kalau memungkinkan, ASCII tree fallback
- LaTeX for math

**Documentation serves:**

- Refactor post-hackathon (Ghaisan can return after weeks and resume work)
- Team-of-one continuity (no team member to verbally hand off, docs ARE the handoff)
- Audit trail (judges reviewing can see process not just product)
- Public surface (README is documentation surface that users see)
- Future orchestrator handoffs (V3, V4, etc. inherit context via docs)

**What NOT to over-document:**

- Obvious code (don't comment "this is a for loop")
- Internal-only decisions that don't affect cross-agent coordination
- Process meta about the process meta (avoid documentation Inception)

---

## SECTION 23: BRAND IDENTITY HINTS

Ghaisan didn't explicitly define brand voice, but signal aggregated from:

- Cyberpunk aesthetic preference (NERIUMcyberpunkcity.html palette, mysterious + futuristic)
- "NERIUM" name itself (flowering plant, beautiful but toxic, named for a Greek nymph, dual-natured)
- "Built itself" meta-narrative (recursive, self-aware, intellectual humility plus bravado)
- 3 world game theme (playful, varied, refuses single visual lock-in)
- Production-grade ambition (serious, not toy)
- Indonesian roots dengan global infrastructure positioning (local origin, global scope)

**Brand voice hypothesis (V2 inference):**

- Confident but not arrogant
- Technical depth but explains via metaphor (Minecraft, Tokopedia, Stripe, DNS, HTTP, kaya listrik)
- Self-aware about being AI-assisted built
- Welcomes scrutiny (open source mandate aligns)
- Beautiful but functional (cyberpunk visual depth, real product underneath)

**Public surface tone direction:**

- README: technical clear, founder voice present (first person OK), 5-pillar narrative spine
- Demo video script: pain hook + pillar walkthrough + meta-narrative close + roadmap teaser
- Twitter announcement (if Ghaisan posts): casual but substantive, lead with concrete pain not abstract vision
- Discord engagement: humble, ask questions, share progress, no over-promise

---

## CLOSING META-NOTE

V1 handoff Section 6 working style applies in full force here. Specifically:

- Indonesian gw/lu register conversational
- English technical artifacts
- No em dash, no emoji
- LaTeX for math
- Direct honest assessment over false optimism
- Push-back welcomed if disagreement, surface with reasoning
- Batch ferry density for coordination efficiency

V1 Section 10 emergency protocols inherited:
- Compacting awareness 60-70% capacity
- Stream hygiene markers
- Token optimization surgical reading list
- Auto-greenlight batch pattern
- Hackathon-specific deadline adherence
- Demo-path-only feature discipline
- Technical debt discipline (acceptable for hackathon, refactor post)

NERIUM is Ghaisan's flagship. Treat every artifact accordingly.

If you (downstream agent) make a decision yang affect cross-cutting concerns (architecture, contract, naming, tier routing, scope), and that decision is not eksplisit covered in this doc atau di formal NERIUM dokumentasi, HALT. Surface to V2. V2 ferry to Ghaisan. Do not silent-assume.

If you (downstream agent) are tempted to deviate from any directive here because "it would be better if...", HALT. Surface alternative dengan reasoning. Wait for explicit Ghaisan greenlight before deviating.

Ghaisan worked hard to make this doc comprehensive. Honor that work by reading carefully and acting accordingly.

---

**End of NarasiGhaisan.md (Expanded v1.1)**

*Document version 1.1 expanded by V2 Hackathon Orchestrator. Source conversation: Claude.ai chat session Selasa 21 April 2026 evening WIB, post-UTBK pre-Metis spawn. Quote integrity preserved verbatim where applicable. Structural expansion includes: anti-pattern aggregation, trust + delegation pattern, self-awareness flags, reading pattern guidance, brand identity hints, documentation discipline, meta-note about doc itself.*
