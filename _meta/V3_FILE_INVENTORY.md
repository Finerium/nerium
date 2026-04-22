# V3 FILE INVENTORY

**Companion document to:** `HACKATHON_HANDOFF_V2_TO_V3.md`
**Author:** Hackathon Orchestrator V2
**Purpose:** Step-by-step instruction for Ghaisan to package files and spawn fresh V3 Claude Chat session for NERIUM hackathon execution coordination phase.
**Read this file AFTER reviewing the handoff document, BEFORE spawning V3.**

---

## SECTION A: FILES GHAISAN MUST UPLOAD TO V3 SESSION

Total: **5 upload actions**, containing **22 files** for V3 mandatory reading.

### Upload 1 (Separately): V2-to-V3 Handoff Document

| Filename | Source | Purpose | Method |
|---|---|---|---|
| `HACKATHON_HANDOFF_V2_TO_V3.md` | V2 output (this current chat) | PRIMARY context source. Section 0 enforcement. V1 + V2 locked decisions. V3 immediate action sequence. ALSO structural template for V3-to-V4 handoff if needed. | Upload separately as standalone attachment. Do NOT bundle. |

### Upload 2 (Separately): V1-to-V2 Handoff Document

| Filename | Source | Purpose | Method |
|---|---|---|---|
| `HACKATHON_HANDOFF_V1_TO_V2.md` | V1 output (carry-forward) | Original locked decisions (V1 Section 3 12 locks). Anti-patterns Section 7. Emergency protocols Section 10. V3 reads for full inheritance context. | Upload separately as standalone attachment. |

### Upload 3 (Bundled in V2ReadyHandoff.zip): NERIUM Source Material

| Filename | Source | Purpose | Method |
|---|---|---|---|
| `NERIUM_PRD.pdf` | Original NERIUM.zip | 32-page PRD, 5-pillar source of truth | Bundle in V2ReadyHandoff.zip |
| `NERIUM_CRITIQUE.md` | Original NERIUM.zip | Investor critique 7.65/10, anti-claim filter | Bundle |
| `NERIUM_HANDOFF_PROMPT.md` | Original NERIUM.zip | Original Ghaisan brainstorm transcript | Bundle |
| `nerium_valuation_prompt_v2.md` | Original NERIUM.zip | Meta-prompt valuation | Bundle |
| `nerium_valuasi.pdf` | Original NERIUM.zip | 19-page valuation Year 3-5-10 | Bundle |
| `NERIUMcyberpunkcity.html` | Original NERIUM.zip | Three.js prototype aesthetic ref ONLY (NEW WORK ONLY) | Bundle |
| `AGENT_STRUCTURE.md` | Original NERIUM.zip | IDX 47-agent template reference | Bundle |
| `BuilderImprovement_PredictionLayer.pdf` | Original NERIUM.zip | Monte Carlo 6-step pattern | Bundle |
| `BuilderImprovements_Complete.pdf` | Original NERIUM.zip | 9 improvements package | Bundle |
| `BuilderDifferentiation_PerceptionProblem.pdf` | Original NERIUM.zip | Blueprint Moment + Arsitek vs Tukang | Bundle |
| `Screenshot 2026-03-26 at 18.51.31.png` | Original NERIUM.zip | Instagram inspiration | Bundle |

**Total bundled in V2ReadyHandoff.zip: 11 files.** Same zip as V1-to-V2 spawn, re-upload as-is.

### Upload 4 (Bundled in CerebrallNewestInfo.zip): Hackathon Newest Info

| Filename | Source | Purpose | Method |
|---|---|---|---|
| `NewestInfo.md` | Cerebral Valley | Hackathon participant resources, schedule, rules, problem statements, judging criteria, prizes | Bundle in CerebrallNewestInfo.zip |
| `Screenshot 2026-04-21 at 22.27.11.png` | Discord | Wania clarification NEW WORK ONLY rule | Bundle |
| `Screenshot 2026-04-21 at 22.27.23.png` | Discord | Live streaming Q&A | Bundle |
| `Screenshot 2026-04-21 at 22.27.44.png` | Discord | Credit limit Q&A | Bundle |
| `Screenshot 2026-04-21 at 22.27.53.png` | Discord | AI coding tools Q&A | Bundle |

