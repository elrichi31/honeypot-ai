import type { ClickHouseClient } from '@clickhouse/client'
import type { ClickHouseScope } from '../../lib/clickhouse-scope.js'

type AttackerRow = {
  eventId: string
  timestamp: string
  sensorId: string
}

export type CowrieAttackerRow = AttackerRow & {
  eventType: string
  username: string | null
  input: string | null
  dstPort: number | null
}

export type WebAttackerRow = AttackerRow & {
  method: string
  path: string
  attackType: string
  canaryTriggered: number
}

export type ProtocolAttackerRow = AttackerRow & {
  protocol: string
  eventType: string
  dstPort: number
  username: string | null
}

export type SuricataAttackerRow = AttackerRow & {
  protocol: string
  action: string
  signature: string
  category: string
  severity: number
  destPort: number | null
}

export type AttackerTimelineQuery = {
  ip: string
  limit: number
  before?: string
  scope: ClickHouseScope
}

export class AnalyticsAttackerRepository {
  constructor(private ch: ClickHouseClient) {}

  async getCowrieEvents(query: AttackerTimelineQuery): Promise<CowrieAttackerRow[]> {
    return this.query<CowrieAttackerRow>(`
      SELECT
        event_id AS eventId,
        toString(timestamp) AS timestamp,
        sensor_id AS sensorId,
        eventid AS eventType,
        username,
        input,
        dst_port AS dstPort
      FROM cowrie_events FINAL
      WHERE src_ip = {ip:String}
        ${query.scope.condition}
        ${this.beforeCondition(query.before)}
      ORDER BY timestamp DESC, eventId ASC
      LIMIT {limit:UInt16}
    `, query)
  }

  async getWebEvents(query: AttackerTimelineQuery): Promise<WebAttackerRow[]> {
    return this.query<WebAttackerRow>(`
      SELECT
        event_id AS eventId,
        toString(timestamp) AS timestamp,
        sensor_id AS sensorId,
        method,
        path,
        attack_type AS attackType,
        canary_triggered AS canaryTriggered
      FROM web_events FINAL
      WHERE src_ip = {ip:String}
        ${query.scope.condition}
        ${this.beforeCondition(query.before)}
      ORDER BY timestamp DESC, eventId ASC
      LIMIT {limit:UInt16}
    `, query)
  }

  async getProtocolEvents(query: AttackerTimelineQuery): Promise<ProtocolAttackerRow[]> {
    return this.query<ProtocolAttackerRow>(`
      SELECT
        event_id AS eventId,
        toString(timestamp) AS timestamp,
        sensor_id AS sensorId,
        protocol,
        event_type AS eventType,
        dst_port AS dstPort,
        username
      FROM protocol_events FINAL
      WHERE src_ip = {ip:String}
        ${query.scope.condition}
        ${this.beforeCondition(query.before)}
      ORDER BY timestamp DESC, eventId ASC
      LIMIT {limit:UInt16}
    `, query)
  }

  async getSuricataEvents(query: AttackerTimelineQuery): Promise<SuricataAttackerRow[]> {
    return this.query<SuricataAttackerRow>(`
      SELECT
        event_id AS eventId,
        toString(timestamp) AS timestamp,
        sensor_id AS sensorId,
        proto AS protocol,
        action,
        signature,
        category,
        severity,
        dest_port AS destPort
      FROM suricata_alerts FINAL
      WHERE src_ip = {ip:String}
        ${query.scope.condition}
        ${this.beforeCondition(query.before)}
      ORDER BY timestamp DESC, eventId ASC
      LIMIT {limit:UInt16}
    `, query)
  }

  private beforeCondition(before?: string): string {
    return before ? 'AND timestamp < parseDateTime64BestEffort({before:String}, 3)' : ''
  }

  private async query<T>(sql: string, query: AttackerTimelineQuery): Promise<T[]> {
    const result = await this.ch.query({
      query: sql,
      query_params: {
        ip: query.ip,
        limit: query.limit,
        ...query.scope.params,
        ...(query.before ? { before: query.before } : {}),
      },
      format: 'JSONEachRow',
    })
    return result.json<T>()
  }
}
