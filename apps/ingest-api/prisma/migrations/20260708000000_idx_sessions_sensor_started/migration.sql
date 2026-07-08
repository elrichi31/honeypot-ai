-- CreateIndex
-- Closes PERF_AUDIT C3: protocol_hits already has the composite
-- (sensor_id, timestamp) index, sessions didn't. getKpiTrends, getHoneypotOverview
-- and friends all filter `WHERE started_at >= cutoff AND sensor_id = ...`, so the
-- single-column sensor_id index forces a less selective scan. CONCURRENTLY avoids
-- locking the sessions table while the index is built.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "sessions_sensor_id_started_at_idx"
  ON "sessions" ("sensor_id", "started_at");

DROP INDEX IF EXISTS "sessions_sensor_id_idx";
