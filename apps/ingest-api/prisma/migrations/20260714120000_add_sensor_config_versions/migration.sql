-- Rebanada 5 (docs/plans/SENSOR_REMOTE_CONTROL.md): append-only history
-- behind the existing single-row sensor_configs table, so config.apply has
-- something to roll back to (the last row with status='applied').
CREATE TABLE "sensor_config_versions" (
  "id" TEXT NOT NULL,
  "sensor_id" TEXT NOT NULL,
  "protocol" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "config_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applied_at" TIMESTAMPTZ,
  "error" TEXT,
  CONSTRAINT "sensor_config_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sensor_config_versions_sensor_id_fkey"
    FOREIGN KEY ("sensor_id") REFERENCES "sensors"("sensor_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "sensor_config_versions_sensor_id_created_at_idx"
  ON "sensor_config_versions"("sensor_id", "created_at" DESC);
CREATE INDEX "sensor_config_versions_sensor_id_status_created_at_idx"
  ON "sensor_config_versions"("sensor_id", "status", "created_at" DESC);
