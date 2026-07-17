import { Kafka, type Producer } from 'kafkajs'
import type { FastifyBaseLogger } from 'fastify'

// KAFKA_LAKE Fase 2 (docs/plans/KAFKA_LAKE.md): the ingest-api tees every
// persisted event to Kafka (one topic per source) for the data lake, in
// parallel to the Postgres write — Kafka sits behind the API, never at the
// sensor edge, so it works identically single-host and multi-host.
//
// Best-effort by design: tee() is fire-and-forget and never throws, so a Kafka
// blip can never block or fail the ingest hot path. Postgres is the source of
// truth; the lake consumer dedups by eventId. A produce lost during a Kafka
// outage is an accepted ceiling (see the plan) — upgrade to a transactional
// outbox only if that loss ever matters.

export const LAKE_TOPICS = {
  cowrie: 'honeypot.cowrie',
  suricata: 'honeypot.suricata',
  web: 'honeypot.web',
  protocol: 'honeypot.protocol',
} as const

export type LakeTopic = (typeof LAKE_TOPICS)[keyof typeof LAKE_TOPICS]

class LakeProducer {
  private producer: Producer | null = null
  private log: FastifyBaseLogger | null = null

  async connect(brokers: string, log: FastifyBaseLogger): Promise<void> {
    this.log = log
    const kafka = new Kafka({
      clientId: 'ingest-api-lake',
      brokers: brokers.split(','),
      retry: { retries: 10, initialRetryTime: 3000, maxRetryTime: 30000 },
    })
    // Topics are created by kafka-init (KAFKA_AUTO_CREATE_TOPICS_ENABLE=false),
    // so don't let a typo silently auto-create a junk topic.
    const producer = kafka.producer({ allowAutoTopicCreation: false })
    await producer.connect()
    this.producer = producer
    log.info('Lake producer connected')
  }

  // Fire-and-forget tee. Not awaited by callers; a failure is logged, never thrown.
  tee(topic: LakeTopic, key: string | undefined, event: unknown): void {
    const producer = this.producer
    if (!producer) return
    producer
      .send({ topic, messages: [{ key, value: JSON.stringify(event) }] })
      .catch((err) => this.log?.warn({ err, topic }, 'lake tee produce failed'))
  }

  async disconnect(): Promise<void> {
    const producer = this.producer
    this.producer = null
    await producer?.disconnect()
  }
}

export const lakeProducer = new LakeProducer()
