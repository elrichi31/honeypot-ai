#!/bin/bash
# Cowrie entrypoint: apply pending config from signal volume, then watch for reload signals.
set -e

SIGNAL_DIR="/signal"
RELOAD_FLAG="$SIGNAL_DIR/cowrie-reload"
NEW_CFG="$SIGNAL_DIR/cowrie.cfg"
ACTIVE_CFG="/cowrie/cowrie-git/etc/cowrie.cfg"

# On every start: if beacon wrote a new config, apply it before cowrie reads it.
if [ -f "$NEW_CFG" ]; then
  echo "[entrypoint] Applying new config from signal volume"
  cp "$NEW_CFG" "$ACTIVE_CFG"
  rm -f "$NEW_CFG" "$RELOAD_FLAG"
fi

echo "[entrypoint] Starting cowrie"
/cowrie/cowrie-git/bin/cowrie start -n &
COWRIE_PID=$!

echo "[entrypoint] cowrie PID=$COWRIE_PID — watching $SIGNAL_DIR for reload signal"

while kill -0 "$COWRIE_PID" 2>/dev/null; do
  if [ -f "$RELOAD_FLAG" ]; then
    echo "[entrypoint] Reload signal received — stopping cowrie for config restart"
    rm -f "$RELOAD_FLAG"
    kill "$COWRIE_PID" 2>/dev/null || true
    break
  fi
  sleep 5
done

wait "$COWRIE_PID" 2>/dev/null || true
echo "[entrypoint] cowrie exited — Docker will restart the container with new config"
exit 0
