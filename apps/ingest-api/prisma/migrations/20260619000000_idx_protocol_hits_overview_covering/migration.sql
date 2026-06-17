-- Covering index for the dashboard overview's per-protocol aggregate
-- (SELECT protocol, COUNT(*), COUNT(DISTINCT src_ip), COUNT(*) FILTER (event_type='auth'),
--  MAX(timestamp) FROM protocol_hits WHERE timestamp >= cutoff GROUP BY protocol).
--
-- Without it, Postgres does a full Seq Scan of protocol_hits (~1M+ rows) because
-- the 90-day filter prunes nothing while the dataset is recent. This index lets
-- the planner use an Index Only Scan, measured ~2155ms -> ~643ms (3.3x) on the
-- prod dataset. Column order: timestamp first (range filter + MAX), then the
-- grouped/aggregated columns so the scan is index-only.
CREATE INDEX IF NOT EXISTS "protocol_hits_overview_covering_idx"
  ON "protocol_hits" ("timestamp", "protocol", "event_type", "src_ip");
