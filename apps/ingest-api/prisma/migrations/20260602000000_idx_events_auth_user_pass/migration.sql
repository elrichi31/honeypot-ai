-- Speeds up Credentials rankings + spray/targeted analysis (GROUP BY
-- username/password over auth events). Partial index keeps it small.
-- One CONCURRENTLY statement per migration file so Prisma runs it outside a
-- transaction (CONCURRENTLY cannot run inside one).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "events_auth_user_pass_idx"
  ON "events" ("username", "password")
  WHERE "event_type" IN ('auth.success', 'auth.failed');
