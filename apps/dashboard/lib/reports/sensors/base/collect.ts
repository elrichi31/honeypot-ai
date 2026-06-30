import { db } from "@/lib/db"

export async function collectBaseSensorIntel(
  sensorIdSet: string[],
  startDate: string,
  endDate: string,
) {
  const [uniqueIpRows, authRows, commandRows, topIpRows, topCredentialRows, topSignalRows, topTargetRows] =
    await Promise.all([
      db.query<{ sensor_id: string; unique_ips: string }>(
        `WITH per_event AS (
           SELECT sensor_id, src_ip FROM sessions
           WHERE sensor_id = ANY($1::text[]) AND started_at >= $2::timestamptz AND started_at <= $3::timestamptz
           UNION ALL
           SELECT sensor_id, src_ip FROM web_hits
           WHERE sensor_id = ANY($1::text[]) AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
           UNION ALL
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id, src_ip FROM protocol_hits
           WHERE COALESCE(sensor_id, data->>'sensor') = ANY($1::text[]) AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         )
         SELECT sensor_id, COUNT(DISTINCT src_ip)::text AS unique_ips
         FROM per_event
         GROUP BY sensor_id`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; auth_attempts: string; success_count: string }>(
        `SELECT sensor_id, COUNT(*)::text AS auth_attempts,
                COUNT(*) FILTER (WHERE success IS TRUE)::text AS success_count
         FROM credential_attempts
         WHERE sensor_id = ANY($1::text[]) AND event_ts >= $2::timestamptz AND event_ts <= $3::timestamptz
         GROUP BY sensor_id`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; command_count: string }>(
        `WITH combined AS (
           SELECT s.sensor_id, COUNT(*)::bigint AS command_count
           FROM events e
           JOIN sessions s ON s.id = e.session_id
           WHERE s.sensor_id = ANY($1::text[])
             AND e.event_type = 'command.input'
             AND e.event_ts >= $2::timestamptz
             AND e.event_ts <= $3::timestamptz
           GROUP BY s.sensor_id
           UNION ALL
           SELECT sensor_id, COUNT(*)::bigint AS command_count
           FROM protocol_hits
           WHERE sensor_id = ANY($1::text[])
             AND event_type = 'command'
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id
         )
         SELECT sensor_id, SUM(command_count)::text AS command_count
         FROM combined
         GROUP BY sensor_id`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; src_ip: string; hit_count: string }>(
        `WITH per_event AS (
           SELECT sensor_id, src_ip FROM sessions
           WHERE sensor_id = ANY($1::text[]) AND started_at >= $2::timestamptz AND started_at <= $3::timestamptz
           UNION ALL
           SELECT sensor_id, src_ip FROM web_hits
           WHERE sensor_id = ANY($1::text[]) AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
           UNION ALL
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id, src_ip FROM protocol_hits
           WHERE COALESCE(sensor_id, data->>'sensor') = ANY($1::text[]) AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         ),
         ranked AS (
           SELECT sensor_id, src_ip, COUNT(*)::bigint AS hit_count,
                  ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY COUNT(*) DESC, src_ip ASC) AS rn
           FROM per_event
           GROUP BY sensor_id, src_ip
         )
         SELECT sensor_id, src_ip, hit_count::text
         FROM ranked
         WHERE rn <= 4`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; username: string | null; password: string | null; attempts: string; success_count: string }>(
        `WITH ranked AS (
           SELECT sensor_id, username, password,
                  COUNT(*)::bigint AS attempts,
                  COUNT(*) FILTER (WHERE success IS TRUE)::bigint AS success_count,
                  ROW_NUMBER() OVER (
                    PARTITION BY sensor_id
                    ORDER BY COUNT(*) DESC,
                             COUNT(*) FILTER (WHERE success IS TRUE) DESC,
                             COALESCE(username, '') ASC,
                             COALESCE(password, '') ASC
                  ) AS rn
           FROM credential_attempts
           WHERE sensor_id = ANY($1::text[]) AND event_ts >= $2::timestamptz AND event_ts <= $3::timestamptz
           GROUP BY sensor_id, username, password
         )
         SELECT sensor_id, username, password, attempts::text, success_count::text
         FROM ranked
         WHERE rn <= 3`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; label: string; count: string }>(
        `WITH raw_signals AS (
           SELECT s.sensor_id, e.event_type AS label, COUNT(*)::bigint AS count
           FROM events e
           JOIN sessions s ON s.id = e.session_id
           WHERE s.sensor_id = ANY($1::text[])
             AND e.event_ts >= $2::timestamptz
             AND e.event_ts <= $3::timestamptz
           GROUP BY s.sensor_id, e.event_type
           UNION ALL
           SELECT sensor_id, event_type AS label, COUNT(*)::bigint AS count
           FROM protocol_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id, event_type
           UNION ALL
           SELECT sensor_id, attack_type AS label, COUNT(*)::bigint AS count
           FROM web_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id, attack_type
         ),
         ranked AS (
           SELECT sensor_id, label, SUM(count)::bigint AS count,
                  ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY SUM(count) DESC, label ASC) AS rn
           FROM raw_signals
           GROUP BY sensor_id, label
         )
         SELECT sensor_id, label, count::text
         FROM ranked
         WHERE rn <= 4`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; label: string; count: string }>(
        `WITH raw_targets AS (
           SELECT sensor_id, CONCAT('port ', dst_port::text) AS label, COUNT(*)::bigint AS count
           FROM protocol_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id, dst_port
           UNION ALL
           SELECT sensor_id, path AS label, COUNT(*)::bigint AS count
           FROM web_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id, path
         ),
         ranked AS (
           SELECT sensor_id, label, SUM(count)::bigint AS count,
                  ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY SUM(count) DESC, label ASC) AS rn
           FROM raw_targets
           GROUP BY sensor_id, label
         )
         SELECT sensor_id, label, count::text
         FROM ranked
         WHERE rn <= 4`,
        [sensorIdSet, startDate, endDate],
      ),
    ])

  return {
    uniqueIpRows,
    authRows,
    commandRows,
    topIpRows,
    topCredentialRows,
    topSignalRows,
    topTargetRows,
  }
}
