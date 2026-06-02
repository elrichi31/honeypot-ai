-- Speeds up the Recent Attempts tab (auth events ordered by event_ts DESC).
-- One CONCURRENTLY statement per migration file (cannot run in a transaction).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "events_auth_event_ts_idx"
  ON "events" ("event_ts" DESC)
  WHERE "event_type" IN ('auth.success', 'auth.failed');
