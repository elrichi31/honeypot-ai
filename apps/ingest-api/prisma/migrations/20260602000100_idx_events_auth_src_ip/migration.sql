-- Speeds up diversified-attacker analysis (GROUP BY src_ip over auth events).
-- One CONCURRENTLY statement per migration file (cannot run in a transaction).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "events_auth_src_ip_idx"
  ON "events" ("src_ip")
  WHERE "event_type" IN ('auth.success', 'auth.failed');
