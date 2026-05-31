import { randomUUID } from 'crypto'
import type { PrismaClient } from '@prisma/client'

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

async function flush() {
  if (!prisma || queue.length === 0) return
  const batch = queue.splice(0)
  try {
    await prisma.protocolHit.createMany({ data: batch, skipDuplicates: true })
  } catch (err) {
    console.error(`[protocol-batch] flush error (${batch.length} events dropped):`, err)
  }
}

export function initProtocolBatch(p: PrismaClient): void {
  prisma = p
  setInterval(flush, FLUSH_MS)
}

export function enqueueProtocolHit(
  input: Omit<ProtocolHitRow, 'id'>,
): string {
  const id = randomUUID()
  queue.push({ ...input, id })
  if (queue.length >= MAX_SIZE) void flush()
  return id
}
