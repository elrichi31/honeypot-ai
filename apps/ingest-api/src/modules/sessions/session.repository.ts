import type { PrismaClient } from '@prisma/client';
import type { SessionUpsertData } from '../../types/index.js';

export class SessionRepository {
  constructor(private prisma: PrismaClient) {}

  async upsert(data: SessionUpsertData): Promise<{ id: string; created: boolean }> {
    const existing = await this.prisma.session.findUnique({
      where: { cowrieSessionId: data.cowrieSessionId },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.session.update({
        where: { id: existing.id },
        data: {
          ...(data.username && { username: data.username }),
          ...(data.password && { password: data.password }),
          ...(data.loginSuccess !== undefined && { loginSuccess: data.loginSuccess }),
          ...(data.hassh && { hassh: data.hassh }),
          ...(data.clientVersion && { clientVersion: data.clientVersion }),
          ...(data.endedAt && { endedAt: data.endedAt }),
        },
      });
      return { id: existing.id, created: false };
    }

    const session = await this.prisma.session.create({
      data: {
        cowrieSessionId: data.cowrieSessionId,
        srcIp: data.srcIp,
        protocol: data.protocol,
        startedAt: data.startedAt,
        username: data.username,
        password: data.password,
        loginSuccess: data.loginSuccess,
        hassh: data.hassh,
        clientVersion: data.clientVersion,
      },
    });

    return { id: session.id, created: true };
  }
}
