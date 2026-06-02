-- Speeds up the Credentials page (rankings / deep-analysis / recent tabs),
-- which GROUP BY username/password/src_ip over the events table filtered to
-- auth attempts. Partial indexes keep them small (only auth rows are indexed)
-- and let Postgres aggregate from the index instead of scanning ~800k rows.
--
-- CONCURRENTLY avoids locking the events table while the index is built.

-- pairs / passwords / usernames rankings + spray/targeted analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS "events_auth_user_pass_idx"
  ON "events" ("username", "password")
  WHERE "event_type" IN ('auth.success', 'auth.failed');

-- diversified-attacker analysis (GROUP BY src_ip over auth events)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "events_auth_src_ip_idx"
  ON "events" ("src_ip")
  WHERE "event_type" IN ('auth.success', 'auth.failed');

-- recent-attempts tab orders auth events by event_ts DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS "events_auth_event_ts_idx"
  ON "events" ("event_ts" DESC)
  WHERE "event_type" IN ('auth.success', 'auth.failed');
