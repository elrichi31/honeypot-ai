export type SshAggRow = {
  src_ip: string
  sessions: bigint
  auth_attempts: bigint
  had_success: boolean
  first_seen: Date | null
  last_seen: Date | null
}

export type WebAggRow = {
  src_ip: string
  total_hits: bigint
  attack_types: string[]
  first_seen: Date | null
  last_seen: Date | null
}

export type ProtocolAggRow = {
  src_ip: string
  protocol: string
  total_hits: bigint
  auth_attempts: bigint
  command_events: bigint
  connect_events: bigint
  dst_ports: number[] | null
  usernames: (string | null)[] | null
  passwords: (string | null)[] | null
  first_seen: Date | null
  last_seen: Date | null
}

export type ProtocolServiceSummary = {
  hits: number
  authAttempts: number
  commandEvents: number
  connectEvents: number
  ports: number[]
}

export type ProtocolSummary = {
  names: string[]
  totalHits: number
  authAttempts: number
  commandEvents: number
  connectEvents: number
  uniquePorts: number
  credentialReuse: boolean
  byService: Record<string, ProtocolServiceSummary>
  usernames: string[]
  passwords: string[]
}

export type ThreatAggregates = {
  ip: string
  ssh: SshAggRow | undefined
  web: WebAggRow | undefined
  cmds: string[]
  protocolRows: ProtocolAggRow[]
  protocolSummary: ProtocolSummary | null
  protocolsSeen: string[]
  crossProtocol: boolean
  timeWindowMinutes: number | null
}
