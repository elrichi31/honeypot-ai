import { readFileSync } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { parseLine, toNormalizedEvent, extractSessionData } from '../../lib/parser.js';
import { SessionRepository } from '../sessions/session.repository.js';
import { EventRepository } from '../events/event.repository.js';
import type { IngestSummary, CowrieRawEvent } from '../../types/index.js';
import { sendDiscordAlert } from '../../lib/discord.js';
import { forwardClientEventBySensorId } from '../../lib/client-forward.js';
import { isInternalIp } from '../../lib/internal-ip.js';
import { isDeceptionSensor } from '../../lib/deception-sensor.js';
import { enqueueProtocolHit } from '../../lib/protocol-batch.js';
import { recordProcessLineLatency } from '../../lib/ingest-metrics.js';
import { lakeProducer, LAKE_TOPICS } from '../../lib/lake-producer.js';

// Cowrie writes to sessions/session_events, but the deception views read
// protocol_hits. For an internal SSH node, mirror real-interaction events as ssh
// protocol_hits (layer=internal) so they count toward the trap node in /deception.
const COWRIE_DECEPTION_EVENT_TYPE: Record<string, 'auth' | 'command'> = {
  'cowrie.login.success': 'auth',
  'cowrie.login.failed': 'auth',
  'cowrie.command.input': 'command',
};

// Bare connect/close and client-hello events carry no attacker intent. On an
// internal trap node they're dominated by the cowrie-beacon's 30s health-probe
// to cowrie:2222 (logged from the beacon's own docker IP, e.g. 172.18.0.4),
// which would otherwise pollute the node + kill chain with fake sessions. For an
// internal source we keep only events that show real interaction; a real
// attacker's session is (re)built from its login/command events.
const COWRIE_NOISE_EVENTS = new Set([
  'cowrie.session.connect',
  'cowrie.session.closed',
  'cowrie.client.version',
  'cowrie.client.size',
  'cowrie.client.kex',
]);

export class IngestService {
  private prisma: PrismaClient;
  private sessionRepo: SessionRepository;
  private eventRepo: EventRepository;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.sessionRepo = new SessionRepository(prisma);
    this.eventRepo = new EventRepository(prisma);
  }

  // The p50/p99 + events/s diagnostic (PERF_AUDIT M3, /health/ingest-metrics)
  // used to be timed in the Kafka consumer. Since KAFKA_LAKE Fase 1 the hot path
  // is HTTP, so the timing lives here — transport-agnostic, one place, survives
  // any future ingestion path.
  async processLine(raw: CowrieRawEvent): Promise<{ sessionCreated: boolean; eventCreated: boolean }> {
    const startedAt = performance.now();
    try {
      return await this._processLine(raw);
    } finally {
      recordProcessLineLatency(performance.now() - startedAt);
    }
  }

  private async _processLine(raw: CowrieRawEvent): Promise<{ sessionCreated: boolean; eventCreated: boolean }> {
    const sensorId = typeof raw.sensor === 'string' ? raw.sensor : null;
    // Drop internal-source noise EXCEPT real interaction with an internal
    // deception node (lateral movement legitimately comes from a private IP).
    // Only pay for the lookup when the event would otherwise be dropped —
    // internet-facing traffic is untouched.
    const internalSrc = isInternalIp(raw.src_ip);
    const deception = internalSrc && sensorId ? await isDeceptionSensor(this.prisma, sensorId) : false;
    if (internalSrc && (!deception || COWRIE_NOISE_EVENTS.has(raw.eventid))) {
      return { sessionCreated: false, eventCreated: false };
    }

    const sessionData = extractSessionData(raw);
    const { id: sessionDbId, created: sessionCreated } = await this.sessionRepo.upsert(sessionData);

    const normalized = toNormalizedEvent(raw);
    const cowrieEventId = `${raw.session}:${raw.eventid}`;
    const cowrieTs = raw.timestamp;
    const { created: eventCreated } = await this.eventRepo.createIfNotExists(sessionDbId, normalized, cowrieEventId, cowrieTs);

    if (eventCreated && raw.eventid === 'cowrie.login.success') {
      sendDiscordAlert({
        level: 'critical',
        title: '🔓 Successful login on the honeypot',
        description: `An attacker authenticated successfully via **SSH**`,
        fields: [
          { name: 'IP',       value: raw.src_ip ?? 'unknown', inline: true },
          { name: 'Username', value: (raw as any).username ?? '—', inline: true },
          { name: 'Password', value: (raw as any).password ?? '—', inline: true },
          { name: 'Session',  value: raw.session, inline: false },
        ],
      })
    }

    if (eventCreated && deception && sensorId) {
      const eventType = COWRIE_DECEPTION_EVENT_TYPE[raw.eventid];
      if (eventType) {
        enqueueProtocolHit({
          eventId: `${cowrieEventId}:${raw.timestamp}`, sensorId, protocol: 'ssh',
          srcIp: raw.src_ip as string, srcPort: null, dstPort: 22,
          eventType, username: raw.username ?? null, password: raw.password ?? null,
          data: { layer: 'internal', source: 'ssh', node_id: sensorId, cowrie_session: raw.session },
          timestamp: new Date(raw.timestamp),
        });
      }
    }

    if (eventCreated) {
      lakeProducer.tee(LAKE_TOPICS.cowrie, cowrieEventId, raw)
      void forwardClientEventBySensorId(this.prisma, typeof raw.sensor === 'string' ? raw.sensor : null, {
        kind: 'cowrie.event',
        event: {
          eventId: cowrieEventId,
          sensorId: typeof raw.sensor === 'string' ? raw.sensor : null,
          session: raw.session,
          srcIp: raw.src_ip,
          timestamp: raw.timestamp,
          eventid: raw.eventid,
          username: raw.username ?? null,
          password: raw.password ?? null,
          command: raw.input ?? null,
          raw,
          normalized: normalized.normalizedJson,
        },
      })
    }

    return { sessionCreated, eventCreated };
  }

  async processCowrieFile(filePath: string): Promise<IngestSummary> {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    const summary: IngestSummary = {
      processed: 0,
      insertedEvents: 0,
      createdSessions: 0,
      updatedSessions: 0,
      skipped: 0,
      errors: [],
    };

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      summary.processed++;

      const raw = parseLine(line);
      if (!raw) {
        summary.skipped++;
        continue;
      }

      try {
        const { sessionCreated, eventCreated } = await this.processLine(raw);

        if (sessionCreated) {
          summary.createdSessions++;
        } else {
          summary.updatedSessions++;
        }

        if (eventCreated) {
          summary.insertedEvents++;
        } else {
          summary.skipped++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        summary.errors.push(`Line ${summary.processed}: ${msg}`);
      }
    }

    return summary;
  }
}
