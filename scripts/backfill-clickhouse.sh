#!/usr/bin/env bash
# One-time backfill: seed ClickHouse (KAFKA_LAKE Sub-fase 3c,
# docs/plans/KAFKA_LAKE.md) with the history that already lives in Postgres.
# Kafka's retention only covers the last few days, so this is the only way to
# get cowrie_events/web_events/protocol_events/suricata_alerts to reflect
# full history instead of just "since the Kafka consumer went live".
#
# Safe to re-run — see clickhouse/backfill/001-backfill-from-postgres.sql.
#
# Usage: ./scripts/backfill-clickhouse.sh
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

ENV_FILE=".env"
SQL_FILE="clickhouse/backfill/001-backfill-from-postgres.sql"
[[ -f "$ENV_FILE" ]] || { echo "ERROR: $ENV_FILE not found — run from the repo root." >&2; exit 1; }
[[ -f "$SQL_FILE" ]] || { echo "ERROR: $SQL_FILE not found." >&2; exit 1; }

set -a; . "./$ENV_FILE"; set +a
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD not set in $ENV_FILE}"

for c in honeypot-clickhouse honeypot-postgres-replica; do
  docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null | grep -q true \
    || { echo "ERROR: container $c is not running." >&2; exit 1; }
done

echo "[backfill] running ${SQL_FILE} against honeypot-clickhouse (reads from postgres-replica)"
docker exec -i honeypot-clickhouse clickhouse-client \
  --param_pg_password="$POSTGRES_PASSWORD" \
  < "$SQL_FILE"

echo
echo "[backfill] row counts — ClickHouse vs Postgres (some ClickHouse-side"
echo "  overcount vs Postgres is expected on rows the live Kafka consumer"
echo "  already inserted before the backfill ran; they collapse into one on"
echo "  the next background merge, ReplacingMergeTree dedups by event_id)"
for pair in "cowrie_events:events" "web_events:web_hits" "protocol_events:protocol_hits" "suricata_alerts:suricata_alerts"; do
  ch_table="${pair%%:*}"
  pg_table="${pair##*:}"
  ch_count=$(docker exec -i honeypot-clickhouse clickhouse-client -q "SELECT count() FROM honeypot_lake.${ch_table}")
  pg_count=$(docker exec -i honeypot-postgres-replica psql -U honeypot -d honeypot_prod -tAc "SELECT count(*) FROM ${pg_table}")
  printf '  %-16s clickhouse=%-10s postgres(%s)=%s\n' "$ch_table" "$ch_count" "$pg_table" "$pg_count"
done
