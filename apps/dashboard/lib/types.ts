export type { HoneypotEvent, ApiSession, ApiSessionDetail } from "./api"

export type EventType =
  | "session.connect"
  | "session.closed"
  | "client.version"
  | "client.kex"
  | "client.size"
  | "auth.success"
  | "auth.failed"
  | "command.input"
  | "command.failed"
  | "unknown"

export interface DashboardStats {
  totalSessions: number
  totalCommands: number
  uniqueIps: number
  successfulLogins: number
  failedLogins: number
  topCommands: { command: string; count: number }[]
  topUsernames: { username: string; count: number }[]
  topPasswords: { password: string; count: number }[]
  eventsByHour: { hour: string; count: number }[]
  eventsByDay: { day: string; count: number }[]
}

export type TimeRange = "day" | "week" | "month"

export interface CountryAttack {
  country: string        // ISO alpha-2 (e.g. "CN")
  name: string           // Full country name
  count: number          // Total unique IPs
  sessions: number       // Total sessions
  successfulLogins: number
}
