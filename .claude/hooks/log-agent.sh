#!/bin/bash
#
# NERIUM SubagentStart hook.
#
# Appends one line to the orchestration log for every subagent invocation so
# Ananke and V4 have an audit trail of which agent fired when. Never blocks;
# always exit 0.
#
# Input schema (SubagentStart):
#   { "session_id": "...", "agent_type": "Explore", ... }
# Note that the agent name is keyed as `agent_type`, not `agent_name`.
#

INPUT=$(cat)

if command -v jq >/dev/null 2>&1; then
    AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // "unknown"' 2>/dev/null)
    SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)
else
    AGENT_TYPE=$(echo "$INPUT" | grep -oE '"agent_type"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"agent_type"[[:space:]]*:[[:space:]]*"//;s/"$//')
    SESSION_ID=$(echo "$INPUT" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"session_id"[[:space:]]*:[[:space:]]*"//;s/"$//')
    [ -z "$AGENT_TYPE" ] && AGENT_TYPE="unknown"
    [ -z "$SESSION_ID" ] && SESSION_ID="unknown"
fi

LOG_DIR="_meta/orchestration_log"
mkdir -p "$LOG_DIR" 2>/dev/null

TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S %Z")
echo "$TIMESTAMP | session=$SESSION_ID | agent=$AGENT_TYPE" >> "$LOG_DIR/agent-audit.log" 2>/dev/null

exit 0
