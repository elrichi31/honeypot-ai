import { randomUUID } from 'crypto';
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
    // createMany with skipDuplicates = 1 DB call instead of findUnique + create
    const result = await this.prisma.event.createMany({
      data: [{
        id:             randomUUID(),
        sessionId:      sessionDbId,
        eventType:      event.eventType,
        eventTs:        event.eventTs,
        srcIp:          event.srcIp,
        message:        event.message,
        command:        event.command,
        username:       event.username,
        password:       event.password,
        success:        event.success,
        rawJson:        event.rawJson as object,
        normalizedJson: event.normalizedJson as object,
        cowrieEventId,
        cowrieTs,
      }],
      skipDuplicates: true,
    });

    return { id: '', created: result.count > 0 };
  }
}
