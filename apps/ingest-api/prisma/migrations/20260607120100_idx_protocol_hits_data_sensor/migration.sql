-- The per-sensor event count in sensor-queries.ts counts protocol_hits with
-- `ph.sensor_id = s.sensor_id OR ph.data->>'sensor' = s.sensor_id`. The column
-- side is indexed (protocol_hits_sensor_id_idx) but the jsonb side
-- (data->>'sensor') was a full-table scan. This expression index covers it.
-- Older rows ingested before sensor_id was backfilled rely on this jsonb path.
-- One CONCURRENTLY statement per migration file (cannot run in a transaction).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "protocol_hits_data_sensor_idx"
  ON "protocol_hits" ((data->>'sensor'));
