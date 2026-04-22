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
