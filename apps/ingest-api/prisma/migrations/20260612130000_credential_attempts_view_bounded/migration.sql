-- Bound the credential_attempts view to the last 90 days.
--
-- The unbounded version (previous migration) aggregated GROUP BY username/password
-- across the full history of both `events` and `protocol_hits` (each hundreds of
-- thousands of rows), which overran the credentials request timeout and made the
-- page fail to load. A 90-day window lets the timestamp indexes
-- (events.event_ts, protocol_hits.timestamp) prune, keeping the aggregations fast.
-- Credential intel older than 90 days adds little to "what's being tried now",
-- and retention already trims most tables near this window.
--
-- CREATE OR REPLACE keeps the same view name/columns, so the queries are unchanged.

CREATE OR REPLACE VIEW credential_attempts AS
  SELECT
    e.event_ts                                   AS event_ts,
    e.src_ip                                     AS src_ip,
    e.username                                   AS username,
    e.password                                   AS password,
    e.success                                    AS success,
    s.sensor_id                                  AS sensor_id,
    'ssh'                                        AS protocol
  FROM events e
  LEFT JOIN sessions s ON s.id = e.session_id
  WHERE e.event_type IN ('auth.success', 'auth.failed')
    AND e.event_ts >= NOW() - INTERVAL '90 days'

  UNION ALL

  SELECT
    ph.timestamp                                 AS event_ts,
    ph.src_ip                                    AS src_ip,
    ph.username                                  AS username,
    ph.password                                  AS password,
    FALSE                                        AS success,
    ph.sensor_id                                 AS sensor_id,
    COALESCE(NULLIF(ph.data->>'protocolName', ''), ph.protocol) AS protocol
  FROM protocol_hits ph
  WHERE ph.event_type = 'auth'
    AND ph.timestamp >= NOW() - INTERVAL '90 days';
