-- Speeds up the deception (OpenCanary) views. Every /deception query filters
-- protocol_hits by data->>'source' = 'opencanary' and groups/joins by
-- data->>'node_id'. Without an index those are jsonb full-table scans on a
-- high-volume table. A partial expression index on node_id, scoped to opencanary
-- rows, covers the WHERE (source) + GROUP BY/JOIN (node_id) of all four routes
-- and stays small (only deception rows).
-- One CONCURRENTLY statement per migration file (cannot run in a transaction).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "protocol_hits_deception_node_idx"
  ON "protocol_hits" ((data->>'node_id'))
  WHERE data->>'source' = 'opencanary';
