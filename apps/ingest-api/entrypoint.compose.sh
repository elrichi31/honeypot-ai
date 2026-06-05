#!/bin/sh
# Note: intentionally NOT using `set -e`. The migration loop below relies on
# inspecting exit codes to retry, which `set -e` would abort. The GID-detection
# block guards every command with `|| true`, so it's safe without it.

# ── Auto-grant Docker socket access (runs only when started as root) ──────────
# The container monitoring view reads /var/run/docker.sock. The app runs as the
# non-root `node` user, which needs to be in the group that owns the socket.
# We detect that group's GID at runtime and join `node` to it, then drop back to
# `node` — so it works on ANY host regardless of its docker GID, with no config.
if [ "$(id -u)" = "0" ]; then
  if [ -S /var/run/docker.sock ]; then
    SOCK_GID=$(stat -c '%g' /var/run/docker.sock)
    if [ "$SOCK_GID" != "0" ]; then
      # Reuse an existing group with that GID, or create one named dockerhost.
      GROUP_NAME=$(getent group "$SOCK_GID" | cut -d: -f1)
      if [ -z "$GROUP_NAME" ]; then
        groupadd -g "$SOCK_GID" dockerhost 2>/dev/null || addgroup --gid "$SOCK_GID" dockerhost 2>/dev/null || true
        GROUP_NAME=dockerhost
      fi
      usermod -aG "$GROUP_NAME" node 2>/dev/null || adduser node "$GROUP_NAME" 2>/dev/null || true
      echo "[entrypoint] node joined group '$GROUP_NAME' (gid $SOCK_GID) for docker.sock access"
    fi
  else
    echo "[entrypoint] no docker.sock mounted — container monitoring disabled"
  fi
  # Re-exec this same script as the node user so the app never runs as root.
  # Fall back to su if gosu is somehow missing, rather than dying.
  if command -v gosu >/dev/null 2>&1; then
    exec gosu node "$0" "$@"
  else
    echo "[entrypoint] gosu not found — falling back to su"
    exec su node -s /bin/sh -c "$0 $*"
  fi
fi

# ── From here on we are the `node` user ──────────────────────────────────────
echo "[entrypoint] Waiting for PostgreSQL..."

MIGRATED=false
while [ "$MIGRATED" = "false" ]; do
  OUTPUT=$(npx prisma migrate deploy 2>&1)
  EXIT_CODE=$?
  echo "$OUTPUT"

  if [ $EXIT_CODE -eq 0 ]; then
    MIGRATED=true
  elif echo "$OUTPUT" | grep -q "P3005"; then
    echo "[entrypoint] Non-empty DB detected, baselining existing schema..."
    npx prisma migrate resolve --applied 20240101000000_init 2>/dev/null || true
  else
    echo "[entrypoint] Migration failed, retrying in 2s..."
    sleep 2
  fi
done

echo "[entrypoint] Database schema applied."

echo "[entrypoint] Starting ingest-api..."
exec npx tsx src/main.ts
