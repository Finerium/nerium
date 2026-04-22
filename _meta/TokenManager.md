# NERIUM Hackathon Token Manager v2 (slim)

**Budget Total:** $500 API credit
**Truth source:** platform.claude.com account page (live actual). This ledger is summary only, NOT source of truth.
**Distribution:** 95% Opus 4.7, Cassandra Sonnet exception.

## Reconcile Baseline 2026-04-22 (V3 to V4 handoff)

Current account remaining per platform check: **$425**. Spent so far: **$75**.

Prior ledger (see `TokenManager_v1_messy.md`) drifted due to cumulative append arithmetic errors across 16 rows (Athena-v2 delta not propagated, Apollo/Cassandra backfill out of order, Helios /cost unavailable estimated). This v2 ledger resets baseline to actual account state and tracks forward only.

Historical session costs (approximate, not authoritative):
- Pythia $6.41, Hephaestus $4.76
- P1 Leads v1: Demeter $1.51, Tyche $2.00, Hecate $2.64, Athena $3.32, Proteus $3.25
- P1 Leads v2: total ~$15-20 across 5 reviews
- P2 wave 2a so far: Apollo $6.06, Cassandra $2.87, Helios ~$8 (estimate), Heracles $5.81

## Going Forward Format

Slim append pattern. Notes max 1 sentence. Detailed rationale lives in git commit messages + agent decisions.md files.

| # | Date | Agent | Session USD | Account Remaining (from platform) | Commit SHA | Note (1 line) |
|---|------|-------|-------------|-----------------------------------|------------|---------------|

---

**Next append:** Post-P2 completion (Erato), P3a batch, P3b batch, P4 Harmonia, P5 Nemea. Update Account Remaining from platform, not cumulative math.
