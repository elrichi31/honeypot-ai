-- sessions(started_at, ended_at) — covers the deception-alert range lookup:
--   WHERE timestamp >= started_at AND timestamp <= COALESCE(ended_at, started_at + interval '2 hours')
CREATE INDEX CONCURRENTLY IF NOT EXISTS "sessions_started_at_ended_at_idx"
  ON "sessions" ("started_at", "ended_at");

-- web_hits covering index for the overview aggregate:
--   WHERE timestamp >= cutoff GROUP BY attack_type + COUNT(DISTINCT src_ip)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "web_hits_timestamp_src_ip_attack_type_idx"
  ON "web_hits" ("timestamp" DESC, "src_ip", "attack_type");
