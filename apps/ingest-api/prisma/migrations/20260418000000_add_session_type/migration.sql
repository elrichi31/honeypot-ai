-- AddColumn: session_type to sessions table
-- Values: 'bot' | 'human' | 'unknown'
ALTER TABLE "sessions" ADD COLUMN "session_type" TEXT NOT NULL DEFAULT 'unknown';

CREATE INDEX "sessions_session_type_idx" ON "sessions"("session_type");
