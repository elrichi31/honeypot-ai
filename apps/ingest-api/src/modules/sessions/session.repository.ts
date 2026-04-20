import type { PrismaClient } from '@prisma/client';
import type { SessionUpsertData } from '../../types/index.js';
import { detectBot } from '../../lib/bot-detector.js';

export class SessionRepository {
  constructor(private prisma: PrismaClient) {}

  async upsert(data: SessionUpsertData): Promise<{ id: string; created: boolean }> {
    const existing = await this.prisma.session.findUnique({
      where: { cowrieSessionId: data.cowrieSessionId },
      select: { id: true },
    });

    if (existing) {
      const updatePayload: Record<string, unknown> = {
        ...(data.username && { username: data.username }),
        ...(data.password && { password: data.password }),
        ...(data.loginSuccess !== undefined && { loginSuccess: data.loginSuccess }),
        ...(data.hassh && { hassh: data.hassh }),
        ...(data.clientVersion && { clientVersion: data.clientVersion }),
        ...(data.endedAt && { endedAt: data.endedAt }),
      };

      // When a session closes, compute actor classification using all available events.
      if (data.endedAt) {
        const classification = await this.classifySession(existing.id, data);
        updatePayload.sessionType = classification;
      }

      await this.prisma.session.update({
        where: { id: existing.id },
        data: updatePayload,
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

  async classifySession(
    sessionId: string,
    sessionData: Partial<SessionUpsertData> & { endedAt?: Date; startedAt?: Date },
  ): Promise<string> {
    const [session, commandEvents, authEvents] = await Promise.all([
      this.prisma.session.findUnique({
        where: { id: sessionId },
        select: { startedAt: true, clientVersion: true, hassh: true, loginSuccess: true },
      }),
      this.prisma.event.findMany({
        where: { sessionId, eventType: 'command.input' },
        select: { command: true },
      }),
      this.prisma.event.findMany({
        where: { sessionId, eventType: { in: ['auth.success', 'auth.failed'] } },
        select: { id: true },
      }),
    ]);

    if (!session) return 'unknown';

    const startedAt = session.startedAt;
    const endedAt = sessionData.endedAt;
    const durationSec =
      startedAt && endedAt
        ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000))
        : null;

    const { actor } = detectBot({
      clientVersion: sessionData.clientVersion ?? session.clientVersion,
      hassh: session.hassh,
      durationSec,
      commands: commandEvents.map(e => e.command ?? '').filter(Boolean),
      authAttemptCount: authEvents.length,
      loginSuccess: sessionData.loginSuccess ?? session.loginSuccess,
      password: sessionData.password,
    });

    return actor;
  }
}
