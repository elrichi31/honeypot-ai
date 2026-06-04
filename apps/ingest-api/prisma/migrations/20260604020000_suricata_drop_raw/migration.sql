-- The full EVE JSON `raw` column was the bulk of suricata_alerts' size. Every
-- field the dashboard uses already lives in its own column, so drop `raw`.
-- (The ingest no longer writes it.) Dropping the column marks the space dead;
-- a VACUUM FULL reclaims it on disk.
ALTER TABLE "suricata_alerts" DROP COLUMN IF EXISTS "raw";
