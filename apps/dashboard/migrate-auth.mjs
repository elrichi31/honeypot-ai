/**
 * Creates Better Auth tables if they don't exist.
 * Runs automatically at container startup before the Next.js server.
 */
import { Pool } from "pg"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c search_path=public",
})

async function migrate() {
  console.log("[migrate] Running better-auth schema migration...")

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "user" (
      "id"            TEXT        NOT NULL PRIMARY KEY,
      "name"          TEXT        NOT NULL,
      "email"         TEXT        NOT NULL UNIQUE,
      "emailVerified" BOOLEAN     NOT NULL DEFAULT false,
      "image"         TEXT,
      "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "session" (
      "id"          TEXT        NOT NULL PRIMARY KEY,
      "expiresAt"   TIMESTAMPTZ NOT NULL,
      "token"       TEXT        NOT NULL UNIQUE,
      "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
      "ipAddress"   TEXT,
      "userAgent"   TEXT,
      "userId"      TEXT        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS "session_userId_idx"
      ON "session" ("userId");

    CREATE TABLE IF NOT EXISTS "account" (
      "id"                     TEXT        NOT NULL PRIMARY KEY,
      "accountId"              TEXT        NOT NULL,
      "providerId"             TEXT        NOT NULL,
      "userId"                 TEXT        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "accessToken"            TEXT,
      "refreshToken"           TEXT,
      "idToken"                TEXT,
      "accessTokenExpiresAt"   TIMESTAMPTZ,
      "refreshTokenExpiresAt"  TIMESTAMPTZ,
      "scope"                  TEXT,
      "password"               TEXT,
      "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS "account_userId_idx"
      ON "account" ("userId");

    CREATE TABLE IF NOT EXISTS "verification" (
      "id"         TEXT        NOT NULL PRIMARY KEY,
      "identifier" TEXT        NOT NULL,
      "value"      TEXT        NOT NULL,
      "expiresAt"  TIMESTAMPTZ NOT NULL,
      "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS "verification_identifier_idx"
      ON "verification" ("identifier");
  `)

  // Add role column to existing user table (idempotent)
  await pool.query(`
    ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'analyst';
  `)

  // Promote the oldest user to admin if no admin exists yet
  await pool.query(`
    UPDATE "user"
    SET role = 'admin'
    WHERE id = (SELECT id FROM "user" ORDER BY "createdAt" ASC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM "user" WHERE role = 'admin');
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "audit_log" (
      "id"           TEXT        NOT NULL PRIMARY KEY,
      "userId"       TEXT        NOT NULL,
      "userEmail"    TEXT        NOT NULL,
      "userName"     TEXT        NOT NULL DEFAULT '',
      "action"       TEXT        NOT NULL,
      "resource"     TEXT        NOT NULL,
      "resourceId"   TEXT,
      "resourceName" TEXT,
      "details"      JSONB       NOT NULL DEFAULT '{}',
      "ipAddress"    TEXT,
      "userAgent"    TEXT,
      "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS "audit_log_userId_idx"    ON "audit_log" ("userId");
    CREATE INDEX IF NOT EXISTS "audit_log_resource_idx"  ON "audit_log" ("resource");
    CREATE INDEX IF NOT EXISTS "audit_log_action_idx"    ON "audit_log" ("action");
    CREATE INDEX IF NOT EXISTS "audit_log_createdAt_idx" ON "audit_log" ("createdAt" DESC);
  `)

  const requiredTables = ["user", "session", "account", "verification", "audit_log"]
  const result = await pool.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [requiredTables]
  )

  const existing = new Set(result.rows.map((row) => row.table_name))
  const missing = requiredTables.filter((table) => !existing.has(table))

  if (missing.length > 0) {
    throw new Error(`Missing auth tables after migration: ${missing.join(", ")}`)
  }

  console.log("[migrate] Done.")
  await pool.end()
}

migrate().catch((err) => {
  console.error("[migrate] Failed:", err.message)
  process.exit(1)
})