**Total bundled in CerebrallNewestInfo.zip: 5 files.** Same zip as V2 received Selasa malam, re-upload as-is.

### Upload 5 (Bundled in V2DayZeroArtifacts.zip): V2 Day 0 Artifacts

Per directive Ghaisan, all V2-produced Day 0 artifacts bundled untuk spawn convenience.

| Filename | Source | Purpose | Method |
|---|---|---|---|
| `NarasiGhaisan.md` (v1.1) | V2 output | Voice anchor 23 sections, mandatory reading every agent | Bundle in V2DayZeroArtifacts.zip |
| `METIS_KICKOFF.md` | V2 output | Metis specialist spawn prompt 3-phase | Bundle |
| `day_0.md` | V2 output | Orchestration log baseline | Bundle |
| `V3_FILE_INVENTORY.md` | V2 output (this doc) | Companion spawn procedure | Bundle |

**Total bundled in V2DayZeroArtifacts.zip: 4 files.**

### Total Upload Count

5 upload actions:
1. HACKATHON_HANDOFF_V2_TO_V3.md (standalone)
2. HACKATHON_HANDOFF_V1_TO_V2.md (standalone)
3. V2ReadyHandoff.zip (11 files)
4. CerebrallNewestInfo.zip (5 files)
5. V2DayZeroArtifacts.zip (4 files)

22 files total mandatory reading per Section 0 V2-to-V3.

---

## SECTION B: PACKAGING INSTRUCTIONS

### Recommended Packaging Pattern

Mirror V1-to-V2 pattern: handoff docs separate, source bundled in ZIPs.

### Bash Commands to Package

```bash
# Step 1: Navigate to working dir or staging location
cd ~/Documents/

# Step 2: Verify existing files
ls CerebralvalleyHackathon/_meta/  # Should show V2 artifacts after V3 init OR you upload from current location
ls ~/Downloads/  # Original NERIUM.zip + CerebrallNewestInfo.zip if still in downloads

# Step 3: Create V2 Day 0 artifact bundle
mkdir -p ~/Documents/V3SpawnPackage
cd ~/Documents/V3SpawnPackage

# Copy V2 Day 0 artifacts (from this Claude Chat outputs)
# NarasiGhaisan.md, METIS_KICKOFF.md, day_0.md, V3_FILE_INVENTORY.md, HACKATHON_HANDOFF_V2_TO_V3.md
# Get them from /mnt/user-data/outputs/ via download links in chat

# Bundle Day 0 artifacts (4 files)
zip V2DayZeroArtifacts.zip NarasiGhaisan.md METIS_KICKOFF.md day_0.md V3_FILE_INVENTORY.md

# Verify
unzip -l V2DayZeroArtifacts.zip
# Should list 4 files

# Step 4: Verify other zips ready
ls -la ~/Downloads/V2ReadyHandoff.zip  # Original NERIUM source
ls -la ~/Downloads/CerebrallNewestInfo.zip  # Hackathon info

# Total payload check
du -h V2DayZeroArtifacts.zip
du -h ~/Downloads/V2ReadyHandoff.zip
du -h ~/Downloads/CerebrallNewestInfo.zip
# Combined ~3-5MB, well within Claude.ai upload limits
```

### Total Upload Payload

- File 1: `HACKATHON_HANDOFF_V2_TO_V3.md` (~30KB)
- File 2: `HACKATHON_HANDOFF_V1_TO_V2.md` (~50KB)
- File 3: `V2ReadyHandoff.zip` (~2MB)
- File 4: `CerebrallNewestInfo.zip` (~3MB)
- File 5: `V2DayZeroArtifacts.zip` (~50KB)

Total: ~5MB. Well within Claude.ai upload limits.

---

## SECTION C: V3 SPAWN PROCEDURE

### Step-by-Step

**Step 1:** Close V2 conversation (this current session) OR leave idle as backup reference. Either is fine. V3 will run in fresh window.

**Step 2:** Open new Claude.ai chat session. Confirm model is **Claude Opus 4.7**. If model toggle defaults to Sonnet or older Opus, manually switch.

