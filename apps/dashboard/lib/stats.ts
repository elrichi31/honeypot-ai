import type { HoneypotEvent, ApiSession, DashboardStats } from "./types"

export function getStatsFromData(
  sessions: ApiSession[],
  events: HoneypotEvent[]
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
    const hour =
      new Date(e.eventTs).getHours().toString().padStart(2, "0") + ":00"
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1)
  })

  const dayCounts = new Map<string, number>()
  events.forEach((e) => {
    const d = new Date(e.eventTs)
    const day = `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`
    dayCounts.set(day, (dayCounts.get(day) || 0) + 1)
  })

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
    eventsByHour: Array.from(hourCounts.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour)),
    eventsByDay: Array.from(dayCounts.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  }
}
