import fp from 'fastify-plugin'
import { Kafka } from 'kafkajs'
import type { FastifyInstance } from 'fastify'
import { cowrieRawEventSchema } from '../schemas/index.js'
import { IngestService } from '../modules/ingest/ingest.service.js'
import { SuricataService } from '../modules/suricata/suricata.service.js'
import type { CowrieRawEvent } from '../types/index.js'
import { eventBus } from '../lib/event-bus.js'
import { lookupGeo } from '../lib/geo.js'
import { scheduleThreatAlert } from '../lib/threat-alerts.js'
import { z } from 'zod'

const eveAlertSchema = z.object({
  timestamp: z.string(),
  flow_id: z.number().optional(),
  in_iface: z.string().optional(),
  event_type: z.literal('alert'),
  src_ip: z.string().default(''),
  src_port: z.number().int().optional(),
  dest_ip: z.string().default(''),
  dest_port: z.number().int().optional(),
  proto: z.string().default(''),
  sensor_id: z.string().default(''),
  alert: z.object({
    action: z.string().default('allowed'),
    gid: z.number().optional(),
    signature_id: z.number().int().default(0),
    rev: z.number().optional(),
    signature: z.string().default(''),
    category: z.string().default(''),
    severity: z.number().int().min(1).max(4).default(3),
  }),
})

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

async function handleCowrie(raw: unknown, fastify: FastifyInstance) {
  const parsed = cowrieRawEventSchema.safeParse(raw)
  if (!parsed.success) {
    fastify.log.warn({ err: parsed.error.flatten() }, 'Kafka cowrie message failed validation — skipping')
    return
  }
  const event = parsed.data as CowrieRawEvent
  const svc = new IngestService(fastify.prisma)
  const { sessionCreated, eventCreated } = await svc.processLine(event)
  if (sessionCreated && event.src_ip) emitSsh(event.src_ip)
  if (eventCreated && shouldEvaluateThreat(event)) scheduleThreatAlert(fastify.prisma, event.src_ip)
}

async function handleSuricata(raw: unknown, fastify: FastifyInstance) {
  const parsed = eveAlertSchema.safeParse(raw)
  if (!parsed.success) {
    fastify.log.warn({ err: parsed.error.flatten() }, 'Kafka suricata message failed validation — skipping')
    return
  }
  const svc = new SuricataService(fastify.prisma, fastify.prismaRead)
  await svc.persistAlerts([parsed.data])
}

export default fp(async (fastify: FastifyInstance) => {
  const brokers = process.env.KAFKA_BROKERS
  if (!brokers) {
    fastify.log.info('KAFKA_BROKERS not set — Kafka consumer disabled')
    return
  }

  const kafka = new Kafka({
    clientId: 'ingest-api',
    brokers: brokers.split(','),
    retry: { retries: 10, initialRetryTime: 3000, maxRetryTime: 30000 },
  })

  const consumer = kafka.consumer({
    groupId: 'ingest-api',
    retry: {
      retries: 10,
      initialRetryTime: 3000,
      maxRetryTime: 30000,
      // Always restart the consumer after a crash. A processing error re-thrown
      // from eachMessage (e.g. Postgres down) must not permanently stop the
      // consumer — it should keep retrying the uncommitted offset until the
      // backend recovers. Without this, a non-retriable-classified error (some
      // Prisma errors) would crash the consumer for good and stall ingestion.
      restartOnFailure: async () => true,
    },
  })

  consumer.on('consumer.crash', ({ payload }) => {
    fastify.log.warn({ err: payload.error }, 'Kafka consumer crashed — will restart')
  })

  fastify.addHook('onClose', async () => {
    await consumer.disconnect()
  })

  // Connect + run in background so the plugin registers immediately without
  // blocking Fastify startup. The consumer retries internally if Kafka is slow.
  setImmediate(async () => {
    try {
      await consumer.connect()
      fastify.log.info('Kafka consumer connected')
      await consumer.subscribe({ topics: ['honeypot.cowrie', 'honeypot.suricata'], fromBeginning: true })
      await consumer.run({
        eachMessage: async ({ topic, message }) => {
          // Two failure classes are handled differently on purpose:
          //  - Validation failure (non-JSON, zod reject): the message will never
          //    be valid no matter how often we retry → skip (log + return), which
          //    lets kafkajs commit the offset.
          //  - Processing failure (Postgres down, deadlock, timeout): transient →
          //    re-throw so kafkajs does NOT commit and re-delivers from this
          //    offset once the backend recovers. Swallowing it here would commit
          //    the offset and silently drop the event — the exact failure mode
          //    Kafka is meant to prevent.
          const raw = (() => {
            try { return JSON.parse(message.value?.toString() ?? '') }
            catch { return null }
          })()
          if (raw === null) {
            fastify.log.warn({ topic, value: message.value?.toString() }, 'Kafka message is not valid JSON — skipping')
            return
          }
          // No try/catch around the handlers: validation skips are handled inside
          // them (safeParse + return); any thrown error is a processing failure
          // and must propagate so the offset is not committed.
          if (topic === 'honeypot.cowrie') await handleCowrie(raw, fastify)
          else if (topic === 'honeypot.suricata') await handleSuricata(raw, fastify)
        },
      })
    } catch (err) {
      fastify.log.error({ err }, 'Kafka consumer failed to start')
    }
  })
})
