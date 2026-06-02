#!/bin/bash
# Entrypoint for the read-replica (hot standby) postgres container.
#
# On first start the data dir is empty, so we clone the primary with
# pg_basebackup (which also writes standby.signal + primary_conninfo via -R).
# On subsequent starts the data dir already exists, so we just boot postgres
# and it resumes streaming replication from where it left off.
set -euo pipefail

PGDATA="${PGDATA:-/var/lib/postgresql/data}"
: "${PRIMARY_HOST:=postgres}"
: "${PRIMARY_PORT:=5432}"
: "${REPLICATION_USER:=replicator}"
: "${REPLICATION_PASSWORD:?REPLICATION_PASSWORD must be set on the replica}"

if [ ! -s "${PGDATA}/PG_VERSION" ]; then
  echo "[replica] empty data dir — cloning primary ${PRIMARY_HOST}:${PRIMARY_PORT} via pg_basebackup"

  # Wait for the primary to accept connections before cloning.
  until pg_isready -h "${PRIMARY_HOST}" -p "${PRIMARY_PORT}" -U "${REPLICATION_USER}"; do
    echo "[replica] waiting for primary…"
    sleep 2
  done

  rm -rf "${PGDATA:?}/"* 2>/dev/null || true

  export PGPASSWORD="${REPLICATION_PASSWORD}"
  pg_basebackup \
    --host="${PRIMARY_HOST}" \
    --port="${PRIMARY_PORT}" \
    --username="${REPLICATION_USER}" \
    --pgdata="${PGDATA}" \
    --wal-method=stream \
    --write-recovery-conf \
    --progress \
    --verbose
  unset PGPASSWORD

  echo "[replica] base backup complete; standby.signal written"
else
  echo "[replica] existing data dir — resuming as standby"
fi

# Permissions can drift when the volume is created by root.
chmod 0700 "${PGDATA}" || true

# Hand off to the stock postgres entrypoint as the postgres user.
exec docker-entrypoint.sh postgres
