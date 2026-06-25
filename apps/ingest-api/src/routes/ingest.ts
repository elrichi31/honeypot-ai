import type { FastifyInstance } from 'fastify';
import { ingestFileBodySchema, cowrieRawEventSchema, ingestBatchBodySchema, vectorBatchBodySchema } from '../schemas/index.js';
import { ensureIngestToken } from '../lib/ingest-auth.js';
import { IngestService } from '../modules/ingest/ingest.service.js';
import type { CowrieRawEvent } from '../types/index.js';
import { eventBus } from '../lib/event-bus.js';
import { lookupGeo } from '../lib/geo.js';
import { scheduleThreatAlert } from '../lib/threat-alerts.js';

function emitSsh(ip: string) {
  const geo = lookupGeo(ip)
  if (!geo) return
  eventBus.emit('attack', { type: 'ssh', ip, ...geo, timestamp: new Date().toISOString() })
}

function shouldEvaluateThreat(raw: CowrieRawEvent) {
  return Boolean(
    raw.src_ip &&
    ['cowrie.login.success', 'cowrie.login.failed', 'cowrie.command.input'].includes(raw.eventid),
  )
}

export async function ingestRoutes(fastify: FastifyInstance) {
  const service = new IngestService(fastify.prisma)

  // Ingest from local file (dev only)
  fastify.post('/ingest/cowrie/file', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply;

    const parsed = ingestFileBodySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const summary = await service.processCowrieFile(parsed.data.filePath);

    return reply.status(200).send(summary);
  });

  // Ingest a single event via HTTP (real-time from VPS)
  fastify.post('/ingest/cowrie/event', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply;

    const parsed = cowrieRawEventSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid event',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const { sessionCreated, eventCreated } = await service.processLine(parsed.data as CowrieRawEvent);
      if (sessionCreated && parsed.data.src_ip) emitSsh(parsed.data.src_ip)
      if (eventCreated && shouldEvaluateThreat(parsed.data as CowrieRawEvent)) {
        scheduleThreatAlert(fastify.prisma, parsed.data.src_ip)
      }
      return reply.status(eventCreated ? 201 : 200).send({
        ingested: eventCreated,
        duplicate: !eventCreated,
        sessionCreated,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: msg });
    }
  });

  // Ingest a batch of events via HTTP (from VPS cron/script)
  fastify.post('/ingest/cowrie/batch', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply;

    const parsed = ingestBatchBodySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid batch',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    let inserted = 0;
    let duplicates = 0;
    let sessions = 0;
    const errors: string[] = [];
    const ipsToEvaluate = new Set<string>();

    for (const raw of parsed.data.events) {
      try {
        const { sessionCreated, eventCreated } = await service.processLine(raw as CowrieRawEvent);
        if (eventCreated) inserted++;
        else duplicates++;
        if (sessionCreated) {
          sessions++;
          if (raw.src_ip) emitSsh(raw.src_ip)
        }
        if (eventCreated && shouldEvaluateThreat(raw as CowrieRawEvent) && raw.src_ip) {
          ipsToEvaluate.add(raw.src_ip)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg);
      }
    }

    for (const ip of ipsToEvaluate) {
      scheduleThreatAlert(fastify.prisma, ip)
    }

    return reply.status(200).send({
      total: parsed.data.events.length,
      inserted,
      duplicates,
      sessionsCreated: sessions,
      errors,
    });
  });

  // Vector HTTP sink sends a raw JSON array (no wrapper object)
  fastify.post('/ingest/cowrie/vector', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply;

    const parsed = vectorBatchBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid batch', details: parsed.error.flatten() });
    }

    let inserted = 0, duplicates = 0, sessions = 0;
    const errors: string[] = [];
    const ipsToEvaluate = new Set<string>();

    for (const raw of parsed.data) {
      try {
        const { sessionCreated, eventCreated } = await service.processLine(raw as CowrieRawEvent);
        if (eventCreated) inserted++; else duplicates++;
        if (sessionCreated) {
          sessions++;
          if (raw.src_ip) emitSsh(raw.src_ip)
        }
        if (eventCreated && shouldEvaluateThreat(raw as CowrieRawEvent) && raw.src_ip) {
          ipsToEvaluate.add(raw.src_ip)
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    for (const ip of ipsToEvaluate) {
      scheduleThreatAlert(fastify.prisma, ip)
    }

    return reply.status(200).send({ total: parsed.data.length, inserted, duplicates, sessionsCreated: sessions, errors });
  });
}
