# Postgres read replica (streaming standby)

The single-host prod stack runs a primary Postgres plus a streaming read
replica. The dashboard's heavy aggregation queries (threats, sessions,
credentials, stats) are served from the replica so collector ingest on the
primary is not slowed down.

## How it works

```text
collectors -> writes -> postgres (primary) -> streaming replication -> postgres-replica (standby, read-only)
                         ^                                                       |
ingest-api -> writes ----'                                                       |
ingest-api -> dashboard reads ---------------------------------------------------'
```

- Primary (`postgres`): `wal_level=replica`, `max_wal_senders`,
  `max_replication_slots`, `wal_keep_size`, and a replication role plus
  physical replication slot created by `primary-init-replication.sh`.
- Replica (`postgres-replica`): `replica-entrypoint.sh` clones the primary with
  `pg_basebackup` on first boot, then streams changes continuously through
  `primary_slot_name`. Read-only.
- Routing (`apps/ingest-api/src/plugins/prisma.ts`): two Prisma clients.
  `fastify.prisma` goes to the primary for writes and consistency-sensitive
  reads. `fastify.prismaRead` goes to the replica for dashboard analytics.

We do not use `@prisma/extension-read-replicas`, because it routes every
`$queryRaw` to the replica and this codebase uses `$queryRaw ... RETURNING` for
some INSERT/UPDATE/DELETE statements that must hit the primary.

## Required env

In your root `.env` (see `.env.example`):

```bash
REPLICATION_USER=replicator
REPLICATION_PASSWORD=<openssl rand -base64 32>
REPLICATION_SLOT=honeypot_replica_slot
```

The compose file passes `REPLICA_DATABASE_URL` to `ingest-api` automatically.

## First-time setup / gotchas

The easiest path on an already-running server is:

```bash
./deploy/postgres/setup-replica.sh
./deploy/postgres/setup-replica.sh --all
```

The helper is idempotent and does the following:

- Ensures `REPLICATION_USER`, `REPLICATION_PASSWORD`, and `REPLICATION_SLOT`
  exist in `.env`.
- Creates or updates the replication role on the primary.
- Creates the physical replication slot on the primary if it does not exist.
- Ensures the `pg_hba.conf` replication entry exists and reloads Postgres.
- Restarts the primary and replica with the correct WAL settings.
- Restarts `ingest-api` so it keeps using `REPLICA_DATABASE_URL`.

If you rebuild the replica from scratch, remove the `pg_replica_data` volume and
restart `postgres-replica`; it will run `pg_basebackup` again.

## Why this is harder to break now

The stack now has two protections against:

```text
requested WAL segment ... has already been removed
```

- Physical replication slot: the primary keeps WAL needed by the replica until
  that replica confirms it has replayed it.
- `wal_keep_size=4096MB`: extra WAL retention buffer during short disconnects,
  restarts, or delayed startup.

This greatly reduces the chance of the replica falling permanently behind after
an outage. The remaining operational risk is disk growth on the primary if the
replica stays offline for a long time, so monitor free disk and slot activity.

## Verify replication is healthy

On the primary:

```sql
SELECT client_addr, state, sync_state FROM pg_stat_replication;
```

Also on the primary, verify the slot is present and active:

```sql
SELECT slot_name, slot_type, active, restart_lsn, wal_status
FROM pg_replication_slots;
```

On the replica (should return `t`):

```sql
SELECT pg_is_in_recovery();
```

Replication lag (run on the replica):

```sql
SELECT now() - pg_last_xact_replay_timestamp() AS lag;
```
