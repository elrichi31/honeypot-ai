import { randomUUID } from 'crypto'
import { Prisma, type PrismaClient } from '@prisma/client'

const FLUSH_MS   = 1_000   // flush every second
const MAX_SIZE   = 500     // immediate flush when queue hits this

interface ProtocolHitRow {
  id:        string
  eventId:   string
  sensorId:  string | null
  protocol:  string
  srcIp:     string
  srcPort:   number | null
  dstPort:   number
  eventType: string
  username:  string | null
  password:  string | null
  data:      Record<string, unknown>
  timestamp: Date
}

let queue:  ProtocolHitRow[]  = []
let prisma: PrismaClient | null = null
let timer:  ReturnType<typeof setInterval> | null = null

async function flush() {
  if (!prisma || queue.length === 0) return
  const batch = queue.splice(0)
  try {
    const data = batch.map(row => ({ ...row, data: row.data as Prisma.InputJsonValue }))
    await prisma.protocolHit.createMany({ data, skipDuplicates: true })
  } catch (err) {
    console.error(`[protocol-batch] flush error (${batch.length} events dropped):`, err)
  }
}

export function initProtocolBatch(p: PrismaClient): void {
  prisma = p
  timer = setInterval(flush, FLUSH_MS)
}

/** Stop the timer and flush any queued hits — call on graceful shutdown so the
 *  in-memory queue (up to MAX_SIZE) isn't lost when the process exits. */
export async function stopProtocolBatch(): Promise<void> {
  if (timer) { clearInterval(timer); timer = null }
  await flush()
}

export function enqueueProtocolHit(
  input: Omit<ProtocolHitRow, 'id'>,
): string {
  const id = randomUUID()
  queue.push({ ...input, id })
  if (queue.length >= MAX_SIZE) void flush()
  return id
}
