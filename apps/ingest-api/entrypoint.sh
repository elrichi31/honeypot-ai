#!/bin/sh
set -e

echo "[entrypoint] Waiting for PostgreSQL..."
until npx prisma db push --skip-generate 2>/dev/null; do
  echo "[entrypoint] Postgres not ready, retrying in 2s..."
  sleep 2
done
echo "[entrypoint] Database schema applied."

echo "[entrypoint] Starting ingest-api..."
exec npx tsx src/main.ts
