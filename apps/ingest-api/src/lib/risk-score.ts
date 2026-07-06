import { CMD_PATTERNS, SCORE_MAX, TOP_FACTORS_LIMIT } from './risk-constants.js'
import { scoreSshFactor, scoreCommandsFactor, scoreWebFactor, scoreProtocolsFactor, scoreCrossProtocolFactor } from './risk-factors.js'

export type { CommandCategory, RiskInput } from './risk-constants.js'
import type { CommandCategory, RiskInput } from './risk-constants.js'

export function classifyCommands(commands: string[]): Record<CommandCategory, string[]> {
  const result: Record<CommandCategory, string[]> = {
    ssh_backdoor: [],
    honeypot_evasion: [],
    container_escape: [],
    malware_drop: [],
    persistence: [],
    lateral_movement: [],
    crypto_mining: [],
    data_exfil: [],
    solana_targeting: [],
    recon: [],
  }

  for (const cmd of commands) {
    for (const [category, patterns] of Object.entries(CMD_PATTERNS)) {
      if (patterns.some((pattern) => pattern.test(cmd))) {
        result[category as CommandCategory].push(cmd)
        break
      }
    }
  }

  return result
}

export interface RiskResult {
  score: number
  level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"
  breakdown: {
    ssh: number
    web: number
    protocols: number
    commands: number
    crossProto: number
  }
  commandCategories: Record<CommandCategory, string[]>
  topFactors: string[]
}

/**
 * Threat tags for the session-list `threatTags` column, derived from the same
 * `classifyCommands()`/`CMD_PATTERNS` engine that drives the risk score — the
 * single source of truth for command-pattern matching (see SSH_CLASSIFICATION_ENGINE.md
 * Task 1). Previously this used a separate, weaker SQL `ILIKE` engine that
 * disagreed with the regex engine here.
 */
export function deriveThreatTags(commands: string[]): string[] {
  const cats = classifyCommands(commands)
  const tags: CommandCategory[] = [
    'ssh_backdoor',
    'honeypot_evasion',
    'container_escape',
    'crypto_mining',
    'malware_drop',
    'persistence',
    'data_exfil',
    'solana_targeting',
  ]
  return tags.filter((tag) => cats[tag].length > 0)
}

export function computeRiskScore(input: RiskInput): RiskResult {
  const cats = classifyCommands(input.commands)
  const uniqueProtocols = [...new Set(input.protocolsSeen)]
  const hasPortScan = uniqueProtocols.includes("port-scan")

  const sshResult = scoreSshFactor(input)
  const cmdResult = scoreCommandsFactor(cats)
  const webResult = scoreWebFactor(input)
  const protoResult = scoreProtocolsFactor(input, hasPortScan)
  const crossResult = scoreCrossProtocolFactor(uniqueProtocols.length)

  const allFactors = [...sshResult.factors, ...cmdResult.factors, ...webResult.factors, ...protoResult.factors, ...crossResult.factors]
  const raw = sshResult.points + cmdResult.points + webResult.points + protoResult.points + crossResult.points
  const score = Math.min(SCORE_MAX, raw)

  const level =
    score >= 80 ? "CRITICAL" :
    score >= 60 ? "HIGH" :
    score >= 40 ? "MEDIUM" :
    score >= 20 ? "LOW" :
    "INFO"

  return {
    score,
    level,
    breakdown: {
      ssh: sshResult.points,
      web: webResult.points,
      protocols: protoResult.points,
      commands: cmdResult.points,
      crossProto: crossResult.points,
    },
    commandCategories: cats,
    topFactors: allFactors.slice(0, TOP_FACTORS_LIMIT),
  }
}

export const RISK_COLORS = {
  CRITICAL: {
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/40",
    dot: "bg-red-500",
  },
  HIGH: {
    bg: "bg-orange-500/15",
    text: "text-orange-400",
    border: "border-orange-500/40",
    dot: "bg-orange-500",
  },
  MEDIUM: {
    bg: "bg-yellow-500/15",
    text: "text-yellow-400",
    border: "border-yellow-500/40",
    dot: "bg-yellow-500",
  },
  LOW: {
    bg: "bg-blue-500/15",
    text: "text-blue-400",
    border: "border-blue-500/40",
    dot: "bg-blue-500",
  },
  INFO: {
    bg: "bg-muted/40",
    text: "text-muted-foreground",
    border: "border-border",
    dot: "bg-muted-foreground",
  },
} as const
