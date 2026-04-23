#!/bin/bash
#
# NERIUM SessionStart hook.
#
# Prints a compact status snapshot that Claude Code sees at session boot so a
# fresh agent has immediate context without scanning the full repo. No stdin
# input; runs once per session.
#

echo "=== NERIUM session context ==="

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ -n "$BRANCH" ]; then
    echo "Branch: $BRANCH"
fi

echo ""
echo "Recent commits:"
git log --oneline -5 2>/dev/null | sed 's/^/  /'

echo ""
echo "RV phase artifacts:"
for f in \
    _meta/RV_PLAN.md \
    docs/phase_rv/RV_MANAGED_AGENTS_RESEARCH_v2.md \
    docs/phase_rv/RV_NERIUM_AGENT_STRUCTURE_v2.md \
    docs/phase_rv/REUSE_REWRITE_MATRIX.md \
    docs/phase_rv/P0_ARTIFACT_INVENTORY.md \
    docs/adr/ADR-override-antipattern-7.md
do
    if [ -f "$f" ]; then
        echo "  present: $f"
    fi
done

echo ""
echo "Mandatory reading for every agent:"
echo "  1. _meta/NarasiGhaisan.md"
echo "  2. CLAUDE.md"
echo "  3. docs/contracts/ (contracts assigned to the agent)"
echo "  4. .claude/agents/<your-name>.md"

LATEST_LOG=$(ls -t _meta/orchestration_log/day_*.md 2>/dev/null | head -1)
if [ -n "$LATEST_LOG" ]; then
    echo ""
    echo "Latest orchestration log: $LATEST_LOG"
fi

CONTRACT_COUNT=$(ls docs/contracts/*.contract.md 2>/dev/null | wc -l | tr -d ' ')
if [ "$CONTRACT_COUNT" -gt 0 ]; then
    echo "Contracts committed: $CONTRACT_COUNT"
fi

SKILL_COUNT=$(ls -d .claude/skills/*/ 2>/dev/null | wc -l | tr -d ' ')
if [ "$SKILL_COUNT" -gt 0 ]; then
    echo "Project skills: $SKILL_COUNT"
fi

echo ""
echo "Daily rhythm lock: 07:00 to 23:00 WIB. Halt clean if approaching 23:00."
echo "==================================="

exit 0
