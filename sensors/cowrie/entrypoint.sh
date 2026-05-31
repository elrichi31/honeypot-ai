#!/bin/bash
# Cowrie entrypoint: apply pending config from signal volume, then watch for reload signals.
set -e

SIGNAL_DIR="/signal"
RELOAD_FLAG="$SIGNAL_DIR/cowrie-reload"
NEW_CFG="$SIGNAL_DIR/cowrie.cfg"
NEW_UDB="$SIGNAL_DIR/userdb.txt"
ACTIVE_CFG="/cowrie/cowrie-git/etc/cowrie.cfg"
ACTIVE_UDB="/cowrie/cowrie-git/etc/userdb.txt"

# On every start: apply any pending config/userdb before cowrie reads them.
if [ -f "$NEW_CFG" ]; then
  echo "[entrypoint] Applying new cowrie.cfg from signal volume"
  cp "$NEW_CFG" "$ACTIVE_CFG"
  rm -f "$NEW_CFG"
fi
if [ -f "$NEW_UDB" ]; then
  echo "[entrypoint] Applying new userdb.txt from signal volume"
  cp "$NEW_UDB" "$ACTIVE_UDB"
  rm -f "$NEW_UDB"
fi
rm -f "$RELOAD_FLAG"

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
