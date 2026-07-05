-- CreateIndex
-- Partial index covering the deception-network filter
-- (data->>'layer' = 'internal' OR data->>'source' = 'opencanary'), used by
-- DeceptionRepository.getOverview/getNodes/getKillchain/getEvents. Before this
-- index, those queries did a Parallel Seq Scan over the full protocol_hits
-- table (~984k rows) to find the ~260 matching rows: ~100ms each. With the
-- index: ~0.5-0.8ms (Index Scan). Only ~260 of ~984k rows match the
-- predicate, so the index stays tiny regardless of table growth.
-- CONCURRENTLY avoids locking protocol_hits (the largest, hottest table)
-- while the index is built.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "protocol_hits_deception_filter_idx"
  ON "protocol_hits" ("timestamp" DESC)
  WHERE (data->>'layer' = 'internal' OR data->>'source' = 'opencanary');
