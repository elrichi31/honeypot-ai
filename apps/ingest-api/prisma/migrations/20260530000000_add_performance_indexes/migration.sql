-- Sessions: filter by session_type (backfill-actor query scans all unknown sessions)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "sessions_session_type_idx" ON "sessions"("session_type");

-- Sessions: filter by session_type ordered by date (session list page with type filter)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "sessions_session_type_started_at_idx" ON "sessions"("session_type", "started_at" DESC);

-- Events: composite for attack_tags CTE (joins on session_id + filters by event_type)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "events_session_id_event_type_idx" ON "events"("session_id", "event_type");

-- Events: composite for dashboard funnel queries (filter by event_type + success flag)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "events_event_type_success_idx" ON "events"("event_type", "success");

-- ProtocolHits: protocol insights endpoint runs 8 queries filtering by protocol ordered by timestamp
CREATE INDEX CONCURRENTLY IF NOT EXISTS "protocol_hits_protocol_timestamp_idx" ON "protocol_hits"("protocol", "timestamp" DESC);

-- ProtocolHits: per-IP protocol analysis (threat intelligence queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "protocol_hits_src_ip_protocol_timestamp_idx" ON "protocol_hits"("src_ip", "protocol", "timestamp" DESC);

-- WebHits: web analytics group by attack_type ordered by timestamp
CREATE INDEX CONCURRENTLY IF NOT EXISTS "web_hits_attack_type_timestamp_idx" ON "web_hits"("attack_type", "timestamp" DESC);

-- WebHits: path grouping for /web-hits/paths endpoint (SELECT path, attack_type, COUNT(*) GROUP BY path)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "web_hits_path_idx" ON "web_hits"("path");
