import type { ApiSession } from "./api"

export type CampaignGroupBy = "ip" | "subnet" | "hassh" | "username"

export interface Campaign {
  key: string
  groupBy: CampaignGroupBy
  label: string
  sessions: ApiSession[]
  firstSeen: string
  lastSeen: string
  uniqueIps: number
  totalCommands: number
  topCredentials: { username: string; password: string; count: number }[]
  loginSuccess: boolean
}

function getSubnet(ip: string): string {
  const parts = ip.split(".")
  if (parts.length !== 4) return ip
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
}

export function detectCampaigns(
  sessions: ApiSession[],
  groupBy: CampaignGroupBy
): Campaign[] {
  const groups = new Map<string, ApiSession[]>()

  for (const session of sessions) {
    let key: string | null = null

    if (groupBy === "ip") {
      key = session.srcIp
    } else if (groupBy === "subnet") {
      key = getSubnet(session.srcIp)
    } else if (groupBy === "hassh") {
      key = session.hassh ?? null
    } else if (groupBy === "username") {
      key = session.username ?? null
    }

    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(session)
  }

  const campaigns: Campaign[] = []

  for (const [key, group] of groups.entries()) {
    // Only show groups with 2+ sessions
    if (group.length < 2) continue

    const sorted = [...group].sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    )

    const credCounts = new Map<string, number>()
    for (const s of group) {
      if (s.username && s.password) {
        const ck = `${s.username}:${s.password}`
        credCounts.set(ck, (credCounts.get(ck) || 0) + 1)
      }
    }

    const topCredentials = Array.from(credCounts.entries())
      .map(([ck, count]) => {
        const [username, ...rest] = ck.split(":")
        return { username, password: rest.join(":"), count }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    const uniqueIps = new Set(group.map((s) => s.srcIp)).size
    const totalCommands = group.reduce((sum, s) => sum + s._count.events, 0)
    const loginSuccess = group.some((s) => s.loginSuccess === true)

    let label = key
    if (groupBy === "hassh") label = `HASSH: ${key.slice(0, 16)}...`
    if (groupBy === "username") label = `User: ${key}`

    campaigns.push({
      key,
      groupBy,
      label,
      sessions: sorted,
      firstSeen: sorted[0].startedAt,
      lastSeen: sorted[sorted.length - 1].startedAt,
      uniqueIps,
      totalCommands,
      topCredentials,
      loginSuccess,
    })
  }

  return campaigns.sort((a, b) => b.sessions.length - a.sessions.length)
}