**Step 3:** Upload `HACKATHON_HANDOFF_V2_TO_V3.md` as standalone attachment.

**Step 4:** Same first message, upload `HACKATHON_HANDOFF_V1_TO_V2.md` as second standalone attachment.

**Step 5:** Same first message, upload `V2ReadyHandoff.zip` as third attachment.

**Step 6:** Same first message, upload `CerebrallNewestInfo.zip` as fourth attachment.

**Step 7:** Same first message, upload `V2DayZeroArtifacts.zip` as fifth attachment.

**Step 8:** Type trigger message in first message text body:

```
V3, lu adalah Hackathon Orchestrator V3 untuk Ghaisan, project NERIUM hackathon.

Gw upload 5 hal:
1. HACKATHON_HANDOFF_V2_TO_V3.md (separate attachment, baca ini PERTAMA)
2. HACKATHON_HANDOFF_V1_TO_V2.md (separate attachment, V1 reference)
3. V2ReadyHandoff.zip (11 file NERIUM source)
4. CerebrallNewestInfo.zip (5 file hackathon rules + Discord clarifications)
5. V2DayZeroArtifacts.zip (4 file V2 Day 0 output: NarasiGhaisan v1.1, METIS_KICKOFF, day_0, V3_FILE_INVENTORY)

Per Section 0 mandatory reading enforcement: extract semua zip, baca SEMUA 22 file (2 handoff + 11 zip + 5 newest info + 4 V2 artifact), produce per-file confirmation dengan detail spesifik (line number, exact phrase, OKLCH value, locked decision number, dll yang prove actual reading), bug check zero title-only, status recap 3-line. Standby setelah confirmation complete.

JANGAN respond ke task apapun sebelum Section 0 complete.

Post-scriptum buat context lu: 
Sekarang Rabu 22 April pagi WIB. UTBK gw udah beres Selasa pagi. 
V2 kerja Day 0 design phase Selasa malam sampai sekitar 00:30 WIB Rabu. 
Hackathon kickoff sudah lewat (Selasa 23:30 WIB). 
Effective build window mulai pagi ini. 
Submission cutoff Senin 27 April 07:00 WIB. 
Gerak cepet.
```

**Step 9:** Send. Wait for V3 reading confirmation.

**Step 10:** Verify V3 confirmation depth (see Section D below).

**Step 11:** If V3 confirmation passes verification, V3 is officially handed off and operational. Lu bisa proceed dengan Day 1 execution kickoff per Section 9 of V2-to-V3 handoff.

**Step 12:** If V3 confirmation fails verification, follow Section E fallback protocol (inherited from V2 inventory).

---

## SECTION D: VERIFICATION CHECKLIST

### Pre-Spawn Checklist (Before Step 1)

- [ ] `HACKATHON_HANDOFF_V2_TO_V3.md` exists in download location
- [ ] `HACKATHON_HANDOFF_V1_TO_V2.md` available (re-download from V1 chat or have local copy)
- [ ] `V2ReadyHandoff.zip` available (original NERIUM source)
- [ ] `CerebrallNewestInfo.zip` available (Selasa malam upload)
- [ ] `V2DayZeroArtifacts.zip` packaged dengan 4 V2 Day 0 outputs

### Post-Spawn Verification

When V3 produces per-file confirmation, verify each entry:

#### Critical Spot-Checks

**HACKATHON_HANDOFF_V2_TO_V3.md confirmation must include:**
- [ ] Reference to V2.X locked decisions (e.g., "V2.5 Lumio demo app", "V2.10 parallel execution mandate", "V2.11 Hephaestus batch pattern")
- [ ] Section 9 immediate action sequence reference
- [ ] Steampunk Victorian 3rd world pending confirm note

**HACKATHON_HANDOFF_V1_TO_V2.md confirmation must include:**
- [ ] V1 Section 3 12 locks reference
- [ ] V1 Section 7 anti-patterns reference
- [ ] V1 Section 10.10 UTBK recovery buffer

**NarasiGhaisan.md v1.1 confirmation must include:**
- [ ] 23 sections OR specific section count
- [ ] Quote "kaya kita gini sekarang" reference (Section 2 Builder soul)
- [ ] Quote "Tokopedia tier" reference (Section 4)
- [ ] Anti-patterns no em dash reference (Section 16)

