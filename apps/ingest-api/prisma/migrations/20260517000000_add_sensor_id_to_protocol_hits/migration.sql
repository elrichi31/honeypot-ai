ALTER TABLE "protocol_hits"
  ADD COLUMN IF NOT EXISTS "sensor_id" TEXT;

CREATE INDEX IF NOT EXISTS "protocol_hits_sensor_id_idx" ON "protocol_hits"("sensor_id");

-- Backfill from data->>'sensor' for rows that have it (Dionaea-style events)
UPDATE "protocol_hits"
SET "sensor_id" = "data"->>'sensor'
WHERE "sensor_id" IS NULL
  AND "data"->>'sensor' IS NOT NULL
  AND "data"->>'sensor' <> '';
