import type { PrismaClient } from '@prisma/client'
import { sendDiscordAlert } from './discord.js'

interface WeeklyStats {
  sshSessions: number
  successfulLogins: number
  uniqueSshIps: number
  webHits: number
  uniqueWebIps: number
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

export async function sendWeeklyReport(prisma: PrismaClient): Promise<void> {
  const now = new Date()
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  let stats: WeeklyStats
  try {
    stats = await collectStats(prisma, since)
  } catch (err) {
    console.error('[weekly-report] Failed to collect stats:', err)
    return
  }

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

  const total = stats.sshSessions + stats.webHits
  const level = total > 5000 ? 'critical' : total > 1000 ? 'high' : 'info'

  await sendDiscordAlert({
    level,
    title: `📊 Weekly Report — ${shortDate(since)} → ${shortDate(now)}`,
    description: `Total activity: **${fmt(total)}** events across SSH and HTTP.`,
    fields: [
      { name: '🔐 SSH Honeypot', value: sshLines, inline: false },
      { name: '💻 Top Commands', value: commandLines, inline: true },
      { name: '🕸️ Web Honeypot', value: webLines, inline: false },
      ...(stats.highRiskSessions > 0
        ? [{ name: '⚠️ High-Risk IPs', value: `${stats.highRiskSessions} IPs with successful login + active commands`, inline: false }]
        : []),
    ],
  })
}
