CREATE INDEX IF NOT EXISTS "sessions_src_ip_idx" ON "sessions" ("src_ip");
CREATE INDEX IF NOT EXISTS "sessions_started_at_idx" ON "sessions" ("started_at" DESC);
CREATE INDEX IF NOT EXISTS "sessions_login_success_started_at_idx" ON "sessions" ("login_success", "started_at" DESC);

CREATE INDEX IF NOT EXISTS "events_event_ts_idx" ON "events" ("event_ts" DESC);
CREATE INDEX IF NOT EXISTS "events_src_ip_event_ts_idx" ON "events" ("src_ip", "event_ts" DESC);
CREATE INDEX IF NOT EXISTS "events_event_type_event_ts_idx" ON "events" ("event_type", "event_ts" DESC);

CREATE INDEX IF NOT EXISTS "web_hits_src_ip_timestamp_idx" ON "web_hits" ("src_ip", "timestamp" DESC);
