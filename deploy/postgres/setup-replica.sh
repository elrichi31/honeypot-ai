#!/usr/bin/env bash
# One-shot, idempotent setup for the Postgres read replica on a single-host
# deploy whose PRIMARY is already initialised (so the auto-init script never
# ran). Safe to re-run.
#
# It:
#   1. ensures REPLICATION_USER / REPLICATION_PASSWORD exist in .env
#   2. creates (or updates) the `replicator` role on the primary
#   3. adds the pg_hba.conf entry and reloads
#   4. recreates the primary with the new WAL flags + brings up the replica
#   5. recreates ingest-api so it picks up REPLICA_DATABASE_URL
#   6. verifies replication
#
# Usage:
#   ./deploy/postgres/setup-replica.sh            # touches only DB + ingest-api
#   ./deploy/postgres/setup-replica.sh --all      # also `up -d` the whole stack
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.single-host.yml"
PRIMARY="honeypot-postgres"
REPLICA="honeypot-postgres-replica"
ENV_FILE=".env"
RUN_ALL=0
[ "${1:-}" = "--all" ] && RUN_ALL=1

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "ERROR: $COMPOSE_FILE not found — run this from the repo root." >&2
  exit 1
fi

# ── 1. .env vars ────────────────────────────────────────────────────────────
touch "$ENV_FILE"
if ! grep -q '^REPLICATION_USER=' "$ENV_FILE"; then
  echo 'REPLICATION_USER=replicator' >> "$ENV_FILE"
  echo "[setup] added REPLICATION_USER=replicator to $ENV_FILE"
fi
if ! grep -q '^REPLICATION_PASSWORD=' "$ENV_FILE"; then
  gen="$(openssl rand -base64 32 | tr -d '\n')"
  echo "REPLICATION_PASSWORD=${gen}" >> "$ENV_FILE"
  echo "[setup] generated REPLICATION_PASSWORD in $ENV_FILE"
fi

# Load .env into the shell (REPLICATION_USER/PASSWORD, POSTGRES_*).
set -a
# shellcheck disable=SC1090
. "./$ENV_FILE"
set +a

: "${REPLICATION_USER:=replicator}"
: "${REPLICATION_PASSWORD:?REPLICATION_PASSWORD must be set}"
: "${POSTGRES_DB:=honeypot_prod}"
DB_USER="${POSTGRES_USER:-honeypot}"

# ── 2. replication role on the primary ──────────────────────────────────────
echo "[setup] ensuring '${REPLICATION_USER}' role on the primary"
docker exec -i "$PRIMARY" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$POSTGRES_DB" >/dev/null <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${REPLICATION_USER}') THEN
    CREATE ROLE ${REPLICATION_USER} WITH REPLICATION LOGIN PASSWORD '${REPLICATION_PASSWORD}';
  ELSE
    ALTER ROLE ${REPLICATION_USER} WITH REPLICATION LOGIN PASSWORD '${REPLICATION_PASSWORD}';
  END IF;
END
\$\$;
SQL

# ── 3. pg_hba.conf entry + reload ───────────────────────────────────────────
echo "[setup] ensuring pg_hba.conf replication entry"
docker exec -i "$PRIMARY" sh -c \
  'grep -q "replication '"${REPLICATION_USER}"'" "$PGDATA/pg_hba.conf" || echo "host replication '"${REPLICATION_USER}"' all md5" >> "$PGDATA/pg_hba.conf"'
docker exec -i "$PRIMARY" psql -U "$DB_USER" -d "$POSTGRES_DB" -c "SELECT pg_reload_conf();" >/dev/null

# ── 4. recreate primary (new WAL flags) + bring up replica ──────────────────
echo "[setup] (re)creating primary with replication flags + starting replica…"
docker compose -f "$COMPOSE_FILE" up -d postgres postgres-replica

# ── 5. ingest-api picks up REPLICA_DATABASE_URL ─────────────────────────────
echo "[setup] recreating ingest-api…"
docker compose -f "$COMPOSE_FILE" up -d ingest-api

if [ "$RUN_ALL" -eq 1 ]; then
  echo "[setup] --all: bringing up the rest of the stack…"
  docker compose -f "$COMPOSE_FILE" up -d
fi

# ── 6. verify ───────────────────────────────────────────────────────────────
echo
echo "[setup] waiting for the replica to finish cloning (pg_basebackup)…"
for i in $(seq 1 60); do
  if docker exec -i "$REPLICA" pg_isready -U "$DB_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 5
  printf '.'
done
echo

echo "── pg_stat_replication on primary (expect 1 row, state=streaming) ──"
docker exec -i "$PRIMARY" psql -U "$DB_USER" -d "$POSTGRES_DB" \
  -c "SELECT client_addr, state, sync_state FROM pg_stat_replication;" || true

echo "── pg_is_in_recovery on replica (expect t) ──"
docker exec -i "$REPLICA" psql -U "$DB_USER" -d "$POSTGRES_DB" \
  -c "SELECT pg_is_in_recovery();" || true

echo "── ingest-api log line ──"
docker logs ingest-api 2>&1 | grep -i "read replica" | tail -1 || \
  echo "(no 'read replica' log line yet — check 'docker logs ingest-api')"

echo
echo "[setup] done. If the replica row is missing above, watch its logs:"
echo "        docker logs -f $REPLICA"
