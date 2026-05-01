CREATE TABLE IF NOT EXISTS "sensors" (
    "id"          TEXT         NOT NULL,
    "sensor_id"   TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "protocol"    TEXT         NOT NULL,
    "ip"          TEXT         NOT NULL,
    "version"     TEXT         NOT NULL DEFAULT '',
    "last_seen"   TIMESTAMPTZ  NOT NULL,
    "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sensors_sensor_id_key" ON "sensors"("sensor_id");
CREATE INDEX IF NOT EXISTS "sensors_last_seen_idx" ON "sensors"("last_seen" DESC);
