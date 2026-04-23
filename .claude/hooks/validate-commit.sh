#!/bin/bash
#
# NERIUM PreToolUse hook for git commit safety.
#
# Enforces CLAUDE.md anti-patterns 1 (no em dash U+2014) and 2 (no emoji) on
# any file staged for commit. Also validates JSON files under docs/contracts
# and src/data parse cleanly. Blocks the commit if violations are found so the
# agent can fix them before a broken state hits git history.
#
# Input schema (PreToolUse for Bash tool):
#   { "tool_name": "Bash", "tool_input": { "command": "git commit -m ..." } }
#
# Exit codes:
#   0 = allow the commit
#   2 = block the commit (stderr is shown to Claude)
#

INPUT=$(cat)

if command -v jq >/dev/null 2>&1; then
    COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
else
    COMMAND=$(echo "$INPUT" | grep -oE '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"command"[[:space:]]*:[[:space:]]*"//;s/"$//')
fi

# Only inspect git commit invocations. All other bash tool calls pass through.
if ! echo "$COMMAND" | grep -qE '(^|[[:space:]])git[[:space:]]+commit'; then
    exit 0
fi

STAGED=$(git diff --cached --name-only 2>/dev/null)
if [ -z "$STAGED" ]; then
    exit 0
fi

BLOCKERS=""

# Anti-pattern 1: em dash (U+2014) in any staged text file.
EM_DASH=$'\xe2\x80\x94'
while IFS= read -r file; do
    if [ -f "$file" ] && file "$file" | grep -q "text"; then
        if grep -q "$EM_DASH" "$file" 2>/dev/null; then
            lines=$(grep -n "$EM_DASH" "$file" | head -3 | cut -d: -f1 | tr '\n' ',' | sed 's/,$//')
            BLOCKERS="$BLOCKERS\n  em dash in $file at line(s) $lines"
        fi
    fi
done <<< "$STAGED"

# Anti-pattern 2: common emoji ranges (rough sweep, not exhaustive).
# Miscellaneous Symbols and Pictographs plus Dingbats plus Emoticons.
EMOJI_REGEX="[\xf0\x9f\x80-\xbf]|[\xe2\x98-\x9f][\x80-\xbf]"
while IFS= read -r file; do
    if [ -f "$file" ] && file "$file" | grep -q "text"; then
        if grep -qP "$EMOJI_REGEX" "$file" 2>/dev/null; then
            lines=$(grep -nP "$EMOJI_REGEX" "$file" | head -3 | cut -d: -f1 | tr '\n' ',' | sed 's/,$//')
            BLOCKERS="$BLOCKERS\n  emoji in $file at line(s) $lines"
        fi
    fi
done <<< "$STAGED"

# Contract JSON validation.
JSON_FILES=$(echo "$STAGED" | grep -E '^(docs/contracts|src/data)/.*\.json$')
if [ -n "$JSON_FILES" ]; then
    PY=""
    for candidate in python3 python py; do
        if command -v "$candidate" >/dev/null 2>&1; then
            PY="$candidate"
            break
        fi
    done
    if [ -n "$PY" ]; then
        while IFS= read -r file; do
            if [ -f "$file" ] && ! "$PY" -m json.tool "$file" >/dev/null 2>&1; then
                BLOCKERS="$BLOCKERS\n  invalid JSON in $file"
            fi
        done <<< "$JSON_FILES"
    fi
fi

if [ -n "$BLOCKERS" ]; then
    printf "Commit blocked by NERIUM validate-commit hook. Fix the following, then retry:%b\n" "$BLOCKERS" >&2
    printf "\nReference: CLAUDE.md anti-patterns 1 (no em dash) and 2 (no emoji).\n" >&2
    exit 2
fi

exit 0
