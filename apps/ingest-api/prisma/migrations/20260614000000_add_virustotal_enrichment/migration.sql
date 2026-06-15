-- Add VirusTotal enrichment columns to ip_enrichment_cache.
-- The table is managed by the dashboard app (raw pg queries), not Prisma ORM,
-- so we ALTER it here to keep migrations in one place.

-- ip_enrichment_cache may not exist yet on fresh deployments; create it if needed.
CREATE TABLE IF NOT EXISTS ip_enrichment_cache (
  ip                       TEXT PRIMARY KEY,
  abuseipdb_data           JSONB,
  ipinfo_data              JSONB,
  spectra_analyze_data     JSONB,
  abuseipdb_fetched_at     TIMESTAMPTZ,
  ipinfo_fetched_at        TIMESTAMPTZ,
  spectra_analyze_fetched_at TIMESTAMPTZ,
  cached_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- VirusTotal IP enrichment
ALTER TABLE ip_enrichment_cache
  ADD COLUMN IF NOT EXISTS virustotal_data       JSONB,
  ADD COLUMN IF NOT EXISTS virustotal_fetched_at TIMESTAMPTZ;

-- VirusTotal quota ledger — one row per calendar day (UTC).
-- Used to enforce the 500 req/day and 15 500 req/month soft caps.
CREATE TABLE IF NOT EXISTS vt_quota_log (
  day        DATE        NOT NULL,
  requests   INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (day)
);
