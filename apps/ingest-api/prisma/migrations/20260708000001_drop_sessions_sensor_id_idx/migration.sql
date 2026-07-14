-- DropIndex
-- Superseded by sessions_sensor_id_started_at_idx (see
-- 20260708000000_idx_sessions_sensor_started). Split into its own migration
-- so the prior CREATE INDEX CONCURRENTLY runs alone, outside a transaction.
DROP INDEX IF EXISTS "sessions_sensor_id_idx";
