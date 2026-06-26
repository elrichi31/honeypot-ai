#!/bin/sh
# Runs once, on first init of the PRIMARY postgres data dir
# (via /docker-entrypoint-initdb.d). Creates the replication role and allows
# the replica container to connect for streaming replication.
# POSIX sh (postgres:16-alpine has no bash).
#
# REPLICATION_PASSWORD is required; the replica uses it to authenticate.
set -eu

: "${REPLICATION_USER:=replicator}"
: "${REPLICATION_PASSWORD:?REPLICATION_PASSWORD must be set on the primary}"
: "${REPLICATION_SLOT:=honeypot_replica_slot}"

echo "[primary-init] ensuring replication role '${REPLICATION_USER}' and slot '${REPLICATION_SLOT}'"
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" <<-SQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${REPLICATION_USER}') THEN
      CREATE ROLE ${REPLICATION_USER} WITH REPLICATION LOGIN PASSWORD '${REPLICATION_PASSWORD}';
    END IF;

    IF NOT EXISTS (SELECT FROM pg_replication_slots WHERE slot_name = '${REPLICATION_SLOT}') THEN
      PERFORM pg_create_physical_replication_slot('${REPLICATION_SLOT}');
    END IF;
  END
  \$\$;
SQL

# Allow the replication user to connect from the private db network.
# md5 to match the primary's password_encryption=md5.
PGDATA="${PGDATA:-/var/lib/postgresql/data}"
HBA="${PGDATA}/pg_hba.conf"
if ! grep -q "replication ${REPLICATION_USER}" "${HBA}"; then
  echo "[primary-init] adding pg_hba entry for replication"
  echo "host replication ${REPLICATION_USER} all md5" >> "${HBA}"
fi

echo "[primary-init] done"
