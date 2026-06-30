import { db } from "@/lib/db"
import type { ReportLabelCount, ReportSensorProfile } from "../../types"

function groupLabelCounts(rows: { sensor_id: string; label: string; count: string }[]) {
  const map = new Map<string, ReportLabelCount[]>()
  for (const row of rows) {
    const list = map.get(row.sensor_id) ?? []
    list.push({ label: row.label, count: Number(row.count) })
    map.set(row.sensor_id, list)
  }
  return map
}

export async function collectWebSensorIntel(
  sensorIdSet: string[],
  startDate: string,
  endDate: string,
) {
  const [webSummaryRows, webAttackTypeRows, webPathRows, webMethodRows, webUserAgentRows, webCanaryRows, webSessionRows] =
    await Promise.all([
      db.query<{ sensor_id: string; hits: string; unique_paths: string; attack_type_count: string; session_count: string; fingerprinted_sessions: string; multi_ip_sessions: string; canary_hits: string; chain_hits: string }>(
        `WITH session_rollup AS (
           SELECT sensor_id,
                  COALESCE(client_fingerprint, src_ip) AS session_key,
                  COUNT(DISTINCT src_ip) AS ip_count
           FROM web_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id, COALESCE(client_fingerprint, src_ip)
         )
         SELECT wh.sensor_id,
                COUNT(*)::text AS hits,
                COUNT(DISTINCT wh.path)::text AS unique_paths,
                COUNT(DISTINCT wh.attack_type)::text AS attack_type_count,
                COUNT(DISTINCT COALESCE(wh.client_fingerprint, wh.src_ip))::text AS session_count,
                COUNT(DISTINCT COALESCE(wh.client_fingerprint, wh.src_ip))
                  FILTER (WHERE wh.client_fingerprint IS NOT NULL)::text AS fingerprinted_sessions,
                COUNT(DISTINCT sr.session_key)
                  FILTER (WHERE sr.ip_count > 1)::text AS multi_ip_sessions,
                COUNT(*) FILTER (WHERE wh.canary_triggered)::text AS canary_hits,
                COUNT(*) FILTER (WHERE wh.is_chain_attack)::text AS chain_hits
         FROM web_hits wh
         LEFT JOIN session_rollup sr
           ON sr.sensor_id = wh.sensor_id
          AND sr.session_key = COALESCE(wh.client_fingerprint, wh.src_ip)
         WHERE wh.sensor_id = ANY($1::text[])
           AND wh.timestamp >= $2::timestamptz
           AND wh.timestamp <= $3::timestamptz
         GROUP BY wh.sensor_id`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; label: string; count: string }>(
        `WITH ranked AS (
           SELECT sensor_id, attack_type AS label, COUNT(*)::bigint AS count,
                  ROW_NUMBER() OVER (
                    PARTITION BY sensor_id
                    ORDER BY COUNT(*) DESC, attack_type ASC
                  ) AS rn
           FROM web_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id, attack_type
         )
         SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 6`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; label: string; count: string }>(
        `WITH ranked AS (
           SELECT sensor_id, path AS label, COUNT(*)::bigint AS count,
                  ROW_NUMBER() OVER (
                    PARTITION BY sensor_id
                    ORDER BY COUNT(*) DESC, path ASC
                  ) AS rn
           FROM web_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id, path
         )
         SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 6`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; label: string; count: string }>(
        `WITH ranked AS (
           SELECT sensor_id, method AS label, COUNT(*)::bigint AS count,
                  ROW_NUMBER() OVER (
                    PARTITION BY sensor_id
                    ORDER BY COUNT(*) DESC, method ASC
                  ) AS rn
           FROM web_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id, method
         )
         SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 5`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; label: string; count: string }>(
        `WITH ranked AS (
           SELECT sensor_id, user_agent AS label, COUNT(*)::bigint AS count,
                  ROW_NUMBER() OVER (
                    PARTITION BY sensor_id
                    ORDER BY COUNT(*) DESC, user_agent ASC
                  ) AS rn
           FROM web_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
             AND COALESCE(user_agent, '') <> ''
           GROUP BY sensor_id, user_agent
         )
         SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 5`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; label: string; count: string }>(
        `WITH ranked AS (
           SELECT sensor_id, COALESCE(canary_token_type, '(untyped)') AS label, COUNT(*)::bigint AS count,
                  ROW_NUMBER() OVER (
                    PARTITION BY sensor_id
                    ORDER BY COUNT(*) DESC, COALESCE(canary_token_type, '(untyped)') ASC
                  ) AS rn
           FROM web_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
             AND canary_triggered IS TRUE
           GROUP BY sensor_id, COALESCE(canary_token_type, '(untyped)')
         )
         SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 5`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; session_label: string; hits: string; ip_count: string; chain_hits: string; canary_hits: string; attack_types: string[] | null; top_paths: string[] | null }>(
        `WITH grouped AS (
           SELECT sensor_id,
                  COALESCE(client_fingerprint, src_ip) AS session_label,
                  COUNT(*)::bigint AS hits,
                  COUNT(DISTINCT src_ip)::bigint AS ip_count,
                  COUNT(*) FILTER (WHERE is_chain_attack)::bigint AS chain_hits,
                  COUNT(*) FILTER (WHERE canary_triggered)::bigint AS canary_hits,
                  ARRAY_AGG(DISTINCT attack_type) AS attack_types,
                  (ARRAY_AGG(path ORDER BY timestamp DESC))[1:4] AS top_paths
           FROM web_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id, COALESCE(client_fingerprint, src_ip)
         ),
         ranked AS (
           SELECT *,
                  ROW_NUMBER() OVER (
                    PARTITION BY sensor_id
                    ORDER BY hits DESC, session_label ASC
                  ) AS rn
           FROM grouped
         )
         SELECT sensor_id, session_label, hits::text, ip_count::text, chain_hits::text, canary_hits::text, attack_types, top_paths
         FROM ranked
         WHERE rn <= 4`,
        [sensorIdSet, startDate, endDate],
      ),
    ])

  const webSummary = new Map(webSummaryRows.rows.map((row) => [row.sensor_id, {
    hits: Number(row.hits),
    uniquePaths: Number(row.unique_paths),
    attackTypeCount: Number(row.attack_type_count),
    sessionCount: Number(row.session_count),
    fingerprintedSessions: Number(row.fingerprinted_sessions),
    multiIpSessions: Number(row.multi_ip_sessions),
    canaryHits: Number(row.canary_hits),
    chainHits: Number(row.chain_hits),
  }]))

  const webAttackTypes = groupLabelCounts(webAttackTypeRows.rows)
  const webPaths = groupLabelCounts(webPathRows.rows)
  const webMethods = groupLabelCounts(webMethodRows.rows)
  const webCanaryTokens = groupLabelCounts(webCanaryRows.rows)

  const webUserAgents = new Map<string, ReportLabelCount[]>()
  for (const row of webUserAgentRows.rows) {
    const list = webUserAgents.get(row.sensor_id) ?? []
    const label = row.label.length > 72 ? `${row.label.slice(0, 69)}...` : row.label
    list.push({ label, count: Number(row.count) })
    webUserAgents.set(row.sensor_id, list)
  }

  const webSessions = new Map<string, NonNullable<ReportSensorProfile["web"]>["topSessions"]>()
  for (const row of webSessionRows.rows) {
    const list = webSessions.get(row.sensor_id) ?? []
    list.push({
      label: row.session_label,
      hits: Number(row.hits),
      ipCount: Number(row.ip_count),
      chainHits: Number(row.chain_hits),
      canaryHits: Number(row.canary_hits),
      attackTypes: row.attack_types ?? [],
      topPaths: row.top_paths ?? [],
    })
    webSessions.set(row.sensor_id, list)
  }

  return {
    webSummary,
    webAttackTypes,
    webPaths,
    webMethods,
    webUserAgents,
    webCanaryTokens,
    webSessions,
  }
}
