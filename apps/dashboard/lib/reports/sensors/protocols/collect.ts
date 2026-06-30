import { db } from "@/lib/db"
import type { ReportSensorProfile } from "../../types"
import { PORT_SERVICE, groupDetailCounts, groupLabelCounts } from "../shared"

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
    scannedPortRows,
  ] = await Promise.all([
    db.query<LabelRow>(
      `WITH ranked AS (
         SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                event_type AS label,
                COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (
                  PARTITION BY COALESCE(sensor_id, data->>'sensor')
                  ORDER BY COUNT(*) DESC, event_type ASC
                ) AS rn
         FROM protocol_hits
         WHERE COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
           AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         GROUP BY 1, 2
       )
       SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<LabelRow>(
      `WITH ranked AS (
         SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                src_port::text AS label,
                COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (
                  PARTITION BY COALESCE(sensor_id, data->>'sensor')
                  ORDER BY COUNT(*) DESC, src_port ASC
                ) AS rn
         FROM protocol_hits
         WHERE src_port IS NOT NULL
           AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
           AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         GROUP BY 1, 2
       )
       SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<LabelRow>(
      `WITH ranked AS (
         SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                data->>'service' AS label,
                COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (
                  PARTITION BY COALESCE(sensor_id, data->>'sensor')
                  ORDER BY COUNT(*) DESC, data->>'service' ASC
                ) AS rn
         FROM protocol_hits
         WHERE COALESCE(data->>'service', '') <> ''
           AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
           AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         GROUP BY 1, 2
       )
       SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<DetailRow>(
      `WITH ranked AS (
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
                ) AS detail,
                COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (
                  PARTITION BY COALESCE(sensor_id, data->>'sensor')
                  ORDER BY COUNT(*) DESC, COALESCE(
                    NULLIF(data->>'requestedPath', ''),
                    NULLIF(data->>'fileName', ''),
                    NULLIF(data->>'command', ''),
                    NULLIF(data->>'url', ''),
                    NULLIF(data->>'outfile', ''),
                    NULLIF(data->>'destfile', ''),
                    event_type
                  ) ASC
                ) AS rn
         FROM protocol_hits
         WHERE protocol IN ('ftp', 'smb')
           AND event_type IN ('file.upload', 'file.download')
           AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
           AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
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
         SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                data->>'domain' AS label,
                COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (
                  PARTITION BY COALESCE(sensor_id, data->>'sensor')
                  ORDER BY COUNT(*) DESC, data->>'domain' ASC
                ) AS rn
         FROM protocol_hits
         WHERE protocol = 'smb' AND COALESCE(data->>'domain', '') <> ''
           AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
           AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         GROUP BY 1, 2
       )
       SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<LabelRow>(
      `WITH ranked AS (
         SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                COALESCE(data->>'shareName', data->>'share') AS label,
                COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (
                  PARTITION BY COALESCE(sensor_id, data->>'sensor')
                  ORDER BY COUNT(*) DESC, COALESCE(data->>'shareName', data->>'share') ASC
                ) AS rn
         FROM protocol_hits
         WHERE protocol = 'smb' AND COALESCE(data->>'shareName', data->>'share', '') <> ''
           AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
           AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         GROUP BY 1, 2
       )
       SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<DetailRow>(
      `WITH ranked AS (
         SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                COALESCE(data->>'hostName', data->>'nativeOS') AS label,
                NULLIF(data->>'domain', '') AS detail,
                COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (
                  PARTITION BY COALESCE(sensor_id, data->>'sensor')
                  ORDER BY COUNT(*) DESC, COALESCE(data->>'hostName', data->>'nativeOS') ASC
                ) AS rn
         FROM protocol_hits
         WHERE protocol = 'smb'
           AND COALESCE(data->>'hostName', data->>'nativeOS', '') <> ''
           AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
           AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         GROUP BY 1, 2, 3
       )
       SELECT sensor_id, label, detail, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<DetailRow>(
      `WITH ranked AS (
         SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                LEFT(data->>'ntlmHash', 32) AS label,
                NULLIF(username, '') AS detail,
                COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (
                  PARTITION BY COALESCE(sensor_id, data->>'sensor')
                  ORDER BY COUNT(*) DESC, LEFT(data->>'ntlmHash', 32) ASC
                ) AS rn
         FROM protocol_hits
         WHERE protocol = 'smb'
           AND COALESCE(data->>'ntlmHash', '') <> ''
           AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
           AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         GROUP BY 1, 2, 3
       )
       SELECT sensor_id, label, detail, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<LabelRow>(
      `WITH ranked AS (
         SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                data->>'database' AS label,
                COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (
                  PARTITION BY COALESCE(sensor_id, data->>'sensor')
                  ORDER BY COUNT(*) DESC, data->>'database' ASC
                ) AS rn
         FROM protocol_hits
         WHERE protocol IN ('mysql', 'mssql') AND COALESCE(data->>'database', '') <> ''
           AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
           AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         GROUP BY 1, 2
       )
       SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
    ),
    db.query<{ sensor_id: string; dst_port: number; count: string }>(
      `WITH ranked AS (
         SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                dst_port,
                COUNT(*)::bigint AS count,
                ROW_NUMBER() OVER (
                  PARTITION BY COALESCE(sensor_id, data->>'sensor')
                  ORDER BY COUNT(*) DESC, dst_port ASC
                ) AS rn
         FROM protocol_hits
         WHERE protocol = 'port-scan'
           AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
           AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         GROUP BY 1, 2
       )
       SELECT sensor_id, dst_port, count::text FROM ranked WHERE rn <= 8`,
      [sensorIdSet, startDate, endDate],
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

  const scannedPorts = new Map<string, ReportSensorProfile["scannedPorts"]>()
  for (const row of scannedPortRows.rows) {
    const list = scannedPorts.get(row.sensor_id) ?? []
    const service = PORT_SERVICE[row.dst_port]
    list.push({ label: service ? `${row.dst_port} (${service})` : `${row.dst_port}`, count: Number(row.count) })
    scannedPorts.set(row.sensor_id, list)
  }

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
  }
}
