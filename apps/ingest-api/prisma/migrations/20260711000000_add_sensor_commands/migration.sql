CREATE TABLE "sensor_commands" (
  "id" TEXT NOT NULL,
  "sensor_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" TEXT NOT NULL,
  "requested_by" TEXT NOT NULL,
  "requested_ip" TEXT,
  "idempotency_key" TEXT,
  "result" JSONB,
  "error" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMPTZ,
  "acked_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "cancelled_at" TIMESTAMPTZ,
  "cancelled_by" TEXT,
  CONSTRAINT "sensor_commands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sensor_commands_status_check" CHECK (
    "status" IN ('queued', 'sent', 'acked', 'running', 'succeeded', 'failed', 'expired', 'cancelled')
  ),
  CONSTRAINT "sensor_commands_sensor_id_fkey"
    FOREIGN KEY ("sensor_id") REFERENCES "sensors"("sensor_id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "sensor_command_events" (
  "id" TEXT NOT NULL,
  "command_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "actor_type" TEXT NOT NULL,
  "actor_id" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sensor_command_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sensor_command_events_command_id_fkey"
    FOREIGN KEY ("command_id") REFERENCES "sensor_commands"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "sensor_commands_sensor_id_idempotency_key_key"
  ON "sensor_commands"("sensor_id", "idempotency_key");
CREATE INDEX "sensor_commands_sensor_id_status_created_at_idx"
  ON "sensor_commands"("sensor_id", "status", "created_at" DESC);
CREATE INDEX "sensor_commands_status_expires_at_idx"
  ON "sensor_commands"("status", "expires_at");
CREATE INDEX "sensor_command_events_command_id_created_at_idx"
  ON "sensor_command_events"("command_id", "created_at");
