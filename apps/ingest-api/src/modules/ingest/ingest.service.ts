import { readFileSync } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { parseLine, toNormalizedEvent, extractSessionData } from '../../lib/parser.js';
import { SessionRepository } from '../sessions/session.repository.js';
import { EventRepository } from '../events/event.repository.js';
import type { IngestSummary, CowrieRawEvent } from '../../types/index.js';
import { sendDiscordAlert } from '../../lib/discord.js';

export class IngestService {
  private sessionRepo: SessionRepository;
  private eventRepo: EventRepository;

  constructor(prisma: PrismaClient) {
    this.sessionRepo = new SessionRepository(prisma);
    this.eventRepo = new EventRepository(prisma);
  }

  async processLine(raw: CowrieRawEvent): Promise<{ sessionCreated: boolean; eventCreated: boolean }> {
    const sessionData = extractSessionData(raw);
    const { id: sessionDbId, created: sessionCreated } = await this.sessionRepo.upsert(sessionData);

    const normalized = toNormalizedEvent(raw);
    const cowrieEventId = `${raw.session}:${raw.eventid}`;
    const cowrieTs = raw.timestamp;
    const { created: eventCreated } = await this.eventRepo.createIfNotExists(sessionDbId, normalized, cowrieEventId, cowrieTs);

    if (eventCreated && raw.eventid === 'cowrie.login.success') {
      sendDiscordAlert({
        level: 'critical',
        title: '🔓 Login exitoso en el honeypot',
        description: `Un atacante autenticó correctamente vía **SSH**`,
        fields: [
          { name: 'IP',       value: raw.src_ip ?? 'desconocida', inline: true },
          { name: 'Usuario',  value: (raw as any).username ?? '—', inline: true },
          { name: 'Password', value: (raw as any).password ?? '—', inline: true },
          { name: 'Sesión',   value: raw.session, inline: false },
        ],
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
