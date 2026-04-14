/**
 * migrate-auth.mjs
 * Creates better-auth tables if they don't exist.
 * Runs automatically at container startup before the Next.js server.
 */
import pg from "pg"

const { Pool } = pg

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function migrate() {
  console.log("[migrate] Running better-auth schema migration...")

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "user" (
      "id"            TEXT      NOT NULL PRIMARY KEY,
      "name"          TEXT      NOT NULL,
      "email"         TEXT      NOT NULL UNIQUE,
      "emailVerified" BOOLEAN   NOT NULL DEFAULT false,
      "image"         TEXT,
      "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt"     TIMESTAMP NOT NULL DEFAULT now()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "id"          TEXT      NOT NULL PRIMARY KEY,
      "expiresAt"   TIMESTAMP NOT NULL,
      "token"       TEXT      NOT NULL UNIQUE,
      "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt"   TIMESTAMP NOT NULL DEFAULT now(),
      "ipAddress"   TEXT,
      "userAgent"   TEXT,
      "userId"      TEXT      NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "account" (
      "id"                     TEXT      NOT NULL PRIMARY KEY,
      "accountId"              TEXT      NOT NULL,
      "providerId"             TEXT      NOT NULL,
      "userId"                 TEXT      NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "accessToken"            TEXT,
      "refreshToken"           TEXT,
      "idToken"                TEXT,
      "accessTokenExpiresAt"   TIMESTAMP,
      "refreshTokenExpiresAt"  TIMESTAMP,
      "scope"                  TEXT,
      "password"               TEXT,
      "createdAt"              TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt"              TIMESTAMP NOT NULL DEFAULT now()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "verification" (
      "id"         TEXT      NOT NULL PRIMARY KEY,
      "identifier" TEXT      NOT NULL,
      "value"      TEXT      NOT NULL,
      "expiresAt"  TIMESTAMP NOT NULL,
      "createdAt"  TIMESTAMP,
      "updatedAt"  TIMESTAMP
    )
  `)

  console.log("[migrate] Done.")
  await pool.end()
}

migrate().catch((err) => {
  console.error("[migrate] Failed:", err.message)
  process.exit(1)
})
