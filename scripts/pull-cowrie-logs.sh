#!/bin/bash
# pull-cowrie-logs.sh — Pulls Cowrie logs and sends them to the ingest API.
# Works both locally and remotely with the same flow.
#
# LOCAL (dev):
#   API_URL=http://localhost:3000 bash scripts/pull-cowrie-logs.sh
#
# DOCKER (inside log-puller container):
#   DIRECT_FILE=true API_URL=http://ingest-api:3000 bash scripts/pull-cowrie-logs.sh
#
# REMOTE (prod):
#   VPS_HOST=user@vps-ip VPS_SSH_PORT=8022 API_URL=http://localhost:3000 bash scripts/pull-cowrie-logs.sh
#
# Environment:
#   VPS_HOST       — SSH connection to remote VPS. If empty, runs locally (default: empty)
#   VPS_SSH_PORT   — SSH port on remote VPS (default: 8022)
#   API_URL        — Ingest API base URL (default: http://localhost:3000)
#   CONTAINER      — Cowrie container name (default: cowrie)
#   POLL_INTERVAL  — Seconds between polls (default: 3)
#   DIRECT_FILE    — Read the log file directly without docker exec (default: false)

set -euo pipefail

VPS_HOST="${VPS_HOST:-}"
VPS_SSH_PORT="${VPS_SSH_PORT:-8022}"
API_URL="${API_URL:-http://localhost:3000}"
CONTAINER="${CONTAINER:-cowrie}"
POLL_INTERVAL="${POLL_INTERVAL:-3}"
DIRECT_FILE="${DIRECT_FILE:-false}"
REMOTE_LOG="/cowrie/cowrie-git/var/log/cowrie/cowrie.json"
ENDPOINT="${API_URL}/ingest/cowrie/batch"

# Run a command — directly on the file, locally via docker exec, or remotely via SSH
cowrie_exec() {
  if [ "$DIRECT_FILE" = "true" ]; then
    "$@" 2>/dev/null
  elif [ -n "$VPS_HOST" ]; then
    ssh -p "$VPS_SSH_PORT" -o ConnectTimeout=5 "$VPS_HOST" "docker exec $CONTAINER $*" 2>/dev/null
  else
    docker exec "$CONTAINER" "$@" 2>/dev/null
  fi
}

if [ "$DIRECT_FILE" = "true" ]; then
  MODE="DIRECT FILE"
elif [ -n "$VPS_HOST" ]; then
  MODE="REMOTE ($VPS_HOST:$VPS_SSH_PORT)"
else
  MODE="LOCAL"
fi

echo "[pull] Mode: $MODE"
echo "[pull] Container: $CONTAINER"
echo "[pull] Sending to: $ENDPOINT"
echo "[pull] Poll interval: ${POLL_INTERVAL}s"
echo ""

# Wait for the log file to exist before starting
until [ -f "$REMOTE_LOG" ]; do
  echo "[pull] Waiting for $REMOTE_LOG to appear..."
  sleep 2
done

# Get initial file size — only process NEW events from this point
OFFSET=$(cowrie_exec wc -c < "$REMOTE_LOG" 2>/dev/null | tr -d '[:space:]' || echo "0")
echo "[pull] Starting from offset $OFFSET bytes (skipping existing logs)"
echo "[pull] Waiting for new events..."

while true; do
  REMOTE_SIZE=$(cowrie_exec wc -c < "$REMOTE_LOG" 2>/dev/null | tr -d '[:space:]' || echo "0")

  # File was truncated/rotated
  if [ "$REMOTE_SIZE" -lt "$OFFSET" ]; then
    echo "[pull] File rotated, resetting offset"
    OFFSET=0
  fi

  # New data available
  if [ "$REMOTE_SIZE" -gt "$OFFSET" ]; then
    NEW_DATA=$(cowrie_exec tail -c "+$((OFFSET + 1))" "$REMOTE_LOG" || true)
    OFFSET="$REMOTE_SIZE"

    if [ -n "$NEW_DATA" ]; then
      # Build JSON array from JSONL lines
      EVENTS="["
      FIRST=true
      COUNT=0
      while IFS= read -r line; do
        [ -z "$line" ] && continue
        if [ "$FIRST" = true ]; then
          EVENTS="${EVENTS}${line}"
          FIRST=false
        else
          EVENTS="${EVENTS},${line}"
        fi
        COUNT=$((COUNT + 1))
      done <<< "$NEW_DATA"
      EVENTS="${EVENTS}]"

      if [ "$COUNT" -gt 0 ]; then
        RESPONSE=$(curl -s -X POST "$ENDPOINT" \
          -H "Content-Type: application/json" \
          -d "{\"events\": $EVENTS}" 2>/dev/null || echo '{"error":"connection failed"}')

        echo "[pull] $(date '+%H:%M:%S') — $COUNT events — $RESPONSE"
      fi
    fi
  fi

  sleep "$POLL_INTERVAL"
done
