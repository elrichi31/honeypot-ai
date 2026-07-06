-- Shrink credential_attempts from a 90-day to a 30-day window.
--
-- At 90 days the view had grown to 916MB / 1.6M rows, and REFRESH MATERIALIZED
-- VIEW CONCURRENTLY (every 5 min) was taking 100-300s, generating enough WAL to
-- push the replica's WAL-replay CPU to 150%+ almost continuously (see incident
-- 2026-07-06). The Credentials dashboard page has no date-range filter in the
-- UI (always queries all available data), so a shorter window only trims how
-- far back credential stats reach, not any user-facing control.
--
-- 30 days is still generous for credential-reuse/spray-pattern detection while
-- cutting the row count (and refresh cost) roughly 3x.

DROP MATERIALIZED VIEW IF EXISTS credential_attempts;

CREATE MATERIALIZED VIEW credential_attempts AS
SELECT
  ROW_NUMBER() OVER () AS id,
  sub.event_ts,
  sub.src_ip,
  sub.username,
  sub.password,
  sub.success,
  sub.sensor_id,
  sub.protocol
FROM (
  SELECT
    e.event_ts AS event_ts,
    e.src_ip AS src_ip,
    e.username AS username,
    e.password AS password,
    e.success AS success,
    s.sensor_id AS sensor_id,
    'ssh' AS protocol
  FROM events e
  LEFT JOIN sessions s ON s.id = e.session_id
  WHERE e.event_type IN ('auth.success', 'auth.failed')
    AND e.event_ts >= NOW() - INTERVAL '30 days'

  UNION ALL

  SELECT
    ph.timestamp AS event_ts,
    ph.src_ip AS src_ip,
    ph.username AS username,
    ph.password AS password,
    FALSE AS success,
    ph.sensor_id AS sensor_id,
    COALESCE(NULLIF(ph.data->>'protocolName', ''), ph.protocol) AS protocol
  FROM protocol_hits ph
  WHERE ph.event_type = 'auth'
    AND ph.timestamp >= NOW() - INTERVAL '30 days'
) sub
WITH DATA;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX credential_attempts_id_idx ON credential_attempts (id);
CREATE INDEX credential_attempts_event_ts_idx ON credential_attempts (event_ts DESC);
CREATE INDEX credential_attempts_src_ip_idx ON credential_attempts (src_ip);
CREATE INDEX credential_attempts_username_idx ON credential_attempts (username);
CREATE INDEX credential_attempts_password_idx ON credential_attempts (password);
CREATE INDEX credential_attempts_protocol_idx ON credential_attempts (protocol);
CREATE INDEX credential_attempts_sensor_idx ON credential_attempts (sensor_id);
