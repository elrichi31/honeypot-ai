-- CreateTable
CREATE TABLE "alerts" (
  "id"          TEXT         NOT NULL,
  "alert_key"   TEXT         NOT NULL,
  "level"       TEXT         NOT NULL DEFAULT 'high',
  "title"       TEXT         NOT NULL,
  "description" TEXT         NOT NULL DEFAULT '',
  "fields"      JSONB        NOT NULL DEFAULT '[]',
  "src_ip"      TEXT,
  "sensor_id"   TEXT,
  "read_at"     TIMESTAMP(3),
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alerts_created_at_idx" ON "alerts" ("created_at" DESC);

-- CreateIndex
CREATE INDEX "alerts_read_at_idx" ON "alerts" ("read_at");

-- CreateIndex
CREATE INDEX "alerts_level_idx" ON "alerts" ("level");
