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
#   VPS_HOST=vps-ip VPS_SSH_PORT=8022 VPS_USER=root SSH_KEY=$HOME/.ssh/honeypot_vps API_URL=http://localhost:3000 bash scripts/pull-cowrie-logs.sh
#
# Environment:
#   VPS_HOST       — Remote VPS host/IP. If empty, runs locally (default: empty)
#   VPS_SSH_PORT   — SSH port on remote VPS (default: 8022)
#   VPS_USER       — SSH user on remote VPS (default: root)
#   SSH_KEY        — SSH private key path (default: ~/.ssh/honeypot_vps)
#   API_URL        — Ingest API base URL (default: http://localhost:3000)
#   DIRECT_FILE    — Read a local/mounted Cowrie JSON log directly (default: false)
#   DIRECT_LOG     — Local Cowrie JSON path for DIRECT_FILE mode
#   POLL_INTERVAL  — Seconds between polls (default: 3)

set -euo pipefail

VPS_HOST="${VPS_HOST:-}"
VPS_SSH_PORT="${VPS_SSH_PORT:-8022}"
VPS_USER="${VPS_USER:-root}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/honeypot_vps}"
API_URL="${API_URL:-http://localhost:3000}"
INGEST_SHARED_SECRET="${INGEST_SHARED_SECRET:-}"
POLL_INTERVAL="${POLL_INTERVAL:-3}"
DIRECT_FILE="${DIRECT_FILE:-false}"
DIRECT_LOG="${DIRECT_LOG:-/cowrie/cowrie-git/var/log/cowrie/cowrie.json}"

# Ruta del log en el VPS host
REMOTE_LOG="${REMOTE_LOG:-/root/honeypot-ai/cowrie.json}"

ENDPOINT="${API_URL}/ingest/cowrie/batch"

cowrie_exec() {
  local cmd="$1"
  if [ "$DIRECT_FILE" = "true" ]; then
    bash -lc "$cmd" 2>/dev/null
  elif [ -n "$VPS_HOST" ]; then
    ssh -i "$SSH_KEY" \
      -p "$VPS_SSH_PORT" \
      -o ConnectTimeout=5 \
      -o StrictHostKeyChecking=accept-new \
      "${VPS_USER}@${VPS_HOST}" \
      "bash -lc '$cmd'" 2>/dev/null
  else
    bash -lc "$cmd" 2>/dev/null
  fi
}

if [ "$DIRECT_FILE" = "true" ]; then
  MODE="DIRECT_FILE (${DIRECT_LOG})"
  LOG_PATH="$DIRECT_LOG"
elif [ -n "$VPS_HOST" ]; then
  MODE="REMOTE (${VPS_USER}@${VPS_HOST}:$VPS_SSH_PORT)"
  LOG_PATH="$REMOTE_LOG"
else
  MODE="LOCAL (${REMOTE_LOG})"
  LOG_PATH="$REMOTE_LOG"
fi

echo "[pull] Mode: $MODE"
echo "[pull] Sending to: $ENDPOINT"
echo "[pull] Poll interval: ${POLL_INTERVAL}s"
echo "[pull] Log path: $LOG_PATH"
echo ""

until cowrie_exec "[ -f \"$LOG_PATH\" ]"; do
  echo "[pull] Waiting for $LOG_PATH to appear..."
  sleep 2
done

OFFSET=$(cowrie_exec "wc -c < \"$LOG_PATH\"" | tr -d '[:space:]' || echo "0")
echo "[pull] Starting from offset $OFFSET bytes (skipping existing logs)"
echo "[pull] Waiting for new events..."

while true; do
  REMOTE_SIZE=$(cowrie_exec "wc -c < \"$LOG_PATH\"" | tr -d '[:space:]' || echo "0")

  if [ "$REMOTE_SIZE" -lt "$OFFSET" ]; then
    echo "[pull] File rotated, resetting offset"
    OFFSET=0
  fi

  if [ "$REMOTE_SIZE" -gt "$OFFSET" ]; then
    NEW_DATA=$(cowrie_exec "tail -c \"+$((OFFSET + 1))\" \"$LOG_PATH\"" || true)
    OFFSET="$REMOTE_SIZE"

    if [ -n "$NEW_DATA" ]; then
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
        CURL_ARGS=(
          -s
          -X POST
          "$ENDPOINT"
          -H "Content-Type: application/json"
        )

        if [ -n "$INGEST_SHARED_SECRET" ]; then
          CURL_ARGS+=(-H "X-Ingest-Token: $INGEST_SHARED_SECRET")
        fi

        RESPONSE=$(curl "${CURL_ARGS[@]}" \
          -d "{\"events\": $EVENTS}" 2>/dev/null || echo '{"error":"connection failed"}')

        echo "[pull] $(date '+%H:%M:%S') — $COUNT events — $RESPONSE"
      fi
    fi
  fi

  sleep "$POLL_INTERVAL"
done
