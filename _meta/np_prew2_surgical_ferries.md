# NP Pre-W2 Surgical Ferries: 2 Bug Fix Spawns

**Author:** Hackathon Orchestrator V5
**Date:** Jumat 24 April 2026 evening WIB
**Purpose:** Resolve 2 W1 closeout bug surfaced by Aether S3 + Hemera final reports before W2 6-pack fires.
**Total scope:** 2 terminal parallel, ~1 session each, low-effort, ~$2-4 combined.
**Status:** PRE-W2 GATE. 6-pack blocked sampai 2 ferry green.

## Context

Aether W1 S3 closeout (SHA `7041136`) + Hemera closeout (SHA `032590f`) flagged 2 cross-agent issue:

1. **Khronos MCP broken kwarg** blocks Kratos W2 Builder runtime MA orchestration (Kratos consume MCP layer from Khronos untuk MA session spawning). Demo-blocking kalo ga fix.
2. **Selene caplog structlog** observability test suite 2/3 fail at HEAD, not demo-blocking tapi regression noise risk W2+.

Alembic chain post-W1 merged at `82c4c84` (merge revision `f0cce6103282`), single head confirmed. W2 agent bebas append migration off merged tip.

## Pre-Spawn Checklist (both terminal identical)

1. Buka terminal baru
2. `cd ~/Documents/CerebralvalleyHackathon`
3. `claude --dangerously-skip-permissions`
4. `/status` confirm API Usage Billing
5. `/effort medium` (low-effort surgical tier, bukan xhigh)
6. Paste respective COPY block

## Concurrency

Fire Terminal A + Terminal B true-parallel detik 0. Zero dependency between them. Wall clock expected ~15-40 min each.

---

## Terminal A: Khronos FastMCP kwarg fix

**Scope:** Remove `version="0.1.0"` kwarg from `FastMCP.__init__()` call at `src/backend/mcp/server.py:32`. `mcp>=1.6.0` reject kwarg, causing 12 lifespan errors + 23 MCP test errors.

=== COPY START ===

# Khronos Surgical Ferry: FastMCP Kwarg Fix

Lu Khronos (Greek primordial time). Surgical bug fix session, scope **SINGLE FILE SINGLE CALL-SITE**. Bukan feature work, bukan expand scope.

**Working dir:** `~/Documents/CerebralvalleyHackathon/`
**Model:** Opus 4.7
**Effort:** medium
**Session:** 1 (expect ~15-25 min)
**Budget expected:** ~$1-2

## Mandatory reading (fast)

1. `CLAUDE.md` root (anti-patterns: no em dash, no emoji, no scope creep)
2. `_meta/NarasiGhaisan.md` (voice anchor)
3. `.claude/agents/khronos.md` (own prompt file full spec)

## Bug context

Aether W1 S3 closeout (SHA `7041136`) flagged:

- File: `src/backend/mcp/server.py:32`
- Call: `FastMCP.__init__(name="nerium-mcp", version="0.1.0", ...)`
- Issue: `mcp>=1.6.0` reject `version` kwarg
- Impact: 12 lifespan error + 23 MCP test error di whole-suite count

## Scope

**ONLY the following:**
1. Open `src/backend/mcp/server.py:32`
2. Remove `version="0.1.0"` from `FastMCP.__init__()` call
3. Kalo version metadata butuh exposed elsewhere (observability log, /health), move ke module-level constant `__version__ = "0.1.0"`, bukan kwarg
4. Run `.venv/bin/pytest tests/backend/mcp/ -q` confirm lifespan + MCP tests green
5. Run `.venv/bin/pytest tests/ -q --tb=no 2>&1 | tail -30` confirm zero regression outside MCP
6. Commit: `fix(mcp): remove unsupported version kwarg from FastMCP init`

**Zero scope outside this file** kecuali absolutely required biar tests pass.

## Halt protocol

- Kalo `pytest tests/backend/mcp/` masih fail post-fix, halt + surface actual failure ke V5
- Kalo ada test fail unrelated to MCP (e.g. Selene caplog), **jangan touch**. Selene parallel ferry sedang handle.
- Post-commit emit: `Khronos ferry complete. SHA {hash}. tests/backend/mcp/ green {N/N}.`

Begin.

=== COPY END ===

---

## Terminal B: Selene caplog structlog fix

**Scope:** `tests/backend/obs/test_log_shape.py` caplog ga capture structlog stdout stream via custom ProcessorFormatter. 2/3 test fail at HEAD, pre-existing confirmed by Hemera stash-verification.

=== COPY START ===

# Selene Surgical Ferry: caplog structlog Capture Fix

Lu Selene (Greek Titan moon, observability lead). Surgical bug fix session, scope **SINGLE TEST FILE + minimal fixture adjust**. Bukan feature work, bukan refactor production structlog.

**Working dir:** `~/Documents/CerebralvalleyHackathon/`
**Model:** Opus 4.7
**Effort:** medium
**Session:** 1 (expect ~15-30 min)
**Budget expected:** ~$1-2

## Mandatory reading (fast)

1. `CLAUDE.md` root
2. `_meta/NarasiGhaisan.md`
3. `.claude/agents/selene.md` (own prompt file full spec)

## Bug context

Hemera W1 closeout (SHA `032590f`) confirmed 2/3 `tests/backend/obs/test_log_shape.py` fail at HEAD, pre-existing, unrelated to Hemera scope. Root cause: structlog via custom ProcessorFormatter writes to stdout stream yang pytest `caplog` fixture ga intercept.

## Scope

**ONLY the following:**
1. Investigate `tests/backend/obs/test_log_shape.py` identify which 2 of 3 test fail
2. Fix capture path, priority urutan:
   - (a) Use `capsys`/`capfd` fixture instead of `caplog` (capture stdout/stderr direct)
   - (b) Configure structlog test-time route via fixture yang inject testable handler into `structlog.configure()` during test setup
   - (c) Use `pytest-structlog` library kalo already di `pyproject.toml`/`requirements` (check dulu, jangan add dep)
3. **Jangan modify production** `src/backend/obs/logging.py` configuration unless fix genuinely require touching it (in which case preserve production behavior exactly, add test-only helper)
4. Run `.venv/bin/pytest tests/backend/obs/ -v` confirm 3/3 green
5. Run `.venv/bin/pytest tests/ -q --tb=no 2>&1 | tail -30` confirm zero regression
6. Commit: `test(obs): fix caplog structlog capture via {chosen path}`

**Zero scope outside observability test** kecuali fix genuinely requires production touch.

## Halt protocol

- Kalo ada hidden dependency (pytest-structlog not installed, structlog version mismatch), halt + surface to V5 dengan specific error
- Kalo fix attempt gagal setelah 3 approach different path, halt + surface, don't burn budget on speculative fix
- Post-commit emit: `Selene ferry complete. SHA {hash}. tests/backend/obs/ green 3/3.`

Begin.

=== COPY END ===

---

## Post-Ferry Signal

Ghaisan confirm kedua ferry complete:

1. Check both SHA landed: `git log --oneline -5`
2. Sanity test: `cd ~/Documents/CerebralvalleyHackathon && .venv/bin/pytest tests/backend/mcp tests/backend/obs -q`
3. Emit to V5: `Ferries done. Khronos {hash}, Selene {hash}. W2 6-pack cleared.`

V5 greenlight fire `np_wave_2_spawn_6pack.md`.
