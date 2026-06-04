-- Daily rollup tables: small, permanent summaries of the high-volume raw event
-- tables. A nightly cron fills these before retention drops the raw rows, so the
-- historical intelligence (top attacker IPs, daily totals, credentials/commands)
-- survives forever even with a 7-day raw-data window.

-- Per-day, per-IP attacker activity.
CREATE TABLE "daily_attacker_stats" (
  "day"             DATE    NOT NULL,
  "src_ip"          TEXT    NOT NULL,
  "events"          BIGINT  NOT NULL DEFAULT 0,
  "auth_attempts"   BIGINT  NOT NULL DEFAULT 0,
  "login_successes" BIGINT  NOT NULL DEFAULT 0,
  "protocol_hits"   BIGINT  NOT NULL DEFAULT 0,
  "web_hits"        BIGINT  NOT NULL DEFAULT 0,
  "sessions"        BIGINT  NOT NULL DEFAULT 0,
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "daily_attacker_stats_pkey" PRIMARY KEY ("day", "src_ip")
);
CREATE INDEX "daily_attacker_stats_day_idx"    ON "daily_attacker_stats" ("day" DESC);
CREATE INDEX "daily_attacker_stats_src_ip_idx" ON "daily_attacker_stats" ("src_ip");

-- Per-day global totals (one row per day).
CREATE TABLE "daily_summary" (
  "day"             DATE    NOT NULL,
  "ssh_events"      BIGINT  NOT NULL DEFAULT 0,
  "web_hits"        BIGINT  NOT NULL DEFAULT 0,
  "protocol_hits"   BIGINT  NOT NULL DEFAULT 0,
  "sessions"        BIGINT  NOT NULL DEFAULT 0,
  "unique_ips"      BIGINT  NOT NULL DEFAULT 0,
  "login_successes" BIGINT  NOT NULL DEFAULT 0,
  "suricata_alerts" BIGINT  NOT NULL DEFAULT 0,
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "daily_summary_pkey" PRIMARY KEY ("day")
);
CREATE INDEX "daily_summary_day_idx" ON "daily_summary" ("day" DESC);

-- Per-day credential attempts (username/password pairs).
CREATE TABLE "daily_credential_stats" (
  "day"          DATE    NOT NULL,
  "username"     TEXT    NOT NULL DEFAULT '',
  "password"     TEXT    NOT NULL DEFAULT '',
  "attempts"     BIGINT  NOT NULL DEFAULT 0,
  "successes"    BIGINT  NOT NULL DEFAULT 0,
  "unique_ips"   BIGINT  NOT NULL DEFAULT 0,
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "daily_credential_stats_pkey" PRIMARY KEY ("day", "username", "password")
);
CREATE INDEX "daily_credential_stats_day_idx" ON "daily_credential_stats" ("day" DESC);

-- Per-day command frequency.
CREATE TABLE "daily_command_stats" (
  "day"        DATE    NOT NULL,
  "command"    TEXT    NOT NULL,
  "count"      BIGINT  NOT NULL DEFAULT 0,
  "unique_ips" BIGINT  NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "daily_command_stats_pkey" PRIMARY KEY ("day", "command")
);
CREATE INDEX "daily_command_stats_day_idx" ON "daily_command_stats" ("day" DESC);
