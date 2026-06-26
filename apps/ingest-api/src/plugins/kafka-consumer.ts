import fp from 'fastify-plugin'
import { Kafka } from 'kafkajs'
import type { FastifyInstance } from 'fastify'
import { cowrieRawEventSchema } from '../schemas/index.js'
import { IngestService } from '../modules/ingest/ingest.service.js'
import { SuricataService } from '../modules/suricata/suricata.service.js'
import { eveAlertSchema } from '../modules/suricata/suricata.schema.js'
import type { CowrieRawEvent } from '../types/index.js'
import { eventBus } from '../lib/event-bus.js'
import { lookupGeo } from '../lib/geo.js'
import { scheduleThreatAlert } from '../lib/threat-alerts.js'

// 'disabled' = no KAFKA_BROKERS (dev without Kafka, healthy by design)
// 'connecting' = booting / between crash and rejoin
// 'running' = joined the group and consuming
// 'crashed' = consumer crashed (will restart, but currently not consuming)
export type KafkaConsumerStatus = 'disabled' | 'connecting' | 'running' | 'crashed'

declare module 'fastify' {
  interface FastifyInstance {
    kafkaConsumerStatus: () => KafkaConsumerStatus
  }
}

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

async function handleCowrie(raw: unknown, fastify: FastifyInstance, svc: IngestService) {
  const parsed = cowrieRawEventSchema.safeParse(raw)
  if (!parsed.success) {
    fastify.log.warn({ err: parsed.error.flatten() }, 'Kafka cowrie message failed validation — skipping')
    return
  }
  const event = parsed.data as CowrieRawEvent
  const { sessionCreated, eventCreated } = await svc.processLine(event)
  if (sessionCreated && event.src_ip) emitSsh(event.src_ip)
  if (eventCreated && shouldEvaluateThreat(event)) scheduleThreatAlert(fastify.prisma, event.src_ip)
}

async function handleSuricata(raw: unknown, fastify: FastifyInstance, svc: SuricataService) {
  const parsed = eveAlertSchema.safeParse(raw)
  if (!parsed.success) {
    fastify.log.warn({ err: parsed.error.flatten() }, 'Kafka suricata message failed validation — skipping')
    return
  }
  await svc.persistAlerts([parsed.data])
}

export default fp(async (fastify: FastifyInstance) => {
  const brokers = process.env.KAFKA_BROKERS
  if (!brokers) {
    fastify.log.info('KAFKA_BROKERS not set — Kafka consumer disabled')
    fastify.decorate('kafkaConsumerStatus', () => 'disabled' as KafkaConsumerStatus)
    return
  }

  let status: KafkaConsumerStatus = 'connecting'
  fastify.decorate('kafkaConsumerStatus', () => status)

  const ingestSvc = new IngestService(fastify.prisma)
  const suricataSvc = new SuricataService(fastify.prisma, fastify.prismaRead)

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

  const { GROUP_JOIN, CRASH, STOP, DISCONNECT } = consumer.events
  consumer.on(GROUP_JOIN, () => { status = 'running' })
  consumer.on(STOP, () => { status = 'connecting' })
  consumer.on(DISCONNECT, () => { status = 'connecting' })
  consumer.on(CRASH, ({ payload }) => {
    status = 'crashed'
    fastify.log.warn({ err: payload.error }, 'Kafka consumer crashed — will restart')
  })

  // Watchdog: log a warning if no message has been processed in 5 minutes
  // while the consumer is supposed to be running. Helps detect silent stalls.
  let lastMessageAt = Date.now()
  const watchdog = setInterval(() => {
    if (status !== 'running') return
    const staleSec = Math.round((Date.now() - lastMessageAt) / 1000)
    if (staleSec > 300) {
      fastify.log.warn({ staleSec }, 'Kafka consumer has not processed a message in >5 min — possible stall')
    }
  }, 60_000)
  fastify.addHook('onClose', () => clearInterval(watchdog))

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
          // Exception: Postgres data errors (22xxx) are permanent — the message
          // will never succeed no matter how many retries. Skip and commit.
          try {
            if (topic === 'honeypot.cowrie') await handleCowrie(raw, fastify, ingestSvc)
            else if (topic === 'honeypot.suricata') await handleSuricata(raw, fastify, suricataSvc)
            lastMessageAt = Date.now()
          } catch (err: any) {
            // Postgres class-22 errors (data exceptions: invalid byte sequence,
            // null value in non-null column, etc.) are permanent — retrying will
            // never succeed. Detect via code field or error message and skip.
            const pgCode: string | undefined = err?.cause?.code ?? err?.meta?.code ?? err?.code
            const isPermanentDataError =
              (typeof pgCode === 'string' && pgCode.startsWith('22')) ||
              /code: "22\d{3}"/.test(err?.message ?? '')
            if (isPermanentDataError) {
              fastify.log.warn({ topic, offset: message.offset, pgCode, err: err?.message }, 'Permanent Postgres data error — skipping message')
              return
            }
            throw err
          }
        },
      })
    } catch (err) {
      fastify.log.error({ err }, 'Kafka consumer failed to start')
    }
  })
})
