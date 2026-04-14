#!/bin/sh

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
