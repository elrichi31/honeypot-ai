import type { PrismaClient } from '@prisma/client'
import { sendDiscordAlert } from './discord.js'
import { getAlertConfig, getTimezone } from './runtime-config.js'
import { formatTimeInTimezone } from './date-utils.js'

interface WeeklyStats {
  sshSessions: number
  successfulLogins: number
  uniqueSshIps: number
  webHits: number
  uniqueWebIps: number
  protocolHits: number
  uniqueProtocolIps: number
  topProtocols: Array<{ protocol: string; count: number }>
  topSshIps: Array<{ ip: string; count: number }>
  topCommands: Array<{ cmd: string; count: number }>
  topPaths: Array<{ path: string; count: number }>
  topAttackTypes: Array<{ type: string; count: number }>
  highRiskSessions: number
}

async function collectStats(prisma: PrismaClient, since: Date): Promise<WeeklyStats> {
  const [
    sshRows,
    loginRows,
    uniqueSshIpRows,
    webHitRows,
    uniqueWebIpRows,
    protocolHitRows,
    uniqueProtocolIpRows,
    topProtocolRows,
    topSshIpRows,
    topCommandRows,
    topPathRows,
    topAttackTypeRows,
    highRiskRows,
  ] = await Promise.all([
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) FROM sessions WHERE started_at >= ${since}`,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) FROM sessions WHERE login_success = true AND started_at >= ${since}`,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT src_ip) FROM sessions WHERE started_at >= ${since}`,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) FROM web_hits WHERE timestamp >= ${since}`,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT src_ip) FROM web_hits WHERE timestamp >= ${since}`,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) FROM protocol_hits WHERE timestamp >= ${since}`,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT src_ip) FROM protocol_hits WHERE timestamp >= ${since}`,
    prisma.$queryRaw<Array<{ protocol: string; cnt: bigint }>>`
      SELECT protocol, COUNT(*) AS cnt FROM protocol_hits
      WHERE timestamp >= ${since}
      GROUP BY protocol ORDER BY cnt DESC LIMIT 5`,
    prisma.$queryRaw<Array<{ src_ip: string; cnt: bigint }>>`
      SELECT src_ip, COUNT(*) AS cnt FROM sessions
      WHERE started_at >= ${since}
      GROUP BY src_ip ORDER BY cnt DESC LIMIT 5`,
    prisma.$queryRaw<Array<{ command: string; cnt: bigint }>>`
      SELECT command, COUNT(*) AS cnt FROM events
      WHERE event_type = 'cowrie.command.input'
        AND command IS NOT NULL
        AND event_ts >= ${since}
      GROUP BY command ORDER BY cnt DESC LIMIT 5`,
    prisma.$queryRaw<Array<{ path: string; cnt: bigint }>>`
      SELECT path, COUNT(*) AS cnt FROM web_hits
      WHERE timestamp >= ${since}
      GROUP BY path ORDER BY cnt DESC LIMIT 5`,
    prisma.$queryRaw<Array<{ attack_type: string; cnt: bigint }>>`
      SELECT attack_type, COUNT(*) AS cnt FROM web_hits
      WHERE timestamp >= ${since}
      GROUP BY attack_type ORDER BY cnt DESC LIMIT 5`,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT src_ip) FROM sessions
      WHERE login_success = true AND started_at >= ${since}
        AND src_ip IN (
          SELECT src_ip FROM events
          WHERE event_ts >= ${since}
            AND event_type = 'cowrie.command.input'
          GROUP BY src_ip HAVING COUNT(*) > 5
        )`,
  ])

  return {
    sshSessions: Number(sshRows[0]?.count ?? 0),
    successfulLogins: Number(loginRows[0]?.count ?? 0),
    uniqueSshIps: Number(uniqueSshIpRows[0]?.count ?? 0),
    webHits: Number(webHitRows[0]?.count ?? 0),
    uniqueWebIps: Number(uniqueWebIpRows[0]?.count ?? 0),
    protocolHits: Number(protocolHitRows[0]?.count ?? 0),
    uniqueProtocolIps: Number(uniqueProtocolIpRows[0]?.count ?? 0),
    topProtocols: topProtocolRows.map(r => ({ protocol: r.protocol, count: Number(r.cnt) })),
    topSshIps: topSshIpRows.map(r => ({ ip: r.src_ip, count: Number(r.cnt) })),
    topCommands: topCommandRows.map(r => ({ cmd: r.command, count: Number(r.cnt) })),
    topPaths: topPathRows.map(r => ({ path: r.path, count: Number(r.cnt) })),
    topAttackTypes: topAttackTypeRows.map(r => ({ type: r.attack_type, count: Number(r.cnt) })),
    highRiskSessions: Number(highRiskRows[0]?.count ?? 0),
  }
}

