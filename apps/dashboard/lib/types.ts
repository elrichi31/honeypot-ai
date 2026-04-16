export type {
  HoneypotEvent,
  ApiSession,
  ApiSessionDetail,
  DashboardStats,
  TimelinePoint,
} from "./api"

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

export type TimeRange = "day" | "week" | "month"

export interface CountryAttack {
  country: string        // ISO alpha-2 (e.g. "CN")
  name: string           // Full country name
  count: number          // Total unique IPs
  sessions: number       // Total sessions
  successfulLogins: number
}
