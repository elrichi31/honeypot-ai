import { timingSafeEqual } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

function getProvidedToken(request: FastifyRequest): string {
  const raw = request.headers['x-ingest-token'];

  if (Array.isArray(raw)) {
    return raw[0] ?? '';
  }

  return raw ?? '';
}

export function ensureIngestToken(request: FastifyRequest, reply: FastifyReply): boolean {
  const expected = process.env.INGEST_SHARED_SECRET;

  if (!expected) {
    console.error('[ingest-auth] INGEST_SHARED_SECRET is not set — all ingest requests are rejected');
    reply.status(401).send({ error: 'Ingest authentication not configured' });
    return false;
  }

  const provided = getProvidedToken(request);

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);

  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    reply.status(401).send({ error: 'Unauthorized ingest request' });
    return false;
  }

  return true;
}
