import type { HoneypotEvent, ApiSession, DashboardStats } from "./types"

function getHourInTz(date: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
    }).formatToParts(date)
    const h = parts.find((p) => p.type === "hour")?.value ?? "00"
    // "24" is returned for midnight by some implementations
    return (h === "24" ? "00" : h.padStart(2, "0")) + ":00"
  } catch {
    return date.getUTCHours().toString().padStart(2, "0") + ":00"
  }
}

function getDayInTz(date: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
    }).formatToParts(date)
    const day = parts.find((p) => p.type === "day")?.value ?? "01"
    const month = parts.find((p) => p.type === "month")?.value ?? "01"
    return `${day}/${month}`
  } catch {
    const d = new Date(date.toISOString())
    return `${d.getUTCDate().toString().padStart(2, "0")}/${(d.getUTCMonth() + 1).toString().padStart(2, "0")}`
  }
}

export function getStatsFromData(
  sessions: ApiSession[],
  events: HoneypotEvent[],
  timezone = "UTC"
): DashboardStats {
  const commands = events.filter(
    (e) => e.eventType === "command.input" && e.command
  )
  const auths = events.filter(
    (e) => e.eventType === "auth.success" || e.eventType === "auth.failed"
  )

  const commandCounts = new Map<string, number>()
  commands.forEach((e) => {
    if (e.command) {
      const cmd = e.command.split(" ")[0]
      commandCounts.set(cmd, (commandCounts.get(cmd) || 0) + 1)
    }
  })

  const usernameCounts = new Map<string, number>()
  const passwordCounts = new Map<string, number>()
  auths.forEach((e) => {
    if (e.username) {
      usernameCounts.set(e.username, (usernameCounts.get(e.username) || 0) + 1)
    }
    if (e.password) {
      passwordCounts.set(e.password, (passwordCounts.get(e.password) || 0) + 1)
    }
  })

  const uniqueIps = new Set(sessions.map((s) => s.srcIp))

  const hourCounts = new Map<string, number>()
  events.forEach((e) => {
    const hour = getHourInTz(new Date(e.eventTs), timezone)
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1)
  })

  const dayCounts = new Map<string, number>()
  events.forEach((e) => {
    const day = getDayInTz(new Date(e.eventTs), timezone)
    dayCounts.set(day, (dayCounts.get(day) || 0) + 1)
  })

  const sessionDayCounts = new Map<string, { sessions: number; successfulLogins: number }>()
  sessions.forEach((s) => {
    const day = getDayInTz(new Date(s.startedAt), timezone)
    const current = sessionDayCounts.get(day) ?? { sessions: 0, successfulLogins: 0 }
    current.sessions += 1
    if (s.loginSuccess === true) current.successfulLogins += 1
    sessionDayCounts.set(day, current)
  })

  const eventsByHour = Array.from(hourCounts.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour.localeCompare(b.hour))

  const eventsByDay = Array.from(dayCounts.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day))

  return {
    totalSessions: sessions.length,
    totalCommands: commands.length,
    uniqueIps: uniqueIps.size,
    successfulLogins: auths.filter((e) => e.success === true).length,
    failedLogins: auths.filter((e) => e.success === false).length,
    topCommands: Array.from(commandCounts.entries())
      .map(([command, count]) => ({ command, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    topUsernames: Array.from(usernameCounts.entries())
      .map(([username, count]) => ({ username, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    topPasswords: Array.from(passwordCounts.entries())
      .map(([password, count]) => ({ password, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    timeline: Array.from(sessionDayCounts.entries())
      .map(([day, counts]) => ({
        bucketStart: day,
        label: day,
        sessions: counts.sessions,
        successfulLogins: counts.successfulLogins,
      }))
      .sort((a, b) => a.bucketStart.localeCompare(b.bucketStart)),
    eventsByHour,
    eventsByDay,
  }
}
