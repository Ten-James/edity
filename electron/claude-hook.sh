#!/bin/bash
# Edity Claude Code hook script
# Called by Claude Code hooks to write session status to a file
# Usage: claude-hook.sh <status>
# Reads JSON from stdin, extracts session_id, writes status file

STATUS_DIR="$HOME/.config/edity/claude-status"
mkdir -p "$STATUS_DIR"

STATUS="$1"
[ -z "$STATUS" ] && STATUS="unknown"

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | grep -oE '"session_id"\s*:\s*"[^"]*"' | head -1 | cut -d'"' -f4)
[ -z "$SESSION_ID" ] && exit 0

printf '{"status":"%s","sessionId":"%s","ts":%s}\n' "$STATUS" "$SESSION_ID" "$(date +%s)" > "$STATUS_DIR/$SESSION_ID.json"
