#!/bin/bash
# Edity Claude Code hook script.
#
# Invoked by Claude Code via hooks in ~/.claude/settings.json whenever a
# session transitions state (UserPromptSubmit / Stop / Notification). Reads
# the IPC server address + token that Edity's main process wrote to
# claude-ipc.json (next to this script) and POSTs the status over localhost
# HTTP. The config file lives next to the script so prod (~/.config/edity)
# and dev (~/.config/edity-dev) installs each have their own IPC endpoint.
#
# If Edity isn't running, the config file is missing or curl fails, this
# script exits silently. There is NO file-based fallback — the next time
# Edity runs, a subsequent hook firing will populate the status.
#
# Usage: claude-hook.sh <status>     (stdin receives Claude's JSON envelope)

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$SCRIPT_DIR/claude-ipc.json"
STATUS="${1:-unknown}"

[ -r "$CONFIG" ] || exit 0

# Portable JSON extraction without jq — matches the style of the old script.
PORT=$(grep -oE '"port"[[:space:]]*:[[:space:]]*[0-9]+' "$CONFIG" | grep -oE '[0-9]+$' | head -1)
TOKEN=$(grep -oE '"token"[[:space:]]*:[[:space:]]*"[^"]+"' "$CONFIG" | head -1 | cut -d'"' -f4)
[ -n "${PORT:-}" ] && [ -n "${TOKEN:-}" ] || exit 0

INPUT=$(cat)
SESSION_ID=$(printf '%s' "$INPUT" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$SESSION_ID" ] || exit 0

PAYLOAD=$(printf '{"status":"%s","sessionId":"%s","claudePid":%s,"ts":%s}' \
  "$STATUS" "$SESSION_ID" "$PPID" "$(date +%s)")

curl -fsS --max-time 1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "http://127.0.0.1:$PORT/claude-status" > /dev/null 2>&1 || true

exit 0
