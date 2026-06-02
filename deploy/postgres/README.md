# Postgres read replica (streaming standby)

The single-host prod stack runs a primary Postgres plus a streaming **read
replica**. The dashboard's heavy aggregation queries (threats, sessions,
credentials, stats) are served from the replica so collector ingest on the
primary isn't slowed down.

## How it works

```
collectors ──writes──▶  postgres (primary)  ──streaming replication──▶  postgres-replica (standby, read-only)
                              ▲                                                 │
ingest-api ──writes──────────┘                                                 │
ingest-api ──dashboard reads──────────────────────────────────────────────────┘
```

- **Primary** (`postgres`): `wal_level=replica`, `max_wal_senders`, and a
  `replicator` role created on first init by
  `primary-init-replication.sh`.
- **Replica** (`postgres-replica`): `replica-entrypoint.sh` clones the primary
  with `pg_basebackup` on first boot (writing `standby.signal` +
  `primary_conninfo`), then streams changes continuously. Read-only.
- **Routing** (in `apps/ingest-api/src/plugins/prisma.ts`): two Prisma clients.
  - `fastify.prisma` → primary. Used for all writes and any read that must be
    consistent (ingest classification, CRUD).
  - `fastify.prismaRead` → replica (or primary if `REPLICA_DATABASE_URL` is
    unset). Used only for dashboard analytics queries.

We do **not** use `@prisma/extension-read-replicas`, because it routes every
`$queryRaw` to the replica and this codebase uses `$queryRaw ... RETURNING` for
some INSERT/UPDATE/DELETE statements that must hit the primary.

## Required env

In your root `.env` (see `.env.example`):

```
REPLICATION_USER=replicator
REPLICATION_PASSWORD=<openssl rand -base64 32>
```

The compose file passes `REPLICA_DATABASE_URL` to `ingest-api` automatically.

## First-time setup / gotchas

**Easiest path (already-running stack):** run the helper from the repo root on
the server. It's idempotent and does everything below for you:

```bash
./deploy/postgres/setup-replica.sh          # DB + ingest-api only
./deploy/postgres/setup-replica.sh --all    # also `up -d` the whole stack
```

Manual steps (what the script does):

- The `replicator` role is created **only on the primary's first init**. If you
  add replication to an already-initialised primary, create the role manually:

  ```sql
  CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD '<REPLICATION_PASSWORD>';
  ```

  and add `host replication replicator all md5` to its `pg_hba.conf`, then
  reload.

- If you change `REPLICATION_PASSWORD` after first boot, update the role on the
  primary (`ALTER ROLE replicator WITH PASSWORD '…'`) and re-clone the replica
  (`docker compose rm -sf postgres-replica && docker volume rm <stack>_pg_replica_data`).

- To rebuild the replica from scratch: remove the `pg_replica_data` volume and
  restart `postgres-replica`; it will `pg_basebackup` again.

## Verify replication is healthy

On the primary:

```sql
SELECT client_addr, state, sync_state FROM pg_stat_replication;
```

On the replica (should return `t`):

```sql
SELECT pg_is_in_recovery();
```

Replication lag (run on the replica):

```sql
SELECT now() - pg_last_xact_replay_timestamp() AS lag;
```
