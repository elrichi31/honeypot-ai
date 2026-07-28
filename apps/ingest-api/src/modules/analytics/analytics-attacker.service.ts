import type { ClickHouseClient } from '@clickhouse/client'
import type { FastifyInstance } from 'fastify'
import type { ClickHouseScope } from '../../lib/clickhouse-scope.js'
import { withCache } from '../../lib/cache-helper.js'
import {
  AnalyticsAttackerRepository,
  type CowrieAttackerRow,
  type ProtocolAttackerRow,
  type SuricataAttackerRow,
  type WebAttackerRow,
} from './analytics-attacker.repository.js'

export type AttackerTimelineSource = 'cowrie' | 'web' | 'protocol' | 'suricata'

export type AttackerTimelineItem = {
  eventId: string
  timestamp: string
  sensorId: string
  source: AttackerTimelineSource
  kind: string
  summary: string
}

export type AttackerTimelinePage = {
  items: AttackerTimelineItem[]
  hasMore: boolean
  nextBefore: string | null
}

const ATTACKER_TIMELINE_TTL_SECONDS = 300

export class AnalyticsAttackerService {
  private repo: AnalyticsAttackerRepository | null

  constructor(ch: ClickHouseClient | null) {
    this.repo = ch ? new AnalyticsAttackerRepository(ch) : null
  }

  get enabled(): boolean {
    return this.repo !== null
  }

  async getTimeline(
    cache: FastifyInstance['cache'],
    ip: string,
    limit: number,
    before: string | undefined,
    scope: ClickHouseScope,
  ): Promise<AttackerTimelinePage> {
    const repo = this.repo
    if (!repo) throw new Error('analytics_unavailable')

    const cacheKey = `analytics:attacker:${ip}:${limit}:${before ?? 'latest'}:${scope.cacheSuffix}`
    return withCache(cache, cacheKey, ATTACKER_TIMELINE_TTL_SECONDS, async () => {
      const query = { ip, limit, before, scope }
      const [cowrie, web, protocol, suricata] = await Promise.all([
        repo.getCowrieEvents(query),
        repo.getWebEvents(query),
        repo.getProtocolEvents(query),
        repo.getSuricataEvents(query),
      ])

      const merged = [
        ...cowrie.map(formatCowrieEvent),
        ...web.map(formatWebEvent),
        ...protocol.map(formatProtocolEvent),
        ...suricata.map(formatSuricataEvent),
      ].sort(compareTimelineItems)

      const items = merged.slice(0, limit)
      const hasMore = merged.length > limit
        || [cowrie, web, protocol, suricata].some((rows) => rows.length === limit)

      return {
        items,
        hasMore,
        nextBefore: hasMore ? items.at(-1)?.timestamp ?? null : null,
      }
    })
  }
}

export function formatCowrieEvent(row: CowrieAttackerRow): AttackerTimelineItem {
  let summary: string
  if (row.eventType === 'cowrie.login.success' || row.eventType === 'cowrie.login.failed') {
    const outcome = row.eventType.endsWith('success') ? 'succeeded' : 'failed'
    summary = `SSH login ${outcome}${row.username ? ` as ${row.username}` : ''}`
  } else if (row.eventType === 'cowrie.command.input') {
    summary = `SSH command: ${row.input || '(empty)'}`
  } else if (row.eventType === 'cowrie.session.connect') {
    summary = `SSH session connected${row.dstPort ? ` on port ${row.dstPort}` : ''}`
  } else {
    summary = `Cowrie event: ${row.eventType}`
  }

  return timelineItem(row, 'cowrie', row.eventType, summary)
}

export function formatWebEvent(row: WebAttackerRow): AttackerTimelineItem {
  const attack = row.attackType ? ` — ${row.attackType}` : ''
  const canary = row.canaryTriggered ? ' (canary triggered)' : ''
  return timelineItem(row, 'web', row.attackType || 'request', `${row.method} ${row.path}${attack}${canary}`)
}

export function formatProtocolEvent(row: ProtocolAttackerRow): AttackerTimelineItem {
  const port = row.dstPort ? ` on port ${row.dstPort}` : ''
  const username = row.username ? ` as ${row.username}` : ''
  return timelineItem(
    row,
    'protocol',
    row.eventType,
    `${row.protocol.toUpperCase()} ${row.eventType}${port}${username}`,
  )
}

export function formatSuricataEvent(row: SuricataAttackerRow): AttackerTimelineItem {
  const port = row.destPort ? ` on port ${row.destPort}` : ''
  return timelineItem(
    row,
    'suricata',
    row.category,
    `${row.signature}${port} (${row.category}, severity ${row.severity}, ${row.action})`,
  )
}

function timelineItem(
  row: { eventId: string; timestamp: string; sensorId: string },
  source: AttackerTimelineSource,
  kind: string,
  summary: string,
): AttackerTimelineItem {
  return {
    eventId: row.eventId,
    timestamp: row.timestamp,
    sensorId: row.sensorId,
    source,
    kind,
    summary,
  }
}

function compareTimelineItems(a: AttackerTimelineItem, b: AttackerTimelineItem): number {
  return b.timestamp.localeCompare(a.timestamp)
    || a.source.localeCompare(b.source)
    || a.eventId.localeCompare(b.eventId)
}
