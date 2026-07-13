import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { ThreatRepository, THREATS_WINDOW_DAYS, type ThreatSummaryRow, type ThreatScope } from './threats.repository.js'
import {
  buildThreatAggregates,
  formatThreatResponse,
  type ProtocolAggRow,
  type SshAggRow,
  type WebAggRow,
  type ThreatItem,
} from '../../lib/threat-format.js'
import { computeRiskScore, classifyCommands } from '../../lib/risk-score.js'
import { resolveClientSensors } from '../../lib/client-helpers.js'
import { withCache } from '../../lib/cache-helper.js'
import { isInternalIp } from '../../lib/internal-ip.js'

export type { ThreatScope, ThreatItem }

export const RISK_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const
export const COMMAND_CATEGORIES = [
  'malware_drop', 'persistence', 'lateral_movement', 'crypto_mining', 'data_exfil', 'recon', 'other',
] as const

export type RiskLevel = (typeof RISK_LEVELS)[number]

export type ThreatListFilters = {
  q?: string
  levels?: RiskLevel[]
  commands?: string[]
  crossProtocol?: boolean
  sortBy: 'score' | 'sessions' | 'webHits' | 'protocols'
  sortDir: 'asc' | 'desc'
}

export class ThreatService {
  private repo: ThreatRepository

  constructor(prismaRead: PrismaClient) {
    this.repo = new ThreatRepository(prismaRead)
  }

  async resolveScope(
    clientSlug: string | undefined,
    sensorId: string | undefined,
    prismaRead: PrismaClient,
  ): Promise<{ scope: ThreatScope; scopeKey: string }> {
    if (sensorId) return { scope: { sensorIds: [sensorId] }, scopeKey: `:s=${sensorId}` }
    if (clientSlug) {
      const cs = await resolveClientSensors(prismaRead, clientSlug)
      const sensorIds = cs?.sensorIds ?? []
      return { scope: { sensorIds }, scopeKey: `:c=${clientSlug}` }
    }
    return { scope: undefined, scopeKey: '' }
  }

  async listThreats(
    cache: FastifyInstance['cache'],
    filters: ThreatListFilters,
    scopeKey: string,
    scope: ThreatScope,
    windowDays: number,
  ): Promise<ThreatItem[]> {
    const hasFilters = Boolean(filters.q) || (filters.levels?.length ?? 0) > 0 || (filters.commands?.length ?? 0) > 0 || filters.crossProtocol !== undefined
    const periodKey = `:w=${windowDays}`

    if (!hasFilters) {
      return withCache(cache, `threats:list${scopeKey}${periodKey}`, 180, () => this.fetchThreats(undefined, scope, windowDays))
    }
    const filteredKey = `threats:filtered${scopeKey}${periodKey}:${filters.q ?? ''}:${[...(filters.levels ?? [])].sort().join('+')}:${[...(filters.commands ?? [])].sort().join('+')}:${filters.crossProtocol ?? ''}`
    return withCache(cache, filteredKey, 300, async () =>
      this.filterThreats(await this.fetchThreats(filters.q, scope, windowDays), filters)
    )
  }

  async getThreatByIp(ip: string) {
    const [sshRows, cmdRows, webRows, protocolRows, portscanRows] = await Promise.all([
      this.repo.querySshRow(ip),
      this.repo.queryCommandsByIp(ip),
      this.repo.queryWebRow(ip),
      this.repo.queryProtocolRowsByIp(ip),
      this.repo.queryPortscanByIp(ip),
    ])
    const cmds = cmdRows.flatMap((row) => row.command ? [row.command] : [])
    const ps = portscanRows[0]
    const portScanEvents = Number(ps?.scan_events ?? 0)
    const portScanUniquePorts = (ps?.scanned_ports ?? []).length
    return {
      threat: buildThreat(ip, sshRows[0], webRows[0], cmds, protocolRows, portScanEvents, portScanUniquePorts),
      cmdRows,
      cmds,
      portScanEvents,
      portScanUniquePorts,
      scannedPorts: ps?.scanned_ports ?? [],
    }
  }

  private async fetchThreats(ipFilter?: string, scope?: ThreatScope, windowDays = THREATS_WINDOW_DAYS): Promise<ThreatItem[]> {
    const [summaryRows, cmdRows] = await Promise.all([
      this.repo.querySummaryRows(ipFilter, scope, windowDays),
      this.repo.queryCommandRows(ipFilter, scope, windowDays),
    ])
    const cmdsByIp = groupCommands(cmdRows)
    return summaryRows.filter((row) => !isInternalIp(row.src_ip)).map((row) =>
      buildThreat(
        row.src_ip,
        summaryRowToSshRow(row),
        summaryRowToWebRow(row),
        cmdsByIp.get(row.src_ip) ?? [],
        summaryRowToProtocolRows(row),
        Number(row.scan_events ?? 0),
        (row.scanned_ports ?? []).length,
      )
    )
  }

