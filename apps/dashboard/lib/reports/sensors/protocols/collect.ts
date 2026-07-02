import { db } from "@/lib/db"
import { groupDetailCounts, groupLabelCounts } from "../shared"
import type {
  ReportEnrichedAttacker,
  ReportSuricataAlert,
  ReportSshFingerprint,
  ReportCredentialCampaign,
  ReportPersistentAttacker,
} from "../../types"

type LabelRow = { sensor_id: string; label: string; count: string }
type DetailRow = { sensor_id: string; label: string; detail: string | null; count: string }

export async function collectProtocolSensorIntel(
  sensorIdSet: string[],
  startDate: string,
  endDate: string,
) {
  const [
    eventBreakdownRows,
    sourcePortRows,
    sourceServiceRows,
    fileTransferRows,
    ftpCommandRows,
    smbDomainRows,
    smbShareRows,
    smbHostRows,
    smbHashRows,
    databaseRows,
    portScanServiceRows,
    dionaeaPortRows,
    suricataRows,
    enrichedRows,
    fingerprintRows,
    credentialRows,
    persistentRows,
  ] = await Promise.all([
    db.query<LabelRow>(
      `WITH ranked AS (
         SELECT sensor_id, label, COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY COUNT(*) DESC, label ASC) AS rn
         FROM (
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                  event_type AS label
           FROM protocol_hits
           WHERE COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
             AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         ) sub
         GROUP BY 1, 2
       )
       SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<LabelRow>(
      `WITH ranked AS (
         SELECT sensor_id, label, COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY COUNT(*) DESC, label ASC) AS rn
         FROM (
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                  src_port::text AS label
           FROM protocol_hits
           WHERE src_port IS NOT NULL
             AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
             AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         ) sub
         GROUP BY 1, 2
       )
       SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<LabelRow>(
      `WITH ranked AS (
         SELECT sensor_id, label, COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY COUNT(*) DESC, label ASC) AS rn
         FROM (
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                  data->>'service' AS label
           FROM protocol_hits
           WHERE COALESCE(data->>'service', '') <> ''
             AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
             AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         ) sub
         WHERE label IS NOT NULL
         GROUP BY 1, 2
       )
       SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<DetailRow>(
      `WITH ranked AS (
         SELECT sensor_id, label, detail, COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY COUNT(*) DESC, label ASC) AS rn
         FROM (
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                  COALESCE(
                    NULLIF(data->>'requestedPath', ''),
                    NULLIF(data->>'fileName', ''),
                    NULLIF(data->>'command', ''),
                    NULLIF(data->>'url', ''),
                    NULLIF(data->>'outfile', ''),
                    NULLIF(data->>'destfile', ''),
                    event_type
                  ) AS label,
                  NULLIF(
                    CONCAT_WS(
                      ' | ',
                      event_type,
                      NULLIF(COALESCE(data->>'shareName', data->>'share'), ''),
                      NULLIF(data->>'sha256', ''),
                      NULLIF(data->>'md5', '')
                    ),
                    ''
                  ) AS detail
           FROM protocol_hits
           WHERE protocol IN ('ftp', 'smb')
             AND event_type IN ('file.upload', 'file.download')
             AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
             AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         ) sub
         GROUP BY 1, 2, 3
       )
       SELECT sensor_id, label, detail, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<LabelRow>(
      `WITH cmds AS (
         SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                jsonb_array_elements(data#>'{raw,ftp,commands}')->>'command' AS label
         FROM protocol_hits
         WHERE protocol = 'ftp' AND event_type = 'command'
           AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
           AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
       ),
       ranked AS (
         SELECT sensor_id, label, COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY COUNT(*) DESC, label ASC) AS rn
         FROM cmds WHERE label IS NOT NULL AND label <> ''
         GROUP BY sensor_id, label
       )
       SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<LabelRow>(
      `WITH ranked AS (
         SELECT sensor_id, label, COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY COUNT(*) DESC, label ASC) AS rn
         FROM (
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                  data->>'domain' AS label
           FROM protocol_hits
           WHERE protocol = 'smb' AND COALESCE(data->>'domain', '') <> ''
             AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
             AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         ) sub
         WHERE label IS NOT NULL
         GROUP BY 1, 2
       )
       SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<LabelRow>(
      `WITH ranked AS (
         SELECT sensor_id, label, COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY COUNT(*) DESC, label ASC) AS rn
         FROM (
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                  COALESCE(data->>'shareName', data->>'share') AS label
           FROM protocol_hits
           WHERE protocol = 'smb' AND COALESCE(data->>'shareName', data->>'share', '') <> ''
             AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
             AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         ) sub
         WHERE label IS NOT NULL
         GROUP BY 1, 2
       )
       SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<DetailRow>(
      `WITH ranked AS (
         SELECT sensor_id, label, detail, COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY COUNT(*) DESC, label ASC) AS rn
         FROM (
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                  COALESCE(data->>'hostName', data->>'nativeOS') AS label,
                  NULLIF(data->>'domain', '') AS detail
           FROM protocol_hits
           WHERE protocol = 'smb'
             AND COALESCE(data->>'hostName', data->>'nativeOS', '') <> ''
             AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
             AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         ) sub
         GROUP BY 1, 2, 3
       )
       SELECT sensor_id, label, detail, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<DetailRow>(
      `WITH ranked AS (
         SELECT sensor_id, label, detail, COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY COUNT(*) DESC, label ASC) AS rn
         FROM (
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                  LEFT(data->>'ntlmHash', 32) AS label,
                  NULLIF(username, '') AS detail
           FROM protocol_hits
           WHERE protocol = 'smb'
             AND COALESCE(data->>'ntlmHash', '') <> ''
             AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
             AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         ) sub
         GROUP BY 1, 2, 3
       )
       SELECT sensor_id, label, detail, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<LabelRow>(
      `WITH ranked AS (
         SELECT sensor_id, label, COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY COUNT(*) DESC, label ASC) AS rn
         FROM (
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                  data->>'database' AS label
           FROM protocol_hits
           WHERE protocol IN ('mysql', 'mssql') AND COALESCE(data->>'database', '') <> ''
             AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
             AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         ) sub
         WHERE label IS NOT NULL
         GROUP BY 1, 2
       )
       SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<LabelRow>(
      `WITH ranked AS (
         SELECT sensor_id, label, COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY COUNT(*) DESC, label ASC) AS rn
         FROM (
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                  COALESCE(NULLIF(data->>'service', ''), NULLIF(data->>'protocolName', ''), 'unknown') AS label
           FROM protocol_hits
           WHERE protocol = 'port-scan'
             AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
             AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         ) sub
         GROUP BY 1, 2
       )
       SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 10`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<LabelRow>(
      `WITH ranked AS (
         SELECT sensor_id, label, COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY COUNT(*) DESC, label ASC) AS rn
         FROM (
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                  CONCAT(
                    (data->'raw'->>'dst_port')::text,
                    ' (',
                    COALESCE(NULLIF(data->'raw'->'connection'->>'protocol', ''), 'tcp'),
                    ')'
                  ) AS label
           FROM protocol_hits
           WHERE protocol = 'dionaea' AND event_type = 'connect'
             AND data->'raw'->>'dst_port' IS NOT NULL
             AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
             AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         ) sub
         GROUP BY 1, 2
       )
       SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 10`,
      [sensorIdSet, startDate, endDate],
    ),
    // Suricata IDS alerts per sensor
    db.query<{ sensor_id: string; signature: string; category: string; severity: string; count: string }>(
      `WITH ranked AS (
         SELECT sensor_id, signature, category, severity::int,
                COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY COUNT(*) DESC) AS rn
         FROM suricata_alerts
         WHERE sensor_id = ANY($1::text[])
           AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         GROUP BY sensor_id, signature, category, severity
       )
       SELECT sensor_id, signature, category, severity::text, count::text FROM ranked WHERE rn <= 5`,
      [sensorIdSet, startDate, endDate],
    ),
    // Top attacking IPs enriched with geo + abuse score
    db.query<{ sensor_id: string; src_ip: string; country: string; org: string; abuse_score: string; hits: string }>(
      `WITH hits AS (
         SELECT sensor_id, src_ip, COUNT(*)::bigint AS n
         FROM sessions
         WHERE sensor_id = ANY($1::text[])
           AND started_at >= $2::timestamptz AND started_at <= $3::timestamptz
         GROUP BY sensor_id, src_ip
         UNION ALL
         SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id, src_ip, COUNT(*)::bigint AS n
         FROM protocol_hits
         WHERE COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
           AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         GROUP BY 1, 2
       ),
       aggregated AS (
         SELECT sensor_id, src_ip, SUM(n)::bigint AS hits
         FROM hits GROUP BY sensor_id, src_ip
       ),
       ranked AS (
         SELECT
           a.sensor_id, a.src_ip,
           COALESCE(e.ipinfo_data->>'country', '?') AS country,
           LEFT(COALESCE(e.ipinfo_data->>'org', e.abuseipdb_data->>'isp', '?'), 22) AS org,
           COALESCE((e.abuseipdb_data->>'abuseConfidenceScore')::int, 0) AS abuse_score,
           a.hits,
           ROW_NUMBER() OVER (PARTITION BY a.sensor_id ORDER BY a.hits DESC) AS rn
         FROM aggregated a
         LEFT JOIN ip_enrichment_cache e ON e.ip = a.src_ip
       )
       SELECT sensor_id, src_ip, country, org, abuse_score::text, hits::text
       FROM ranked WHERE rn <= 6`,
      [sensorIdSet, startDate, endDate],
    ),
    // SSH client fingerprints
    db.query<{ sensor_id: string; client_version: string; sessions: string; successes: string }>(
      `WITH ranked AS (
         SELECT sensor_id, client_version,
                COUNT(*)::bigint AS sessions,
                SUM(CASE WHEN login_success THEN 1 ELSE 0 END)::bigint AS successes,
                ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY COUNT(*) DESC) AS rn
         FROM sessions
         WHERE sensor_id = ANY($1::text[])
           AND started_at >= $2::timestamptz AND started_at <= $3::timestamptz
           AND client_version IS NOT NULL
         GROUP BY sensor_id, client_version
       )
       SELECT sensor_id, client_version, sessions::text, successes::text FROM ranked WHERE rn <= 6`,
      [sensorIdSet, startDate, endDate],
    ),
    // Credential campaigns (global, not per-sensor — filtered to period)
    db.query<{ username: string; password: string; attempts: string; ips: string }>(
      `SELECT username, password,
              SUM(attempts)::bigint::text AS attempts,
              SUM(unique_ips)::bigint::text AS ips
       FROM daily_credential_stats
       WHERE day >= $1::date AND day <= $2::date
         AND username IS NOT NULL
       GROUP BY username, password
       ORDER BY SUM(attempts) DESC
       LIMIT 6`,
      [startDate, endDate],
    ),
    // Persistent attackers (global — most days active in period)
    db.query<{ src_ip: string; active_days: string; total_hits: string }>(
      `SELECT src_ip,
              COUNT(DISTINCT day)::text AS active_days,
              SUM(events)::bigint::text AS total_hits
       FROM daily_attacker_stats
       WHERE day >= $1::date AND day <= $2::date
       GROUP BY src_ip
       HAVING COUNT(DISTINCT day) >= 3
       ORDER BY COUNT(DISTINCT day) DESC, SUM(events) DESC
       LIMIT 6`,
      [startDate, endDate],
    ),
  ])

  const eventBreakdown = groupLabelCounts(eventBreakdownRows.rows)
  const sourcePorts = groupLabelCounts(sourcePortRows.rows)
  const sourceServices = groupLabelCounts(sourceServiceRows.rows)
  const fileTransfers = groupDetailCounts(fileTransferRows.rows)
  const ftpCommands = groupLabelCounts(ftpCommandRows.rows)
  const smbDomains = groupLabelCounts(smbDomainRows.rows)
  const smbShares = groupLabelCounts(smbShareRows.rows)
  const smbHosts = groupDetailCounts(smbHostRows.rows)
  const smbNtlmHashes = groupDetailCounts(smbHashRows.rows)
  const databases = groupLabelCounts(databaseRows.rows)
  const scannedPorts = groupLabelCounts([...portScanServiceRows.rows, ...dionaeaPortRows.rows])

  // Suricata: group by sensor_id
  const suricataMap = new Map<string, ReportSuricataAlert[]>()
  for (const row of suricataRows.rows) {
    const list = suricataMap.get(row.sensor_id) ?? []
    list.push({ signature: row.signature, category: row.category, severity: Number(row.severity), count: Number(row.count) })
    suricataMap.set(row.sensor_id, list)
  }

  // Enriched attackers: group by sensor_id
  const enrichedMap = new Map<string, ReportEnrichedAttacker[]>()
  for (const row of enrichedRows.rows) {
    const list = enrichedMap.get(row.sensor_id) ?? []
    list.push({ ip: row.src_ip, country: row.country, org: row.org, abuseScore: Number(row.abuse_score), hits: Number(row.hits) })
    enrichedMap.set(row.sensor_id, list)
  }

  // SSH fingerprints: group by sensor_id
  const fingerprintMap = new Map<string, ReportSshFingerprint[]>()
  for (const row of fingerprintRows.rows) {
    const list = fingerprintMap.get(row.sensor_id) ?? []
    list.push({ clientVersion: row.client_version, sessions: Number(row.sessions), successes: Number(row.successes) })
    fingerprintMap.set(row.sensor_id, list)
  }

  // Global: shared across all sensors in the report
  const credentialCampaigns: ReportCredentialCampaign[] = credentialRows.rows.map((r) => ({
    username: r.username,
    password: r.password,
    attempts: Number(r.attempts),
    ips: Number(r.ips),
  }))

  const persistentAttackers: ReportPersistentAttacker[] = persistentRows.rows.map((r) => ({
    ip: r.src_ip,
    activeDays: Number(r.active_days),
    totalHits: Number(r.total_hits),
  }))

  return {
    eventBreakdown,
    sourcePorts,
    sourceServices,
    fileTransfers,
    ftpCommands,
    smbDomains,
    smbShares,
    smbHosts,
    smbNtlmHashes,
    databases,
    scannedPorts,
    suricataMap,
    enrichedMap,
    fingerprintMap,
    credentialCampaigns,
    persistentAttackers,
  }
}
