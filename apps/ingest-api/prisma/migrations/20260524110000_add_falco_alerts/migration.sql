CREATE TABLE IF NOT EXISTS "falco_alerts" (
  "id"             TEXT        NOT NULL PRIMARY KEY,
  "sensor_id"      TEXT        NOT NULL DEFAULT '',
  "rule"           TEXT        NOT NULL DEFAULT '',
  "priority"       TEXT        NOT NULL DEFAULT 'warning',
  "output"         TEXT        NOT NULL DEFAULT '',
  "container_id"   TEXT,
  "container_name" TEXT,
  "proc_name"      TEXT,
  "proc_cmdline"   TEXT,
  "user_name"      TEXT,
  "evt_type"       TEXT,
  "fd_name"        TEXT,
  "tags"           TEXT[]      NOT NULL DEFAULT '{}',
  "output_fields"  JSONB       NOT NULL DEFAULT '{}',
  "timestamp"      TIMESTAMPTZ NOT NULL,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "falco_alerts_sensor_id_idx"    ON "falco_alerts" ("sensor_id");
CREATE INDEX IF NOT EXISTS "falco_alerts_rule_idx"         ON "falco_alerts" ("rule");
CREATE INDEX IF NOT EXISTS "falco_alerts_priority_idx"     ON "falco_alerts" ("priority");
CREATE INDEX IF NOT EXISTS "falco_alerts_container_idx"    ON "falco_alerts" ("container_name");
CREATE INDEX IF NOT EXISTS "falco_alerts_timestamp_idx"    ON "falco_alerts" ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS "falco_alerts_created_at_idx"   ON "falco_alerts" ("created_at" DESC);
