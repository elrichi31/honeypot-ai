-- Tighten retention to 7 days for the high-volume raw-event tables and start
-- pruning suricata_alerts (which had no retention row and grew unbounded).
-- These tables were filling the DB (1-1.5 GB each) and slowing every aggregate
-- query. Aggregated stats keep working; only raw events older than the window
-- are dropped.

UPDATE "retention_settings" SET retention_days = 7,  updated_at = now() WHERE table_name = 'events';
UPDATE "retention_settings" SET retention_days = 7,  updated_at = now() WHERE table_name = 'protocol_hits';
UPDATE "retention_settings" SET retention_days = 7,  updated_at = now() WHERE table_name = 'web_hits';
UPDATE "retention_settings" SET retention_days = 14, updated_at = now() WHERE table_name = 'sessions';

-- Add suricata_alerts (7-day retention). ON CONFLICT keeps any manual override
-- if the row already exists.
INSERT INTO "retention_settings" (id, table_name, label, retention_days, enabled)
VALUES ('ret-suricata', 'suricata_alerts', 'Suricata Alerts', 7, true)
ON CONFLICT (table_name) DO NOTHING;
