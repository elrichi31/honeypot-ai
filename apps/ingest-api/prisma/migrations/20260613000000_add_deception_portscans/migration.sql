CREATE TABLE "deception_portscans" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "sensor_id"   TEXT        NOT NULL DEFAULT '',
  "timestamp"   TIMESTAMPTZ NOT NULL,
  "src_ip"      TEXT        NOT NULL,
  "dst_ports"   INTEGER[]   NOT NULL DEFAULT '{}',
  "node_id"     TEXT,
  "scan_type"   TEXT        NOT NULL DEFAULT 'syn',
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "deception_portscans_src_ip_idx"    ON "deception_portscans" ("src_ip");
CREATE INDEX "deception_portscans_timestamp_idx" ON "deception_portscans" ("timestamp" DESC);
CREATE INDEX "deception_portscans_sensor_id_idx" ON "deception_portscans" ("sensor_id");
