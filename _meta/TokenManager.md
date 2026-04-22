# NERIUM Hackathon Token Manager

**Purpose:** Running ledger token usage + cost per specialist session. Setiap specialist WAJIB append 1 row setelah session selesai sebelum handoff.

**Budget Total:** $500 API credit (organization `a3feb2eb-d893-43f5-b4cf-0aab808c85c7`)
**Distribution Lock:** 95% Opus 4.7, 5% Sonnet 4.6 (Cassandra only), 0% Haiku (removed)
**Pricing Reference:** Opus 4.7 = $15/M input, $75/M output. Sonnet 4.6 = $3/M input, $15/M output.

## How To Append

After your session ends:
1. Run `/cost` slash command di Claude Code CLI untuk ambil total tokens + USD
2. Add new row ke table di bawah dengan increment nomor
3. Update Running Total USD kolom dengan cumulative sum
4. Commit: `chore: TokenManager append [specialist name]`

## Ledger

| # | Date | Specialist | Role | Model | Input Tokens | Output Tokens | Total Tokens | Session USD | Running Total USD | Budget Remaining | Notes |
|---|------|-----------|------|-------|--------------|---------------|--------------|-------------|-------------------|------------------|-------|
| 1 | 2026-04-22 | Pythia | Contract designer, 32 files | Opus 4.7 | 40 direct / 4.29M cached | 105.2K | 105.24K direct / 4.29M cached | $6.41 | $6.41 | $493.59 | 32 contracts shipped, self-check 19/19 pass. Actual $6.41 via heavy prompt caching (4M cache read, 288K cache write, 40 direct input, 105K output). Cache optimization reduced cost significantly below pre-cache estimate ($10-12 raw). Haiku 2.7K input negligible background. API duration 23m 4s, wallclock 26m 32s, 4016 lines added 1 removed. |
| 2 | 2026-04-22 | Hephaestus | Prompt authoring, 22 agent files | Opus 4.7 | 1.0K direct / 2.3M cached | 79.0K | 79.0K direct / 2.3M cached | $4.76 | $11.17 | $488.83 | 22 agent prompts shipped, self-check 19/19 pass. Heavy cache reuse (2.3M cache read + 261.8K cache write on Opus, 1K direct input, 79K output). Haiku 3.5K input background negligible ($0.0036). API duration 16m 47s, wallclock 17m 40s, 3364 lines added 0 removed. Zero halts, zero per-file ferry, single-session batch pattern per MedWatch V5 lesson honored. Commit 3b1734a. |
| 3 | 2026-04-22 | Demeter | Marketplace Lead P1, 5 artifacts | Opus 4.7 | 22 direct / 686.0K cached | 17.4K | 17.4K direct / 686.0K cached | $1.51 | $12.68 | $487.32 | 5 artifacts shipped (listing.schema.ts + categories.json + ranking_weights.json + demeter.output.md + demeter.decisions.md 9 ADRs), self-check 19/19 pass. Cache read 686K + cache write 117.5K on Opus, 22 direct input, 17.4K output. Haiku 610 input background negligible ($0.0007). API duration 4m 11s, wallclock 5m 55s, 565 lines added 0 removed. VendorOrigin naming reconciled vs Pythia contract in ADR-01 (contract canonical, nerium_builder additive). Weights sum 1.0 invariant verified. Commit 6607123. |
| 4 | 2026-04-22 | Tyche | Banking Lead P1, 5 artifacts | Opus 4.7 | 34 direct / 1.6M cached | 17.4K | 17.4K direct / 1.6M cached | $2.00 | $14.68 | $485.32 | 5 artifacts shipped (wallet.schema.ts + meter_contract.ts + tier_model.json + tyche.output.md + tyche.decisions.md 6 ADRs), self-check 19/19 pass. Cache read 1.6M + cache write 124.4K on Opus, 34 direct input, 17.4K output. Haiku 609 input background negligible ($0.0007). API duration 4m 52s, wallclock 7m 34s, 670 lines added 0 removed. Contract conformance billing_meter + transaction_event v0.1.0 verified. Pure mock posture (ADR-003) + USD/IDR locale bind (ADR-004) accepted per Ghaisan Decisions 1+2. Tier boundaries (ADR-001) + 15 pct platform fee (ADR-002) flagged proposed pending Ghaisan lock. Commit 8ab9203. |

## Running Projection (V3 estimate, reference only)

| Specialist | Estimated USD | Status |
|-----------|---------------|--------|
| Pythia | 3-5 | running |
| Hephaestus | 5-8 | pending |
| Workers 22 total | 80-120 | pending |
| Heracles MA runtime | 150 cap | pending |
| Dionysus Lumio bake | 36 | pending |
| Nemea QA | 15 | pending |
| Buffer | 160-210 | reserved |
| Total | 449-544 | tight, monitor |