function fmt(n: number) {
  return n.toLocaleString('en-US')
}

function shortDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export async function sendPeriodicReport(prisma: PrismaClient): Promise<void> {
  const { reportIntervalHours } = getAlertConfig()
  const timezone = getTimezone()
  const now = new Date()
  const since = new Date(now.getTime() - reportIntervalHours * 60 * 60 * 1000)

  let stats: WeeklyStats
  try {
    stats = await collectStats(prisma, since)
  } catch (err) {
    console.error('[periodic-report] Failed to collect stats:', err)
    return
  }

  const total = stats.sshSessions + stats.webHits + stats.protocolHits
  if (total === 0) return

  const sshLines = [
    `🔗 **${fmt(stats.sshSessions)}** sessions  |  ✅ **${fmt(stats.successfulLogins)}** logins  |  🌐 **${fmt(stats.uniqueSshIps)}** unique IPs`,
    stats.topSshIps.length > 0
      ? `Top IPs: ${stats.topSshIps.map(r => `\`${r.ip}\` (${r.count})`).join(' · ')}`
      : '',
  ].filter(Boolean).join('\n')

  const commandLines = stats.topCommands.length > 0
    ? stats.topCommands.map(r => `\`${r.cmd}\` — ${r.count}×`).join('\n')
    : 'No commands recorded'

  const webLines = [
    `💥 **${fmt(stats.webHits)}** hits  |  🌐 **${fmt(stats.uniqueWebIps)}** unique IPs`,
    stats.topAttackTypes.length > 0
      ? `Types: ${stats.topAttackTypes.map(r => `${r.type} (${r.count})`).join(' · ')}`
      : '',
    stats.topPaths.length > 0
      ? `Top paths: ${stats.topPaths.map(r => `\`${r.path}\``).join(' · ')}`
      : '',
  ].filter(Boolean).join('\n')

  const protocolLines = stats.protocolHits > 0
    ? [
        `📡 **${fmt(stats.protocolHits)}** hits  |  🌐 **${fmt(stats.uniqueProtocolIps)}** unique IPs`,
        stats.topProtocols.length > 0
          ? `Protocols: ${stats.topProtocols.map(r => `${r.protocol.toUpperCase()} (${r.count})`).join(' · ')}`
          : '',
      ].filter(Boolean).join('\n')
    : null

  const level = total > 5000 ? 'critical' : total > 1000 ? 'high' : 'info'
  const timeLabel = formatTimeInTimezone(now, timezone)
  const intervalLabel = reportIntervalHours === 1 ? '1 hora' : `${reportIntervalHours} horas`

  await sendDiscordAlert({
    level,
    title: `📊 Reporte cada ${intervalLabel} — (as of ${timeLabel})`,
    description: `**${fmt(total)}** eventos capturados en las últimas ${intervalLabel}.`,
    fields: [
      { name: '🔐 SSH Honeypot', value: sshLines || 'Sin actividad', inline: false },
      { name: '💻 Top Commands', value: commandLines, inline: true },
      { name: '🕸️ Web Honeypot', value: webLines || 'Sin actividad', inline: false },
      ...(protocolLines ? [{ name: '📡 Otros Protocolos', value: protocolLines, inline: false }] : []),
      ...(stats.highRiskSessions > 0
        ? [{ name: '⚠️ High-Risk IPs', value: `${stats.highRiskSessions} IPs with successful login + active commands`, inline: false }]
        : []),
    ],
  })
}
