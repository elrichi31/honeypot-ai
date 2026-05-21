CREATE TABLE "api_defense_events" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "src_ip"      TEXT        NOT NULL,
  "method"      TEXT        NOT NULL,
  "path"        TEXT        NOT NULL,
  "user_agent"  TEXT        NOT NULL DEFAULT '',
  "attack_type" TEXT        NOT NULL,
  "details"     JSONB       NOT NULL DEFAULT '{}',
  "status_code" INTEGER,
  "timestamp"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "api_defense_events_src_ip_idx"     ON "api_defense_events"("src_ip");
CREATE INDEX "api_defense_events_type_idx"        ON "api_defense_events"("attack_type");
CREATE INDEX "api_defense_events_ts_idx"          ON "api_defense_events"("timestamp" DESC);
CREATE INDEX "api_defense_events_src_ip_ts_idx"   ON "api_defense_events"("src_ip", "timestamp" DESC);
