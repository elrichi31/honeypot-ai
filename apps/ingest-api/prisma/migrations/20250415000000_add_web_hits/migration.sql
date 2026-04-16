-- CreateTable
CREATE TABLE IF NOT EXISTS "web_hits" (
    "id"          TEXT        NOT NULL,
    "event_id"    TEXT        NOT NULL,
    "src_ip"      TEXT        NOT NULL,
    "method"      TEXT        NOT NULL,
    "path"        TEXT        NOT NULL,
    "query"       TEXT        NOT NULL DEFAULT '',
    "user_agent"  TEXT        NOT NULL DEFAULT '',
    "headers"     JSONB       NOT NULL,
    "body"        TEXT        NOT NULL DEFAULT '',
    "attack_type" TEXT        NOT NULL,
    "timestamp"   TIMESTAMP(3) NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_hits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "web_hits_event_id_key" ON "web_hits"("event_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "web_hits_src_ip_idx"      ON "web_hits"("src_ip");
CREATE INDEX IF NOT EXISTS "web_hits_attack_type_idx"  ON "web_hits"("attack_type");
CREATE INDEX IF NOT EXISTS "web_hits_timestamp_idx"    ON "web_hits"("timestamp");
