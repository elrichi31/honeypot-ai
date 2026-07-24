-- AbuseIPDB quota ledger — one row per calendar day (UTC).
-- Mirrors vt_quota_log's shape. AbuseIPDB's free tier only caps requests per
-- day (1,000/day) — there is no monthly cap to enforce.
CREATE TABLE IF NOT EXISTS abuseipdb_quota_log (
  day        DATE        NOT NULL,
  requests   INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (day)
);
