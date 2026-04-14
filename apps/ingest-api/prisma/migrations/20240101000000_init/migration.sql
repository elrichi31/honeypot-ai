-- CreateTable
CREATE TABLE IF NOT EXISTS "sessions" (
    "id" TEXT NOT NULL,
    "cowrie_session_id" TEXT NOT NULL,
    "src_ip" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "username" TEXT,
    "password" TEXT,
    "login_success" BOOLEAN,
    "hassh" TEXT,
    "client_version" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "events" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_ts" TIMESTAMP(3) NOT NULL,
    "src_ip" TEXT NOT NULL,
    "message" TEXT,
    "command" TEXT,
    "username" TEXT,
    "password" TEXT,
    "success" BOOLEAN,
    "raw_json" JSONB NOT NULL,
    "normalized_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cowrie_event_id" TEXT NOT NULL,
    "cowrie_ts" TEXT NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_cowrie_session_id_key" ON "sessions"("cowrie_session_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "events_cowrie_event_id_cowrie_ts_key" ON "events"("cowrie_event_id", "cowrie_ts");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "events_session_id_idx" ON "events"("session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "events_event_type_idx" ON "events"("event_type");

-- AddForeignKey (safe — skipped if already exists via IF NOT EXISTS workaround)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_session_id_fkey'
  ) THEN
    ALTER TABLE "events" ADD CONSTRAINT "events_session_id_fkey"
      FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
