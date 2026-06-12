-- Promote credential_attempts from a plain VIEW to a MATERIALIZED VIEW.
--
-- The plain view worked but the Credentials page ran 16 aggregation queries in
-- parallel, each re-materializing the events+protocol_hits UNION (≈130k rows in
-- the 90-day window) and grouping it — ~18s total. A view can't be indexed, so
-- the planner had no shortcuts.
--
-- A materialized view stores the rows once and CAN be indexed, so those
-- GROUP BY/COUNT(DISTINCT) queries hit real indexes → sub-second. It's refreshed
-- on a timer (see the ingest refresh job); credential data tolerating a few
-- minutes of staleness is fine.
--
-- A surrogate `id` (ROW_NUMBER) gives the unique index that REFRESH … CONCURRENTLY
-- requires (so refreshes don't block reads).

DROP VIEW IF EXISTS credential_attempts;

CREATE MATERIALIZED VIEW credential_attempts AS
  SELECT
    ROW_NUMBER() OVER ()                         AS id,
    sub.event_ts,
    sub.src_ip,
    sub.username,
    sub.password,
    sub.success,
    sub.sensor_id,
    sub.protocol
  FROM (
    SELECT
      e.event_ts   AS event_ts,
      e.src_ip     AS src_ip,
      e.username   AS username,
      e.password   AS password,
      e.success    AS success,
      s.sensor_id  AS sensor_id,
      'ssh'        AS protocol
    FROM events e
    LEFT JOIN sessions s ON s.id = e.session_id
    WHERE e.event_type IN ('auth.success', 'auth.failed')
      AND e.event_ts >= NOW() - INTERVAL '90 days'

    UNION ALL

    SELECT
      ph.timestamp AS event_ts,
      ph.src_ip    AS src_ip,
      ph.username  AS username,
      ph.password  AS password,
      FALSE        AS success,
      ph.sensor_id AS sensor_id,
      COALESCE(NULLIF(ph.data->>'protocolName', ''), ph.protocol) AS protocol
    FROM protocol_hits ph
    WHERE ph.event_type = 'auth'
      AND ph.timestamp >= NOW() - INTERVAL '90 days'
  ) sub;

-- Unique index required by REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX credential_attempts_id_idx ON credential_attempts (id);

-- Indexes the credentials aggregations actually use.
CREATE INDEX credential_attempts_username_idx ON credential_attempts (username);
CREATE INDEX credential_attempts_password_idx ON credential_attempts (password);
CREATE INDEX credential_attempts_src_ip_idx   ON credential_attempts (src_ip);
CREATE INDEX credential_attempts_event_ts_idx ON credential_attempts (event_ts DESC);
CREATE INDEX credential_attempts_protocol_idx ON credential_attempts (protocol);
CREATE INDEX credential_attempts_sensor_idx   ON credential_attempts (sensor_id);
