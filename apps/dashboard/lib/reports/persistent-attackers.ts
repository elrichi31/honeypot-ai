// Server-only: IPs that came back on several different days of the period.
//
// This used to be read from `daily_attacker_stats`, which has no sensor or
// client dimension — every client's report was showing every other client's
// attackers. Counted from the raw tables instead, scoped to the tenant's own
// sensors like the rest of the report.
import { db } from "@/lib/db"
import type { ReportPersistentAttacker } from "./types"

const MIN_ACTIVE_DAYS = 3

export async function collectPersistentAttackers(
  sensorIds: string[] | undefined,
  startDate: string,
  endDate: string,
): Promise<ReportPersistentAttacker[]> {
  if (!sensorIds?.length) return []

  const { rows } = await db.query<{ src_ip: string; active_days: string; total_hits: string }>(
    `WITH activity AS (
       SELECT src_ip, started_at::date AS day, COUNT(*)::bigint AS hits
       FROM sessions
       WHERE sensor_id = ANY($1::text[])
         AND started_at >= $2::timestamptz AND started_at <= $3::timestamptz
       GROUP BY 1, 2
       UNION ALL
       SELECT src_ip, timestamp::date AS day, COUNT(*)::bigint AS hits
       FROM web_hits
       WHERE sensor_id = ANY($1::text[])
         AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
       GROUP BY 1, 2
       UNION ALL
       SELECT src_ip, timestamp::date AS day, COUNT(*)::bigint AS hits
       FROM protocol_hits
       WHERE COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
         AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
       GROUP BY 1, 2
     )
     SELECT src_ip,
            COUNT(DISTINCT day)::text AS active_days,
            SUM(hits)::bigint::text AS total_hits
     FROM activity
     GROUP BY src_ip
     HAVING COUNT(DISTINCT day) >= ${MIN_ACTIVE_DAYS}
     ORDER BY COUNT(DISTINCT day) DESC, SUM(hits) DESC
     LIMIT 10`,
    [sensorIds, startDate, endDate],
  )

  return rows.map((row) => ({
    ip: row.src_ip,
    activeDays: Number(row.active_days),
    totalHits: Number(row.total_hits),
  }))
}
