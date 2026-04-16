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
    return true;
  }

  if (getProvidedToken(request) !== expected) {
    reply.status(401).send({ error: 'Unauthorized ingest request' });
    return false;
  }

  return true;
}
