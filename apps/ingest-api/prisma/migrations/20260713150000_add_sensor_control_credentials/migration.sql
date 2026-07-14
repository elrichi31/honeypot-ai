CREATE TABLE "sensor_control_credentials" (
  "id" TEXT NOT NULL,
  "sensor_id" TEXT NOT NULL,
  "secret_hash" TEXT NOT NULL,
  "secret_prefix" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  "rotated_at" TIMESTAMPTZ,
  "revoked_at" TIMESTAMPTZ,
  CONSTRAINT "sensor_control_credentials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sensor_control_credentials_sensor_id_key" UNIQUE ("sensor_id"),
  CONSTRAINT "sensor_control_credentials_sensor_id_fkey"
    FOREIGN KEY ("sensor_id") REFERENCES "sensors"("sensor_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "sensor_control_credentials_revoked_at_idx"
  ON "sensor_control_credentials"("revoked_at");
