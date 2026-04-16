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

  const requiredTables = ["user", "session", "account", "verification"]
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
