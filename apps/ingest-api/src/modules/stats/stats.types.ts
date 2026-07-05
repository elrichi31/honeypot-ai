export type TimelineBucket = 'hour' | 'day'
export type CredentialsMainTab = 'rankings' | 'patterns' | 'recent'
export type CredentialsRankingType = 'pairs' | 'passwords' | 'usernames'
export type CredentialsOutcomeFilter = 'all' | 'success' | 'failed'
export type CredentialsFrequencyFilter = 'all' | 'reused' | 'single'
export type CredentialsSortDirection = 'asc' | 'desc'

export interface TimelineRow { bucketStart: string; label: string; count: number }
export interface SessionTimelineRow { bucketStart: string; label: string; sessions: number; successfulLogins: number }
export interface CountRow { count: number | bigint }
export interface CountOnlyRow { count: number | bigint }
export interface CommandRow { command: string; count: number | bigint }
export interface GroupedUsernameRow { username: string | null; _count: { username: number | bigint } }
export interface GroupedPasswordRow { password: string | null; _count: { password: number | bigint } }

export interface CredentialPairRow {
  username: string | null; password: string | null
  attempts: number | bigint; successCount: number | bigint; failedCount: number | bigint
  uniqueIps: number | bigint; firstSeen: Date; lastSeen: Date
}

export interface UsernameAggregateRow {
  username: string | null
  attempts: number | bigint; successCount: number | bigint; failedCount: number | bigint
  uniqueIps: number | bigint; passwordCount: number | bigint
}

export interface PasswordAggregateRow {
  password: string | null
  attempts: number | bigint; successCount: number | bigint; failedCount: number | bigint
  uniqueIps: number | bigint; usernameCount: number | bigint
}

export interface SprayPasswordRow {
  password: string | null
  attempts: number | bigint; successCount: number | bigint
  usernameCount: number | bigint; ipCount: number | bigint
}

export interface TargetedUsernameRow {
  username: string | null
  attempts: number | bigint; successCount: number | bigint
  passwordCount: number | bigint; ipCount: number | bigint
}

export interface DiversifiedAttackerRow {
  srcIp: string
  attempts: number | bigint; successCount: number | bigint
  credentialCount: number | bigint; usernameCount: number | bigint
  passwordCount: number | bigint; lastSeen: Date
}

export interface InsightWindowRow {
  firstSeen: Date | null; lastSeen: Date | null
  totalSessions: number | bigint; uniqueIps: number | bigint
}

export interface FunnelRow {
  connections: number | bigint; authAttempts: number | bigint
  loginSuccess: number | bigint; commands: number | bigint
  highSignalCompromise: number | bigint
}

export interface CountrySuccessCandidateRow { srcIp: string; sessions: number | bigint; successes: number | bigint }

export interface CredentialCampaignRow {
  bucketStart: Date; username: string | null; password: string | null
  attempts: number | bigint; successCount: number | bigint
  uniqueIps: number | bigint; ips: string[]
}

export interface RecurringIpRow {
  srcIp: string
  totalSessions: number | bigint; failedSessions: number | bigint
  successfulSessions: number | bigint; credentialCount: number | bigint
  firstSeen: Date; lastSeen: Date
  returnAfterMinutes: number | bigint | null; clientVersion: string | null
}

export interface CommandPatternRow { sequence: string; sessions: number | bigint; uniqueIps: number | bigint }
export interface DepthBucketRow { bucket: string; sessions: number | bigint }
export interface DepthStatsRow { averageCommands: number | null; maxCommands: number | null; interactiveSessions: number | bigint }
