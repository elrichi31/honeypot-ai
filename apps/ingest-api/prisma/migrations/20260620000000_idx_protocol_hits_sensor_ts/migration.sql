-- Per-client (per-sensor) telemetry queries — the client timeline / activity
-- chart and threats ranking filter protocol_hits by sensor_id over a time range
-- (WHERE sensor_id IN (...) AND timestamp >= cutoff). The single-column
-- sensor_id index forced a Seq Scan of ~1M rows for the aggregate, measured
-- ~1539ms — the reason the client view's activity chart intermittently timed out
-- (it ran alongside several other heavy queries against the 10s budget).
--
-- A composite (sensor_id, timestamp) index lets the planner do an Index Only
-- Scan: measured ~1539ms -> ~167ms (9x). It also supersedes the standalone
-- sensor_id index (any sensor_id lookup can use the composite), so drop that to
-- avoid a redundant index slowing down ingest writes.
CREATE INDEX IF NOT EXISTS "protocol_hits_sensor_id_timestamp_idx"
  ON "protocol_hits" ("sensor_id", "timestamp");

DROP INDEX IF EXISTS "protocol_hits_sensor_id_idx";
