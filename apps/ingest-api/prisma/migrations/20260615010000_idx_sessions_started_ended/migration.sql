-- sessions(started_at, ended_at) — covers the deception-alert range lookup:
--   WHERE timestamp >= started_at AND timestamp <= COALESCE(ended_at, started_at + interval '2 hours')
-- One CONCURRENTLY statement per file: CONCURRENTLY cannot run inside a transaction,
-- and Prisma wraps multi-statement migration files in one.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "sessions_started_at_ended_at_idx"
  ON "sessions" ("started_at", "ended_at");
