CREATE TABLE "suricata_alerts" (
  "id"           TEXT        NOT NULL PRIMARY KEY,
  "sensor_id"    TEXT        NOT NULL DEFAULT '',
  "timestamp"    TIMESTAMPTZ NOT NULL,
  "src_ip"       TEXT        NOT NULL DEFAULT '',
  "src_port"     INTEGER,
  "dest_ip"      TEXT        NOT NULL DEFAULT '',
  "dest_port"    INTEGER,
  "proto"        TEXT        NOT NULL DEFAULT '',
  "action"       TEXT        NOT NULL DEFAULT 'allowed',
  "signature_id" INTEGER     NOT NULL DEFAULT 0,
  "signature"    TEXT        NOT NULL DEFAULT '',
  "category"     TEXT        NOT NULL DEFAULT '',
  "severity"     INTEGER     NOT NULL DEFAULT 3,
  "flow_id"      BIGINT,
  "in_iface"     TEXT,
  "raw"          JSONB       NOT NULL DEFAULT '{}',
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "suricata_alerts_src_ip_idx"       ON "suricata_alerts" ("src_ip");
CREATE INDEX "suricata_alerts_severity_idx"      ON "suricata_alerts" ("severity");
CREATE INDEX "suricata_alerts_signature_id_idx"  ON "suricata_alerts" ("signature_id");
CREATE INDEX "suricata_alerts_timestamp_idx"     ON "suricata_alerts" ("timestamp" DESC);
CREATE INDEX "suricata_alerts_created_at_idx"    ON "suricata_alerts" ("created_at" DESC);
CREATE INDEX "suricata_alerts_src_ip_ts_idx"     ON "suricata_alerts" ("src_ip", "timestamp" DESC);