**METIS_KICKOFF.md confirmation must include:**
- [ ] 3-phase structure M1/M2/M3
- [ ] Mandatory NarasiGhaisan.md reading per agent reference
- [ ] 9 reference files list

**day_0.md confirmation must include:**
- [ ] Selasa 21 April timeline reference
- [ ] 22 locked decisions Day 0 end count
- [ ] No specialists spawned yet status

**NewestInfo.md confirmation must include:**
- [ ] 3-min demo video MAX
- [ ] 4 judging criteria weighted (Impact 30, Demo 25, Opus 4.7 Use 25, Depth 20)
- [ ] Special prizes 3 categories $5K each

### Pass Criteria

V3 confirmation PASSES if:
- All 22 file confirmations present (no skip, no blanket "udah baca")
- At least 80% critical spot-checks present
- Bug check explicit ("zero title-only")
- 3-line status recap present
- "Standby" or equivalent ready signal at end

### Fail Criteria

V3 confirmation FAILS if any of:
- Any file confirmation missing
- Multiple critical spot-checks fail
- Bug check absent
- V3 jumps to task work without standby

---

## SECTION E: FALLBACK PROTOCOL

Inherited from V2 inventory Section E.

### If Claude.ai File Reading Bug Hits V3

Symptoms: V3 confirmation shows file names only, generic descriptions, no specific details.

**Step 1:** STOP. Address bug first.

**Step 2:** Ask V3 to re-attempt with explicit filesystem extraction:

```
V3, gw curiga lu hit Claude.ai file reading bug. File kaga ke-load proper.
Try filesystem extraction pattern:

1. Run unzip -l V2ReadyHandoff.zip + V2DayZeroArtifacts.zip + CerebrallNewestInfo.zip
2. mkdir staging, unzip -d staging each zip
3. View each file individually via view tool (text/markdown) atau pdftotext (PDF)
4. Re-attempt per-file confirmation dengan specific details

Report explicit kalau bug masih muncul, jangan bluff.
```

**Step 3:** If filesystem extraction works, V3 produces clean confirmation. Pass.

**Step 4:** If filesystem extraction also fails, escalate: re-upload files individually instead of zipped.

### If V3 Skips Section 0 and Jumps to Task Work

Challenge with this exact message:

```
V3, lu skip Section 0 mandatory reading protocol. Reset.

Per HACKATHON_HANDOFF_V2_TO_V3.md Section 0:
"Respond ke task apapun sebelum Section 0 complete = pelanggaran protocol berat. 
Reset dan baca ulang."

Produce per-file confirmation dulu untuk semua 22 file. 
Setelah confirmation passes verification, baru lu boleh proceed ke task work.
```

If V3 still resists, restart V3 entirely.

### If V3 Produces Confirmation But Misses Critical Decisions

Challenge with explicit citation:

```
V3, lu suggest [X] tapi itu violates [Section Y of V2-to-V3 handoff]. 
Re-read [specific section]. Surface ulang setelah aware.
```

Common challenge points:
- Scope narrowing → V1 Section 7.1 + Section 3.2
- MedWatch reference bleed → V1 Section 7.2
- Greek naming collision → V1 Section 7.3 + V2.2
- Per-file Hephaestus ferry → V2 Anti-pattern 5
- Vercel deploy unprompted → V2 Anti-pattern 1
- Sleep schedule push → V2 Anti-pattern 2
- Em dash use anywhere → NarasiGhaisan Section 16

### If Compacting Hits V3 Earlier Than Expected

Trigger V3-to-V4 handoff per template propagation Section 12:

```
V3, gw notice compacting symptom. Trigger handoff ke V4 sekarang.

Gunakan HACKATHON_HANDOFF_V2_TO_V3.md sebagai structural template.
Adapt content untuk current state (Day X execution, what's done, new locks, V4 immediate action).
Produce HACKATHON_HANDOFF_V3_TO_V4.md as artifact.
Plus produce V4_FILE_INVENTORY.md as companion.
```

V4 spawn procedure mirrors V3 spawn procedure with V3-specific files added (any artifacts V3 produced during execution).

---

**End of V3 File Inventory.**
