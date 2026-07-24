-- Per-port open/closed status self-reported by the sensor in its heartbeat.
-- Keyed by display port (as text, since JSON keys are strings): { "3389": true }.
ALTER TABLE sensors ADD COLUMN IF NOT EXISTS port_status JSONB NOT NULL DEFAULT '{}'::jsonb;
