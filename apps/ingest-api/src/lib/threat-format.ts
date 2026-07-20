import type { RiskResult } from './risk-score.js'
import type {
  SshAggRow, WebAggRow, ProtocolAggRow,
  ProtocolServiceSummary, ProtocolSummary, ThreatAggregates,
} from './threat-types.js'

export type { SshAggRow, WebAggRow, ProtocolAggRow, ProtocolSummary, ThreatAggregates }
export type ThreatItem = ReturnType<typeof formatThreatResponse>

function uniqStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v && v.trim())))]
}

function protocolDateRange(rows: ProtocolAggRow[]): { firstSeen: Date | null; lastSeen: Date | null } | null {
  if (rows.length === 0) return null
  let firstSeen: Date | null = null
  let lastSeen: Date | null = null
  for (const row of rows) {
    if (row.first_seen && (!firstSeen || row.first_seen < firstSeen)) firstSeen = row.first_seen
    if (row.last_seen && (!lastSeen || row.last_seen > lastSeen)) lastSeen = row.last_seen
  }
  return { firstSeen, lastSeen }
}

export function mergeTimeWindowMinutes(
  ...ranges: Array<{ firstSeen: Date | null; lastSeen: Date | null } | null>
): number | null {
  let firstSeen: Date | null = null
  let lastSeen: Date | null = null
  for (const range of ranges) {
    if (!range) continue
    if (range.firstSeen && (!firstSeen || range.firstSeen < firstSeen)) firstSeen = range.firstSeen
    if (range.lastSeen && (!lastSeen || range.lastSeen > lastSeen)) lastSeen = range.lastSeen
  }
  if (!firstSeen || !lastSeen) return null
  return Math.max(0, Math.round((lastSeen.getTime() - firstSeen.getTime()) / 60000))
}

function trackCredentials(map: Map<string, Set<string>>, values: string[], protocol: string) {
  for (const val of values) {
    if (!map.has(val)) map.set(val, new Set())
    map.get(val)!.add(protocol)
  }
}

type CredentialMaps = { usernameProtos: Map<string, Set<string>>; passwordProtos: Map<string, Set<string>> }
function reduceProtocolRow(
  row: ProtocolAggRow, byService: Record<string, ProtocolServiceSummary>,
  portSet: Set<number>, creds: CredentialMaps, allUsernames: string[], allPasswords: string[],
) {
  const ports = [...new Set((row.dst_ports ?? []).filter((p): p is number => typeof p === 'number'))]
  for (const port of ports) portSet.add(port)
  const rowUsernames = uniqStrings(row.usernames ?? [])
  const rowPasswords = uniqStrings(row.passwords ?? [])
  allUsernames.push(...rowUsernames)
  allPasswords.push(...rowPasswords)
  trackCredentials(creds.usernameProtos, rowUsernames, row.protocol)
  trackCredentials(creds.passwordProtos, rowPasswords, row.protocol)
  byService[row.protocol] = {
    hits: Number(row.total_hits), authAttempts: Number(row.auth_attempts),
    commandEvents: Number(row.command_events), connectEvents: Number(row.connect_events), ports,
  }
}

export function buildProtocolSummary(rows: ProtocolAggRow[]): ProtocolSummary | null {
  if (rows.length === 0) return null
  const byService: Record<string, ProtocolServiceSummary> = {}
  const portSet = new Set<number>()
  const creds: CredentialMaps = { usernameProtos: new Map(), passwordProtos: new Map() }
  const allUsernames: string[] = []
  const allPasswords: string[] = []
  let totalHits = 0, authAttempts = 0, commandEvents = 0, connectEvents = 0
  for (const row of rows) {
    reduceProtocolRow(row, byService, portSet, creds, allUsernames, allPasswords)
    totalHits += Number(row.total_hits); authAttempts += Number(row.auth_attempts)
    commandEvents += Number(row.command_events); connectEvents += Number(row.connect_events)
  }
  const credentialReuse = [...creds.usernameProtos.values(), ...creds.passwordProtos.values()].some((s) => s.size > 1)
  return {
    names: Object.keys(byService), totalHits, authAttempts, commandEvents, connectEvents,
    uniquePorts: portSet.size, credentialReuse, byService,
    usernames: uniqStrings(allUsernames), passwords: uniqStrings(allPasswords),
  }
}

export function buildThreatAggregates(
  ip: string, ssh: SshAggRow | undefined, web: WebAggRow | undefined,
  cmds: string[], protocolRows: ProtocolAggRow[],
): ThreatAggregates {
  const protocolSummary = buildProtocolSummary(protocolRows)
  const protocolsSeen = [
    ...(ssh && Number(ssh.sessions) > 0 ? ['ssh'] : []),
    ...(web && Number(web.total_hits) > 0 ? ['http'] : []),
    ...(protocolSummary?.names ?? []),
  ]
  const timeWindowMinutes = mergeTimeWindowMinutes(
    ssh ? { firstSeen: ssh.first_seen, lastSeen: ssh.last_seen } : null,
    web ? { firstSeen: web.first_seen, lastSeen: web.last_seen } : null,
    protocolDateRange(protocolRows),
  )
  return {
    ip, ssh, web, cmds, protocolRows, protocolSummary,
    protocolsSeen, crossProtocol: protocolsSeen.length > 1, timeWindowMinutes,
  }
}

export function formatThreatResponse(agg: ThreatAggregates, risk: RiskResult) {
  const { ip, ssh, web, cmds, protocolSummary, protocolsSeen, crossProtocol } = agg
  return {
    ip, protocolsSeen, crossProtocol,
    ssh: ssh ? {
      sessions: Number(ssh.sessions), authAttempts: Number(ssh.auth_attempts),
      loginSuccess: ssh.had_success, commandCount: cmds.length,
    } : null,
    web: web ? {
      hits: Number(web.total_hits), attackTypes: web.attack_types,
      topPaths: web.top_paths ?? [], userAgents: web.user_agents ?? [], canaryHits: web.canary_hits ?? 0,
    } : null,
    protocols: protocolSummary,
    score: risk.score, level: risk.level, breakdown: risk.breakdown,
    commandCategories: Object.fromEntries(
      Object.entries(risk.commandCategories).map(([k, v]) => [k, v.length]),
    ),
    topFactors: risk.topFactors,
  }
}
