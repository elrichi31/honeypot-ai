-- Threat IP summary view: aggregates activity from all honeypot sources into a
-- single IP-centric table. Replaces the 4×LIMIT-500 fan-out queries in the
-- threats route, which silently dropped IPs that appeared only in protocol_hits
-- (e.g. MSSQL-only burst attackers that never triggered SSH or web hits).
--
-- Design notes:
-- • Regular VIEW (not materialized) so data is always current; the threats route
--   caches results in-process for 3-5 min, so query cost is amortized.
-- • No per-source LIMIT — every IP that hit ANY honeypot in the window appears.
-- • Timestamp range filtering (90-day window) is done at query time via the
--   WHERE clause pushed down into each CTE by Postgres.
-- • burst_score = hits in last 24h / total hits, used for recency weighting in
--   the application's risk scoring.

CREATE OR REPLACE VIEW threat_ip_summary AS
WITH
  ssh_agg AS (
    SELECT
      s.src_ip,
      COUNT(DISTINCT s.id)                                                            AS ssh_sessions,
      COUNT(e.id)  FILTER (WHERE e.event_type IN ('auth.success', 'auth.failed'))     AS ssh_auth_attempts,
      BOOL_OR(s.login_success)                                                        AS ssh_had_success,
      MIN(s.started_at)                                                               AS ssh_first_seen,
      MAX(COALESCE(s.ended_at, s.started_at))                                         AS ssh_last_seen
    FROM sessions s
    LEFT JOIN events e ON e.session_id = s.id
    GROUP BY s.src_ip
  ),
  web_agg AS (
    SELECT
      src_ip,
      COUNT(*)                                AS web_total_hits,
      ARRAY_AGG(DISTINCT attack_type)         AS web_attack_types,
      MIN(timestamp)                          AS web_first_seen,
      MAX(timestamp)                          AS web_last_seen,
      COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '24 hours') AS web_hits_24h
    FROM web_hits
    GROUP BY src_ip
  ),
  proto_agg AS (
    SELECT
      src_ip,
      ARRAY_AGG(DISTINCT protocol)                                                              AS protocols_seen,
      SUM(total_hits)                                                                           AS proto_total_hits,
      SUM(auth_attempts)                                                                        AS proto_auth_attempts,
      SUM(command_events)                                                                       AS proto_command_events,
      SUM(connect_events)                                                                       AS proto_connect_events,
      MIN(first_seen)                                                                           AS proto_first_seen,
      MAX(last_seen)                                                                            AS proto_last_seen,
      SUM(hits_24h)                                                                             AS proto_hits_24h
    FROM (
      SELECT
        src_ip,
        protocol,
        COUNT(*)                                                               AS total_hits,
        COUNT(*) FILTER (WHERE event_type = 'auth')                            AS auth_attempts,
        COUNT(*) FILTER (WHERE event_type = 'command')                         AS command_events,
        COUNT(*) FILTER (WHERE event_type = 'connect')                         AS connect_events,
        MIN(timestamp)                                                         AS first_seen,
        MAX(timestamp)                                                         AS last_seen,
        COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '24 hours')       AS hits_24h
      FROM protocol_hits
      GROUP BY src_ip, protocol
    ) ph_by_proto
    GROUP BY src_ip
  ),
  all_ips AS (
    SELECT src_ip FROM ssh_agg
    UNION
    SELECT src_ip FROM web_agg
    UNION
    SELECT src_ip FROM proto_agg
  )
SELECT
  a.src_ip,
  -- SSH
  COALESCE(s.ssh_sessions, 0)       AS ssh_sessions,
  COALESCE(s.ssh_auth_attempts, 0)  AS ssh_auth_attempts,
  COALESCE(s.ssh_had_success, false) AS ssh_had_success,
  s.ssh_first_seen,
  s.ssh_last_seen,
  -- Web
  COALESCE(w.web_total_hits, 0)     AS web_total_hits,
  COALESCE(w.web_attack_types, '{}') AS web_attack_types,
  w.web_first_seen,
  w.web_last_seen,
  COALESCE(w.web_hits_24h, 0)       AS web_hits_24h,
  -- Protocol
  COALESCE(p.protocols_seen, '{}')  AS protocols_seen,
  COALESCE(p.proto_total_hits, 0)   AS proto_total_hits,
  COALESCE(p.proto_auth_attempts, 0) AS proto_auth_attempts,
  COALESCE(p.proto_command_events, 0) AS proto_command_events,
  COALESCE(p.proto_connect_events, 0) AS proto_connect_events,
  p.proto_first_seen,
  p.proto_last_seen,
  COALESCE(p.proto_hits_24h, 0)     AS proto_hits_24h,
  -- Derived: earliest / latest activity across all sources
  LEAST(
    s.ssh_first_seen, w.web_first_seen, p.proto_first_seen
  )                                  AS first_seen,
  GREATEST(
    s.ssh_last_seen, w.web_last_seen, p.proto_last_seen
  )                                  AS last_seen,
  -- Recency burst score: fraction of total hits in last 24h (0.0–1.0).
  -- Higher = recent burst; used to boost risk scores for active attackers.
  CASE
    WHEN (COALESCE(w.web_total_hits,0) + COALESCE(p.proto_total_hits,0)) = 0 THEN 0.0
    ELSE ROUND(
      (COALESCE(w.web_hits_24h,0) + COALESCE(p.proto_hits_24h,0))::numeric /
      (COALESCE(w.web_total_hits,0) + COALESCE(p.proto_total_hits,0))::numeric,
      4
    )
  END                                AS burst_score
FROM all_ips a
LEFT JOIN ssh_agg   s ON s.src_ip = a.src_ip
LEFT JOIN web_agg   w ON w.src_ip = a.src_ip
LEFT JOIN proto_agg p ON p.src_ip = a.src_ip;
