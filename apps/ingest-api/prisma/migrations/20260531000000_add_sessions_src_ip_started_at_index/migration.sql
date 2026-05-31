-- CreateIndex
-- CONCURRENTLY avoids locking the sessions table while the index is built
CREATE INDEX CONCURRENTLY IF NOT EXISTS "sessions_src_ip_started_at_idx"
  ON "sessions" ("src_ip", "started_at" DESC);
