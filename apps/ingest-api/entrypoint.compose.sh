#!/bin/sh
# Note: no `set -e`. The migration loop relies on inspecting exit codes to
# retry, which `set -e` would abort.
#
# Docker socket access for the container-monitoring view is granted via
# `group_add` in the compose file (the GID is auto-detected by the sensor/host
# installer). We deliberately do NOT drop privileges with gosu/su here: the
# services run with `no-new-privileges:true`, which the kernel uses to reject
# any setuid — so an in-container privilege drop fails with EPERM. Running as
# `node` from the start (USER node in the Dockerfile) sidesteps that entirely.

# GEODATADIR points at the geoip_data volume, shared with the geoip-updater
# sidecar. geoip-updater's updatedb.js only ever refreshes geoip-country.dat;
# the other bundled bases (country6, asn, asn6, city...) are never written
# there. Seed any missing base from the package's own bundled copy so a fresh
# (empty) volume doesn't crash geoip-lite's module-load-time file read.
if [ -n "$GEODATADIR" ]; then
  mkdir -p "$GEODATADIR"
  for f in node_modules/geoip-lite/data/*.dat; do
    base=$(basename "$f")
    [ -f "$GEODATADIR/$base" ] || cp "$f" "$GEODATADIR/$base"
  done
fi

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
