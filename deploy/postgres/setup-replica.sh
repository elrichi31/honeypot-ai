#!/usr/bin/env bash
# One-shot, idempotent setup for the Postgres read replica on a single-host
# deploy whose PRIMARY is already initialised (so the auto-init script never
# ran). Safe to re-run.
#
# It:
#   1. ensures REPLICATION_USER / REPLICATION_PASSWORD / REPLICATION_SLOT exist in .env
#   2. creates (or updates) the replication role on the primary
#   3. creates the physical replication slot on the primary
#   4. adds the pg_hba.conf entry and reloads
#   5. recreates the primary with the new WAL flags + brings up the replica
#   6. recreates ingest-api so it picks up REPLICA_DATABASE_URL
#   7. verifies replication
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
  echo "ERROR: $COMPOSE_FILE not found - run this from the repo root." >&2
  exit 1
fi

# 1. .env vars
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
if ! grep -q '^REPLICATION_SLOT=' "$ENV_FILE"; then
  echo 'REPLICATION_SLOT=honeypot_replica_slot' >> "$ENV_FILE"
  echo "[setup] added REPLICATION_SLOT=honeypot_replica_slot to $ENV_FILE"
fi

# Load .env into the shell (REPLICATION_USER/PASSWORD/SLOT, POSTGRES_*).
set -a
# shellcheck disable=SC1090
. "./$ENV_FILE"
set +a

: "${REPLICATION_USER:=replicator}"
: "${REPLICATION_PASSWORD:?REPLICATION_PASSWORD must be set}"
: "${REPLICATION_SLOT:=honeypot_replica_slot}"
: "${POSTGRES_DB:=honeypot_prod}"
DB_USER="${POSTGRES_USER:-honeypot}"

# 2-3. replication role + physical slot on the primary
echo "[setup] ensuring role '${REPLICATION_USER}' and slot '${REPLICATION_SLOT}' on the primary"
docker exec -i "$PRIMARY" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$POSTGRES_DB" >/dev/null <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${REPLICATION_USER}') THEN
    CREATE ROLE ${REPLICATION_USER} WITH REPLICATION LOGIN PASSWORD '${REPLICATION_PASSWORD}';
  ELSE
    ALTER ROLE ${REPLICATION_USER} WITH REPLICATION LOGIN PASSWORD '${REPLICATION_PASSWORD}';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_replication_slots WHERE slot_name = '${REPLICATION_SLOT}') THEN
    PERFORM pg_create_physical_replication_slot('${REPLICATION_SLOT}');
  END IF;
END
\$\$;
SQL

# 4. pg_hba.conf entry + reload
echo "[setup] ensuring pg_hba.conf replication entry"
docker exec -i "$PRIMARY" sh -c \
  'grep -q "replication '"${REPLICATION_USER}"'" "$PGDATA/pg_hba.conf" || echo "host replication '"${REPLICATION_USER}"' all md5" >> "$PGDATA/pg_hba.conf"'
docker exec -i "$PRIMARY" psql -U "$DB_USER" -d "$POSTGRES_DB" -c "SELECT pg_reload_conf();" >/dev/null

# 5. recreate primary (new WAL flags) + bring up replica
echo "[setup] recreating primary with replication flags + starting replica..."
docker compose -f "$COMPOSE_FILE" up -d postgres postgres-replica

# 6. ingest-api picks up REPLICA_DATABASE_URL
echo "[setup] recreating ingest-api..."
docker compose -f "$COMPOSE_FILE" up -d ingest-api

if [ "$RUN_ALL" -eq 1 ]; then
  echo "[setup] --all: bringing up the rest of the stack..."
  docker compose -f "$COMPOSE_FILE" up -d
fi

# 7. verify
echo
echo "[setup] waiting for the replica to become ready..."
for i in $(seq 1 60); do
  if docker exec -i "$REPLICA" pg_isready -U "$DB_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 5
  printf '.'
done
echo

echo "-- pg_stat_replication on primary (expect 1 row, state=streaming) --"
docker exec -i "$PRIMARY" psql -U "$DB_USER" -d "$POSTGRES_DB" \
  -c "SELECT client_addr, state, sync_state FROM pg_stat_replication;" || true

echo "-- pg_replication_slots on primary (expect ${REPLICATION_SLOT}, active=t) --"
docker exec -i "$PRIMARY" psql -U "$DB_USER" -d "$POSTGRES_DB" \
  -c "SELECT slot_name, slot_type, active, restart_lsn, wal_status FROM pg_replication_slots WHERE slot_name = '${REPLICATION_SLOT}';" || true

echo "-- pg_is_in_recovery on replica (expect t) --"
docker exec -i "$REPLICA" psql -U "$DB_USER" -d "$POSTGRES_DB" \
  -c "SELECT pg_is_in_recovery();" || true

echo "-- replica lag --"
docker exec -i "$REPLICA" psql -U "$DB_USER" -d "$POSTGRES_DB" \
  -c "SELECT now() - pg_last_xact_replay_timestamp() AS lag;" || true

echo "-- ingest-api log line --"
docker logs ingest-api 2>&1 | grep -i "read replica" | tail -1 || \
  echo "(no 'read replica' log line yet - check 'docker logs ingest-api')"

echo
echo "[setup] done. If the replica row is missing above, watch its logs:"
echo "        docker logs -f $REPLICA"
