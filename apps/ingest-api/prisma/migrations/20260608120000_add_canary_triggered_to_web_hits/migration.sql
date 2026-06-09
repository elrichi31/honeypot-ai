-- Flags a web hit where the attacker replayed the leaked DB credentials at a
-- login form. Adding a BOOLEAN with a constant DEFAULT is a metadata-only change
-- in Postgres 11+ (no table rewrite), so this is safe on a large web_hits table.
ALTER TABLE "web_hits" ADD COLUMN IF NOT EXISTS "canary_triggered" BOOLEAN NOT NULL DEFAULT false;
