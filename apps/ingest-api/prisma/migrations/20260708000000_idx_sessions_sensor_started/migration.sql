-- CreateIndex
-- Closes PERF_AUDIT C3: protocol_hits already has the composite
-- (sensor_id, timestamp) index, sessions didn't. getKpiTrends, getHoneypotOverview
-- and friends all filter `WHERE started_at >= cutoff AND sensor_id = ...`, so the
-- single-column sensor_id index forces a less selective scan. CONCURRENTLY avoids
-- locking the sessions table while the index is built.
--
-- Split into its own migration file (2026-07-13): a file with a second
-- statement gets wrapped in a transaction by Prisma, and CONCURRENTLY cannot
-- run inside one (Postgres 25001). See prisma-concurrent-index-migrations
-- memory / docs/project-notes — one CONCURRENTLY statement per file only.
-- The DROP INDEX moved to 20260708000001_drop_sessions_sensor_id_idx.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "sessions_sensor_id_started_at_idx"
  ON "sessions" ("sensor_id", "started_at");