  private filterThreats(threats: ThreatItem[], filters: ThreatListFilters): ThreatItem[] {
    const search = filters.q?.toLowerCase()
    const levelSet = (filters.levels?.length ?? 0) > 0 ? new Set(filters.levels) : null
    const commands = filters.commands ?? []
    return threats.filter((threat) => {
      if (search && !threat.ip.toLowerCase().includes(search)) return false
      if (levelSet && !levelSet.has(threat.level)) return false
      if (commands.length && !commands.some((category) => (threat.commandCategories[category] ?? 0) > 0)) return false
      return filters.crossProtocol === undefined || threat.crossProtocol === filters.crossProtocol
    })
  }
}

export { classifyCommands }

// ---------------------------------------------------------------------------
// Pure helpers (no DB)
// ---------------------------------------------------------------------------

function groupCommands(rows: Array<{ src_ip: string; command: string }>) {
  const groups = new Map<string, string[]>()
  for (const row of rows) {
    groups.set(row.src_ip, [...(groups.get(row.src_ip) ?? []), row.command])
  }
  return groups
}

export function buildThreat(
  ip: string,
  ssh: SshAggRow | undefined,
  web: WebAggRow | undefined,
  cmds: string[],
  protocols: ProtocolAggRow[],
  portScanEvents = 0,
  portScanUniquePorts = 0,
): ThreatItem {
  const agg = buildThreatAggregates(ip, ssh, web, cmds, protocols)
  const risk = computeRiskScore({
    sshSessions: Number(ssh?.sessions ?? 0),
    sshAuthAttempts: Number(ssh?.auth_attempts ?? 0),
    sshLoginSuccess: ssh?.had_success ?? false,
    commands: cmds,
    webHits: Number(web?.total_hits ?? 0),
    webAttackTypes: web?.attack_types ?? [],
    protocolsSeen: agg.protocolsSeen,
    protocolAuthAttempts: agg.protocolSummary?.authAttempts ?? 0,
    protocolCommandCount: agg.protocolSummary?.commandEvents ?? 0,
    protocolConnectCount: agg.protocolSummary?.connectEvents ?? 0,
    protocolUniquePorts: agg.protocolSummary?.uniquePorts ?? 0,
    credentialReuse: agg.protocolSummary?.credentialReuse ?? false,
    timeWindowMinutes: agg.timeWindowMinutes,
    portScanEvents,
    portScanUniquePorts,
  })
  return formatThreatResponse(agg, risk)
}

export function sortThreats(threats: ThreatItem[], sortBy: ThreatListFilters['sortBy'], sortDir: ThreatListFilters['sortDir']): void {
  threats.sort((a, b) => {
    let cmp: number
    if (sortBy === 'sessions') cmp = (a.ssh?.sessions ?? 0) - (b.ssh?.sessions ?? 0)
    else if (sortBy === 'webHits') cmp = (a.web?.hits ?? 0) - (b.web?.hits ?? 0)
    else if (sortBy === 'protocols') cmp = a.protocolsSeen.length - b.protocolsSeen.length
    else cmp = a.score - b.score
    return sortDir === 'asc' ? cmp : -cmp
  })
}

export function buildSummary(threats: ThreatItem[]) {
  return {
    total: threats.length,
    critical: threats.filter((t) => t.level === 'CRITICAL').length,
    high: threats.filter((t) => t.level === 'HIGH').length,
    crossProtocol: threats.filter((t) => t.crossProtocol).length,
  }
}

function summaryRowToSshRow(row: ThreatSummaryRow): SshAggRow | undefined {
  if (!row.ssh_sessions) return undefined
  return {
    src_ip: row.src_ip, sessions: row.ssh_sessions, auth_attempts: row.ssh_auth_attempts,
    had_success: row.ssh_had_success, first_seen: row.ssh_first_seen, last_seen: row.ssh_last_seen,
  }
}

function summaryRowToWebRow(row: ThreatSummaryRow): WebAggRow | undefined {
  if (!row.web_total_hits) return undefined
  return {
    src_ip: row.src_ip, total_hits: row.web_total_hits,
    attack_types: row.web_attack_types ?? [], first_seen: row.web_first_seen, last_seen: row.web_last_seen,
  }
}

function summaryRowToProtocolRows(row: ThreatSummaryRow): ProtocolAggRow[] {
  if (!row.proto_total_hits) return []
  return (row.protocols_seen ?? []).map((protocol) => ({
    src_ip: row.src_ip, protocol, total_hits: row.proto_total_hits,
    auth_attempts: row.proto_auth_attempts, command_events: row.proto_command_events,
    connect_events: row.proto_connect_events, dst_ports: null, usernames: null, passwords: null,
    first_seen: row.proto_first_seen, last_seen: row.proto_last_seen,
  }))
}
