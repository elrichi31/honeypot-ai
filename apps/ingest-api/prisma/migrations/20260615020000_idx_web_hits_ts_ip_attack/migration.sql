-- web_hits covering index for the overview aggregate:
--   WHERE timestamp >= cutoff GROUP BY attack_type + COUNT(DISTINCT src_ip)
-- One CONCURRENTLY statement per file: CONCURRENTLY cannot run inside a transaction,
-- and Prisma wraps multi-statement migration files in one.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "web_hits_timestamp_src_ip_attack_type_idx"
  ON "web_hits" ("timestamp" DESC, "src_ip", "attack_type");
