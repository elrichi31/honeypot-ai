import type { PrismaClient } from '@prisma/client';
import type { NormalizedEvent } from '../../types/index.js';

export class EventRepository {
  constructor(private prisma: PrismaClient) {}

  async createIfNotExists(
    sessionDbId: string,
    event: NormalizedEvent,
    cowrieEventId: string,
    cowrieTs: string,
  ): Promise<{ id: string; created: boolean }> {
    const existing = await this.prisma.event.findUnique({
      where: { uq_cowrie_event: { cowrieEventId, cowrieTs } },
      select: { id: true },
    });

    if (existing) {
      return { id: existing.id, created: false };
    }

    const created = await this.prisma.event.create({
      data: {
        sessionId: sessionDbId,
        eventType: event.eventType,
        eventTs: event.eventTs,
        srcIp: event.srcIp,
        message: event.message,
        command: event.command,
        username: event.username,
        password: event.password,
        success: event.success,
        rawJson: event.rawJson as object,
        normalizedJson: event.normalizedJson as object,
        cowrieEventId,
        cowrieTs,
      },
    });

    return { id: created.id, created: true };
  }
}
