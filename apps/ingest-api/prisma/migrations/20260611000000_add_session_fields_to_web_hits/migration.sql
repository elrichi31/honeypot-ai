-- Add session tracking and fingerprint fields to web_hits.
-- All columns are nullable so existing rows are unaffected and the migration
-- runs without a table rewrite on large datasets.

ALTER TABLE web_hits
  ADD COLUMN IF NOT EXISTS session_hits        int,
  ADD COLUMN IF NOT EXISTS session_elapsed_s   real,
  ADD COLUMN IF NOT EXISTS paths_visited       text[],
  ADD COLUMN IF NOT EXISTS attack_chain        text[],
  ADD COLUMN IF NOT EXISTS is_chain_attack     boolean,
  ADD COLUMN IF NOT EXISTS client_fingerprint  text,
  ADD COLUMN IF NOT EXISTS canary_token_type   text,
  ADD COLUMN IF NOT EXISTS referer             text,
  ADD COLUMN IF NOT EXISTS http_version        text;

-- Index fingerprint for cross-IP correlation queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS web_hits_client_fingerprint_idx
  ON web_hits (client_fingerprint)
  WHERE client_fingerprint IS NOT NULL;

-- Index chain attacks for quick dashboard filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS web_hits_is_chain_attack_idx
  ON web_hits (is_chain_attack, timestamp DESC)
  WHERE is_chain_attack = true;
