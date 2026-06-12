-- Unified credential-attempts view.
--
-- The Credentials page used to read only from `events` (SSH/Cowrie). Auth
-- attempts from the other honeypots (MySQL, MSSQL, FTP, VNC, RDP via the port
-- honeypot, Dionaea) live in `protocol_hits` instead, so they were invisible.
--
-- This view normalizes both tables into one shape the credentials queries can
-- aggregate over, adding a `protocol` column so the UI can filter/badge by
-- source. Columns match what the queries expect: event_ts, src_ip, username,
-- password, success, plus sensor_id (for client scoping) and protocol.
--
-- A VIEW (not a table) means zero extra storage and it's always live — no sync
-- job. The underlying tables are already indexed on the timestamp/src_ip columns
-- the aggregations use.

CREATE OR REPLACE VIEW credential_attempts AS
  -- SSH (Cowrie): auth events live in `events`; sensor attribution comes from the
  -- parent session. success is meaningful here (login succeeded or not).
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

  UNION ALL

  -- Everything else: auth attempts captured by the protocol honeypots. These are
  -- always rejected (low/medium interaction), so success is always false. For the
  -- port honeypot we prefer the specific handshake protocol (vnc/rdp) recorded in
  -- data->>'protocolName' over the generic 'port-scan'.
  SELECT
    ph.timestamp                                 AS event_ts,
    ph.src_ip                                    AS src_ip,
    ph.username                                  AS username,
    ph.password                                  AS password,
    FALSE                                        AS success,
    ph.sensor_id                                 AS sensor_id,
    COALESCE(NULLIF(ph.data->>'protocolName', ''), ph.protocol) AS protocol
  FROM protocol_hits ph
  WHERE ph.event_type = 'auth';
