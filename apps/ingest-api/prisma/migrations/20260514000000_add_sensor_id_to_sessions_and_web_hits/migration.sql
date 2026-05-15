ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "sensor_id" TEXT;
ALTER TABLE "web_hits" ADD COLUMN IF NOT EXISTS "sensor_id" TEXT;

CREATE INDEX IF NOT EXISTS "sessions_sensor_id_idx" ON "sessions"("sensor_id");
CREATE INDEX IF NOT EXISTS "web_hits_sensor_id_idx" ON "web_hits"("sensor_id");
