import type { PrismaClient } from '@prisma/client'

export type SensorConfigVersionStatus = 'pending' | 'applied' | 'failed' | 'rolled_back'

export type SensorConfigVersionRow = {
  id: string
  sensorId: string
  protocol: string
  config: unknown
  configHash: string
  status: SensorConfigVersionStatus
  createdBy: string
  createdAt: Date
  appliedAt: Date | null
  error: string | null
}

export class SensorConfigRepository {
  constructor(private prisma: PrismaClient) {}

  // sensor_configs stays the single-row "current desired config" the
  // existing HTTP poller (cowrie-beacon's 10s loop) reads — untouched by
  // Rebanada 5, kept as the fallback path per the plan's Rebanada 6.
  async getCurrent(sensorId: string): Promise<{ config: unknown; config_hash: string } | null> {
    const rows = await this.prisma.$queryRaw<Array<{ config: unknown; config_hash: string }>>`
      SELECT config, config_hash FROM sensor_configs WHERE sensor_id = ${sensorId}
    `
    return rows[0] ?? null
  }

  async upsertCurrent(sensorId: string, configStr: string, hash: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO sensor_configs (sensor_id, config, config_hash, updated_at)
      VALUES (${sensorId}, CAST(${configStr} AS jsonb), ${hash}, NOW())
      ON CONFLICT (sensor_id) DO UPDATE SET
        config      = EXCLUDED.config,
        config_hash = EXCLUDED.config_hash,
        updated_at  = EXCLUDED.updated_at
    `
  }

  createVersion(args: {
    id: string; sensorId: string; protocol: string; configStr: string; configHash: string; createdBy: string
  }): Promise<SensorConfigVersionRow> {
    return this.prisma.sensorConfigVersion.create({
      data: {
        id: args.id,
        sensorId: args.sensorId,
        protocol: args.protocol,
        config: JSON.parse(args.configStr),
        configHash: args.configHash,
        status: 'pending',
        createdBy: args.createdBy,
      },
    }) as Promise<SensorConfigVersionRow>
  }

  markStatus(id: string, status: SensorConfigVersionStatus, extra: { appliedAt?: Date; error?: string } = {}) {
    return this.prisma.sensorConfigVersion.update({
      where: { id },
      data: { status, ...extra },
    })
  }

  findByHash(sensorId: string, configHash: string): Promise<SensorConfigVersionRow | null> {
    return this.prisma.sensorConfigVersion.findFirst({
      where: { sensorId, configHash },
      orderBy: { createdAt: 'desc' },
    }) as Promise<SensorConfigVersionRow | null>
  }

  findLastApplied(sensorId: string): Promise<SensorConfigVersionRow | null> {
    return this.prisma.sensorConfigVersion.findFirst({
      where: { sensorId, status: 'applied' },
      orderBy: { createdAt: 'desc' },
    }) as Promise<SensorConfigVersionRow | null>
  }

  list(sensorId: string, limit: number): Promise<SensorConfigVersionRow[]> {
    return this.prisma.sensorConfigVersion.findMany({
      where: { sensorId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }) as Promise<SensorConfigVersionRow[]>
  }
}
