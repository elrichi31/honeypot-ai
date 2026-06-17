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

  // Multi-tenant: the client (tenant) this user is scoped to. NULL = unscoped,
  // which only the superadmin role may use for global access. For any other role
  // NULL means "no data" (fail-closed enforcement in roles.ts).
  await pool.query(`
    ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
  `)

  // Promote the oldest user to admin only if NO admin-level user exists yet.
  // superadmin counts as admin-level — otherwise this would demote a lone
  // superadmin back to admin on every startup (migrate-auth runs each boot).
  await pool.query(`
    UPDATE "user"
    SET role = 'admin'
    WHERE id = (SELECT id FROM "user" ORDER BY "createdAt" ASC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM "user" WHERE role IN ('admin', 'superadmin'));
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "ip_enrichment_cache" (
      "ip"                   TEXT        NOT NULL PRIMARY KEY,
      "abuseipdb_data"       JSONB,
      "ipinfo_data"          JSONB,
      "spectra_analyze_data" JSONB,
      "abuseipdb_fetched_at" TIMESTAMPTZ,
      "ipinfo_fetched_at"    TIMESTAMPTZ,
      "spectra_analyze_fetched_at" TIMESTAMPTZ,
      "cached_at"            TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `)

  await pool.query(`
    ALTER TABLE "ip_enrichment_cache"
      ADD COLUMN IF NOT EXISTS "spectra_analyze_data" JSONB,
      ADD COLUMN IF NOT EXISTS "spectra_analyze_fetched_at" TIMESTAMPTZ;
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "ai_threat_cache" (
      "ip"          TEXT        NOT NULL PRIMARY KEY,
      "analysis"    JSONB       NOT NULL DEFAULT '{}',
      "analyzed_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "suricata_alerts" (
      "id"           TEXT        NOT NULL PRIMARY KEY,
      "sensor_id"    TEXT        NOT NULL DEFAULT '',
      "timestamp"    TIMESTAMPTZ NOT NULL,
      "src_ip"       TEXT        NOT NULL DEFAULT '',
      "src_port"     INTEGER,
      "dest_ip"      TEXT        NOT NULL DEFAULT '',
      "dest_port"    INTEGER,
      "proto"        TEXT        NOT NULL DEFAULT '',
      "action"       TEXT        NOT NULL DEFAULT 'allowed',
      "signature_id" INTEGER     NOT NULL DEFAULT 0,
      "signature"    TEXT        NOT NULL DEFAULT '',
      "category"     TEXT        NOT NULL DEFAULT '',
      "severity"     INTEGER     NOT NULL DEFAULT 3,
      "flow_id"      BIGINT,
      "in_iface"     TEXT,
      "raw"          JSONB       NOT NULL DEFAULT '{}',
      "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS "suricata_alerts_src_ip_idx"
      ON "suricata_alerts" ("src_ip");
    CREATE INDEX IF NOT EXISTS "suricata_alerts_severity_idx"
      ON "suricata_alerts" ("severity");
    CREATE INDEX IF NOT EXISTS "suricata_alerts_signature_id_idx"
      ON "suricata_alerts" ("signature_id");
    CREATE INDEX IF NOT EXISTS "suricata_alerts_timestamp_idx"
      ON "suricata_alerts" ("timestamp" DESC);
    CREATE INDEX IF NOT EXISTS "suricata_alerts_created_at_idx"
      ON "suricata_alerts" ("created_at" DESC);
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "falco_alerts" (
      "id"             TEXT        NOT NULL PRIMARY KEY,
      "sensor_id"      TEXT        NOT NULL DEFAULT '',
      "rule"           TEXT        NOT NULL DEFAULT '',
      "priority"       TEXT        NOT NULL DEFAULT 'warning',
      "output"         TEXT        NOT NULL DEFAULT '',
      "container_id"   TEXT,
      "container_name" TEXT,
      "proc_name"      TEXT,
      "proc_cmdline"   TEXT,
      "user_name"      TEXT,
      "evt_type"       TEXT,
      "fd_name"        TEXT,
      "tags"           TEXT[]      NOT NULL DEFAULT '{}',
      "output_fields"  JSONB       NOT NULL DEFAULT '{}',
      "timestamp"      TIMESTAMPTZ NOT NULL,
      "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS "falco_alerts_sensor_id_idx"  ON "falco_alerts" ("sensor_id");
    CREATE INDEX IF NOT EXISTS "falco_alerts_rule_idx"        ON "falco_alerts" ("rule");
    CREATE INDEX IF NOT EXISTS "falco_alerts_priority_idx"    ON "falco_alerts" ("priority");
    CREATE INDEX IF NOT EXISTS "falco_alerts_container_idx"   ON "falco_alerts" ("container_name");
    CREATE INDEX IF NOT EXISTS "falco_alerts_timestamp_idx"   ON "falco_alerts" ("timestamp" DESC);
    CREATE INDEX IF NOT EXISTS "falco_alerts_created_at_idx"  ON "falco_alerts" ("created_at" DESC);
  `)

  const requiredTables = ["user", "session", "account", "verification", "audit_log", "ip_enrichment_cache", "ai_threat_cache"]
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
