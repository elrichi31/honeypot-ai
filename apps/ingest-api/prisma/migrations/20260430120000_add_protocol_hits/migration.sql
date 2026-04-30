CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "protocol_hits" (
    "id"          TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
    "event_id"    TEXT         NOT NULL,
    "protocol"    TEXT         NOT NULL,
    "src_ip"      TEXT         NOT NULL,
    "src_port"    INTEGER,
    "dst_port"    INTEGER      NOT NULL,
    "event_type"  TEXT         NOT NULL,
    "username"    TEXT,
    "password"    TEXT,
    "data"        JSONB        NOT NULL DEFAULT '{}'::jsonb,
    "timestamp"   TIMESTAMPTZ  NOT NULL,
    "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "protocol_hits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "protocol_hits_event_id_key" ON "protocol_hits"("event_id");
CREATE INDEX IF NOT EXISTS "protocol_hits_src_ip_idx" ON "protocol_hits"("src_ip");
CREATE INDEX IF NOT EXISTS "protocol_hits_protocol_idx" ON "protocol_hits"("protocol");
CREATE INDEX IF NOT EXISTS "protocol_hits_dst_port_idx" ON "protocol_hits"("dst_port");
CREATE INDEX IF NOT EXISTS "protocol_hits_timestamp_idx" ON "protocol_hits"("timestamp" DESC);
